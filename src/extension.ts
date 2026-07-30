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
                if (paths.length === 0 || (paths.length === 1 && paths[0] === `${moduleName}.${word}`)) {
                    return null; 
                }

                const md = new vscode.MarkdownString();
                md.appendMarkdown('**Verilog Signal Dataflow:**\n\n');
                paths.forEach(p => {
                    md.appendCodeblock(p, 'plaintext');
                });

                return new vscode.Hover(md);
            }
        }
    );

    context.subscriptions.push(hoverProvider);
}

export function deactivate() {}
