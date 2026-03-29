import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SemgrepFinding {
    id: string;
    path: string;
    line: number;
    message: string;
    severity: 'ERROR' | 'WARNING' | 'INFO';
    ruleId: string;
    extra: any;
}

interface SemgrepStore {
    findings: Record<string, SemgrepFinding[]>; // projectPath -> findings
    lastScan: Record<string, string>;           // projectPath -> timestamp
    configPath: string;                         // Ruta global persistente del config
    
    setFindings: (path: string, findings: SemgrepFinding[]) => void;
    setConfigPath: (path: string) => void;
    clearFindings: (path: string) => void;
}

export const useSemgrepStore = create<SemgrepStore>()(
    persist(
        (set) => ({
            findings: {},
            lastScan: {},
            configPath: 'p/default',

            setFindings: (path, findings) =>
                set((state) => ({
                    findings: { ...state.findings, [path]: findings },
                    lastScan: { ...state.lastScan, [path]: new Date().toISOString() }
                })),

            setConfigPath: (path) => set({ configPath: path }),

            clearFindings: (path) =>
                set((state) => {
                    const newFindings = { ...state.findings };
                    delete newFindings[path];
                    return { findings: newFindings };
                }),
        }),
        { name: 'microtermix-semgrep-storage' }
    )
);
