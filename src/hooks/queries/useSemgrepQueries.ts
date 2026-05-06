import { useQuery, useMutation } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useSemgrepStore } from '../../stores/semgrepStore';
import { toast } from 'sonner';
import { listen } from '@tauri-apps/api/event';
import type { SemgrepFinding } from '../../semgrep/domain/SemgrepFinding';
import { resolveEffectiveConfig } from '../../semgrep/domain/SemgrepScanConfig';

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
        staleTime: Infinity,
    });
}

interface ScanParams {
    projectPath: string;
    configPath: string | null;
    onLog?: (log: string) => void;
    onProgress: (action: string) => void;
}

export function useSemgrepScan() {
    const setFindings = useSemgrepStore(s => s.setFindings);

    return useMutation({
        mutationFn: async ({ projectPath, configPath, onLog, onProgress }: ScanParams) => {
            const unlisten = await listen<string>('semgrep-log', (event) => {
                const line = String(event.payload);
                if (line.startsWith('PROG:')) {
                    const cleanLine = line.replace('PROG:', '').trim();
                    if (cleanLine) onProgress(cleanLine.substring(0, 40).toUpperCase());
                    if (onLog) onLog(`⚡ ${cleanLine}`);
                } else {
                    if (onLog) onLog(line);
                }
            });

            try {
                const effectiveConfig = resolveEffectiveConfig(configPath || 'p/default');
                const resultStr = await invoke<string>('run_semgrep_scan', {
                    projectPath,
                    configPath: effectiveConfig,
                });

                const data = JSON.parse(resultStr) as { results?: Array<Record<string, unknown>> };
                const mapped: SemgrepFinding[] = (data.results || []).map((r) => {
                    const extra = r.extra as Record<string, unknown> | undefined;
                    const start = r.start as Record<string, unknown> | undefined;
                    return {
                        id: crypto.randomUUID(),
                        path: (r.path as string) || '',
                        line: (start?.line as number) || 0,
                        message: (extra?.message as string) || '',
                        severity: (extra?.severity as SemgrepFinding['severity']) || 'INFO',
                        ruleId: (r.check_id as string) || '',
                        extra: {
                            ...(extra || {}),
                            message: extra?.message as string | undefined,
                            severity: extra?.severity as SemgrepFinding['severity'] | undefined,
                            fix: extra?.fix as string | undefined,
                            metadata: extra?.metadata as SemgrepFinding['extra']['metadata'] | undefined,
                        },
                    };
                });

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
