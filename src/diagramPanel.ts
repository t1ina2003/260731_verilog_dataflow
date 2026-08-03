import * as vscode from 'vscode';
import { TraceNode } from './tracker';

export interface DataFlowItem {
    id: string;
    name: string;
    sourceModule: string;
    sourceSignal: string;
    paths: TraceNode[][];
    color: string;
    visible: boolean;
    addedAt: number;
}

// 預設鮮明且具現代感之顏色調色盤
const COLOR_PALETTE = [
    '#38bdf8', // 亮天藍 (Sky)
    '#fbbf24', // 琥珀黃 (Amber)
    '#34d399', // 翡翠綠 (Emerald)
    '#f43f5e', // 玫瑰紅 (Rose)
    '#a78bfa', // 紫羅蘭 (Violet)
    '#fb923c', // 珊瑚橘 (Orange)
    '#f472b6', // 櫻花粉 (Pink)
    '#2dd4bf', // 青綠 (Teal)
    '#818cf8', // 靛藍 (Indigo)
    '#e879f9'  // 霓虹紫 (Fuchsia)
];

export class BlockDiagramPanel {
    public static currentPanel: BlockDiagramPanel | undefined;
    private static readonly viewType = 'verilogBlockDiagram';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _flows: DataFlowItem[] = [];
    private _colorIndex = 0;

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;

