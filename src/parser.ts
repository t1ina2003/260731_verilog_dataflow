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
        let lastIndex = 0;

        const moduleBlocks: {name: string, content: string}[] = [];

        while ((moduleMatch = moduleRegex.exec(cleanContent)) !== null) {
            const moduleName = moduleMatch[1];
            const endMatch = cleanContent.indexOf('endmodule', moduleMatch.index);
            if (endMatch !== -1) {
                moduleBlocks.push({
                    name: moduleName,
                    content: cleanContent.substring(moduleMatch.index, endMatch)
                });
            }
        }

        for (const block of moduleBlocks) {
            const modDef: ModuleDef = {
                name: block.name,
                fileUri,
                instances: []
            };

            const instRegex = /\b([a-zA-Z_]\w*)\s+(?:#\s*\([\s\S]*?\)\s*)?([a-zA-Z_]\w*)\s*\(([\s\S]*?)\)\s*;/g;
            let instMatch;
            while ((instMatch = instRegex.exec(block.content)) !== null) {
                const instModuleName = instMatch[1];
                const instName = instMatch[2];
                const portsStr = instMatch[3];

                const keywords = new Set([
                    'module', 'endmodule', 'always', 'initial', 'if', 'else', 'for', 'while', 'case', 'endcase',
                    'assign', 'always_ff', 'always_comb', 'always_latch', 'logic', 'wire', 'reg', 'integer',
                    'genvar', 'generate', 'endgenerate', 'begin', 'end', 'function', 'endfunction', 'task', 'endtask', 'return'
                ]);
                if (keywords.has(instModuleName) || keywords.has(instName)) continue;

                const connections = new Map<string, string>();
                const portRegex = /\.\s*([a-zA-Z_]\w*)\s*\(\s*([^)]+)\s*\)/g;
                let portMatch;
                while ((portMatch = portRegex.exec(portsStr)) !== null) {
                    // Extracting the inner variable without spaces
                    const portName = portMatch[1];
                    const rawSignal = portMatch[2];
                    // We extract just the word part to match hover. Ignoring indices for simplicity.
                    const sigWordMatch = rawSignal.match(/([a-zA-Z_]\w*)/);
                    if (sigWordMatch) {
                        connections.set(portName, sigWordMatch[1]);
                    }
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

    public findModuleByUri(uri: vscode.Uri): string | null {
        for (const [name, mod] of this.modules.entries()) {
            if (mod.fileUri.fsPath === uri.fsPath) {
                return name;
            }
        }
        return null;
    }
}
