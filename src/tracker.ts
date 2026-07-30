import { VerilogParser } from './parser';

export class SignalTracker {
    constructor(private parser: VerilogParser) {}

    public traceTopDown(moduleName: string, signalName: string): string[] {
        const paths: string[] = [];
        this.traceParent(moduleName, signalName, moduleName + '.' + signalName, paths, new Set());
        return paths.length > 0 ? paths : [moduleName + '.' + signalName];
    }

    private traceParent(moduleName: string, signalName: string, currentPath: string, paths: string[], visited: Set<string>) {
        if (visited.has(moduleName)) return;
        visited.add(moduleName);

        let hasParent = false;
        for (const [parentName, parentDef] of this.parser.modules.entries()) {
            for (const inst of parentDef.instances) {
                if (inst.moduleName === moduleName) {
                    if (inst.connections.has(signalName)) {
                        const parentSignal = inst.connections.get(signalName)!;
                        hasParent = true;
                        this.traceParent(parentName, parentSignal, parentName + '.' + parentSignal + ' -> ' + currentPath, paths, new Set(visited));
                    }
                }
            }
        }

        if (!hasParent) {
            paths.push(currentPath);
        }
    }

    public traceBottomUp(moduleName: string, signalName: string): string[] {
        const paths: string[] = [];
        this.traceChild(moduleName, signalName, moduleName + '.' + signalName, paths, new Set());
        return paths.length > 0 ? paths : [moduleName + '.' + signalName];
    }

    private traceChild(moduleName: string, signalName: string, currentPath: string, paths: string[], visited: Set<string>) {
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
                    this.traceChild(inst.moduleName, port, currentPath + ' -> ' + inst.instanceName + '.' + port, paths, new Set(visited));
                }
            }
        }

        if (!hasChild) {
            paths.push(currentPath);
        }
    }

    public traceFull(moduleName: string, signalName: string): string[] {
        const upPaths = this.traceTopDown(moduleName, signalName);
        const downPaths = this.traceBottomUp(moduleName, signalName);

        const fullPaths: string[] = [];
        for (const up of upPaths) {
            for (const down of downPaths) {
                const upParts = up.split(' -> ');
                const downParts = down.split(' -> ');
                
                const upPart = upParts.slice(0, -1).join(' -> ');
                const downPart = downParts.slice(1).join(' -> ');
                
                let combined = moduleName + '.' + signalName;
                if (upPart) combined = upPart + ' -> ' + combined;
                if (downPart) combined = combined + ' -> ' + downPart;
                
                fullPaths.push(combined);
            }
        }
        
        // Remove duplicates just in case
        return [...new Set(fullPaths)];
    }
}