        if (BlockDiagramPanel.currentPanel) {
            BlockDiagramPanel.currentPanel._panel.reveal(column);
            return BlockDiagramPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            BlockDiagramPanel.viewType,
            'Verilog Dataflow Block Diagram',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        BlockDiagramPanel.currentPanel = new BlockDiagramPanel(panel, extensionUri);
        return BlockDiagramPanel.currentPanel;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // 設定 Webview 初始 HTML
        this._update();

        // 監聽 Webview 關閉事件
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // 處理來自 Webview 的訊息
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'goto': {
                        // 轉發給 extension 中的 goto 指令
                        await vscode.commands.executeCommand('verilogDataflow.goto', {
                            module: message.module,
                            target: message.target,
                            signal: message.signal
                        });
                        break;
                    }
                    case 'removeFlow': {
                        this.removeFlow(message.id);
                        break;
                    }
                    case 'toggleFlow': {
                        this.toggleFlow(message.id);
                        break;
                    }
                    case 'clearAllFlows': {
                        this.clearAllFlows();
                        break;
                    }
                    case 'requestData': {
                        this._sendFlows();
                        break;
                    }
                }
            },
            null,
            this._disposables
        );
    }

    // 新增一條 Dataflow
    public addFlow(sourceModule: string, sourceSignal: string, paths: TraceNode[][]) {
        // 檢查是否已存在相同 module 及 signal 的 flow
        const existingIndex = this._flows.findIndex(
            f => f.sourceModule === sourceModule && f.sourceSignal === sourceSignal
        );

        if (existingIndex !== -1) {
            // 已存在則更新其路徑並設為顯示
            this._flows[existingIndex].paths = paths;
            this._flows[existingIndex].visible = true;
            vscode.window.showInformationMessage(`已更新 Dataflow: ${sourceModule}.${sourceSignal}`);
        } else {
            const color = COLOR_PALETTE[this._colorIndex % COLOR_PALETTE.length];
            this._colorIndex++;

            const newFlow: DataFlowItem = {
                id: `flow_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: `${sourceModule}.${sourceSignal}`,
                sourceModule,
                sourceSignal,
                paths,
                color,
                visible: true,
                addedAt: Date.now()
            };
            this._flows.push(newFlow);
            vscode.window.showInformationMessage(`已將 Dataflow ${sourceModule}.${sourceSignal} 加入至區塊圖`);
        }

        this._sendFlows();
    }

    // 移除指定 Flow
    public removeFlow(id: string) {
        this._flows = this._flows.filter(f => f.id !== id);
        this._sendFlows();
    }

    // 切換指定 Flow 的可見度
    public toggleFlow(id: string) {
        const flow = this._flows.find(f => f.id === id);
        if (flow) {
            flow.visible = !flow.visible;
            this._sendFlows();
        }
    }

    // 清空所有 Flow
    public clearAllFlows() {
        this._flows = [];
        this._sendFlows();
    }

    private _sendFlows() {
        this._panel.webview.postMessage({
            type: 'setFlows',
            flows: this._flows
        });
    }

    public dispose() {
        BlockDiagramPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        this._panel.title = 'Verilog Dataflow Block Diagram';
        this._panel.webview.html = this._getHtmlForWebview();
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verilog Dataflow Block Diagram</title>
    <style>
        :root {
            --bg-color: var(--vscode-editor-background, #1e1e2e);
            --fg-color: var(--vscode-editor-foreground, #cdd6f4);
            --panel-bg: var(--vscode-sideBar-background, #181825);
            --card-bg: var(--vscode-editorWidget-background, #1e1e2e);
            --border-color: var(--vscode-panel-border, rgba(255, 255, 255, 0.12));
            --block-bg: var(--vscode-editorGroupHeader-tabsBackground, #24273a);
            --block-header: var(--vscode-activityBar-background, #181926);
            --block-border: var(--vscode-focusBorder, #89b4fa);
            --text-muted: var(--vscode-descriptionForeground, #a6adc8);
            --btn-bg: var(--vscode-button-background, #89b4fa);
            --btn-fg: var(--vscode-button-foreground, #11111b);
            --btn-hover: var(--vscode-button-hoverBackground, #b4befe);
            --badge-bg: var(--vscode-badge-background, #313244);
            --badge-fg: var(--vscode-badge-foreground, #cdd6f4);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            background-color: var(--bg-color);
            color: var(--fg-color);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            width: 100vw;
            height: 100vh;
            user-select: none;
        }

        /* 工具列 Header */
        .toolbar {
            height: 44px;
            background-color: var(--panel-bg);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            flex-shrink: 0;
            z-index: 10;
        }

        .title-area {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .title-area h2 {
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .count-badge {
            background-color: var(--badge-bg);
            color: var(--badge-fg);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
        }

        .controls {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn {
            background-color: var(--card-bg);
            color: var(--fg-color);
            border: 1px solid var(--border-color);
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
            transition: all 0.15s ease;
        }

        .btn:hover {
            background-color: var(--badge-bg);
            border-color: var(--block-border);
        }

        .btn-primary {
            background-color: var(--btn-bg);
            color: var(--btn-fg);
            font-weight: 600;
            border: none;
        }

        .btn-primary:hover {
            background-color: var(--btn-hover);
        }

        .btn-danger:hover {
            color: #f38ba8;
            border-color: #f38ba8;
        }

        /* 主工作區域 */
        .main-container {
            flex: 1;
            display: flex;
            position: relative;
            overflow: hidden;
        }

        /* 畫布區域 */
        .canvas-area {
            flex: 1;
            position: relative;
            overflow: hidden;
            background-color: var(--bg-color);
            background-image: 
                radial-gradient(var(--border-color) 1px, transparent 1px);
            background-size: 24px 24px;
            cursor: grab;
        }

        .canvas-area.grabbing {
            cursor: grabbing;
        }

        svg#graph-svg {
            width: 100%;
            height: 100%;
            display: block;
        }

        /* 側邊 Dataflow 管理面板 */
        .flow-sidebar {
            width: 280px;
            background-color: var(--panel-bg);
            border-left: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
            transition: width 0.2s ease;
        }

        .flow-sidebar.collapsed {
            width: 0;
            border-left: none;
            overflow: hidden;
        }

        .sidebar-header {
            padding: 10px 14px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-muted);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .flow-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .flow-card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            position: relative;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .flow-card:hover {
            border-color: var(--block-border);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .flow-card.inactive {
            opacity: 0.45;
        }

        .flow-card-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .flow-card-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 13px;
        }

        .flow-color-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .flow-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .icon-btn {
            background: none;
            border: none;
            color: var(--text-muted);
            cursor: pointer;
            padding: 3px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .icon-btn:hover {
            color: var(--fg-color);
            background-color: var(--badge-bg);
        }

        .icon-btn.delete:hover {
            color: #f38ba8;
        }

        .flow-card-path {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 11px;
            color: var(--text-muted);
            line-height: 1.4;
            word-break: break-all;
            background: rgba(0, 0, 0, 0.15);
            padding: 4px 6px;
            border-radius: 4px;
        }

        /* 空狀態提示 */
        .empty-state {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            color: var(--text-muted);
            max-width: 360px;
            padding: 24px;
            pointer-events: none;
        }

        .empty-state-icon {
            font-size: 42px;
            margin-bottom: 12px;
            opacity: 0.8;
        }

        .empty-state h3 {
            font-size: 16px;
            color: var(--fg-color);
            margin-bottom: 8px;
        }

        .empty-state p {
            font-size: 13px;
            line-height: 1.5;
        }

        /* SVG 內部節點與連線樣式 */
        .svg-block {
            cursor: move;
            transition: filter 0.15s ease;
        }

        .svg-block:hover {
            filter: drop-shadow(0 4px 12px rgba(0,0,0,0.35));
        }

        .svg-block-rect {
            fill: var(--block-bg);
            stroke: var(--border-color);
            stroke-width: 1.5px;
            rx: 8px;
            ry: 8px;
        }

        .svg-block.is-top .svg-block-rect {
            stroke: var(--block-border);
            stroke-width: 2px;
        }

        .svg-block-header-rect {
            fill: var(--block-header);
            rx: 8px;
            ry: 8px;
        }

        .svg-block-title {
            fill: var(--fg-color);
            font-weight: 600;
            font-size: 13px;
            dominant-baseline: middle;
        }

        .svg-block-sub {
            fill: var(--text-muted);
            font-size: 10px;
            dominant-baseline: middle;
            font-family: monospace;
        }

        .svg-port-row {
            cursor: pointer;
        }

        .svg-port-row:hover .svg-port-label {
            fill: var(--block-border);
            font-weight: 600;
        }

        .svg-port-pin {
            fill: var(--text-muted);
            transition: all 0.15s ease;
        }

        .svg-port-row:hover .svg-port-pin {
            fill: var(--block-border);
            r: 5;
        }

        .svg-port-label {
            fill: var(--fg-color);
            font-size: 11px;
            font-family: monospace;
            dominant-baseline: middle;
        }

        .svg-wire {
            fill: none;
            stroke-linecap: round;
            stroke-linejoin: round;
            transition: stroke-width 0.2s ease, opacity 0.2s ease;
        }

        .svg-wire-bg {
            fill: none;
            stroke: var(--bg-color);
            stroke-width: 6px;
            stroke-linecap: round;
        }

        .svg-wire:hover {
            stroke-width: 4px !important;
            filter: drop-shadow(0 0 6px currentColor);
        }

        .wire-label {
            font-family: monospace;
            font-size: 10px;
            fill: var(--text-muted);
            pointer-events: none;
            dominant-baseline: middle;
            text-anchor: middle;
        }

        /* 提示浮動窗 Tooltip */
        .tooltip {
            position: absolute;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            color: var(--fg-color);
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 11px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease;
            z-index: 1000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            font-family: monospace;
        }
    </style>
</head>
<body>
    <!-- 頂部工具列 -->
    <div class="toolbar">
        <div class="title-area">
            <h2>⚡ Verilog Dataflow Block Diagram</h2>
            <span class="count-badge" id="flow-count-badge">0 Dataflows</span>
        </div>
        <div class="controls">
            <button class="btn" id="btn-zoom-in" title="放大">➕ 放大</button>
            <button class="btn" id="btn-zoom-out" title="縮小">➖ 縮小</button>
            <button class="btn" id="btn-fit-view" title="最適大小">⛶ 最適大小</button>
            <button class="btn" id="btn-auto-layout" title="重新自動排版">↺ 重新排版</button>
            <button class="btn btn-danger" id="btn-clear-all" title="清空全部">✕ 清空</button>
            <button class="btn" id="btn-toggle-sidebar" title="切換清單面板">📋 清單</button>
        </div>
    </div>

    <!-- 主顯示區域 -->
    <div class="main-container">
        <!-- SVG 區塊圖畫布 -->
        <div class="canvas-area" id="canvas-container">
            <svg id="graph-svg">
                <defs id="svg-defs">
                    <!-- 動態箭頭 Marker 會由 JS 生成 -->
                </defs>
                <g id="transform-group">
                    <g id="wires-group"></g>
                    <g id="blocks-group"></g>
                </g>
            </svg>

            <!-- 空狀態提示 -->
            <div class="empty-state" id="empty-state">
                <div class="empty-state-icon">🔲 ➔ 🔲</div>
                <h3>尚未加入 Dataflow</h3>
                <p>在 Verilog 程式碼中的訊號名稱上點選右鍵，選擇<strong>「加入至 Dataflow 區塊圖」</strong>，即可在此檢視模組與訊號流向區塊圖。</p>
            </div>
        </div>

        <!-- 側邊 Dataflow 清單 -->
        <div class="flow-sidebar" id="flow-sidebar">
            <div class="sidebar-header">
                <span>已加入 Dataflow 列表</span>
                <span id="active-flow-text">0 / 0 顯示中</span>
            </div>
            <div class="flow-list" id="flow-list">
                <!-- 由 JS 動態渲染 -->
            </div>
        </div>
    </div>

    <!-- 懸浮提示框 -->
    <div class="tooltip" id="tooltip"></div>

    <script>
        const vscode = acquireVsCodeApi();

        // 狀態管理
        let flows = [];
        let zoom = 1;
        let panX = 40;
        let panY = 40;
        let isPanning = false;
        let startPanX = 0;
        let startPanY = 0;
        let draggingBlockId = null;
        let dragOffset = { x: 0, y: 0 };
        let customBlockPositions = new Map(); // blockId -> { x, y }

        // DOM 元素
        const container = document.getElementById('canvas-container');
        const transformGroup = document.getElementById('transform-group');
        const wiresGroup = document.getElementById('wires-group');
        const blocksGroup = document.getElementById('blocks-group');
        const svgDefs = document.getElementById('svg-defs');
        const emptyState = document.getElementById('empty-state');
        const flowListEl = document.getElementById('flow-list');
        const flowCountBadge = document.getElementById('flow-count-badge');
        const activeFlowText = document.getElementById('active-flow-text');
        const flowSidebar = document.getElementById('flow-sidebar');
        const tooltip = document.getElementById('tooltip');

        // 初始化通知 Extension
        vscode.postMessage({ command: 'requestData' });

        // 監聽 Extension 傳來的訊息
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'setFlows') {
                flows = message.flows || [];
                render();
            }
        });

        // 按鈕事件綁定
        document.getElementById('btn-zoom-in').addEventListener('click', () => zoomBy(1.2));
        document.getElementById('btn-zoom-out').addEventListener('click', () => zoomBy(0.8));
        document.getElementById('btn-fit-view').addEventListener('click', () => fitView());
        document.getElementById('btn-auto-layout').addEventListener('click', () => {
            customBlockPositions.clear();
            render();
            fitView();
        });
        document.getElementById('btn-clear-all').addEventListener('click', () => {
            vscode.postMessage({ command: 'clearAllFlows' });
        });
        document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
            flowSidebar.classList.toggle('collapsed');
        });

        function zoomBy(factor) {
            const rect = container.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            panX = cx - (cx - panX) * factor;
            panY = cy - (cy - panY) * factor;
            zoom *= factor;
            updateTransform();
        }

        function updateTransform() {
            transformGroup.setAttribute('transform', \`translate(\${panX}, \${panY}) scale(\${zoom})\`);
        }

        // 畫布平移拖曳
        container.addEventListener('mousedown', (e) => {
            if (e.target.closest('.svg-block') || e.target.closest('.svg-port-row')) return;
            isPanning = true;
            startPanX = e.clientX - panX;
            startPanY = e.clientY - panY;
            container.classList.add('grabbing');
        });

        window.addEventListener('mousemove', (e) => {
            if (isPanning) {
                panX = e.clientX - startPanX;
                panY = e.clientY - startPanY;
                updateTransform();
            } else if (draggingBlockId) {
                const currentPos = {
                    x: (e.clientX - panX) / zoom - dragOffset.x,
                    y: (e.clientY - panY) / zoom - dragOffset.y
                };
                customBlockPositions.set(draggingBlockId, currentPos);
                renderGraph();
            }
        });

        window.addEventListener('mouseup', () => {
            if (isPanning) {
                isPanning = false;
                container.classList.remove('grabbing');
            }
            if (draggingBlockId) {
                draggingBlockId = null;
            }
        });

        // 滾輪縮放與平移
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                panX = mouseX - (mouseX - panX) * zoomFactor;
                panY = mouseY - (mouseY - panY) * zoomFactor;
                zoom *= zoomFactor;
                updateTransform();
            } else {
                panX -= e.deltaX;
                panY -= e.deltaY;
                updateTransform();
            }
        }, { passive: false });

        // Tooltip 輔助
        function showTooltip(x, y, html) {
            tooltip.innerHTML = html;
            tooltip.style.left = (x + 12) + 'px';
            tooltip.style.top = (y + 12) + 'px';
            tooltip.style.opacity = '1';
        }
        function hideTooltip() {
            tooltip.style.opacity = '0';
        }

        // 主渲染入口
        function render() {
            renderSidebar();
            renderGraph();
        }

        // 渲染側邊欄清單
        function renderSidebar() {
            flowListEl.innerHTML = '';
            const activeCount = flows.filter(f => f.visible).length;
            flowCountBadge.textContent = \`\${flows.length} Dataflows\`;
            activeFlowText.textContent = \`\${activeCount} / \${flows.length} 顯示中\`;

            if (flows.length === 0) {
                flowListEl.innerHTML = '<div style="padding: 12px; color: var(--text-muted); text-align: center;">尚未加入任何 Dataflow</div>';
                return;
            }

            flows.forEach(flow => {
                const card = document.createElement('div');
                card.className = 'flow-card' + (flow.visible ? '' : ' inactive');

                // 產生路徑簡介字串
                const pathSummary = flow.paths.map(p => 
                    p.map(n => \`\${n.target}.\${n.signal}\`).join(' ➔ ')
                ).join('<br/>');

                card.innerHTML = \`
                    <div class="flow-card-top">
                        <div class="flow-card-title">
                            <span class="flow-color-dot" style="background-color: \${flow.color}; box-shadow: 0 0 6px \${flow.color}88;"></span>
                            <span>\${escapeHtml(flow.name)}</span>
                        </div>
                        <div class="flow-actions">
                            <button class="icon-btn" title="\${flow.visible ? '隱藏此 Dataflow' : '顯示此 Dataflow'}" data-action="toggle" data-id="\${flow.id}">
                                \${flow.visible ? '👁️' : '🕶️'}
                            </button>
                            <button class="icon-btn delete" title="移除此 Dataflow" data-action="delete" data-id="\${flow.id}">
                                ✕
                            </button>
                        </div>
                    </div>
                    <div class="flow-card-path">\${pathSummary}</div>
                \`;

                // 點選按鈕行為
                card.querySelector('[data-action="toggle"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({ command: 'toggleFlow', id: flow.id });
                });
                card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({ command: 'removeFlow', id: flow.id });
                });

                flowListEl.appendChild(card);
            });
        }

        function escapeHtml(str) {
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        }

        // 渲染 SVG 區塊圖
        function renderGraph() {
            const activeFlows = flows.filter(f => f.visible);

            if (activeFlows.length === 0) {
                emptyState.style.display = 'flex';
                wiresGroup.innerHTML = '';
                blocksGroup.innerHTML = '';
                svgDefs.innerHTML = '';
                return;
            }

            emptyState.style.display = 'none';

            // 1. 建立圖結構 (Blocks & Wires)
            // Block ID: module + '_' + target (確保唯一)
            const blockMap = new Map(); // blockId -> { id, module, target, moduleType, isModuleRoot, ports: Set<string>, rank: 0 }
            const wireList = []; // { fromBlockId, fromPort, toBlockId, toPort, flowColor, flowId, signalName }

            // 建立箭頭 marker 定義
            let defsHtml = '';
            activeFlows.forEach(flow => {
                defsHtml += \`
                    <marker id="arrow-\${flow.id}" markerWidth="10" markerHeight="10" refX="7" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="\${flow.color}" />
                    </marker>
                \`;
            });
            svgDefs.innerHTML = defsHtml;

            activeFlows.forEach(flow => {
                flow.paths.forEach(path => {
                    for (let i = 0; i < path.length; i++) {
                        const node = path[i];
                        const blockId = \`\${node.module}::\${node.target}\`;

                        if (!blockMap.has(blockId)) {
                            blockMap.set(blockId, {
                                id: blockId,
                                module: node.module,
                                target: node.target,
                                moduleType: node.moduleType || (node.target === node.module ? node.module : 'module'),
                                isModuleRoot: node.target === node.module,
                                ports: new Set(),
                                rank: i
                            });
                        }
                        const block = blockMap.get(blockId);
                        if (node.moduleType) {
                            block.moduleType = node.moduleType;
                        }
                        block.ports.add(node.signal);
                        block.rank = Math.max(block.rank, i);

                        // 建立連線
                        if (i > 0) {
                            const prevNode = path[i - 1];
                            const prevBlockId = \`\${prevNode.module}::\${prevNode.target}\`;
                            wireList.push({
                                fromBlockId: prevBlockId,
                                fromPort: prevNode.signal,
                                fromNode: prevNode,
                                toBlockId: blockId,
                                toPort: node.signal,
                                toNode: node,
                                flowColor: flow.color,
                                flowId: flow.id,
                                signalName: node.signal
                            });
                        }
                    }
                });
            });

            // 2. 佈局計算 (Hierarchical Column Layout)
            const rankGroups = new Map(); // rank -> Block[]
            blockMap.forEach(block => {
                const r = block.rank;
                if (!rankGroups.has(r)) rankGroups.set(r, []);
                rankGroups.get(r).push(block);
            });

            const BLOCK_WIDTH = 190;
            const PORT_HEIGHT = 24;
            const HEADER_HEIGHT = 44;
            const COL_GAP = 120;
            const ROW_GAP = 40;

            const blockLayouts = new Map(); // blockId -> { x, y, width, height, portPositions: Map<port, {x, y, isRight}> }

            const sortedRanks = Array.from(rankGroups.keys()).sort((a, b) => a - b);
            sortedRanks.forEach((rank, colIdx) => {
                const blocksInRank = rankGroups.get(rank);
                let startY = 40;

                blocksInRank.forEach(block => {
                    const portCount = Math.max(block.ports.size, 1);
                    const blockHeight = HEADER_HEIGHT + portCount * PORT_HEIGHT + 14;

                    let x = 40 + colIdx * (BLOCK_WIDTH + COL_GAP);
                    let y = startY;

                    // 若使用者手動拖曳過此區塊，則採用自訂座標
                    if (customBlockPositions.has(block.id)) {
                        const custom = customBlockPositions.get(block.id);
                        x = custom.x;
                        y = custom.y;
                    }

                    startY += blockHeight + ROW_GAP;

                    // 計算每個 port 的接腳錨點座標
                    const portPositions = new Map();
                    let portIdx = 0;
                    block.ports.forEach(port => {
                        const portY = y + HEADER_HEIGHT + portIdx * PORT_HEIGHT + PORT_HEIGHT / 2 + 6;
                        // 預設左邊為 input/inlet (x), 右邊為 output/outlet (x + BLOCK_WIDTH)
                        portPositions.set(port, {
                            left: { x: x, y: portY },
                            right: { x: x + BLOCK_WIDTH, y: portY }
                        });
                        portIdx++;
                    });

                    blockLayouts.set(block.id, {
                        x,
                        y,
                        width: BLOCK_WIDTH,
                        height: blockHeight,
                        portPositions
                    });
                });
            });

            // 3. 繪製連線 Wires
            let wiresHtml = '';
            wireList.forEach((wire) => {
                const fromLayout = blockLayouts.get(wire.fromBlockId);
                const toLayout = blockLayouts.get(wire.toBlockId);

                if (!fromLayout || !toLayout) return;

                const fromPortPos = fromLayout.portPositions.get(wire.fromPort);
                const toPortPos = toLayout.portPositions.get(wire.toPort);

                if (!fromPortPos || !toPortPos) return;

                // 判斷接線起始點與終點（左或右側）
                let p1 = fromPortPos.right;
                let p2 = toPortPos.left;

                if (fromLayout.x > toLayout.x) {
                    p1 = fromPortPos.left;
                    p2 = toPortPos.right;
                }

                // 產生平滑三次貝茲曲線
                const dx = Math.abs(p2.x - p1.x) * 0.5;
                const minCurve = 50;
                const curveOffset = Math.max(dx, minCurve);
                const cx1 = p1.x + (p1 === fromPortPos.right ? curveOffset : -curveOffset);
                const cx2 = p2.x + (p2 === toPortPos.left ? -curveOffset : curveOffset);

                const pathD = \`M \${p1.x} \${p1.y} C \${cx1} \${p1.y}, \${cx2} \${p2.y}, \${p2.x} \${p2.y}\`;

                wiresHtml += \`
                    <g class="svg-wire-group" data-flow="\${wire.flowId}">
                        <path class="svg-wire-bg" d="\${pathD}" />
                        <path class="svg-wire" d="\${pathD}" stroke="\${wire.flowColor}" stroke-width="2.5" marker-end="url(#arrow-\${wire.flowId})" />
                    </g>
                \`;
            });
            wiresGroup.innerHTML = wiresHtml;

            // 4. 繪製模組區塊 Blocks
            let blocksHtml = '';
            blockMap.forEach(block => {
                const layout = blockLayouts.get(block.id);
                if (!layout) return;

                const subLabel = block.isModuleRoot ? 'Top Module' : (block.moduleType ? \`module: \${block.moduleType}\` : \`module: \${block.module}\`);
                const titleLabel = block.target;

                let portsSvg = '';
                let pIdx = 0;
                block.ports.forEach(port => {
                    const py = layout.y + HEADER_HEIGHT + pIdx * PORT_HEIGHT + 6;
                    const textY = py + PORT_HEIGHT / 2;

                    portsSvg += \`
                        <g class="svg-port-row" data-module="\${block.module}" data-target="\${block.target}" data-signal="\${port}">
                            <circle class="svg-port-pin" cx="\${layout.x}" cy="\${textY}" r="3.5" />
                            <circle class="svg-port-pin" cx="\${layout.x + layout.width}" cy="\${textY}" r="3.5" />
                            <text class="svg-port-label" x="\${layout.x + 14}" y="\${textY}">.\${escapeHtml(port)}</text>
                        </g>
                    \`;
                    pIdx++;
                });

                blocksHtml += \`
                    <g class="svg-block \${block.isModuleRoot ? 'is-top' : ''}" id="block-\${block.id}" data-id="\${block.id}">
                        <!-- 主方框 -->
                        <rect class="svg-block-rect" x="\${layout.x}" y="\${layout.y}" width="\${layout.width}" height="\${layout.height}" />
                        <!-- 標題欄底色 -->
                        <rect class="svg-block-header-rect" x="\${layout.x}" y="\${layout.y}" width="\${layout.width}" height="\${HEADER_HEIGHT}" />
                        <!-- 標題文字 -->
                        <text class="svg-block-title" x="\${layout.x + 12}" y="\${layout.y + 18}">\${escapeHtml(titleLabel)}</text>
                        <text class="svg-block-sub" x="\${layout.x + 12}" y="\${layout.y + 33}">\${escapeHtml(subLabel)}</text>
                        <!-- 接腳列表 -->
                        \${portsSvg}
                    </g>
                \`;
            });
            blocksGroup.innerHTML = blocksHtml;

            // 綁定區塊拖曳與點擊事件
            bindGraphEvents(blockLayouts);
            updateTransform();
        }

        // 綁定 SVG 節點事件
        function bindGraphEvents(blockLayouts) {
            // 區塊拖曳
            document.querySelectorAll('.svg-block').forEach(el => {
                const blockId = el.getAttribute('data-id');
                el.addEventListener('mousedown', (e) => {
                    if (e.target.closest('.svg-port-row')) return;
                    e.stopPropagation();
                    draggingBlockId = blockId;
                    const layout = blockLayouts.get(blockId);
                    const mouseSvgX = (e.clientX - panX) / zoom;
                    const mouseSvgY = (e.clientY - panY) / zoom;
                    dragOffset = {
                        x: mouseSvgX - layout.x,
                        y: mouseSvgY - layout.y
                    };
                });
            });

            // 連接埠點選 -> 跳轉 Verilog 程式碼
            document.querySelectorAll('.svg-port-row').forEach(el => {
                const mod = el.getAttribute('data-module');
                const target = el.getAttribute('data-target');
                const sig = el.getAttribute('data-signal');

                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    vscode.postMessage({
                        command: 'goto',
                        module: mod,
                        target: target,
                        signal: sig
                    });
                });

                el.addEventListener('mouseenter', (e) => {
                    showTooltip(e.clientX, e.clientY, \`點擊跳轉至程式碼:<br/><strong>\${target}.\${sig}</strong> (\${mod})\`);
                });
                el.addEventListener('mouseleave', () => hideTooltip());
            });
        }

        // 最適視野計算 (Fit View)
        function fitView() {
            if (flows.filter(f => f.visible).length === 0) {
                panX = 40;
                panY = 40;
                zoom = 1;
                updateTransform();
                return;
            }

            const bbox = transformGroup.getBBox();
            if (bbox.width === 0 || bbox.height === 0) return;

            const rect = container.getBoundingClientRect();
            const padding = 60;
            const scaleX = (rect.width - padding * 2) / bbox.width;
            const scaleY = (rect.height - padding * 2) / bbox.height;
            zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.5);

            panX = (rect.width - bbox.width * zoom) / 2 - bbox.x * zoom;
            panY = (rect.height - bbox.height * zoom) / 2 - bbox.y * zoom;
            updateTransform();
        }
    </script>
</body>
</html>`;
    }
}
