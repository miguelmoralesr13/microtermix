import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type ProcessStatus = 'idle' | 'running' | 'error' | 'stopped';

/**
 * Identifica a qué utilidad pertenece el proceso.
 * Cada panel filtra `activeProcesses` usando su propio source.
 * Agregar nuevas utilidades aquí cuando se integren al sistema.
 */
export type ProcessSource =
    | 'services'   // Procesos visibles en la pestaña Services / Terminals
    | 'sonar'      // Scanner de Sonar (solo visible en el panel Sonar)
    | 'semgrep'    // Scanner de Semgrep (solo visible en el panel Semgrep)
    | 'git'        // Operaciones de Git (solo visible en el panel Git)
    | 'jenkins'    // Pipelines de Jenkins
    | 'tests'      // Ejecución de tests
    | 'proxy'      // Procesos del proxy local
    | string;      // fallback para futuras utilidades sin tipado estricto

export interface ProcessState {
    status: ProcessStatus;
    source: ProcessSource;  // ← Qué utilidad es dueña de este proceso
    script?: string;
    envJson?: string;
    logs: string[];
    restarts: number;
}

export interface ProcessStore {
    activeProcesses: Record<string, ProcessState>;
    activeTerminalTab: string | null;

    // Actions
    setActiveTerminalTab: (tabId: string | null) => void;
    updateProcessStatus: (
        serviceId: string,
        status: ProcessStatus,
        script?: string,
        envJson?: string,
        incrementRestart?: boolean,
        source?: ProcessSource,
    ) => void;
    appendLogs: (serviceId: string, newLines: string[]) => void;
    setLogs: (serviceId: string, logs: string[]) => void;
    removeProcess: (serviceId: string) => void;
    clearAllProcesses: () => void;

    // Selector helper — devuelve los ids de procesos de una utilidad
    getProcessIdsBySource: (source: ProcessSource) => string[];
}

// ─── Buffer de batching de logs ───────────────────────────────────────────────

const logBuffer: Record<string, string[]> = {};
let logTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useProcessStore = create<ProcessStore>()(
    subscribeWithSelector(
        devtools(
            (set, get) => ({
                activeProcesses: {},
                activeTerminalTab: null,

                setActiveTerminalTab: (tabId) => set({ activeTerminalTab: tabId }),

                updateProcessStatus: (serviceId, status, script, envJson, incrementRestart, source) =>
                    set((state) => {
                        const existing = state.activeProcesses[serviceId];

                        // 'idle' elimina el registro del mapa
                        if (status === 'idle') {
                            const next = { ...state.activeProcesses };
                            delete next[serviceId];
                            return { activeProcesses: next };
                        }

                        const base = existing || {
                            logs: [],
                            restarts: 0,
                            status: 'idle' as ProcessStatus,
                            source: source ?? 'services',
                        };

                        let nextLogs = base.logs;
                        let nextRestarts = base.restarts;

                        const isNewStart =
                            status === 'running' &&
                            (base.status !== 'running' || !existing || incrementRestart);

                        if (isNewStart) {
                            nextLogs = [];
                            if (incrementRestart || existing) nextRestarts += 1;
                        }

                        return {
                            activeProcesses: {
                                ...state.activeProcesses,
                                [serviceId]: {
                                    ...base,
                                    status,
                                    source: source ?? base.source,
                                    script: script ?? base.script,
                                    envJson: envJson ?? base.envJson,
                                    logs: nextLogs,
                                    restarts: nextRestarts,
                                },
                            },
                        };
                    }),

                appendLogs: (serviceId, newLines) =>
                    set((state) => {
                        const existing = state.activeProcesses[serviceId];

                        // Si el proceso aún no existe en el store, ignoramos los logs.
                        // El proceso siempre debe ser registrado primero vía updateProcessStatus
                        // (que sí porta el source correcto). Esto evita la race condition donde
                        // los primeros logs crean la entrada con source='services' por defecto.
                        if (!existing) return state;

                        return {
                            activeProcesses: {
                                ...state.activeProcesses,
                                [serviceId]: {
                                    ...existing,
                                    logs: [...existing.logs, ...newLines].slice(-1000),
                                },
                            },
                        };
                    }),

                setLogs: (serviceId, logs) =>
                    set((state) => ({
                        activeProcesses: {
                            ...state.activeProcesses,
                            [serviceId]: {
                                ...(state.activeProcesses[serviceId] || {
                                    status: 'idle',
                                    restarts: 0,
                                    source: 'services',
                                }),
                                logs: logs.slice(-1000),
                            },
                        },
                    })),

                removeProcess: (serviceId) =>
                    set((state) => {
                        const next = { ...state.activeProcesses };
                        delete next[serviceId];
                        return { activeProcesses: next };
                    }),

                clearAllProcesses: () => set({ activeProcesses: {} }),

                getProcessIdsBySource: (source) => {
                    const procs = get().activeProcesses;
                    return Object.keys(procs).filter((id) => procs[id].source === source);
                },
            }),
            { name: 'ProcessStore' }
        )
    )
);

// ─── Helper de batching ───────────────────────────────────────────────────────

export const batchedAppendLogs = (serviceId: string, logLine: string) => {
    if (!logBuffer[serviceId]) logBuffer[serviceId] = [];
    logBuffer[serviceId].push(logLine);

    if (!logTimer) {
        logTimer = setTimeout(() => {
            const bufferCopy = { ...logBuffer };
            for (const key in logBuffer) delete logBuffer[key];
            logTimer = null;

            const store = useProcessStore.getState();
            Object.entries(bufferCopy).forEach(([sId, lines]) => {
                store.appendLogs(sId, lines);
            });
        }, 50);
    }
};
