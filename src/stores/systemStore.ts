import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ManagedProcessInfo {
    service_id: string;
    pid: number | null;
    cpu_usage: number;
    memory_bytes: number;
}

export interface AppDiagnostics {
    pid: number;
    memory_rss_bytes: number;
    memory_virt_bytes: number;
    cpu_usage_pct: number;
    thread_count: number;
    uptime_secs: number;
    managed_processes: ManagedProcessInfo[];
}

interface SystemState {
    diagnostics: AppDiagnostics | null;
    history: { cpu: number; ram: number; timestamp: number }[];
    isPolling: boolean;
    error: string | null;

    fetchDiagnostics: () => Promise<void>;
    startPolling: (intervalMs?: number) => void;
    stopPolling: () => void;
}

export const useSystemStore = create<SystemState>((set, get) => {
    let timer: ReturnType<typeof setInterval> | null = null;

    return {
        diagnostics: null,
        history: [],
        isPolling: false,
        error: null,

        fetchDiagnostics: async () => {
            try {
                const data = await invoke<AppDiagnostics>('get_microtermix_performance_data');
                
                set((state) => {
                    const newHistory = [
                        ...state.history,
                        { 
                            cpu: data.cpu_usage_pct, 
                            ram: data.memory_rss_bytes / 1024, // KB to MB
                            timestamp: Date.now() 
                        }
                    ].slice(-20); // Keep last 20 points

                    return {
                        diagnostics: data,
                        history: newHistory,
                        error: null
                    };
                });
            } catch (err) {
                set({ error: String(err) });
            }
        },

        startPolling: (intervalMs = 3000) => {
            if (timer) return;
            
            set({ isPolling: true });
            get().fetchDiagnostics();
            
            timer = setInterval(() => {
                get().fetchDiagnostics();
            }, intervalMs);
        },

        stopPolling: () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            set({ isPolling: false });
        }
    };
});
