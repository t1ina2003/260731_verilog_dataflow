import * as vscode from 'vscode';
import * as fs from 'fs';

export interface Instantiation {
    moduleName: string;
    instanceName: string;
    connections: Map<string, string>; // portName -> signalName
}

export interface ModuleDef {
    name: string;
    fileUri: vscode.Uri;
    instances: Instantiation[];
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
        
        // Remove comments and compiler directives
        const cleanContent = content
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/`(?:ifdef|ifndef|else|elsif|endif|define|undef|include|timescale|default_nettype)\b.*$/gm, '');
        
        const moduleRegex = /\bmodule\s+([a-zA-Z_]\w*)/g;
        let moduleMatch;

        const moduleBlocks: {name: string, content: string}[] = [];

        while ((moduleMatch = moduleRegex.exec(cleanContent)) !== null) {
            const moduleName = moduleMatch[1];
            const endMatch = cleanContent.indexOf('endmodule', moduleMatch.index);
            if (endMatch !== -1) {
                const bodyStart = this.findModuleBodyStart(cleanContent, moduleMatch.index + moduleMatch[0].length, endMatch);
                moduleBlocks.push({
                    name: moduleName,
                    content: cleanContent.substring(bodyStart, endMatch)
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
                instances: []
            };

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
                    // Extracting the inner variable without spaces
                    // We extract just the word part to match hover. Ignoring indices for simplicity.
                    const sigWordMatch = rawSignal.match(/([a-zA-Z_]\w*)/);
                    if (sigWordMatch) {
                        connections.set(portName, sigWordMatch[1]);
                    }

                    pIdx = portCloseIdx + 1;
                }

                modDef.instances.push({
                    moduleName: instModuleName,
                    instanceName: instName,
                    connections
                });
            }

            this.modules.set(block.name, modDef);
        }
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

    // 定位 module 宣告標頭結束後的本體起始索引（跳過 #(...) 與 (...) 列表及結尾分號）
    private findModuleBodyStart(content: string, startIdx: number, endLimit: number): number {
        let idx = startIdx;
        while (idx < endLimit) {
            while (idx < endLimit && /\s/.test(content[idx])) idx++;
            if (content[idx] === '#') {
                idx++;
                while (idx < endLimit && /\s/.test(content[idx])) idx++;
                if (content[idx] === '(') {
                    const closeIdx = this.findMatchingParen(content, idx);
                    if (closeIdx !== -1 && closeIdx < endLimit) {
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
                return idx + 1;
            }
            // 若遇到其他非標頭字元則向後尋找第一個分號
            const semiIdx = content.indexOf(';', idx);
            if (semiIdx !== -1 && semiIdx < endLimit) {
                return semiIdx + 1;
            }
            break;
        }
        return startIdx;
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
