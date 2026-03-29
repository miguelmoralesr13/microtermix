import { useQuery, useMutation } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { SemgrepFinding, useSemgrepStore } from '../../stores/semgrepStore';
import { toast } from 'sonner';
import { listen } from '@tauri-apps/api/event';

export const semgrepKeys = {
    all: ['semgrep'] as const,
    installed: () => [...semgrepKeys.all, 'installed'] as const,
};

export function useSemgrepInstalled() {
    return useQuery({
        queryKey: semgrepKeys.installed(),
        queryFn: async () => {
            try {
                return await invoke<boolean>('check_semgrep_installed');
            } catch {
                return false;
            }
        },
        staleTime: Infinity, // Installation status doesn't change often
    });
}

interface ScanParams {
    projectPath: string;
    configPath: string | null;
    onLog: (log: string) => void;
    onProgress: (action: string) => void;
}

export function useSemgrepScan() {
    const setFindings = useSemgrepStore(s => s.setFindings);
    
    return useMutation({
        mutationFn: async ({ projectPath, configPath, onLog, onProgress }: ScanParams) => {
            // Listener for real-time logs
            const unlisten = await listen<string>('semgrep-log', (event) => {
                const line = event.payload;
                if (line.startsWith('PROG:')) {
                    const cleanLine = line.replace('PROG:', '').trim();
                    if (cleanLine) onProgress(cleanLine.substring(0, 40).toUpperCase());
                    onLog(`⚡ ${cleanLine}`);
                } else {
                    onLog(line);
                }
            });

            try {
                const resultStr = await invoke<string>('run_semgrep_scan', { 
                    projectPath,
                    configPath: configPath === 'p/default' ? null : configPath 
                });
                
                const data = JSON.parse(resultStr);
                const mapped: SemgrepFinding[] = (data.results || []).map((r: any) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    path: r.path,
                    line: r.start.line,
                    message: r.extra.message,
                    severity: r.extra.severity,
                    ruleId: r.check_id,
                    extra: r.extra
                }));

                setFindings(projectPath, mapped);
                return mapped;
            } finally {
                unlisten();
            }
        },
        onSuccess: (mapped) => {
            toast.success(`Escaneo completado: ${mapped.length} hallazgos.`);
        },
        onError: (e) => {
            toast.error(`Error en escaneo: ${e}`);
        }
    });
}
