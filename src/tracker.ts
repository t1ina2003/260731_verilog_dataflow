import { VerilogParser, Instantiation } from './parser';

export interface TraceNode {
    module: string;
    target: string;
    signal: string;
    moduleType?: string; // 模組定義名稱（例如 top, submod_a 等）
    value?: string;      // 參數值或計算結果（供 parameter 追蹤顯示）
}

export interface ParameterTraceStep {
    module: string;       // 定義或傳遞此參數之模組名稱
    target: string;       // 模組名稱或實例名稱
    paramName: string;    // 參數名稱
    rawExpr: string;      // 該層級設定的原始表達式
    resolvedValue: string;// 代入頂層與上層參數後計算出的最終數值
    moduleType?: string;
}

export class SignalTracker {
    constructor(private parser: VerilogParser) {}

    public traceTopDown(moduleName: string, signalName: string): TraceNode[][] {
        const paths: TraceNode[][] = [];
        this.traceParent(moduleName, signalName, [{ module: moduleName, target: moduleName, signal: signalName, moduleType: moduleName }], paths, new Set());
        return paths.length > 0 ? paths : [[{ module: moduleName, target: moduleName, signal: signalName, moduleType: moduleName }]];
    }

    private traceParent(moduleName: string, signalName: string, currentPath: TraceNode[], paths: TraceNode[][], visited: Set<string>) {
        if (visited.has(moduleName)) return;
        visited.add(moduleName);

        let hasParent = false;
        for (const [parentName, parentDef] of this.parser.modules.entries()) {
            for (const inst of parentDef.instances) {
                if (inst.moduleName === moduleName) {
                    if (inst.connections.has(signalName)) {
                        const parentSignal = inst.connections.get(signalName)!;
                        hasParent = true;
                        const newNode = { module: parentName, target: parentName, signal: parentSignal, moduleType: parentName };
                        const updatedCurrentPath = [...currentPath];
                        updatedCurrentPath[0] = { ...updatedCurrentPath[0], target: inst.instanceName, module: parentName, moduleType: inst.moduleName };
                        this.traceParent(parentName, parentSignal, [newNode, ...updatedCurrentPath], paths, new Set(visited));
                    }
                }
            }
        }

        if (!hasParent) {
            paths.push(currentPath);
        }
    }

    public traceBottomUp(moduleName: string, signalName: string): TraceNode[][] {
        const paths: TraceNode[][] = [];
        this.traceChild(moduleName, signalName, [{ module: moduleName, target: moduleName, signal: signalName, moduleType: moduleName }], paths, new Set());
        return paths.length > 0 ? paths : [[{ module: moduleName, target: moduleName, signal: signalName, moduleType: moduleName }]];
    }

    private traceChild(moduleName: string, signalName: string, currentPath: TraceNode[], paths: TraceNode[][], visited: Set<string>) {
        if (visited.has(moduleName)) return;
        visited.add(moduleName);

        const modDef = this.parser.modules.get(moduleName);
        if (!modDef) {
            paths.push(currentPath);
            return;
        }

        let hasChild = false;
        for (const inst of modDef.instances) {
            for (const [port, sig] of inst.connections.entries()) {
                if (sig === signalName) {
                    hasChild = true;
                    const newNode = { module: moduleName, target: inst.instanceName, signal: port, moduleType: inst.moduleName };
                    this.traceChild(inst.moduleName, port, [...currentPath, newNode], paths, new Set(visited));
                }
            }
        }

        if (!hasChild) {
            paths.push(currentPath);
        }
    }

    public traceFull(moduleName: string, signalName: string): TraceNode[][] {
        const upPaths = this.traceTopDown(moduleName, signalName);
        const downPaths = this.traceBottomUp(moduleName, signalName);

        const fullPaths: TraceNode[][] = [];
        for (const up of upPaths) {
            for (const down of downPaths) {
                // Merge up and down. The last element of up and the first element of down represent the same node.
                // But up might have modified target to instanceName. We prefer up's version if it's longer than 1.
                const merged = [...up.slice(0, -1), down[0], ...down.slice(1)];
                if (up.length > 1) {
                    merged[up.length - 1] = up[up.length - 1]; // Use the instance name from up path
                }
                fullPaths.push(merged);
            }
        }
        
        // Remove duplicates by stringifying
        const unique = new Map<string, TraceNode[]>();
        for (const p of fullPaths) {
            unique.set(JSON.stringify(p), p);
        }
        return Array.from(unique.values());
    }

