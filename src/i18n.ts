import * as vscode from 'vscode';

// 支援之語系定義
export type SupportedLocale = 'en' | 'zh-tw' | 'zh-cn';

// 多國語系字串介面
export interface I18nStrings {
    // 區塊圖介面文字
    title: string;
    zoomIn: string;
    zoomInTitle: string;
    zoomOut: string;
    zoomOutTitle: string;
    fitView: string;
    fitViewTitle: string;
    autoLayout: string;
    autoLayoutTitle: string;
    clearAll: string;
    clearAllTitle: string;
    sidebarToggle: string;
    sidebarToggleTitle: string;
    emptyTitle: string;
    emptyDesc: string;
    sidebarHeader: string;
    noDataflows: string;
    hideFlow: string;
    showFlow: string;
    removeFlow: string;
    jumpToCode: string;
    topModuleLabel: string;
    moduleLabelPrefix: string;
    activeText: string;
    dataflowUnitSingular: string;
    dataflowUnitPlural: string;

    // 通知訊息 (Extension 端)
    flowUpdated: string;
    flowAdded: string;
    openFileWarning: string;
    selectSignalWarning: string;
    noModuleWarning: string;
}

// 語系字典
export const I18N_DICTIONARIES: Record<SupportedLocale, I18nStrings> = {
    'en': {
        title: '⚡ Verilog Dataflow Diagram',
        zoomIn: '➕ Zoom In',
        zoomInTitle: 'Zoom In',
        zoomOut: '➖ Zoom Out',
        zoomOutTitle: 'Zoom Out',
        fitView: '⛶ Fit View',
        fitViewTitle: 'Fit View',
        autoLayout: '↺ Auto Layout',
        autoLayoutTitle: 'Reset Auto Layout',
        clearAll: '✕ Clear',
        clearAllTitle: 'Clear All Dataflows',
        sidebarToggle: '📋 List',
        sidebarToggleTitle: 'Toggle Dataflow List',
        emptyTitle: 'No Dataflows Added',
        emptyDesc: 'Right-click a signal name in Verilog code and select <strong>"Add to Block Diagram"</strong> to visualize module and signal flow here.',
        sidebarHeader: 'Dataflow List',
        noDataflows: 'No dataflows added yet',
        hideFlow: 'Hide this dataflow',
        showFlow: 'Show this dataflow',
        removeFlow: 'Remove this dataflow',
        jumpToCode: 'Click to jump to code:',
        topModuleLabel: 'Top Module',
        moduleLabelPrefix: 'module',
        activeText: 'visible',
        dataflowUnitSingular: 'Dataflow',
        dataflowUnitPlural: 'Dataflows',
        flowUpdated: 'Updated Dataflow: {name}',
        flowAdded: 'Added Dataflow {name} to block diagram',
        openFileWarning: 'Please open a Verilog file first',
        selectSignalWarning: 'Please select or place cursor on a Verilog signal name to trace',
        noModuleWarning: 'Unable to identify the corresponding Verilog module in this file'
    },
    'zh-tw': {
        title: '⚡ Verilog Dataflow 區塊圖',
        zoomIn: '➕ 放大',
        zoomInTitle: '放大',
        zoomOut: '➖ 縮小',
        zoomOutTitle: '縮小',
        fitView: '⛶ 最適大小',
        fitViewTitle: '最適大小',
        autoLayout: '↺ 重新排版',
        autoLayoutTitle: '重新自動排版',
        clearAll: '✕ 清空',
        clearAllTitle: '清空全部',
        sidebarToggle: '📋 清單',
        sidebarToggleTitle: '切換清單面板',
        emptyTitle: '尚未加入 Dataflow',
        emptyDesc: '在 Verilog 程式碼中的訊號名稱上點選右鍵，選擇<strong>「Add to Block Diagram」</strong>，即可在此檢視模組與訊號流向區塊圖。',
        sidebarHeader: '已加入 Dataflow 列表',
        noDataflows: '尚未加入任何 Dataflow',
        hideFlow: '隱藏此 Dataflow',
        showFlow: '顯示此 Dataflow',
        removeFlow: '移除此 Dataflow',
        jumpToCode: '點擊跳轉至程式碼：',
        topModuleLabel: 'Top Module',
        moduleLabelPrefix: 'module',
        activeText: '顯示中',
        dataflowUnitSingular: 'Dataflow',
        dataflowUnitPlural: 'Dataflows',
        flowUpdated: '已更新 Dataflow: {name}',
        flowAdded: '已將 Dataflow {name} 加入至區塊圖',
        openFileWarning: '請先開啟 Verilog 檔案',
        selectSignalWarning: '請選取或將游標移至欲追蹤之 Verilog 訊號名稱上',
        noModuleWarning: '無法在此檔案中識別對應的 Verilog 模組'
    },
    'zh-cn': {
        title: '⚡ Verilog Dataflow 框图',
        zoomIn: '➕ 放大',
        zoomInTitle: '放大',
        zoomOut: '➖ 缩小',
        zoomOutTitle: '缩小',
        fitView: '⛶ 适应视图',
        fitViewTitle: '适应视图',
        autoLayout: '↺ 重新排版',
        autoLayoutTitle: '重新自动排版',
        clearAll: '✕ 清空',
        clearAllTitle: '清空全部',
        sidebarToggle: '📋 列表',
        sidebarToggleTitle: '切换列表面板',
        emptyTitle: '尚未加入 Dataflow',
        emptyDesc: '在 Verilog 代码中的信号名称上右键，选择<strong>“Add to Block Diagram”</strong>，即可在此查看模块与信号流向框图。',
        sidebarHeader: '已加入 Dataflow 列表',
        noDataflows: '尚未加入任何 Dataflow',
        hideFlow: '隐藏此 Dataflow',
        showFlow: '显示此 Dataflow',
        removeFlow: '移除此 Dataflow',
        jumpToCode: '点击跳转至代码：',
        topModuleLabel: 'Top Module',
        moduleLabelPrefix: 'module',
        activeText: '显示中',
        dataflowUnitSingular: 'Dataflow',
        dataflowUnitPlural: 'Dataflows',
        flowUpdated: '已更新 Dataflow: {name}',
        flowAdded: '已将 Dataflow {name} 加入至框图',
        openFileWarning: '请先打开 Verilog 文件',
        selectSignalWarning: '请选取或将光标移至欲追踪的 Verilog 信号名称上',
        noModuleWarning: '无法在此文件中识别对应的 Verilog 模块'
    }
};

/**
 * 取得當前 VS Code 的顯示語言
 */
export function getCurrentLocale(): SupportedLocale {
    const lang = (vscode.env.language || '').toLowerCase();
    if (lang.startsWith('zh-tw') || lang.startsWith('zh-hk') || lang.startsWith('zh-hant') || lang.startsWith('zh-mo')) {
        return 'zh-tw';
    }
    if (lang.startsWith('zh')) {
        return 'zh-cn';
    }
    return 'en';
}

/**
 * 取得當前語系之翻譯字典
 */
export function getI18n(locale?: SupportedLocale): I18nStrings {
    const current = locale || getCurrentLocale();
    return I18N_DICTIONARIES[current] || I18N_DICTIONARIES['en'];
}

/**
 * 字串樣板格式化輔助函式
 */
export function formatString(template: string, args: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
        return args[key] !== undefined ? String(args[key]) : `{${key}}`;
    });
}
