import { VerilogParser } from './parser';

export interface TraceNode {
    module: string;
    target: string;
    signal: string;
}

export class SignalTracker {
    constructor(private parser: VerilogParser) {}

    public traceTopDown(moduleName: string, signalName: string): TraceNode[][] {
        const paths: TraceNode[][] = [];
        this.traceParent(moduleName, signalName, [{ module: moduleName, target: moduleName, signal: signalName }], paths, new Set());
        return paths.length > 0 ? paths : [[{ module: moduleName, target: moduleName, signal: signalName }]];
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
                        // Replace the first element of currentPath with instance name if we want, but for top-down it's better to keep module context
                        // Actually we can insert the parent node at the beginning
                        const newNode = { module: parentName, target: parentName, signal: parentSignal };
                        // Note: The connection is through inst.instanceName, we could change currentPath[0].target to inst.instanceName
                        const updatedCurrentPath = [...currentPath];
                        updatedCurrentPath[0] = { ...updatedCurrentPath[0], target: inst.instanceName, module: parentName };
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
        this.traceChild(moduleName, signalName, [{ module: moduleName, target: moduleName, signal: signalName }], paths, new Set());
        return paths.length > 0 ? paths : [[{ module: moduleName, target: moduleName, signal: signalName }]];
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
                    const newNode = { module: moduleName, target: inst.instanceName, signal: port };
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
}
