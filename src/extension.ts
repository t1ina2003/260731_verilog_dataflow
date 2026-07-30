import * as vscode from 'vscode';
import { VerilogParser } from './parser';
import { SignalTracker } from './tracker';

export async function activate(context: vscode.ExtensionContext) {
    const parser = new VerilogParser();
    const tracker = new SignalTracker(parser);

    await parser.parseWorkspace();

    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{v,sv}');
    watcher.onDidChange(async () => await parser.parseWorkspace());
    watcher.onDidCreate(async () => await parser.parseWorkspace());
    watcher.onDidDelete(async () => await parser.parseWorkspace());
    context.subscriptions.push(watcher);

    const gotoCommand = vscode.commands.registerCommand('verilogDataflow.goto', async (args: { module: string, target: string, signal?: string }) => {
        const modDef = parser.modules.get(args.module);
        if (!modDef) return;

        const document = await vscode.workspace.openTextDocument(modDef.fileUri);
        const text = document.getText();
        let index = -1;

        if (args.target === args.module) {
            index = text.indexOf(`module ${args.module}`);
            if (index === -1) index = text.search(new RegExp(`\\bmodule\\s+${args.module}\\b`));
        } else {
            index = text.search(new RegExp(`\\b${args.target}\\b\\s*\\(`));
            if (index === -1) index = text.search(new RegExp(`\\b${args.target}\\b`));
        }

        if (index !== -1 && args.signal) {
            const signalIndex = text.indexOf(args.signal, index);
            if (signalIndex !== -1 && signalIndex < index + 2000) {
                index = signalIndex;
            }
        }

        if (index !== -1) {
            const position = document.positionAt(index);
            const editor = await vscode.window.showTextDocument(document);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
    });
    context.subscriptions.push(gotoCommand);

    const hoverProvider = vscode.languages.registerHoverProvider(
        [{ scheme: 'file', language: 'verilog' }, { scheme: 'file', language: 'systemverilog' }],
        {
            provideHover(document, position, token) {
                const range = document.getWordRangeAtPosition(position);
                if (!range) return null;

                const word = document.getText(range);
                
                const moduleName = parser.findModuleByUri(document.uri);
                if (!moduleName) return null;

                const paths = tracker.traceFull(moduleName, word);
                if (paths.length === 0 || (paths.length === 1 && paths[0].length === 1 && paths[0][0].signal === word)) {
                    return null; 
                }

                const md = new vscode.MarkdownString();
                md.isTrusted = true;
                md.appendMarkdown('**Verilog Signal Dataflow:**\n\n');
                
                paths.forEach(p => {
                    const strParts = p.map(node => {
                        const argsTarget = encodeURIComponent(JSON.stringify({ module: node.module, target: node.target }));
                        const argsSignal = encodeURIComponent(JSON.stringify({ module: node.module, target: node.target, signal: node.signal }));
                        return `[${node.target}](command:verilogDataflow.goto?${argsTarget}).[${node.signal}](command:verilogDataflow.goto?${argsSignal})`;
                    });
                    md.appendMarkdown('- ' + strParts.join(' -> ') + '\n');
                });

                return new vscode.Hover(md);
            }
        }
    );

    context.subscriptions.push(hoverProvider);
}

export function deactivate() {}
