import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CoverageStat { covered: number; total: number; }
export interface CoverageSummary {
    lines: CoverageStat;
    branches: CoverageStat;
    functions: CoverageStat;
}

interface CoverageStore {
    // projectPath -> CoverageSummary
    coverageMap: Record<string, CoverageSummary>;
    setCoverage: (path: string, summary: CoverageSummary) => void;
    clearCoverage: (path: string) => void;
}

export const useCoverageStore = create<CoverageStore>()(
    persist(
        (set) => ({
            coverageMap: {},
            setCoverage: (path, summary) => set((state) => ({
                coverageMap: { ...state.coverageMap, [path]: summary }
            })),
            clearCoverage: (path) => set((state) => {
                const next = { ...state.coverageMap };
                delete next[path];
                return { coverageMap: next };
            }),
        }),
        {
            name: 'microtermix-coverage-storage',
        }
    )
);