    /**
     * 判斷指定識別字是否為該模組中的 parameter / localparam
     */
    public isParameter(moduleName: string, name: string): boolean {
        const modDef = this.parser.modules.get(moduleName);
        if (!modDef) return false;
        return modDef.parameters.has(name);
    }

    /**
     * 追蹤底層或任意層級模組中的 parameter，一路往上回溯至 Top Module，
     * 並解析出每一層實例化路徑中由 Top 傳入的最終數值。
     */
    public traceParameter(moduleName: string, paramName: string): ParameterTraceStep[][] {
        const modDef = this.parser.modules.get(moduleName);
        if (!modDef || !modDef.parameters.has(paramName)) {
            return [];
        }

        // 收集所有從 Top 模組到達目標 moduleName 的實例化鏈路
        const instanceChains = this.findInstanceChainsToModule(moduleName);
        const results: ParameterTraceStep[][] = [];

        for (const chain of instanceChains) {
            // chain 為從 Top 到目標模組的階層：[{ parentMod, inst }, ...]
            // 依序由上而下建立每個模組實例的已解析參數表 (Resolved Parameter Map)
            const envStack: { modName: string; targetName: string; modType: string; resolvedParams: Map<string, string>; rawParams: Map<string, string> }[] = [];

            if (chain.length === 0) {
                // 目標模組本身就是頂層模組（無上層父模組實例化它）
                const resolved = this.resolveModuleParams(moduleName, new Map());
                const rawExpr = modDef.parameters.get(paramName) || '';
                const finalVal = resolved.get(paramName) || rawExpr;
                results.push([{
                    module: moduleName,
                    target: moduleName,
                    paramName,
                    rawExpr,
                    resolvedValue: finalVal,
                    moduleType: moduleName
                }]);
                continue;
            }

            // 1. 先解析最頂層父模組 (Top Module) 的預設參數
            const topModName = chain[0].parentMod;
            const topModDef = this.parser.modules.get(topModName);
            const topResolved = this.resolveModuleParams(topModName, new Map());
            envStack.push({
                modName: topModName,
                targetName: topModName,
                modType: topModName,
                resolvedParams: topResolved,
                rawParams: topModDef ? new Map(topModDef.parameters) : new Map()
            });

            // 2. 沿著實例化鏈路往下傳遞並計算每一層的覆寫參數值
            for (const step of chain) {
                const parentEnv = envStack[envStack.length - 1];
                const childModName = step.inst.moduleName;
                const childModDef = this.parser.modules.get(childModName);

                const overrideResolved = new Map<string, string>();
                const overrideRaw = new Map<string, string>();

                for (const [k, rawOverrideExpr] of step.inst.paramOverrides.entries()) {
                    let targetParamName = k;
                    if (k.startsWith('#') && childModDef) {
                        const idx = parseInt(k.slice(1), 10);
                        if (!isNaN(idx) && idx < childModDef.paramOrder.length) {
                            targetParamName = childModDef.paramOrder[idx];
                        }
                    }
                    overrideRaw.set(targetParamName, rawOverrideExpr);
                    const evalVal = this.evaluateParamExpr(rawOverrideExpr, parentEnv.resolvedParams);
                    overrideResolved.set(targetParamName, evalVal);
                }

                const childResolved = this.resolveModuleParams(childModName, overrideResolved);
                const combinedRaw = new Map<string, string>();
                if (childModDef) {
                    for (const [pk, pv] of childModDef.parameters.entries()) {
                        combinedRaw.set(pk, pv);
                    }
                }
                for (const [ok, ov] of overrideRaw.entries()) {
                    combinedRaw.set(ok, ov);
                }

                envStack.push({
                    modName: step.parentMod,
                    targetName: step.inst.instanceName,
                    modType: childModName,
                    resolvedParams: childResolved,
                    rawParams: combinedRaw
                });
            }

            // 3. 從目標模組（鏈路末端）往上回溯該參數的數值來源鏈路
            const traceSteps: ParameterTraceStep[] = [];
            let currentParam = paramName;

            for (let i = envStack.length - 1; i >= 0; i--) {
                const env = envStack[i];
                const rawExpr = env.rawParams.get(currentParam) ?? '';
                const resolvedVal = env.resolvedParams.get(currentParam) ?? rawExpr;

                traceSteps.unshift({
                    module: env.modName,
                    target: env.targetName,
                    paramName: currentParam,
                    rawExpr,
                    resolvedValue: resolvedVal,
                    moduleType: env.modType
                });

                if (i > 0) {
                    const stepInst = chain[i - 1].inst;
                    const childModDef = this.parser.modules.get(stepInst.moduleName);
                    let passedExpr: string | undefined = stepInst.paramOverrides.get(currentParam);

                    if (passedExpr === undefined && childModDef) {
                        const orderIdx = childModDef.paramOrder.indexOf(currentParam);
                        if (orderIdx !== -1 && stepInst.paramOverrides.has(`#${orderIdx}`)) {
                            passedExpr = stepInst.paramOverrides.get(`#${orderIdx}`);
                        }
                    }

                    // 若此參數本身未被上層直接覆寫，在同模組內透過 BFS 尋找它所依賴且被上層覆寫的 parameter
                    if (passedExpr === undefined && childModDef) {
                        const depChain = this.findLocalParamDependencyChain(currentParam, childModDef, stepInst);
                        if (depChain.length > 1) {
                            // 依序將同模組內的相依參數節點加入鏈路（由下而上）
                            for (let d = depChain.length - 2; d >= 0; d--) {
                                const depParam = depChain[d];
                                const depRaw = env.rawParams.get(depParam) ?? '';
                                const depResolved = env.resolvedParams.get(depParam) ?? depRaw;
                                traceSteps.unshift({
                                    module: env.modName,
                                    target: env.targetName,
                                    paramName: depParam,
                                    rawExpr: depRaw,
                                    resolvedValue: depResolved,
                                    moduleType: env.modType
                                });
                            }
                            const rootLocalParam = depChain[0];
                            passedExpr = stepInst.paramOverrides.get(rootLocalParam);
                            if (passedExpr === undefined) {
                                const idx = childModDef.paramOrder.indexOf(rootLocalParam);
                                if (idx !== -1) passedExpr = stepInst.paramOverrides.get(`#${idx}`);
                            }
                        } else {
                            break;
                        }
                    }

                    if (passedExpr !== undefined) {
                        const parentEnv = envStack[i - 1];
                        const parentRefs = this.extractIdentifiers(passedExpr).filter(id => parentEnv.resolvedParams.has(id));
                        if (parentRefs.length > 0) {
                            currentParam = parentRefs[0];
                        } else {
                            // 上層傳入的是常數表達式（例如 .WIDTH(32)），直接停止往上找變數，但保留鏈路
                            break;
                        }
                    } else {
                        break;
                    }
                } else {
                    // i === 0：已到達 Top 模組，若該參數還依賴於 Top 模組內部的根參數（例如 COMPUTED_DELAY 依賴 TOP_BASE_DELAY），展開至最源頭
                    const topModDef = this.parser.modules.get(env.modName);
                    if (topModDef) {
                        const visitedTop = new Set<string>([currentParam]);
                        let curTopParam = currentParam;
                        while (true) {
                            const expr = topModDef.parameters.get(curTopParam) || '';
                            const refs = this.extractIdentifiers(expr).filter(id => topModDef.parameters.has(id) && !visitedTop.has(id));
                            if (refs.length === 0) break;
                            const nextTopParam = refs[0];
                            visitedTop.add(nextTopParam);
                            const nextRaw = env.rawParams.get(nextTopParam) ?? '';
                            const nextResolved = env.resolvedParams.get(nextTopParam) ?? nextRaw;
                            traceSteps.unshift({
                                module: env.modName,
                                target: env.targetName,
                                paramName: nextTopParam,
                                rawExpr: nextRaw,
                                resolvedValue: nextResolved,
                                moduleType: env.modType
                            });
                            curTopParam = nextTopParam;
                        }
                    }
                }
            }

            results.push(traceSteps);
        }

        return results;
    }

