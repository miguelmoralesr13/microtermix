import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ProcessStatus = 'idle' | 'running' | 'error' | 'stopped';

export interface ProcessState {
    status: ProcessStatus;
    script?: string;
    envJson?: string;
    logs: string[];
    restarts: number;
}

interface ProcessStore {
    activeProcesses: Record<string, ProcessState>;
    activeTerminalTab: string | null;
    
    // Actions
    setActiveTerminalTab: (tabId: string | null) => void;
    updateProcessStatus: (serviceId: string, status: ProcessStatus, script?: string, envJson?: string, incrementRestart?: boolean) => void;
    appendLogs: (serviceId: string, newLines: string[]) => void;
    removeProcess: (serviceId: string) => void;
    clearAllProcesses: () => void;
}

// Buffer temporal para batching de logs (fuera del store para evitar re-renders constantes)
const logBuffer: Record<string, string[]> = {};
let logTimer: ReturnType<typeof setTimeout> | null = null;

export const useProcessStore = create<ProcessStore>()(
    devtools(
        (set) => ({
            activeProcesses: {},
            activeTerminalTab: null,

            setActiveTerminalTab: (tabId) => set({ activeTerminalTab: tabId }),

            updateProcessStatus: (serviceId, status, script, envJson, incrementRestart) => 
                set((state) => {
                    const existing = state.activeProcesses[serviceId];
                    
                    if (status === 'idle') {
                        const next = { ...state.activeProcesses };
                        delete next[serviceId];
                        return { activeProcesses: next };
                    }

                    const base = existing || { logs: [], restarts: 0, status: 'idle' };
                    let nextLogs = base.logs;
                    let nextRestarts = base.restarts;

                    if (status === 'running' && (!existing || incrementRestart)) {
                        nextLogs = [];
                        if (incrementRestart) nextRestarts += 1;
                    }

                    return {
                        activeProcesses: {
                            ...state.activeProcesses,
                            [serviceId]: {
                                ...base,
                                status,
                                script: script ?? base.script,
                                envJson: envJson ?? base.envJson,
                                logs: nextLogs,
                                restarts: nextRestarts
                            }
                        }
                    };
                }),

            appendLogs: (serviceId, newLines) => 
                set((state) => {
                    const existing = state.activeProcesses[serviceId];
                    if (!existing) {
                        // Crear placeholder si el proceso aún no está en el store
                        return {
                            activeProcesses: {
                                ...state.activeProcesses,
                                [serviceId]: {
                                    status: 'running',
                                    logs: newLines.slice(-1000),
                                    restarts: 0
                                }
                            }
                        };
                    }

                    return {
                        activeProcesses: {
                            ...state.activeProcesses,
                            [serviceId]: {
                                ...existing,
                                logs: [...existing.logs, ...newLines].slice(-1000)
                            }
                        }
                    };
                }),

            removeProcess: (serviceId) => 
                set((state) => {
                    const next = { ...state.activeProcesses };
                    delete next[serviceId];
                    return { activeProcesses: next };
                }),

            clearAllProcesses: () => set({ activeProcesses: {} }),
        }),
        { name: 'ProcessStore' }
    )
);

// Helper para enviar logs al store con throttling (Punto 4)
export const batchedAppendLogs = (serviceId: string, logLine: string) => {
    if (!logBuffer[serviceId]) logBuffer[serviceId] = [];
    logBuffer[serviceId].push(logLine);

    if (!logTimer) {
        logTimer = setTimeout(() => {
            const bufferCopy = { ...logBuffer };
            // Limpiar buffer original inmediatamente
            for (const key in logBuffer) delete logBuffer[key];
            logTimer = null;

            const store = useProcessStore.getState();
            Object.entries(bufferCopy).forEach(([sId, lines]) => {
                store.appendLogs(sId, lines);
            });
        }, 150);
    }
};
