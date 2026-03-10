import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
    Cloud, Settings, RefreshCw, CheckCircle, AlertCircle, X, Star,
    Monitor, Play, Square, RotateCcw, Terminal, ChevronDown, ChevronRight,
    Circle, Loader, Search, ClipboardPaste,
} from 'lucide-react';
import { SsmTerminal } from './SsmTerminal';
import {
    CwCredentials,
    CwLogGroup,
    CwLogStream,
    CwLogEvent,
    CwMetricItem,
    CwDimension,
    CwDatapoint,
    loadCwConfig, saveCwConfig,
    cwGetLogGroups,
    cwGetLogStreams,
    cwGetLogEvents,
    cwListMetrics,
    cwGetMetricData,
    ssmCheckPlugin,
} from '../services/cloudwatchApi';
import { ApiGatewayPanel } from './ApiGatewayPanel';

type CwTab = 'settings' | 'logs' | 'metrics' | 'ec2' | 'api-gateway';

// ── EC2 Types ─────────────────────────────────────────────────────────────────

interface Ec2Tag { key: string; value: string; }

interface Ec2Instance {
    instance_id: string;
    name: string | null;
    state: string;
    state_code: number;
    instance_type: string;
    public_ip: string | null;
    private_ip: string | null;
    key_name: string | null;
    launch_time: string | null;
    availability_zone: string | null;
    image_id: string | null;
    platform: string | null;
    vpc_id: string | null;
    subnet_id: string | null;
    tags: Ec2Tag[];
}

interface SshDefaults { username: string; keyPath: string; port: number; }

const SSH_KEY = 'nexus-ec2-ssh';

