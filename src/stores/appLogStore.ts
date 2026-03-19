import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';

export type AppEventLevel = 'Info' | 'Warn' | 'Error' | 'Debug';

export interface AppLog {
    level: AppEventLevel;
    source: String;
    message: String;
    timestamp: number;
}

interface AppLogState {
    logs: AppLog[];
    maxLogs: number;
    addLog: (log: AppLog) => void;
    clearLogs: () => void;
    initListener: () => Promise<() => void>;
}

export const useAppLogStore = create<AppLogState>((set, get) => ({
    logs: [],
    maxLogs: 200,

    addLog: (log) => set((state) => ({
        logs: [log, ...state.logs].slice(0, state.maxLogs)
    })),

    clearLogs: () => set({ logs: [] }),

    initListener: async () => {
        const unlisten = await listen<AppLog>('app-log-event', (event) => {
            get().addLog(event.payload);
        });
        return unlisten;
    }
}));
