import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    Search, Loader, RefreshCw, Monitor, AlertCircle, X, 
    Database, Link2, Trash2, ChevronDown, ChevronRight, CheckCircle, XCircle 
} from 'lucide-react';
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
import { ssmCheckPlugin } from '../../services/cloudwatchApi';
import { useAwsStore } from '../../stores/awsStore';


// ── SSM Tunnel Components ─────────────────────────────────────────────────────

interface SsmPortForwardModalProps {
    inst: Ec2Instance;
    onConfirm: (remoteHost: string, remotePort: number, localPort: number) => void;
    onClose: () => void;
    starting: boolean;
    error: string | null;
}

function SsmPortForwardModal({ inst, onConfirm, onClose, starting, error }: SsmPortForwardModalProps) {
    const [remoteHost, setRemoteHost] = useState('');
    const [remotePort, setRemotePort] = useState(27017); // Default to Mongo
    const [localPort, setLocalPort] = useState(27017);
    const displayName = inst.name ?? inst.instance_id;

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!remoteHost.trim()) return;
        onConfirm(remoteHost.trim(), remotePort, localPort);
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800 bg-slate-800/50">
                    <Database size={16} className="text-purple-400" />
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight">SSM Port Forwarding</h3>
                    <span className="ml-auto text-[10px] text-slate-500 font-mono truncate max-w-[120px]">{displayName}</span>
                    <button onClick={onClose} className="ml-2 text-slate-500 hover:text-slate-300">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
                    <p className="text-[11px] text-slate-400 leading-relaxed italic border-l-2 border-purple-500/30 pl-3">
                        Crea un túnel cifrado desde tu máquina local hasta un host privado (ej. MongoDB, RDS) a través de esta instancia EC2.
                    </p>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Host remoto (Privado)</label>
                        <input
                            autoFocus
                            type="text"
                            value={remoteHost}
                            onChange={e => setRemoteHost(e.target.value)}
                            placeholder="my-db-internal-ip-or-dns"
                            className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-purple-500 placeholder-slate-700 transition-colors"
                        />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Puerto remoto</label>
                            <input
                                type="number"
                                value={remotePort}
                                onChange={e => setRemotePort(parseInt(e.target.value) || 0)}
                                className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Puerto local</label>
                            <input
                                type="number"
                                value={localPort}
                                onChange={e => setLocalPort(parseInt(e.target.value) || 0)}
                                className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 p-2.5 bg-red-900/20 border border-red-800/40 rounded text-red-400 text-[11px] animate-in slide-in-from-top-2">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3 justify-end pt-2 border-t border-slate-800 mt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded text-xs text-slate-400 hover:text-slate-200 transition-colors">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={starting || !remoteHost.trim()}
                            className="px-5 py-2 bg-purple-500 text-white rounded text-xs font-bold hover:bg-purple-400 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {starting && <Loader size={14} className="animate-spin" />}
                            {starting ? 'Iniciando...' : 'Iniciar túnel'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ActiveTunnelsPanel({ instances }: { instances: Ec2Instance[] }) {
    const { ssm, toggleTunnel, removeTunnel } = useAwsStore();
    const [expanded, setExpanded] = useState(true);

    if (!ssm?.tunnels || ssm.tunnels.length === 0) return null;

    // Solo mostramos los túneles cuyas instancias estén presentes en la región/cuenta actual
    const visibleTunnels = ssm.tunnels.filter(t => instances.some(inst => inst.instance_id === t.instanceId));
    if (visibleTunnels.length === 0) return null;

    return (
        <div className="mx-4 mt-2 mb-3 border border-slate-700/50 rounded-lg overflow-hidden bg-slate-900/40 backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
            <div 
                className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 border-b border-slate-700/50 cursor-pointer hover:bg-slate-800/60 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <Link2 size={13} className="text-purple-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex-1">Túneles SSM Activos</span>
                <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[9px] text-slate-500 border border-slate-700 font-mono">{visibleTunnels.length}</span>
                {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
            </div>
            {expanded && (
                <div className="flex flex-col divide-y divide-slate-800/50">
                    {visibleTunnels.map(t => (
                        <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-slate-900/20 group">
                            <div className="shrink-0">
                                {t.active ? (
                                    <div className="relative">
                                        <CheckCircle size={14} className="text-green-500" />
                                        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                        </span>
                                    </div>
                                ) : <XCircle size={14} className="text-slate-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-bold text-slate-200 truncate">{t.name}</div>
                                <div className="text-[9px] font-mono text-slate-500 truncate opacity-70">
                                    localhost:<span className="text-slate-300">{t.localPort}</span> → {t.remoteHost}:<span className="text-slate-300">{t.remotePort}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => toggleTunnel(t.id).catch(err => alert(`Error: ${err}`))}
                                    className={`px-2 py-0.5 rounded text-[9px] font-extrabold border uppercase tracking-tight transition-all ${t.active ? 'text-red-400 border-red-500/20 bg-red-500/5 hover:bg-red-500/10' : 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10'}`}
                                >
                                    {t.active ? 'DETENER' : 'INICIAR'}
                                </button>
                                <button onClick={() => removeTunnel(t.id)} className="p-1 px-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/5 rounded transition-colors"><Trash2 size={13} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function Ec2Tab() {
    const cfg = useAwsStore(s => s.credentials);
    if (!cfg) return null;
    const queryClient = useQueryClient();
    const [pendingMap, setPendingMap] = useState<Record<string, string>>({});
    const [stateFilter, setStateFilter] = useState<Ec2StateFilter>('all');
    const [search, setSearch] = useState('');
    const [ssh, setSsh] = useState<SshDefaults>(loadSshDefaults);
    const [sshSession, setSshSession] = useState<SshSession | null>(null);
    const [connectingId, setConnectingId] = useState<{ id: string, type: 'ssh' | 'ssm' } | null>(null);
    const [pluginAvailable, setPluginAvailable] = useState<boolean | null>(null);

    // SSM Tunnel state
    const { addTunnel } = useAwsStore();
    const [tunnelInstance, setTunnelInstance] = useState<Ec2Instance | null>(null);
    const [tunnelStarting, setTunnelStarting] = useState(false);
    const [tunnelError, setTunnelError] = useState<string | null>(null);

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
        onSettled: (_, __, { id }) => {
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
        if (!cfg || connectingId) return;
        setConnectingId({ id: inst.instance_id, type: 'ssm' });
        const serviceId = `ec2::ssm::${inst.instance_id}`;
        const credentials = toEc2Rust(cfg);
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

    async function handleStartTunnel(remoteHost: string, remotePort: number, localPort: number) {
        if (!tunnelInstance || !cfg) return;
        setTunnelStarting(true);
        setTunnelError(null);
        
        const serviceId = `ssm-tunnel::${tunnelInstance.instance_id}::${localPort}`;
        const credentials = toEc2Rust(cfg);
        
        try {
            await invoke('ssm_start_port_forward', {
                credentials,
                instanceId: tunnelInstance.instance_id,
                remoteHost,
                remotePort,
                localPort,
                serviceId,
                pluginPath: cfg.ssmPluginPath ?? null
            });
            
            addTunnel({
                name: tunnelInstance.name ?? tunnelInstance.instance_id,
                instanceId: tunnelInstance.instance_id,
                remoteHost,
                remotePort,
                localPort
            });
            
            setTunnelInstance(null);
        } catch (e) {
            setTunnelError(String(e));
        } finally {
            setTunnelStarting(false);
        }
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
                            className={`px-3 py-1 rounded text-xs capitalize transition-colors ${stateFilter === f ? 'bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30' : 'text-slate-500 hover:text-slate-300'}`}>
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

            {/* SSM Active Tunnels */}
            <ActiveTunnelsPanel instances={instances} />

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
                        <p className="text-sm">No hay instancias en <span className="text-slate-300">{cfg?.region}</span>.</p>
                    </div>
                )}
                {filtered.length > 0 && (
                    <div className="flex flex-col gap-2">
                        {filtered.map(inst => (
                            <Ec2InstanceRow key={inst.instance_id} inst={inst} ssh={ssh}
                                onAction={handleAction} pending={pendingMap[inst.instance_id] ?? null}
                                onSshConnect={handleSshConnect} onSsmConnect={handleSsmConnect}
                                onTunnelClick={(inst) => setTunnelInstance(inst)}
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

            {/* SSM Tunnel Modal */}
            {tunnelInstance && (
                <SsmPortForwardModal 
                    inst={tunnelInstance} 
                    onConfirm={handleStartTunnel} 
                    onClose={() => { setTunnelInstance(null); setTunnelError(null); }} 
                    starting={tunnelStarting}
                    error={tunnelError}
                />
            )}
        </div>

    );
}