    // 尋找同模組內從被覆寫的 parameter 到 targetParam 的相依路徑
    private findLocalParamDependencyChain(
        targetParam: string,
        modDef: { parameters: Map<string, string>; paramOrder: string[] },
        stepInst: Instantiation
    ): string[] {
        const isOverridden = (p: string): boolean => {
            if (stepInst.paramOverrides.has(p)) return true;
            const idx = modDef.paramOrder.indexOf(p);
            return idx !== -1 && stepInst.paramOverrides.has(`#${idx}`);
        };

        const queue: string[][] = [[targetParam]];
        const visited = new Set<string>([targetParam]);

        while (queue.length > 0) {
            const path = queue.shift()!;
            const head = path[0];
            if (isOverridden(head)) {
                return path;
            }
            const expr = modDef.parameters.get(head) || '';
            const refs = this.extractIdentifiers(expr).filter(id => modDef.parameters.has(id));
            for (const r of refs) {
                if (!visited.has(r)) {
                    visited.add(r);
                    queue.push([r, ...path]);
                }
            }
        }
        return [targetParam];
    }

    // 尋找所有從最頂層模組到達 targetModule 的實例化路徑
    private findInstanceChainsToModule(targetModule: string): { parentMod: string; inst: Instantiation }[][] {
        const chains: { parentMod: string; inst: Instantiation }[][] = [];

        const dfs = (currentMod: string, currentChain: { parentMod: string; inst: Instantiation }[], visited: Set<string>) => {
            if (visited.has(currentMod)) return;
            visited.add(currentMod);

            let foundParent = false;
            for (const [parentName, parentDef] of this.parser.modules.entries()) {
                for (const inst of parentDef.instances) {
                    if (inst.moduleName === currentMod) {
                        foundParent = true;
                        dfs(parentName, [{ parentMod: parentName, inst }, ...currentChain], new Set(visited));
                    }
                }
            }

            if (!foundParent) {
                chains.push(currentChain);
            }
        };

        dfs(targetModule, [], new Set());
        return chains;
    }