function loadSshDefaults(): SshDefaults {
    try {
        const raw = localStorage.getItem(SSH_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { username: 'ec2-user', keyPath: '', port: 22 };
}
function saveSshDefaults(s: SshDefaults) { localStorage.setItem(SSH_KEY, JSON.stringify(s)); }

function toEc2Rust(cfg: CwCredentials) {
    return {
        access_key_id: cfg.accessKeyId,
        secret_access_key: cfg.secretAccessKey,
        region: cfg.region,
        session_token: cfg.sessionToken ?? null,
    };
}

// ── EC2 Helpers ───────────────────────────────────────────────────────────────

function ec2StateColor(state: string): string {
    switch (state) {
        case 'running': return '#22c55e';
        case 'stopped': return '#ef4444';
        case 'stopping': case 'pending': case 'shutting-down': return '#f59e0b';
        case 'terminated': return '#475569';
        default: return '#6b7280';
    }
}

function Ec2StateIcon({ state }: { state: string }) {
    const color = ec2StateColor(state);
    if (state === 'running') return <CheckCircle size={14} style={{ color }} />;
    if (state === 'stopped') return <X size={14} style={{ color }} />;
    if (['pending', 'stopping', 'shutting-down'].includes(state))
        return <Loader size={14} style={{ color }} className="animate-spin" />;
    if (state === 'terminated') return <Circle size={14} style={{ color }} />;
    return <AlertCircle size={14} style={{ color }} />;
}

function formatLaunchTime(iso: string | null): string {
    if (!iso) return '–';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

// ── EC2 Instance Row ──────────────────────────────────────────────────────────

function Ec2InstanceRow({ inst, ssh, onAction, pending, onSshConnect, onSsmConnect, connecting, ssmAvailable }: {
    inst: Ec2Instance;
    ssh: SshDefaults;
    onAction: (action: 'start' | 'stop' | 'reboot', id: string) => void;
    pending: string | null;
    onSshConnect: (inst: Ec2Instance, cmd: string) => void;
    onSsmConnect: (inst: Ec2Instance) => void;
    connecting: string | null; // which connect mode is active: 'ssh' | 'ssm'
    ssmAvailable: boolean | null; // null=checking, false=not found
}) {
    const [expanded, setExpanded] = useState(false);
    const displayName = inst.name ?? inst.instance_id;
    const connectHost = inst.public_ip ?? inst.private_ip;
    const isRunning = inst.state === 'running';
    const isStopped = inst.state === 'stopped';

    function buildSshCmd(): string {
        const keyFlag = ssh.keyPath ? ` -i "${ssh.keyPath}"` : '';
        const portFlag = ssh.port !== 22 ? ` -p ${ssh.port}` : '';
        return `ssh -tt${keyFlag}${portFlag} ${ssh.username}@${connectHost}`;
    }

    return (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
            <div
                className="flex items-center gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800/70 cursor-pointer select-none"
                onClick={() => setExpanded(e => !e)}
            >
                <span className="text-slate-600">
                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
                <Ec2StateIcon state={inst.state} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-100 truncate">{displayName}</span>
                        {inst.name && <span className="text-xs text-slate-600 font-mono">{inst.instance_id}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span style={{ color: ec2StateColor(inst.state) }}>
                            {inst.state.charAt(0).toUpperCase() + inst.state.slice(1)}
                        </span>
                        <span>{inst.instance_type}</span>
                        {inst.availability_zone && <span>{inst.availability_zone}</span>}
                        {connectHost && <span className="font-mono">{connectHost}</span>}
                    </div>
                </div>
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {pending
                        ? <Loader size={14} className="animate-spin text-slate-400 mx-1" />
                        : <>
                            {isStopped && (
                                <button onClick={() => onAction('start', inst.instance_id)}
                                    className="p-1.5 rounded text-green-400 hover:bg-green-400/10" title="Start">
                                    <Play size={14} />
                                </button>
                            )}
                            {isRunning && <>
                                <button onClick={() => onAction('stop', inst.instance_id)}
                                    className="p-1.5 rounded text-red-400 hover:bg-red-400/10" title="Stop">
                                    <Square size={14} />
                                </button>
                                <button onClick={() => onAction('reboot', inst.instance_id)}
                                    className="p-1.5 rounded text-yellow-400 hover:bg-yellow-400/10" title="Reboot">
                                    <RotateCcw size={14} />
                                </button>
                                <button
                                    onClick={() => connectHost && onSshConnect(inst, buildSshCmd())}
                                    disabled={!connectHost || !!connecting}
                                    className="px-2.5 py-1 rounded text-xs bg-slate-700 text-slate-200 border border-slate-600 hover:bg-slate-600 disabled:opacity-40 flex items-center gap-1.5"
                                    title={connectHost ? buildSshCmd() : 'Sin IP disponible'}>
                                    {connecting === 'ssh' ? <Loader size={12} className="animate-spin" /> : <Terminal size={12} />} SSH
                                </button>
                                <button
                                    onClick={() => onSsmConnect(inst)}
                                    disabled={!!connecting || ssmAvailable === false}
                                    className="px-2.5 py-1 rounded text-xs bg-nexus-neon/10 text-nexus-neon border border-nexus-neon/30 hover:bg-nexus-neon/20 flex items-center gap-1.5 disabled:opacity-40"
                                    title={ssmAvailable === false ? 'session-manager-plugin no encontrado. Configura la ruta en Settings.' : 'Conectar via AWS SSM Session Manager (sin puerto 22)'}>
                                    {connecting === 'ssm' ? <Loader size={12} className="animate-spin" /> : <Terminal size={12} />} SSM
                                </button>
                            </>}
                        </>
                    }
                </div>
            </div>
            {expanded && (
                <div className="bg-slate-950 border-t border-slate-800 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    {([
                        ['Instance ID', inst.instance_id],
                        ['Type', inst.instance_type],
                        ['Platform', inst.platform ?? 'Linux / Other'],
                        ['Public IP', inst.public_ip ?? '–'],
                        ['Private IP', inst.private_ip ?? '–'],
                        ['Key Pair', inst.key_name ?? '–'],
                        ['Image ID', inst.image_id ?? '–'],
                        ['VPC', inst.vpc_id ?? '–'],
                        ['Subnet', inst.subnet_id ?? '–'],
                        ['AZ', inst.availability_zone ?? '–'],
                        ['Launch', formatLaunchTime(inst.launch_time)],
                    ] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                            <span className="text-slate-500 shrink-0 w-20">{k}</span>
                            <span className="text-slate-300 font-mono break-all">{v}</span>
                        </div>
                    ))}
                    {inst.tags.length > 0 && (
                        <div className="col-span-2 flex flex-wrap gap-1.5 mt-1">
                            {inst.tags.map(t => (
                                <span key={t.key} className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs">
                                    {t.key}: {t.value}
                                </span>
                            ))}
                        </div>
                    )}
                    {connectHost && isRunning && (
                        <div className="col-span-2 mt-1">
                            <span className="text-slate-500">SSH  </span>
                            <span className="font-mono text-slate-300 select-all">{buildSshCmd()}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── EC2 SSH Terminal (inline) ─────────────────────────────────────────────────

interface SshSession {
    serviceId: string;
    inst: Ec2Instance;
    sshCmd: string;
    connected: boolean;
}

interface LogLine { text: string; isError: boolean; }

function Ec2Terminal({ session, onDisconnect }: { session: SshSession; onDisconnect: () => void }) {
    const isSsm = session.sshCmd.startsWith('SSM →');
    const [logs, setLogs] = useState<LogLine[]>([]);
    const [input, setInput] = useState('');
    const [alive, setAlive] = useState(true);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const displayName = session.inst.name ?? session.inst.instance_id;

    // Listen to service-logs and service-stopped (used for SSH mode only)
    useEffect(() => {
        const unlistenLogs = listen<{ service_id: string; line: string; is_error: boolean }>(
            'service-logs',
            ({ payload }) => {
                if (payload.service_id !== session.serviceId) return;
                setLogs(prev => [...prev, { text: payload.line, isError: payload.is_error }]);
            }
        );
        const unlistenStopped = listen<string>('service-stopped', ({ payload }) => {
            if (payload !== session.serviceId) return;
            setAlive(false);
            setLogs(prev => [...prev, { text: '[Conexión cerrada]', isError: false }]);
        });
        return () => {
            unlistenLogs.then(fn => fn());
            unlistenStopped.then(fn => fn());
        };
    }, [session.serviceId]);

    // Auto-scroll
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    useEffect(() => { inputRef.current?.focus(); }, []);

    async function sendLine(line: string) {
        if (!alive) return;
        setInput('');
        setLogs(prev => [...prev, { text: `$ ${line}`, isError: false }]);
        try {
            await invoke('write_stdin_line', { serviceId: session.serviceId, line });
        } catch (e) {
            setLogs(prev => [...prev, { text: `[Error enviando: ${e}]`, isError: true }]);
        }
    }

    async function handleDisconnect() {
        try { await invoke('kill_service', { serviceId: session.serviceId }); } catch { /* ignore */ }
        onDisconnect();
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Terminal header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 bg-slate-900 shrink-0">
                <Terminal size={14} className="text-nexus-neon" />
                <span className="text-sm font-medium text-slate-200">{displayName}</span>
                <span className="text-xs text-slate-500 font-mono">{session.inst.public_ip ?? session.inst.private_ip}</span>
                {alive
                    ? <span className="flex items-center gap-1 text-xs text-green-400 ml-1"><CheckCircle size={11} /> Conectado</span>
                    : <span className="flex items-center gap-1 text-xs text-slate-500 ml-1"><Circle size={11} /> Desconectado</span>
                }
                <div className="ml-auto flex items-center gap-2">
                    {!isSsm && (
                        <button
                            onClick={() => sendLine('')}
                            disabled={!alive}
                            className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 disabled:opacity-40"
                            title="Enviar Enter"
                        >↵</button>
                    )}
                    <button
                        onClick={handleDisconnect}
                        className="px-2.5 py-1 rounded text-xs text-red-400 hover:bg-red-400/10 border border-red-900/40"
                    >Desconectar</button>
                    <button
                        onClick={onDisconnect}
                        className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200 border border-slate-700"
                    >← Volver</button>
                </div>
            </div>

            {/* Body */}
            {isSsm ? (
                /* xterm.js real terminal for SSM */
                <div className="flex-1 min-h-0 p-2 bg-[#020617]">
                    <SsmTerminal serviceId={session.serviceId} onClose={() => setAlive(false)} />
                </div>
            ) : (
                /* Simple log viewer for SSH */
                <>
                    <div
                        className="flex-1 overflow-y-auto bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed"
                        onClick={() => inputRef.current?.focus()}
                    >
                        {logs.map((l, i) => (
                            <div key={i} className={l.isError ? 'text-red-400' : l.text.startsWith('$') ? 'text-nexus-neon' : l.text.startsWith('[') ? 'text-slate-500' : 'text-slate-200'}>
                                {l.text}
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-800 bg-slate-900 shrink-0">
                        <span className="text-nexus-neon font-mono text-xs select-none">$</span>
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); sendLine(input); }
                                if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); sendLine('\x03'); }
                            }}
                            disabled={!alive}
                            placeholder={alive ? 'Escribe un comando y presiona Enter…' : 'Sesión terminada'}
                            className="flex-1 bg-transparent text-slate-100 font-mono text-xs focus:outline-none placeholder-slate-600 disabled:opacity-40"
                        />
                    </div>
                </>
            )}
        </div>
    );
}

// ── EC2 SSH Settings bar ──────────────────────────────────────────────────────

function Ec2SshSettings({ ssh, setSsh }: { ssh: SshDefaults; setSsh: (s: SshDefaults) => void }) {
    return (
        <div className="border-t border-slate-800 px-4 py-2 flex flex-wrap gap-4 items-end bg-slate-900/40 shrink-0">
            <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">SSH User</label>
                <input value={ssh.username} onChange={e => { const s = { ...ssh, username: e.target.value }; setSsh(s); saveSshDefaults(s); }}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon w-28" />
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-40">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Key (.pem)</label>
                <input value={ssh.keyPath} onChange={e => { const s = { ...ssh, keyPath: e.target.value }; setSsh(s); saveSshDefaults(s); }}
                    placeholder="/path/to/key.pem"
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-nexus-neon placeholder-slate-600" />
            </div>
            <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Port</label>
                <input type="number" value={ssh.port} onChange={e => { const s = { ...ssh, port: parseInt(e.target.value) || 22 }; setSsh(s); saveSshDefaults(s); }}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon w-20" />
            </div>
        </div>
    );
}

// ── EC2 Tab ───────────────────────────────────────────────────────────────────

type Ec2StateFilter = 'all' | 'running' | 'stopped';

function Ec2Tab({ cfg }: { cfg: CwCredentials }) {
    const [instances, setInstances] = useState<Ec2Instance[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingMap, setPendingMap] = useState<Record<string, string>>({});
    const [stateFilter, setStateFilter] = useState<Ec2StateFilter>('all');
    const [search, setSearch] = useState('');
    const [ssh, setSsh] = useState<SshDefaults>(loadSshDefaults);
    const [sshSession, setSshSession] = useState<SshSession | null>(null);
    const [connectingId, setConnectingId] = useState<{ id: string, type: 'ssh' | 'ssm' } | null>(null);
    const [pluginAvailable, setPluginAvailable] = useState<boolean | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchInstances = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<Ec2Instance[]>('ec2_list_instances', { credentials: toEc2Rust(cfg) });
            setInstances(result);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [cfg]);

    useEffect(() => {
        fetchInstances();
        pollRef.current = setInterval(fetchInstances, 30_000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchInstances]);

    useEffect(() => {
        ssmCheckPlugin(cfg.ssmPluginPath)
            .then(() => setPluginAvailable(true))
            .catch(() => setPluginAvailable(false));
    }, [cfg.ssmPluginPath]);

    async function handleAction(action: 'start' | 'stop' | 'reboot', id: string) {
        setPendingMap(p => ({ ...p, [id]: action }));
        try {
            const cmd = action === 'start' ? 'ec2_start_instance'
                : action === 'stop' ? 'ec2_stop_instance'
                    : 'ec2_reboot_instance';
            await invoke(cmd, { credentials: toEc2Rust(cfg), instanceId: id });
            await new Promise(r => setTimeout(r, 1500));
            await fetchInstances();
        } catch (e) {
            alert(`Error al ${action} instancia: ${e}`);
        } finally {
            setPendingMap(p => { const n = { ...p }; delete n[id]; return n; });
        }
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
                    <button onClick={fetchInstances} disabled={loading}
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

function usePersistedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
        try {
            const saved = localStorage.getItem(key);
            if (saved !== null) return JSON.parse(saved);
        } catch { }
        return initialValue;
    });

    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(state));
    }, [key, state]);

    return [state, setState];
}

