import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader, RefreshCw, Monitor, AlertCircle, X } from 'lucide-react';
import { 
    Ec2Instance, 
    SshDefaults, 
    Ec2StateFilter, 
    SshSession, 
    loadSshDefaults, 
    toEc2Rust 
} from './ec2Types';
import { Ec2InstanceRow } from './Ec2InstanceRow';
import { Ec2SshSettings } from './Ec2SshSettings';
import { Ec2Terminal } from './Ec2Terminal';
import { CwCredentials, ssmCheckPlugin } from '../../services/cloudwatchApi';

interface Ec2TabProps {
    cfg: CwCredentials;
}

export function Ec2Tab({ cfg }: Ec2TabProps) {
    const queryClient = useQueryClient();
    const [pendingMap, setPendingMap] = useState<Record<string, string>>({});
    const [stateFilter, setStateFilter] = useState<Ec2StateFilter>('all');
    const [search, setSearch] = useState('');
    const [ssh, setSsh] = useState<SshDefaults>(loadSshDefaults);
    const [sshSession, setSshSession] = useState<SshSession | null>(null);
    const [connectingId, setConnectingId] = useState<{ id: string, type: 'ssh' | 'ssm' } | null>(null);
    const [pluginAvailable, setPluginAvailable] = useState<boolean | null>(null);

    // Queries
    const {
        data: instances = [],
        isLoading: loading,
        error: queryError
    } = useQuery({
        queryKey: ['ec2-instances', cfg.accessKeyId, cfg.region],
        queryFn: () => invoke<Ec2Instance[]>('ec2_list_instances', { credentials: toEc2Rust(cfg) }),
        refetchInterval: 30_000,
        enabled: !!cfg.accessKeyId && !!cfg.region,
    });

    // Mutations
    const actionMutation = useMutation({
        mutationFn: async ({ action, id }: { action: 'start' | 'stop' | 'reboot', id: string }) => {
            const cmd = action === 'start' ? 'ec2_start_instance'
                : action === 'stop' ? 'ec2_stop_instance'
                    : 'ec2_reboot_instance';
            return invoke(cmd, { credentials: toEc2Rust(cfg), instanceId: id });
        },
        onMutate: async ({ action, id }) => {
            setPendingMap(p => ({ ...p, [id]: action }));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ec2-instances'] });
        },
        onError: (err, { action }) => {
            alert(`Error al ${action} instancia: ${err}`);
        },
        onSettled: (data, error, { id }) => {
            setPendingMap(p => { const n = { ...p }; delete n[id]; return n; });
        }
    });

    useEffect(() => {
        ssmCheckPlugin(cfg.ssmPluginPath)
            .then(() => setPluginAvailable(true))
            .catch(() => setPluginAvailable(false));
    }, [cfg.ssmPluginPath]);

    async function handleAction(action: 'start' | 'stop' | 'reboot', id: string) {
        actionMutation.mutate({ action, id });
    }

    async function handleSshConnect(inst: Ec2Instance, sshCmd: string) {
        if (connectingId) return;
        setConnectingId({ id: inst.instance_id, type: 'ssh' });
        const serviceId = `ec2::ssh::${inst.instance_id}`;
        try {
            await invoke('spawn_pty_shell', { serviceId, command: sshCmd, envs: null });
            setSshSession({ serviceId, inst, sshCmd, connected: true });
        } catch (e) {
            alert(`No se pudo iniciar SSH: ${e}`);
        } finally {
            setConnectingId(null);
        }
    }

    async function handleSsmConnect(inst: Ec2Instance) {
        if (connectingId) return;
        setConnectingId({ id: inst.instance_id, type: 'ssm' });
        const serviceId = `ec2::ssm::${inst.instance_id}`;
        const credentials = {
            access_key_id: cfg.accessKeyId,
            secret_access_key: cfg.secretAccessKey,
            region: cfg.region,
            session_token: cfg.sessionToken ?? null,
        };
        try {
            await invoke('ssm_start_session', {
                credentials,
                instanceId: inst.instance_id,
                serviceId,
                pluginPath: cfg.ssmPluginPath ?? null,
            });
            setSshSession({ serviceId, inst, sshCmd: `SSM → ${inst.instance_id}`, connected: true });
        } catch (e) {
            alert(`No se pudo iniciar SSM Session: ${e}`);
        } finally {
            setConnectingId(null);
        }
    }

    function handleDisconnect() {
        setSshSession(null);
    }

    // If a session is active, show the terminal
    if (sshSession) {
        return <Ec2Terminal session={sshSession} onDisconnect={handleDisconnect} />;
    }

    const counts = {
        all: instances.length,
        running: instances.filter(i => i.state === 'running').length,
        stopped: instances.filter(i => i.state === 'stopped').length,
    };

    const filtered = instances.filter(i => {
        if (stateFilter !== 'all' && i.state !== stateFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            return (i.name ?? '').toLowerCase().includes(q)
                || i.instance_id.toLowerCase().includes(q)
                || (i.public_ip ?? '').includes(q)
                || (i.private_ip ?? '').includes(q);
        }
        return true;
    });

    const error = queryError ? String(queryError) : null;

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 shrink-0">
                <div className="flex gap-1">
                    {(['all', 'running', 'stopped'] as Ec2StateFilter[]).map(f => (
                        <button key={f} onClick={() => setStateFilter(f)}
                            className={`px-3 py-1 rounded text-xs capitalize transition-colors ${stateFilter === f ? 'bg-nexus-neon/10 text-nexus-neon border border-nexus-neon/30' : 'text-slate-500 hover:text-slate-300'}`}>
                            {f} <span className="opacity-50">({counts[f]})</span>
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 flex-1 max-w-xs">
                    <Search size={13} className="text-slate-500 shrink-0" />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Filtrar por nombre, IP…"
                        className="bg-transparent text-xs text-slate-100 focus:outline-none placeholder-slate-600 w-full" />
                    {search && <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300"><X size={13} /></button>}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {loading && <Loader size={14} className="animate-spin text-slate-400" />}
                    <button onClick={() => queryClient.invalidateQueries({ queryKey: ['ec2-instances'] })} disabled={loading}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-40" title="Actualizar">
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800/40 rounded text-red-400 text-sm mb-3">
                        <AlertCircle size={15} className="shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}
                {!error && !loading && instances.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-500">
                        <Monitor size={36} strokeWidth={1} />
                        <p className="text-sm">No hay instancias en <span className="text-slate-300">{cfg.region}</span>.</p>
                    </div>
                )}
                {filtered.length > 0 && (
                    <div className="flex flex-col gap-2">
                        {filtered.map(inst => (
                            <Ec2InstanceRow key={inst.instance_id} inst={inst} ssh={ssh}
                                onAction={handleAction} pending={pendingMap[inst.instance_id] ?? null}
                                onSshConnect={handleSshConnect} onSsmConnect={handleSsmConnect}
                                connecting={connectingId?.id === inst.instance_id ? connectingId.type : null}
                                ssmAvailable={pluginAvailable} />
                        ))}
                    </div>
                )}
                {!error && instances.length > 0 && filtered.length === 0 && (
                    <p className="text-center text-slate-500 text-sm pt-16">
                        Ninguna instancia coincide con el filtro.
                    </p>
                )}
            </div>

            {/* SSH defaults bar */}
            <Ec2SshSettings ssh={ssh} setSsh={setSsh} />
        </div>
    );
}