    // 解析單一模組內所有 parameter / localparam 的數值（考量上層覆寫值與同模組內參數互相引用）
    private resolveModuleParams(moduleName: string, overrides: Map<string, string>): Map<string, string> {
        const resolved = new Map<string, string>();
        const modDef = this.parser.modules.get(moduleName);
        if (!modDef) {
            for (const [k, v] of overrides.entries()) {
                resolved.set(k, v);
            }
            return resolved;
        }

        // 先載入原始定義與覆寫值
        for (const [paramName, defaultExpr] of modDef.parameters.entries()) {
            if (overrides.has(paramName)) {
                resolved.set(paramName, overrides.get(paramName)!);
            } else {
                resolved.set(paramName, defaultExpr);
            }
        }
        for (const [k, v] of overrides.entries()) {
            if (!resolved.has(k)) {
                resolved.set(k, v);
            }
        }

        // 多次迭代展開模組內參數間的相依引用（例如 localparam HALF = WIDTH / 2）
        for (let pass = 0; pass < 4; pass++) {
            for (const [paramName, expr] of resolved.entries()) {
                const evaluated = this.evaluateParamExpr(expr, resolved, paramName);
                resolved.set(paramName, evaluated);
            }
        }

        return resolved;
    }

    // 計算並化簡 Verilog 參數表達式（支援常見數值格式與四則/位移運算）
    public evaluateParamExpr(expr: string, env: Map<string, string>, selfName?: string): string {
        if (!expr) return '';
        let replaced = expr.trim();

        // 將識別字替換為環境中已知的參數值
        replaced = replaced.replace(/\b([a-zA-Z_]\w*)\b/g, (match) => {
            if (match === selfName) return match;
            if (env.has(match)) {
                const val = env.get(match)!;
                return `(${val})`;
            }
            return match;
        });

        // 轉換 Verilog 進制常數（例如 8'd16 -> 16, 8'h10 -> 0x10, 4'b1010 -> 0b1010）以便計算
        const jsNumericExpr = replaced
            .replace(/\b\d*'[sS]?[dD]([0-9_]+)\b/g, (_, digits) => String(parseInt(digits.replace(/_/g, ''), 10)))
            .replace(/\b\d*'[sS]?[hH]([0-9a-fA-F_]+)\b/g, (_, digits) => String(parseInt(digits.replace(/_/g, ''), 16)))
            .replace(/\b\d*'[sS]?[bB]([01_]+)\b/g, (_, digits) => String(parseInt(digits.replace(/_/g, ''), 2)))
            .replace(/\b\d*'[sS]?[oO]([0-7_]+)\b/g, (_, digits) => String(parseInt(digits.replace(/_/g, ''), 8)));

        // 若表達式僅包含安全的數值與算術運算子，則直接計算出整數/數值結果
        if (/^[0-9+\-*/%&|^~<>()\s]+$/.test(jsNumericExpr)) {
            try {
                // eslint-disable-next-line no-new-func
                const val = Function(`"use strict"; return (${jsNumericExpr});`)();
                if (typeof val === 'number' && Number.isFinite(val)) {
                    return String(val);
                }
            } catch {
                // 若表達式無法直接求值，保留替換後的表達式
            }
        }

        // 移除多餘的最外層括號
        return replaced.replace(/^\(\s*([0-9a-zA-Z_'$]+)\s*\)$/, '$1');
    }

    private extractIdentifiers(expr: string): string[] {
        if (!expr) return [];
        const cleaned = expr.replace(/\b\d*'[sS]?[bBoOdDhH][0-9a-fA-F_xzXZ]+\b/g, '');
        const matches = cleaned.match(/\b[a-zA-Z_]\w*\b/g) || [];
        return Array.from(new Set(matches));
    }
}
