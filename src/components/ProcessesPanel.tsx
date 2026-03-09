import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, Trash2 } from 'lucide-react';

export interface ListeningProcess {
    proto: string;
    local_address: string;
    foreign_address: string;
    state: string;
    pid: number;
}

export const ProcessesPanel: React.FC = () => {
    const [processes, setProcesses] = useState<ListeningProcess[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [killing, setKilling] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const list = await invoke<ListeningProcess[]>('get_listening_processes');
            setProcesses(list);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setProcesses([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleKill = async (pid: number) => {
        setKilling(pid);
        try {
            await invoke('kill_process_by_pid', { pid });
            setProcesses(prev => prev.filter(p => p.pid !== pid));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setKilling(null);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
                <h2 className="text-sm font-bold text-slate-200">Procesos en escucha (netstat)</h2>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-300 bg-slate-800 rounded-lg border border-slate-700 hover:bg-slate-700 hover:text-nexus-neon transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Actualizar
                </button>
            </div>

            {error && (
                <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-nexus-danger/10 border border-nexus-danger/30 text-nexus-danger text-xs">
                    {error}
                </div>
            )}

            <div className="flex-1 overflow-auto p-4">
                {loading && processes.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
                        Cargando…
                    </div>
                ) : processes.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
                        No hay procesos en escucha o no se pudo leer netstat.
                    </div>
                ) : (
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-slate-700">
                                <th className="text-left py-2 px-2 font-semibold text-slate-500">Proto</th>
                                <th className="text-left py-2 px-2 font-semibold text-slate-500">Dirección local</th>
                                <th className="text-left py-2 px-2 font-semibold text-slate-500">Dirección remota</th>
                                <th className="text-left py-2 px-2 font-semibold text-slate-500">Estado</th>
                                <th className="text-left py-2 px-2 font-semibold text-slate-500">PID</th>
                                <th className="w-20 py-2 px-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {processes.map((proc) => (
                                <tr
                                    key={`${proc.pid}-${proc.local_address}-${proc.proto}`}
                                    className="border-b border-slate-800/80 hover:bg-slate-800/50"
                                >
                                    <td className="py-1.5 px-2 font-mono text-slate-300">{proc.proto}</td>
                                    <td className="py-1.5 px-2 font-mono text-slate-200">{proc.local_address}</td>
                                    <td className="py-1.5 px-2 font-mono text-slate-400">{proc.foreign_address}</td>
                                    <td className="py-1.5 px-2 text-slate-400">{proc.state}</td>
                                    <td className="py-1.5 px-2 font-mono text-nexus-neon/90">{proc.pid}</td>
                                    <td className="py-1.5 px-2">
                                        <button
                                            onClick={() => handleKill(proc.pid)}
                                            disabled={killing === proc.pid || proc.pid === 0}
                                            className="p-1.5 rounded text-slate-500 hover:text-nexus-danger hover:bg-nexus-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={proc.pid === 0 ? 'PID desconocido (sin permisos)' : 'Terminar proceso'}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
