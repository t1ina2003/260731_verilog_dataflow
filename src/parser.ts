import * as vscode from 'vscode';
import * as fs from 'fs';

export interface Instantiation {
    moduleName: string;
    instanceName: string;
    connections: Map<string, string>; // portName -> signalName
    paramOverrides: Map<string, string>; // paramName -> rawExpression (或 #index -> rawExpression)
}

export interface ModuleDef {
    name: string;
    fileUri: vscode.Uri;
    instances: Instantiation[];
    parameters: Map<string, string>; // paramName -> defaultValueExpression
    paramOrder: string[]; // 宣告於 module #(...) 標頭中的 parameter 順序（供位置型參數覆寫對應）
}

export class VerilogParser {
    public modules: Map<string, ModuleDef> = new Map();

    public async parseWorkspace() {
        this.modules.clear();
        const files = await vscode.workspace.findFiles('**/*.{v,sv}', '**/node_modules/**');
        for (const file of files) {
            await this.parseFile(file);
        }
    }

    private async parseFile(fileUri: vscode.Uri) {
        const content = fs.readFileSync(fileUri.fsPath, 'utf8');
        
        // 移除註解與編譯器指示字
        const cleanContent = content
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/`(?:ifdef|ifndef|else|elsif|endif|define|undef|include|timescale|default_nettype)\b.*$/gm, '');
        
        const moduleRegex = /\bmodule\s+([a-zA-Z_]\w*)/g;
        let moduleMatch;

        const moduleBlocks: { name: string; headerParamsStr: string; content: string }[] = [];

        while ((moduleMatch = moduleRegex.exec(cleanContent)) !== null) {
            const moduleName = moduleMatch[1];
            const endMatch = cleanContent.indexOf('endmodule', moduleMatch.index);
            if (endMatch !== -1) {
                const headerInfo = this.extractModuleHeaderAndBodyStart(
                    cleanContent,
                    moduleMatch.index + moduleMatch[0].length,
                    endMatch
                );
                moduleBlocks.push({
                    name: moduleName,
                    headerParamsStr: headerInfo.headerParamsStr,
                    content: cleanContent.substring(headerInfo.bodyStart, endMatch)
                });
            }
        }

        const keywords = new Set([
            'module', 'endmodule', 'always', 'initial', 'if', 'else', 'for', 'while', 'case', 'endcase',
            'assign', 'always_ff', 'always_comb', 'always_latch', 'logic', 'wire', 'reg', 'integer',
            'genvar', 'generate', 'endgenerate', 'begin', 'end', 'function', 'endfunction', 'task', 'endtask',
            'return', 'input', 'output', 'inout', 'parameter', 'localparam', 'typedef', 'struct', 'enum', 'union'
        ]);

        for (const block of moduleBlocks) {
            const modDef: ModuleDef = {
                name: block.name,
                fileUri,
                instances: [],
                parameters: new Map(),
                paramOrder: []
            };

            // 1. 解析模組標頭 #(...) 與本體中的 parameter / localparam 宣告
            this.parseModuleParameters(block.headerParamsStr, block.content, modDef);

            // 2. 解析模組實例化與 #(...) 參數傳遞
            const instHeaderRegex = /\b([a-zA-Z_]\w*)\b/g;
            let headerMatch;
            while ((headerMatch = instHeaderRegex.exec(block.content)) !== null) {
                const instModuleName = headerMatch[1];
                if (keywords.has(instModuleName)) {
                    continue;
                }

                let cursor = instHeaderRegex.lastIndex;
                // 略過空白
                while (cursor < block.content.length && /\s/.test(block.content[cursor])) {
                    cursor++;
                }

                let paramsRawStr = '';
                // 若有 #(...) 參數區塊，支援巢狀括號解析
                if (block.content[cursor] === '#') {
                    cursor++;
                    while (cursor < block.content.length && /\s/.test(block.content[cursor])) {
                        cursor++;
                    }
                    if (block.content[cursor] !== '(') {
                        continue;
                    }
                    const paramCloseIdx = this.findMatchingParen(block.content, cursor);
                    if (paramCloseIdx === -1) {
                        continue;
                    }
                    paramsRawStr = block.content.substring(cursor + 1, paramCloseIdx);
                    cursor = paramCloseIdx + 1;
                    while (cursor < block.content.length && /\s/.test(block.content[cursor])) {
                        cursor++;
                    }
                }

                // 解析實例名稱 (Instance Name)
                const instNameMatch = block.content.slice(cursor).match(/^([a-zA-Z_]\w*)\s*\(/);
                if (!instNameMatch) {
                    continue;
                }

                const instName = instNameMatch[1];
                if (keywords.has(instName)) {
                    continue;
                }

                const portsOpenIdx = cursor + instNameMatch[0].lastIndexOf('(');
                const portsCloseIdx = this.findMatchingParen(block.content, portsOpenIdx);
                if (portsCloseIdx === -1) {
                    continue;
                }

                // 確認閉合括號後方是否緊接 ';'
                let afterPorts = portsCloseIdx + 1;
                while (afterPorts < block.content.length && /\s/.test(block.content[afterPorts])) {
                    afterPorts++;
                }
                if (block.content[afterPorts] !== ';') {
                    continue;
                }

                const portsStr = block.content.substring(portsOpenIdx + 1, portsCloseIdx);
                instHeaderRegex.lastIndex = afterPorts + 1;

                // 解析實例化時的 #(...) 參數覆寫
                const paramOverrides = this.parseInstanceParamOverrides(paramsRawStr);

                const connections = new Map<string, string>();
                let pIdx = 0;
                while (pIdx < portsStr.length) {
                    const dotIdx = portsStr.indexOf('.', pIdx);
                    if (dotIdx === -1) break;

                    const portNameMatch = portsStr.slice(dotIdx + 1).match(/^\s*([a-zA-Z_]\w*)\s*\(/);
                    if (!portNameMatch) {
                        pIdx = dotIdx + 1;
                        continue;
                    }

                    const portName = portNameMatch[1];
                    const portOpenIdx = dotIdx + 1 + portNameMatch[0].lastIndexOf('(');
                    const portCloseIdx = this.findMatchingParen(portsStr, portOpenIdx);
                    if (portCloseIdx === -1) {
                        pIdx = dotIdx + 1;
                        continue;
                    }

                    const rawSignal = portsStr.substring(portOpenIdx + 1, portCloseIdx).trim();
                    // 擷取訊號識別字以對應 hover 查詢
                    const sigWordMatch = rawSignal.match(/([a-zA-Z_]\w*)/);
                    if (sigWordMatch) {
                        connections.set(portName, sigWordMatch[1]);
                    }

                    pIdx = portCloseIdx + 1;
                }

                modDef.instances.push({
                    moduleName: instModuleName,
                    instanceName: instName,
                    connections,
                    paramOverrides
                });
            }

            this.modules.set(block.name, modDef);
        }
    }

    // 解析模組的 parameter / localparam 預設值（包含 module #(...) 標頭與模組本體）
    private parseModuleParameters(headerParamsStr: string, bodyContent: string, modDef: ModuleDef) {
        // 1. 解析 module #(...) 標頭內的參數宣告
        if (headerParamsStr.trim().length > 0) {
            const items = this.splitTopLevelComma(headerParamsStr);
            for (const item of items) {
                const assignMatch = item.match(/([a-zA-Z_]\w*)\s*=\s*([\s\S]+)$/);
                if (assignMatch) {
                    const paramName = assignMatch[1].trim();
                    const paramVal = assignMatch[2].trim();
                    modDef.parameters.set(paramName, paramVal);
                    if (!modDef.paramOrder.includes(paramName)) {
                        modDef.paramOrder.push(paramName);
                    }
                }
            }
        }

        // 2. 解析模組本體中的 parameter / localparam 語句（例如 parameter WIDTH = 8, DEPTH = 16;）
        const bodyParamRegex = /\b(parameter|localparam)\b([^;]+);/g;
        let match;
        while ((match = bodyParamRegex.exec(bodyContent)) !== null) {
            const kw = match[1];
            const declStr = match[2];
            const items = this.splitTopLevelComma(declStr);
            for (const item of items) {
                const assignMatch = item.match(/([a-zA-Z_]\w*)\s*=\s*([\s\S]+)$/);
                if (assignMatch) {
                    const paramName = assignMatch[1].trim();
                    const paramVal = assignMatch[2].trim();
                    modDef.parameters.set(paramName, paramVal);
                    if (kw === 'parameter' && !modDef.paramOrder.includes(paramName)) {
                        modDef.paramOrder.push(paramName);
                    }
                }
            }
        }
    }

    // 解析實例化 #(...) 中的參數覆寫（支援具名 .PARAM(VAL) 與位置型 #(VAL1, VAL2)）
    private parseInstanceParamOverrides(paramsRawStr: string): Map<string, string> {
        const overrides = new Map<string, string>();
        const trimmed = paramsRawStr.trim();
        if (!trimmed) return overrides;

        // 具名參數覆寫：.PARAM_NAME(EXPR)
        if (trimmed.includes('.')) {
            let pIdx = 0;
            while (pIdx < trimmed.length) {
                const dotIdx = trimmed.indexOf('.', pIdx);
                if (dotIdx === -1) break;

                const nameMatch = trimmed.slice(dotIdx + 1).match(/^\s*([a-zA-Z_]\w*)\s*\(/);
                if (!nameMatch) {
                    pIdx = dotIdx + 1;
                    continue;
                }

                const paramName = nameMatch[1];
                const openIdx = dotIdx + 1 + nameMatch[0].lastIndexOf('(');
                const closeIdx = this.findMatchingParen(trimmed, openIdx);
                if (closeIdx === -1) {
                    pIdx = dotIdx + 1;
                    continue;
                }

                const rawVal = trimmed.substring(openIdx + 1, closeIdx).trim();
                overrides.set(paramName, rawVal);
                pIdx = closeIdx + 1;
            }
        } else {
            // 位置型參數覆寫：#(VAL1, VAL2) -> 儲存為 #0, #1, ...
            const items = this.splitTopLevelComma(trimmed);
            items.forEach((item, idx) => {
                if (item.trim()) {
                    overrides.set(`#${idx}`, item.trim());
                }
            });
        }

        return overrides;
    }

    // 以最外層逗號分割字串（忽略小括號、中括號、大括號內部的逗號）
    private splitTopLevelComma(str: string): string[] {
        const result: string[] = [];
        let current = '';
        let parenDepth = 0;
        let bracketDepth = 0;
        let braceDepth = 0;

        for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
            else if (ch === '[') bracketDepth++;
            else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
            else if (ch === '{') braceDepth++;
            else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);

            if (ch === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        if (current.trim()) {
            result.push(current.trim());
        }
        return result;
    }

    // 尋找對應的閉合括號位置（支援巢狀括號）
    private findMatchingParen(text: string, openIdx: number): number {
        if (text[openIdx] !== '(') return -1;
        let depth = 1;
        for (let i = openIdx + 1; i < text.length; i++) {
            if (text[i] === '(') depth++;
            else if (text[i] === ')') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    // 擷取 module #(...) 標頭參數內容，並定位模組本體起始索引（跳過 #(...) 與 (...) 列表及結尾分號）
    private extractModuleHeaderAndBodyStart(content: string, startIdx: number, endLimit: number): { headerParamsStr: string; bodyStart: number } {
        let idx = startIdx;
        let headerParamsStr = '';
        while (idx < endLimit) {
            while (idx < endLimit && /\s/.test(content[idx])) idx++;
            if (content[idx] === '#') {
                idx++;
                while (idx < endLimit && /\s/.test(content[idx])) idx++;
                if (content[idx] === '(') {
                    const closeIdx = this.findMatchingParen(content, idx);
                    if (closeIdx !== -1 && closeIdx < endLimit) {
                        headerParamsStr = content.substring(idx + 1, closeIdx);
                        idx = closeIdx + 1;
                        continue;
                    }
                }
            }
            if (content[idx] === '(') {
                const closeIdx = this.findMatchingParen(content, idx);
                if (closeIdx !== -1 && closeIdx < endLimit) {
                    idx = closeIdx + 1;
                    continue;
                }
            }
            if (content[idx] === ';') {
                return { headerParamsStr, bodyStart: idx + 1 };
            }
            // 若遇到其他非標頭字元則向後尋找第一個分號
            const semiIdx = content.indexOf(';', idx);
            if (semiIdx !== -1 && semiIdx < endLimit) {
                return { headerParamsStr, bodyStart: semiIdx + 1 };
            }
            break;
        }
        return { headerParamsStr, bodyStart: startIdx };
    }

    public findModuleByUri(uri: vscode.Uri): string | null {
        for (const [name, mod] of this.modules.entries()) {
            if (mod.fileUri.fsPath === uri.fsPath) {
                return name;
            }
        }
        return null;
    }
}
