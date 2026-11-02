import * as vscode from 'vscode';
import { VerilogParser } from './parser';
import { SignalTracker } from './tracker';
import { BlockDiagramPanel } from './diagramPanel';
import { getI18n } from './i18n';

export async function activate(context: vscode.ExtensionContext) {
    const parser = new VerilogParser();
    const tracker = new SignalTracker(parser);

    // 解析工作區中的 Verilog 檔案
    await parser.parseWorkspace();

    // 檔案變更監聽器
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{v,sv}');
    watcher.onDidChange(async () => await parser.parseWorkspace());
    watcher.onDidCreate(async () => await parser.parseWorkspace());
    watcher.onDidDelete(async () => await parser.parseWorkspace());
    context.subscriptions.push(watcher);

    // 跳轉至程式碼位置指令
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
            // 支援含 #(...) 參數覆寫的實例化定位
            index = text.search(new RegExp(`\\b${args.target}\\b\\s*\\(`));
            if (index === -1) index = text.search(new RegExp(`\\b${args.target}\\b`));
        }

        if (index !== -1 && args.signal) {
            // 若為實例化且參數定義在 #(...) 中，擴大向前與向後搜尋範圍以精準定位參數或端口
            const searchStart = Math.max(0, index - 800);
            const subText = text.substring(searchStart, index + 2000);
            const sigMatch = subText.search(new RegExp(`\\b${args.signal}\\b`));
            if (sigMatch !== -1) {
                index = searchStart + sigMatch;
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

    // 右鍵選單：將選中的 Dataflow 加入至 Block Diagram 視窗
    const addToBlockDiagramCommand = vscode.commands.registerCommand('verilogDataflow.addToBlockDiagram', async () => {
        const i18n = getI18n();
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(i18n.openFileWarning);
            return;
        }

        let signalName = '';
        const selection = editor.selection;
        if (!selection.isEmpty) {
            signalName = editor.document.getText(selection).trim();
        } else {
            const range = editor.document.getWordRangeAtPosition(editor.selection.active);
            if (range) {
                signalName = editor.document.getText(range).trim();
            }
        }

        if (!signalName) {
            vscode.window.showWarningMessage(i18n.selectSignalWarning);
            return;
        }

        const moduleName = parser.findModuleByUri(editor.document.uri);
        if (!moduleName) {
            vscode.window.showWarningMessage(i18n.noModuleWarning);
            return;
        }

        // 若選取的是 parameter，將參數傳遞鏈轉換為 TraceNode 加入區塊圖
        if (tracker.isParameter(moduleName, signalName)) {
            const paramTraces = tracker.traceParameter(moduleName, signalName);
            const paramPaths = paramTraces.map(chain =>
                chain.map(step => ({
                    module: step.module,
                    target: step.target,
                    signal: `${step.paramName}=${step.resolvedValue}`,
                    moduleType: step.moduleType,
                    value: step.resolvedValue
                }))
            );
            const panel = BlockDiagramPanel.createOrShow(context.extensionUri);
            panel.addFlow(moduleName, signalName, paramPaths);
            return;
        }

        const paths = tracker.traceFull(moduleName, signalName);
        const panel = BlockDiagramPanel.createOrShow(context.extensionUri);
        panel.addFlow(moduleName, signalName, paths);
    });
    context.subscriptions.push(addToBlockDiagramCommand);

    // 指令：開啟 Dataflow Block Diagram 視窗
    const showBlockDiagramCommand = vscode.commands.registerCommand('verilogDataflow.showBlockDiagram', () => {
        BlockDiagramPanel.createOrShow(context.extensionUri);
    });
    context.subscriptions.push(showBlockDiagramCommand);

    // 懸浮提示 Hover 提供者
    const hoverProvider = vscode.languages.registerHoverProvider(
        [{ scheme: 'file', language: 'verilog' }, { scheme: 'file', language: 'systemverilog' }],
        {
            provideHover(document, position, token) {
                const range = document.getWordRangeAtPosition(position);
                if (!range) return null;

                const word = document.getText(range);
                
                const moduleName = parser.findModuleByUri(document.uri);
                if (!moduleName) return null;

                const md = new vscode.MarkdownString();
                md.isTrusted = true;
                let hasContent = false;

                // 1. 檢查是否為 Parameter / Localparam，若是則回溯 Top Module 設定數值與傳遞鏈
                if (tracker.isParameter(moduleName, word)) {
                    const paramChains = tracker.traceParameter(moduleName, word);
                    if (paramChains.length > 0) {
                        hasContent = true;
                        md.appendMarkdown('**Verilog Parameter Value Trace:**\n\n');
                        paramChains.forEach(chain => {
                            const finalStep = chain[chain.length - 1];
                            const topStep = chain[0];
                            md.appendMarkdown(`- **Resolved Value:** \`${finalStep.resolvedValue}\` *(from Top \`${topStep.target}\`)*\n`);
                            const stepLinks = chain.map(step => {
                                const argsTarget = encodeURIComponent(JSON.stringify({ module: step.module, target: step.target }));
                                const argsParam = encodeURIComponent(JSON.stringify({ module: step.module, target: step.target, signal: step.paramName }));
                                const exprSuffix = step.rawExpr && step.rawExpr !== step.resolvedValue
                                    ? ` = \`${step.rawExpr}\` (\`${step.resolvedValue}\`)`
                                    : ` = \`${step.resolvedValue}\``;
                                return `[${step.target}](command:verilogDataflow.goto?${argsTarget}).[${step.paramName}](command:verilogDataflow.goto?${argsParam})${exprSuffix}`;
                            });
                            md.appendMarkdown('  ' + stepLinks.join(' -> ') + '\n');
                        });
                    }
                }

                // 2. 追蹤一般訊號 Dataflow
                const paths = tracker.traceFull(moduleName, word);
                const hasSignalFlow = !(paths.length === 0 || (paths.length === 1 && paths[0].length === 1 && paths[0][0].signal === word));

                if (hasSignalFlow) {
                    if (hasContent) {
                        md.appendMarkdown('\n---\n\n');
                    }
                    hasContent = true;
                    md.appendMarkdown('**Verilog Signal Dataflow:**\n\n');
                    
                    paths.forEach(p => {
                        const strParts = p.map(node => {
                            const argsTarget = encodeURIComponent(JSON.stringify({ module: node.module, target: node.target }));
                            const argsSignal = encodeURIComponent(JSON.stringify({ module: node.module, target: node.target, signal: node.signal }));
                            return `[${node.target}](command:verilogDataflow.goto?${argsTarget}).[${node.signal}](command:verilogDataflow.goto?${argsSignal})`;
                        });
                        md.appendMarkdown('- ' + strParts.join(' -> ') + '\n');
                    });
                }

                if (!hasContent) {
                    return null;
                }

                return new vscode.Hover(md);
            }
        }
    );

    context.subscriptions.push(hoverProvider);
}

export function deactivate() {}