// ── LogMessage Formatter ──────────────────────────────────────────────────────

function LogMessage({ message }: { message: string }) {
    try {
        const parsed = JSON.parse(message);
        return (
            <pre className="text-[10px] text-slate-300 bg-slate-900/50 p-2 rounded-md border border-slate-800/50 whitespace-pre-wrap break-words">
                {JSON.stringify(parsed, null, 2)}
            </pre>
        );
    } catch {
        // Not JSON, return as normal text
        return <span className="break-all">{message}</span>;
    }
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

/** Parses the block that AWS gives you (CLI format or export format) and returns
 *  whichever credential fields it finds.
 *
 *  Handles both:
 *    aws_access_key_id=VALUE
 *    export AWS_ACCESS_KEY_ID=VALUE
 */
function parseAwsCredentialBlock(text: string): Partial<CwCredentials> {
    const result: Partial<CwCredentials> = {};
    for (const raw of text.split('\n')) {
        // strip leading "export " and surrounding whitespace
        const line = raw.replace(/^\s*export\s+/i, '').trim();
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim().toLowerCase();
        const value = line.slice(eq + 1).trim();
        if (!value) continue;
        if (key === 'aws_access_key_id') result.accessKeyId = value;
        if (key === 'aws_secret_access_key') result.secretAccessKey = value;
        if (key === 'aws_session_token') result.sessionToken = value;
        if (key === 'region' || key === 'aws_default_region') result.region = value;
    }
    return result;
}

type OsTab = 'windows' | 'linux' | 'macos';
function detectOs(): OsTab {
    const p = navigator.platform ?? '';
    if (p.startsWith('Win')) return 'windows';
    if (p.includes('Mac')) return 'macos';
    return 'linux';
}

function SettingsTab({ onSaved }: { onSaved: () => void }) {
    const [draft, setDraft] = useState<CwCredentials>(() => loadCwConfig());
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<'ok' | 'error' | null>(null);
    const [errMsg, setErrMsg] = useState('');
    const [showPaste, setShowPaste] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [pasteApplied, setPasteApplied] = useState(false);
    const [osTab, setOsTab] = useState<OsTab>(detectOs);

    const handleSave = () => {
        saveCwConfig(draft);
        onSaved();
    };

    const handleTest = async () => {
        setTesting(true);
        setResult(null);
        try {
            await cwGetLogGroups(draft, '');
            await ssmCheckPlugin(draft.ssmPluginPath);
            setResult('ok');
        } catch (e: any) {
            setResult('error');
            setErrMsg(e?.message ?? String(e));
        } finally {
            setTesting(false);
        }
    };

    function applyPaste(text: string) {
        const parsed = parseAwsCredentialBlock(text);
        if (Object.keys(parsed).length === 0) return;
        setDraft(prev => ({ ...prev, ...parsed }));
        setPasteText('');
        setShowPaste(false);
        setPasteApplied(true);
        setTimeout(() => setPasteApplied(false), 2500);
    }

    const field = (label: string, key: keyof CwCredentials, placeholder: string, secret = false) => (
        <div key={key}>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
            <input
                type={secret ? 'password' : 'text'}
                value={(draft[key] as string) ?? ''}
                onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-nexus-accent placeholder:text-slate-700"
            />
        </div>
    );

    return (
        <div className="max-w-md mx-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <Settings size={15} /> Credenciales AWS
                </h2>
                <button
                    onClick={() => { setShowPaste(p => !p); setPasteText(''); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${showPaste
                        ? 'bg-nexus-neon/10 text-nexus-neon border-nexus-neon/30'
                        : 'text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500'}`}
                    title="Pegar el bloque de credenciales que entrega AWS"
                >
                    <ClipboardPaste size={13} />
                    Pegar bloque AWS
                </button>
            </div>

            {/* ── Paste area ── */}
            {showPaste && (
                <div className="rounded-lg border border-nexus-neon/20 bg-nexus-neon/5 p-3 space-y-2">
                    <p className="text-[11px] text-slate-400">
                        Pega aquí el bloque completo que AWS te da (formato <code className="text-nexus-neon">aws_access_key_id=…</code>).
                        Los campos se rellenarán automáticamente.
                    </p>
                    <textarea
                        autoFocus
                        value={pasteText}
                        onChange={e => setPasteText(e.target.value)}
                        onPaste={e => {
                            // auto-apply on paste without needing to click Apply
                            const text = e.clipboardData.getData('text');
                            e.preventDefault();
                            applyPaste(text);
                        }}
                        placeholder={`aws_access_key_id=ASIA…\naws_secret_access_key=…\naws_session_token=…`}
                        rows={5}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-nexus-neon placeholder:text-slate-600 resize-none"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => applyPaste(pasteText)}
                            disabled={!pasteText.trim()}
                            className="px-3 py-1 rounded text-xs bg-nexus-neon/10 text-nexus-neon border border-nexus-neon/30 hover:bg-nexus-neon/20 disabled:opacity-40 transition-colors"
                        >
                            Aplicar
                        </button>
                        <button
                            onClick={() => { setShowPaste(false); setPasteText(''); }}
                            className="px-3 py-1 rounded text-xs text-slate-400 border border-slate-700 hover:text-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {pasteApplied && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-2">
                    <CheckCircle size={13} /> Credenciales aplicadas — revisa los campos y guarda.
                </div>
            )}

            {field('Región', 'region', 'us-east-1')}
            {field('Access Key ID', 'accessKeyId', 'AKIAIOSFODNN7EXAMPLE')}
            {field('Secret Access Key', 'secretAccessKey', '••••••••••••••••••••', true)}
            {field('Session Token (opcional)', 'sessionToken', 'dejar vacío si no usas STS')}
            {field('Ruta Session Manager Plugin (Opcional)', 'ssmPluginPath', 'Vacío = autodetectar. Ej Win: C:\\...\\session-manager-plugin.exe  Linux: /usr/local/sessionmanagerplugin/bin/session-manager-plugin')}

            {/* SSM Plugin download instructions */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
                <p className="text-slate-400 mb-2 font-medium">Instalar session-manager-plugin:</p>
                <div className="flex gap-1 mb-3">
                    {(['windows', 'linux', 'macos'] as OsTab[]).map(os => (
                        <button key={os} onClick={() => setOsTab(os)}
                            className={`px-2.5 py-0.5 rounded text-[11px] capitalize transition-colors ${osTab === os ? 'bg-nexus-neon/15 text-nexus-neon border border-nexus-neon/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                            {os === 'macos' ? 'macOS' : os.charAt(0).toUpperCase() + os.slice(1)}
                        </button>
                    ))}
                </div>
                {osTab === 'windows' && (
                    <div className="space-y-2">
                        <p className="text-slate-400">Descarga e instala el <span className="text-slate-200">.exe</span> de AWS:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300 break-all">
                            https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe
                        </code>
                        <p className="text-slate-500">O con winget:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300">
                            winget install --id Amazon.SessionManagerPlugin
                        </code>
                        <p className="text-slate-500 mt-1">Ruta por defecto tras instalar:<br />
                            <span className="text-slate-400 font-mono">C:\Program Files\Amazon\SessionManagerPlugin\bin\session-manager-plugin.exe</span>
                        </p>
                    </div>
                )}
                {osTab === 'linux' && (
                    <div className="space-y-2">
                        <p className="text-slate-400">Debian / Ubuntu:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300 whitespace-pre">{`curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o smp.deb\nsudo dpkg -i smp.deb`}</code>
                        <p className="text-slate-400 mt-1">RHEL / Fedora:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300 whitespace-pre">{`curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/linux_64bit/session-manager-plugin.rpm" -o smp.rpm\nsudo rpm -i smp.rpm`}</code>
                        <p className="text-slate-500 mt-1">Ruta por defecto: <span className="text-slate-400 font-mono">/usr/local/sessionmanagerplugin/bin/session-manager-plugin</span></p>
                    </div>
                )}
                {osTab === 'macos' && (
                    <div className="space-y-2">
                        <p className="text-slate-400">Instalar con el paquete .pkg:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300 whitespace-pre">{`curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac/sessionmanager-bundle.zip" -o smp.zip\nunzip smp.zip && sudo ./sessionmanager-bundle/install -i /usr/local/sessionmanagerplugin -b /usr/local/bin/session-manager-plugin`}</code>
                        <p className="text-slate-500 mt-1">O con Homebrew:</p>
                        <code className="block bg-slate-950 rounded px-2 py-1.5 font-mono text-[11px] text-slate-300">
                            brew install --cask session-manager-plugin
                        </code>
                        <p className="text-slate-500 mt-1">Ruta por defecto: <span className="text-slate-400 font-mono">/usr/local/sessionmanagerplugin/bin/session-manager-plugin</span></p>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40 hover:bg-nexus-accent/30 rounded-lg text-xs font-bold transition-colors"
                >
                    Guardar
                </button>
                <button
                    onClick={handleTest}
                    disabled={testing || !draft.accessKeyId || !draft.secretAccessKey}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 border border-slate-700 rounded-lg text-xs font-bold transition-colors"
                >
                    {testing ? <RefreshCw size={12} className="animate-spin" /> : null}
                    {testing ? 'Probando…' : 'Probar conexión'}
                </button>
                {result === 'ok' && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={13} /> Conectado</span>}
                {result === 'error' && (
                    <span className="flex items-center gap-1 text-xs text-red-400" title={errMsg}>
                        <AlertCircle size={13} /> Error
                    </span>
                )}
            </div>
            {result === 'error' && errMsg && (
                <p className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded p-2 leading-snug break-all">{errMsg}</p>
            )}
        </div>
    );
}

// ── NeedConfig guard ──────────────────────────────────────────────────────────

function NeedConfig({ onGo }: { onGo: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 p-12">
            <AlertCircle size={36} />
            <p className="text-sm text-center">Primero configura tus credenciales AWS.</p>
            <button onClick={onGo} className="text-xs text-nexus-accent hover:underline">Ir a Configuración →</button>
        </div>
    );
}

// ── Stubs for Logs and Metrics (replaced in Tasks 6 and 7) ───────────────────

function LogsTab({ cfg }: { cfg: CwCredentials }) {
    // ── Log groups ──
    const [groups, setGroups] = usePersistedState<CwLogGroup[]>('nexus-cw-logs-groups', []);
    const [groupSearch, setGroupSearch] = usePersistedState('nexus-cw-logs-group-search', '');
    const [selectedGroup, setSelectedGroup] = usePersistedState<string | null>('nexus-cw-logs-selected-group', null);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [groupError, setGroupError] = useState<string | null>(null);
    const [favorites, setFavorites] = usePersistedState<string[]>('nexus-cw-favorites', []);

    const toggleFavorite = (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setFavorites(prev =>
            prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
        );
    };

    const [streamFavorites, setStreamFavorites] = usePersistedState<string[]>('nexus-cw-stream-favorites', []);

    const toggleStreamFavorite = (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setStreamFavorites(prev =>
            prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
        );
    };

    // ── Log streams ──
    const [streams, setStreams] = usePersistedState<CwLogStream[]>('nexus-cw-logs-streams', []);
    const [streamSearch, setStreamSearch] = usePersistedState('nexus-cw-logs-stream-search', '');
    const [selectedStream, setSelectedStream] = usePersistedState<string | null>('nexus-cw-logs-selected-stream', null);
    const [loadingStreams, setLoadingStreams] = useState(false);
    const [streamError, setStreamError] = useState<string | null>(null);

    // ── Events ──
    const [events, setEvents] = useState<CwLogEvent[]>([]);
    const [nextToken, setNextToken] = useState<string | null>(null);
    const [tailing, setTailing] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [logFilters, setLogFilters] = useState<string[]>([]);
    const [filterInput, setFilterInput] = useState('');
    const tailRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const nextTokenRef = useRef<string | null>(null);

    // Keep ref in sync with state for use inside interval
    useEffect(() => { nextTokenRef.current = nextToken; }, [nextToken]);

    // Fetching functions
    const fetchGroups = useCallback((prefix?: string) => {
        setLoadingGroups(true);
        setGroupError(null);
        cwGetLogGroups(cfg, prefix)
            .then(setGroups)
            .catch(e => setGroupError(e?.message ?? String(e)))
            .finally(() => setLoadingGroups(false));
    }, [cfg]);

    const fetchStreams = useCallback((group: string, prefix?: string) => {
        setLoadingStreams(true);
        setStreamError(null);
        cwGetLogStreams(cfg, group, prefix)
            .then(res => {
                setStreams(res);
                if (res.length === 0 && prefix) {
                    setStreamError(`No se encontraron streams que empiecen con "${prefix}"`);
                }
            })
            .catch(e => setStreamError(e?.message ?? String(e)))
            .finally(() => setLoadingStreams(false));
    }, [cfg]);

    // Initial load groups
    useEffect(() => {
        fetchGroups();
    }, [fetchGroups]);

    // Load streams when group changes
    useEffect(() => {
        if (!selectedGroup) {
            setStreams([]);
            setSelectedStream(null);
            setEvents([]);
            return;
        }
        fetchStreams(selectedGroup);
        setSelectedStream(null);
        setEvents([]);
        setNextToken(null);
        setTailing(false);
    }, [selectedGroup, fetchStreams]);

    // Initial load events when stream selected
    useEffect(() => {
        if (!selectedGroup || !selectedStream) return;
        setEvents([]);
        setNextToken(null);
        setLoadingEvents(true);
        // Remove startMs restriction to see logs of any stream regardless of age
        cwGetLogEvents(cfg, selectedGroup, selectedStream, null, null)
            .then(res => {
                setEvents(res.events);
                setNextToken(res.next_forward_token);
                setTailing(true);
            })
            .catch(() => { })
            .finally(() => setLoadingEvents(false));
    }, [selectedStream, cfg, selectedGroup]);

    // Auto-scroll to bottom on new events
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    // Live tail interval
    useEffect(() => {
        if (!tailing || !selectedGroup || !selectedStream) {
            if (tailRef.current) clearInterval(tailRef.current);
            tailRef.current = null;
            return;
        }
        tailRef.current = setInterval(async () => {
            if (!nextTokenRef.current) return;
            try {
                const res = await cwGetLogEvents(cfg, selectedGroup, selectedStream, nextTokenRef.current);
                if (res.events.length > 0) {
                    setEvents(prev => [...prev.slice(-1000), ...res.events]);
                }
                if (res.next_forward_token && res.next_forward_token !== nextTokenRef.current) {
                    setNextToken(res.next_forward_token);
                }
            } catch { /* ignore tail errors silently */ }
        }, 5000);
        return () => { if (tailRef.current) clearInterval(tailRef.current); };
    }, [tailing, selectedGroup, selectedStream, cfg]);

    // Local filtered lists for UI
    // Favorites are always included, others only if they match the search

    // For groups: Include all favorites even if not in the current 'groups' list (as stubs),
    // then filter by search (favorites bypass search), then sort.
    const allGroups = [...groups];
    favorites.forEach(fav => {
        if (!allGroups.some(g => g.name === fav)) {
            allGroups.push({ name: fav, stored_bytes: 0 }); // stub for missing favorite
        }
    });

    const sortedGroups = allGroups
        .filter(g => favorites.includes(g.name) || g.name.toLowerCase().includes(groupSearch.toLowerCase()))
        .sort((a, b) => {
            const aFav = favorites.includes(a.name);
            const bFav = favorites.includes(b.name);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0;
        });

    // For streams: Include all streamFavorites as stubs if missing
    const allStreams = [...streams];
    streamFavorites.forEach(fav => {
        if (!allStreams.some(s => s.name === fav)) {
            allStreams.push({ name: fav, last_event_ms: null });
        }
    });

    const filteredStreams = allStreams
        .sort((a, b) => {
            const aFav = streamFavorites.includes(a.name);
            const bFav = streamFavorites.includes(b.name);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0;
        });

    // Local filtered events
    const filteredEvents = events.filter(e => {
        if (logFilters.length === 0) return true;
        const msg = e.message.toLowerCase();
        return logFilters.every(filter => msg.includes(filter.toLowerCase()));
    });

    const removeLogFilter = (f: string) => {
        setLogFilters(prev => prev.filter(x => x !== f));
    };

    const addLogFilter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && filterInput.trim()) {
            const f = filterInput.trim();
            if (!logFilters.includes(f)) {
                setLogFilters(prev => [...prev, f]);
            }
            setFilterInput('');
        }
    };

    return (
        <div className="flex h-full min-h-0">
            {/* Left: groups + streams */}
            <div className="w-64 shrink-0 border-r border-slate-800 flex flex-col min-h-0">
                {/* Group search */}
                <div className="p-2 border-b border-slate-800">
                    <div className="flex gap-1">
                        <div className="relative flex-1">
                            <input
                                value={groupSearch}
                                onChange={e => setGroupSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && fetchGroups(groupSearch.trim())}
                                placeholder="Buscar grupo…"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                            />
                            {loadingGroups && <RefreshCw size={10} className="animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />}
                        </div>
                        <button
                            onClick={() => fetchGroups(groupSearch.trim())}
                            disabled={loadingGroups}
                            title="Buscar grupos en AWS CloudWatch"
                            className="px-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700 transition-colors"
                        >
                            <RefreshCw size={12} className={loadingGroups ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
                {groupError && <p className="px-2 py-1 text-[10px] text-red-400 bg-red-500/10 border-b border-red-500/20">{groupError}</p>}

                <div className="flex-1 overflow-y-auto py-1">
                    {sortedGroups.map(g => {
                        const isFav = favorites.includes(g.name);
                        return (
                            <div key={g.name} className="group flex items-center pr-1">
                                <button onClick={() => setSelectedGroup(g.name)}
                                    className={`flex-1 text-left px-3 py-2 text-xs font-mono truncate transition-colors ${selectedGroup === g.name
                                        ? 'bg-nexus-neon/10 text-nexus-neon'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                        }`} title={g.name}>
                                    {g.name}
                                </button>
                                <button
                                    onClick={(e) => toggleFavorite(g.name, e)}
                                    className={`p-1.5 rounded-md hover:bg-slate-800 transition-colors ${isFav ? 'text-amber-400' : 'text-slate-700 opacity-0 group-hover:opacity-100'}`}
                                >
                                    <Star size={12} fill={isFav ? "currentColor" : "none"} />
                                </button>
                            </div>
                        );
                    })}
                    {sortedGroups.length === 0 && !loadingGroups && (
                        <p className="px-4 py-3 text-[10px] text-slate-600 italic">No hay resultados.</p>
                    )}
                </div>

                {/* Streams */}
                {selectedGroup && (
                    <>
                        <div className="border-t border-slate-800 p-2 bg-slate-900/40">
                            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5 px-1 flex justify-between items-center">
                                <span>Log Streams</span>
                                {loadingStreams && <RefreshCw size={10} className="animate-spin text-slate-500" />}
                            </div>
                            <div className="flex gap-1">
                                <div className="relative flex-1">
                                    <input
                                        value={streamSearch}
                                        onChange={e => setStreamSearch(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && fetchStreams(selectedGroup, streamSearch.trim())}
                                        placeholder="Buscar streams (Enter)…"
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                                    />
                                    {streamSearch && (
                                        <button
                                            onClick={() => { setStreamSearch(''); fetchStreams(selectedGroup); }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                                        >
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => fetchStreams(selectedGroup, streamSearch.trim())}
                                    disabled={loadingStreams}
                                    title="Buscar streams en AWS"
                                    className="px-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700 transition-colors"
                                >
                                    <RefreshCw size={12} className={loadingStreams ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>
                        {streamError && <p className="px-2 py-1 text-[10px] text-amber-400 bg-amber-500/5 border-b border-amber-500/10 leading-tight">{streamError}</p>}

                        <div className="overflow-y-auto max-h-56 py-1 border-t border-slate-800">
                            {filteredStreams.map(s => {
                                const isFav = streamFavorites.includes(s.name);
                                return (
                                    <div key={s.name} className="group flex items-center pr-1">
                                        <button onClick={() => setSelectedStream(s.name)}
                                            className={`flex-1 text-left px-3 py-1.5 text-[11px] font-mono transition-colors flex justify-between items-center gap-2 ${selectedStream === s.name
                                                ? 'bg-nexus-accent/10 text-nexus-accent'
                                                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                                }`} title={s.name}>
                                            <span className="truncate flex-1">{s.name}</span>
                                            {s.last_event_ms && (
                                                <span className="text-[9px] opacity-60 shrink-0">
                                                    {new Date(s.last_event_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </button>
                                        <button
                                            onClick={(e) => toggleStreamFavorite(s.name, e)}
                                            className={`p-1.5 rounded-md hover:bg-slate-800 transition-colors ${isFav ? 'text-amber-400' : 'text-slate-700 opacity-0 group-hover:opacity-100'}`}
                                        >
                                            <Star size={12} fill={isFav ? "currentColor" : "none"} />
                                        </button>
                                    </div>
                                );
                            })}
                            {filteredStreams.length === 0 && !loadingStreams && !streamError && (
                                <p className="px-4 py-2 text-[10px] text-slate-600 italic">Nada por aquí.</p>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Right: event viewer */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {!selectedStream ? (
                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                        Selecciona un grupo y un stream
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="flex flex-col border-b border-slate-800 shrink-0 bg-slate-900/40 min-w-0">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/50 min-w-0">
                                <span className="text-[10px] text-slate-500 font-mono truncate flex-1 min-w-0" title={`${selectedGroup} › ${selectedStream}`}>
                                    {selectedGroup} › {selectedStream}
                                </span>
                                {loadingEvents && <RefreshCw size={11} className="animate-spin text-slate-500 shrink-0" />}

                                <div className="flex items-center gap-1.5 ml-2 shrink-0 flex-wrap sm:flex-nowrap justify-end">
                                    <input
                                        value={filterInput}
                                        onChange={e => setFilterInput(e.target.value)}
                                        onKeyDown={addLogFilter}
                                        placeholder="Filtrar logs (Enter)"
                                        className="w-32 bg-slate-950 border border-slate-700/50 rounded px-2 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-nexus-accent transition-colors"
                                    />
                                    <button
                                        onClick={() => setTailing(v => !v)}
                                        className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded border transition-colors ${tailing
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                                            }`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${tailing ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                                        {tailing ? 'Live' : 'Pausado'}
                                    </button>
                                    <button onClick={() => setEvents([])} className="text-[10px] text-slate-600 hover:text-slate-400 ml-1">Limpiar</button>
                                </div>
                            </div>

                            {/* Filter Chips */}
                            {logFilters.length > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
                                    <span className="text-[9px] text-slate-600 uppercase">Filtros:</span>
                                    {logFilters.map(f => (
                                        <span key={f} className="flex items-center gap-1 bg-nexus-neon/10 text-nexus-neon border border-nexus-neon/20 px-1.5 py-0.5 rounded text-[10px]">
                                            {f}
                                            <button onClick={() => removeLogFilter(f)} className="hover:text-white rounded-full p-0.5 transition-colors"><X size={9} /></button>
                                        </span>
                                    ))}
                                    <button onClick={() => setLogFilters([])} className="text-[9px] text-slate-500 hover:text-slate-300 ml-1">Limpiar filtros</button>
                                </div>
                            )}
                        </div>

                        {/* Log lines */}
                        <div className="flex-1 overflow-y-auto bg-slate-950 p-3 font-mono text-[11px] text-slate-300 space-y-1">
                            {filteredEvents.length === 0 && !loadingEvents && (
                                <p className="text-slate-600 italic">Sin eventos que coincidan.</p>
                            )}
                            {[...filteredEvents].reverse().map((e, i) => (
                                <div key={i} className="flex gap-3 leading-relaxed hover:bg-slate-800/40 p-1.5 rounded-md transition-colors w-full group overflow-hidden">
                                    <span className="text-slate-600 shrink-0 select-none whitespace-nowrap mt-0.5">
                                        {new Date(e.timestamp).toLocaleTimeString()}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <LogMessage message={e.message} />
                                    </div>
                                </div>
                            ))}
                            <div ref={bottomRef} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────

function LineChart({ points }: { points: CwDatapoint[] }) {
    if (points.length === 0) return (
        <div className="flex items-center justify-center h-32 text-slate-600 text-xs italic">Sin datos</div>
    );

    const W = 560, H = 160, PX = 48, PY = 16;
    const xs = points.map(p => p.timestamp);
    const ys = points.map(p => p.value);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeY = maxY - minY || 1;

    const px = (x: number) => PX + ((x - minX) / (maxX - minX || 1)) * (W - PX - 8);
    const py = (y: number) => H - PY - ((y - minY) / rangeY) * (H - PY - PY);

    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.timestamp).toFixed(1)} ${py(p.value).toFixed(1)}`).join(' ');

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
        y: py(minY + t * rangeY),
        label: (minY + t * rangeY).toFixed(1),
    }));

    const xLabels = [
        { x: px(minX), label: new Date(minX).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
        { x: px(maxX), label: new Date(maxX).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    ];

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
            {yTicks.map((t, i) => (
                <g key={i}>
                    <line x1={PX} y1={t.y} x2={W - 8} y2={t.y} stroke="#1e293b" strokeDasharray="4 2" />
                    <text x={PX - 4} y={t.y + 3} textAnchor="end" fill="#475569" fontSize="9">{t.label}</text>
                </g>
            ))}
            <line x1={PX} y1={PY} x2={PX} y2={H - PY} stroke="#334155" />
            <line x1={PX} y1={H - PY} x2={W - 8} y2={H - PY} stroke="#334155" />
            {xLabels.map((l, i) => (
                <text key={i} x={l.x} y={H - 2} textAnchor="middle" fill="#475569" fontSize="9">{l.label}</text>
            ))}
            <path d={`${d} L ${px(maxX).toFixed(1)} ${H - PY} L ${px(minX).toFixed(1)} ${H - PY} Z`}
                fill="url(#cwGrad)" opacity="0.3" />
            <defs>
                <linearGradient id="cwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={d} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" />
            {points.length <= 30 && points.map((p, i) => (
                <circle key={i} cx={px(p.timestamp)} cy={py(p.value)} r="2.5" fill="#22d3ee" />
            ))}
        </svg>
    );
}

const NAMESPACE_SUGGESTIONS = [
    'AWS/Lambda', 'AWS/EC2', 'AWS/ECS', 'AWS/RDS', 'AWS/S3',
    'AWS/ApiGateway', 'AWS/DynamoDB', 'AWS/SQS', 'AWS/SNS',
    '/aws/lambda', 'AWS/ApplicationELB', 'AWS/CloudFront',
];

const STAT_OPTIONS = ['Average', 'Sum', 'Maximum', 'Minimum', 'SampleCount'];
const PERIOD_OPTIONS = [
    { label: '1 min', value: 60 },
    { label: '5 min', value: 300 },
    { label: '15 min', value: 900 },
    { label: '1 hora', value: 3600 },
];
const RANGE_OPTIONS = [
    { label: 'Última 1h', value: 3600_000 },
    { label: 'Últimas 6h', value: 21600_000 },
    { label: 'Últimas 24h', value: 86400_000 },
    { label: 'Últimos 7d', value: 604800_000 },
];

function MetricsTab({ cfg }: { cfg: CwCredentials }) {
    const [namespace, setNamespace] = usePersistedState('nexus-cw-metrics-ns', '');
    const [metricSearch, setMetricSearch] = usePersistedState('nexus-cw-metrics-search', '');
    const [metrics, setMetrics] = usePersistedState<CwMetricItem[]>('nexus-cw-metrics-list', []);
    const [loadingMetrics, setLoadingMetrics] = useState(false);
    const [selectedMetric, setSelectedMetric] = usePersistedState<CwMetricItem | null>('nexus-cw-metrics-selected', null);
    const [dimensions, setDimensions] = usePersistedState<CwDimension[]>('nexus-cw-metrics-dims', []);
    const [stat, setStat] = usePersistedState('nexus-cw-metrics-stat', 'Average');
    const [period, setPeriod] = usePersistedState('nexus-cw-metrics-period', 300);
    const [range, setRange] = usePersistedState('nexus-cw-metrics-range', 3600_000);
    const [datapoints, setDatapoints] = usePersistedState<CwDatapoint[]>('nexus-cw-metrics-data', []);
    const [loadingData, setLoadingData] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);

    const searchMetrics = useCallback(async () => {
        setLoadingMetrics(true);
        setMetrics([]);
        try {
            const result = await cwListMetrics(cfg, namespace || undefined, metricSearch || undefined);
            setMetrics(result.slice(0, 100));
        } catch { setMetrics([]); }
        finally { setLoadingMetrics(false); }
    }, [cfg, namespace, metricSearch]);

    const handleSelectMetric = (m: CwMetricItem) => {
        setSelectedMetric(m);
        setDimensions(m.dimensions.map(d => ({ ...d })));
    };

    const loadData = async () => {
        if (!selectedMetric) return;
        setLoadingData(true);
        setDataError(null);
        try {
            const endMs = Date.now();
            const startMs = endMs - range;
            const pts = await cwGetMetricData(
                cfg, selectedMetric.namespace, selectedMetric.metric_name,
                dimensions, stat, period, startMs, endMs,
            );
            setDatapoints(pts);
        } catch (e: any) {
            setDataError(e?.message ?? String(e));
        } finally {
            setLoadingData(false);
        }
    };

    const selectLabel = selectedMetric
        ? `${selectedMetric.namespace} / ${selectedMetric.metric_name}`
        : null;

    return (
        <div className="flex flex-col h-full min-h-0 p-4 gap-4">
            {/* Search row */}
            <div className="flex flex-wrap gap-2 items-end shrink-0">
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase tracking-wider">Namespace</label>
                    <input
                        list="ns-suggestions"
                        value={namespace}
                        onChange={e => setNamespace(e.target.value)}
                        placeholder="AWS/Lambda"
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 w-44 focus:outline-none focus:border-nexus-neon placeholder:text-slate-600"
                    />
                    <datalist id="ns-suggestions">
                        {NAMESPACE_SUGGESTIONS.map(n => <option key={n} value={n} />)}
                    </datalist>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase tracking-wider">Métrica</label>
                    <input
                        value={metricSearch}
                        onChange={e => setMetricSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchMetrics()}
                        placeholder="Errors ↵"
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 w-36 focus:outline-none focus:border-nexus-neon placeholder:text-slate-600"
                    />
                </div>
                <button onClick={searchMetrics} disabled={loadingMetrics}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                    {loadingMetrics ? <RefreshCw size={11} className="animate-spin" /> : null}
                    Buscar
                </button>
            </div>

            {/* Metric list */}
            {metrics.length > 0 && !selectedMetric && (
                <div className="border border-slate-800 rounded-lg overflow-hidden max-h-48 overflow-y-auto shrink-0">
                    {metrics.map((m, i) => (
                        <button key={i} onClick={() => handleSelectMetric(m)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 border-b border-slate-800 last:border-0 transition-colors">
                            <span className="text-nexus-neon font-mono">{m.namespace}</span>
                            <span className="text-slate-400 mx-1">/</span>
                            <span className="text-slate-200">{m.metric_name}</span>
                            {m.dimensions.length > 0 && (
                                <span className="text-slate-600 ml-2 text-[10px]">
                                    {m.dimensions.map(d => `${d.name}=${d.value}`).join(', ')}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Selected metric config */}
            {selectedMetric && (
                <div className="shrink-0 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 font-mono">{selectLabel}</span>
                        <button onClick={() => { setSelectedMetric(null); setDatapoints([]); }}
                            className="text-slate-600 hover:text-slate-300"><X size={13} /></button>
                    </div>

                    {dimensions.length > 0 && (
                        <div className="space-y-1.5">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Dimensiones</span>
                            {dimensions.map((d, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <span className="text-[11px] text-slate-400 font-mono w-28 shrink-0">{d.name}</span>
                                    <input value={d.value}
                                        onChange={e => setDimensions(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-nexus-neon"
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 uppercase tracking-wider">Estadística</label>
                            <select value={stat} onChange={e => setStat(e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon">
                                {STAT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 uppercase tracking-wider">Período</label>
                            <select value={period} onChange={e => setPeriod(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon">
                                {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 uppercase tracking-wider">Rango</label>
                            <select value={range} onChange={e => setRange(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon">
                                {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col justify-end">
                            <button onClick={loadData} disabled={loadingData}
                                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40 hover:bg-nexus-accent/30 disabled:opacity-40 rounded-lg transition-colors">
                                {loadingData ? <RefreshCw size={11} className="animate-spin" /> : null}
                                {loadingData ? 'Cargando…' : 'Cargar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chart */}
            {dataError && <p className="text-xs text-red-400 shrink-0">{dataError}</p>}
            {datapoints.length > 0 && (
                <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-auto">
                    <LineChart points={datapoints} />
                    <p className="text-[10px] text-slate-600 mt-2 text-right">
                        {datapoints.length} datapoints · {stat} · cada {period / 60} min
                    </p>
                </div>
            )}
            {!selectedMetric && metrics.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-sm italic">
                    Busca un namespace / métrica para comenzar
                </div>
            )}
        </div>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export const CloudWatchPanel: React.FC = () => {
    const [tab, setTab] = usePersistedState<CwTab>('nexus-cw-active-tab', 'settings');
    const [savedMsg, setSavedMsg] = useState(false);
    const [cfg, setCfg] = useState<CwCredentials>(() => loadCwConfig());
    const isConfigured = !!(cfg.accessKeyId && cfg.secretAccessKey && cfg.region);

    const handleSaved = () => {
        const updated = loadCwConfig();
        setCfg(updated);
        setSavedMsg(true);
        if (updated.accessKeyId && updated.secretAccessKey) setTab('logs');
    };

    const tabs: { id: CwTab; label: string }[] = [
        { id: 'settings', label: 'Configuración' },
        { id: 'logs', label: 'Logs' },
        { id: 'metrics', label: 'Métricas' },
        { id: 'ec2', label: 'EC2' },
        { id: 'api-gateway', label: 'API Gateway' },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                <Cloud size={15} className="text-nexus-neon mr-2 shrink-0" />
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${tab === t.id
                            ? 'border-nexus-neon text-white'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}>
                        {t.label}
                    </button>
                ))}
                {savedMsg && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle size={12} /> Guardado
                        <button onClick={() => setSavedMsg(false)} className="ml-1 text-slate-600 hover:text-slate-400"><X size={10} /></button>
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-auto">
                {tab === 'settings' && <SettingsTab onSaved={handleSaved} />}
                {tab === 'logs' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'logs' && isConfigured && <LogsTab cfg={cfg} />}
                {tab === 'metrics' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'metrics' && isConfigured && <MetricsTab cfg={cfg} />}
                {tab === 'ec2' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'ec2' && isConfigured && <Ec2Tab cfg={cfg} />}
                {tab === 'api-gateway' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'api-gateway' && isConfigured && <ApiGatewayPanel credentials={cfg} />}
            </div>
        </div>
    );
};
