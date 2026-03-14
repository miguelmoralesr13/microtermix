import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
    Monitor, RefreshCw, Settings, Play, Square, RotateCcw, Terminal,
    ChevronDown, ChevronRight, CheckCircle, XCircle, Circle, Loader,
    AlertCircle, Eye, EyeOff, Search, X, Database, Link2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Ec2Credentials {
    access_key_id: string;
    secret_access_key: string;
    region: string;
    session_token?: string;
}

interface Ec2Tag {
    key: string;
    value: string;
}

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

interface ActiveTunnel {
    serviceId: string;
    instanceId: string;
    instanceName: string;
    remoteHost: string;
    remotePort: number;
    localPort: number;
    status: 'connecting' | 'active' | 'stopped';
}

// ── localStorage ───────────────────────────────────────────────────────────────

const CFG_KEY = 'microtermix-ec2-cfg';
const SSH_KEY = 'microtermix-ec2-ssh';

interface SshDefaults {
    username: string;
    keyPath: string;
    port: number;
}

function loadCreds(): Ec2Credentials {
    try {
        const raw = localStorage.getItem(CFG_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { access_key_id: '', secret_access_key: '', region: 'us-east-1', session_token: '' };
}

function saveCreds(c: Ec2Credentials) {
    localStorage.setItem(CFG_KEY, JSON.stringify(c));
}

function loadSshDefaults(): SshDefaults {
    try {
        const raw = localStorage.getItem(SSH_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { username: 'ec2-user', keyPath: '', port: 22 };
}

function saveSshDefaults(s: SshDefaults) {
    localStorage.setItem(SSH_KEY, JSON.stringify(s));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function stateColor(state: string): string {
    switch (state) {
        case 'running': return '#22c55e';
        case 'stopped': return '#ef4444';
        case 'stopping': return '#f59e0b';
        case 'pending': return '#38bdf8';
        case 'shutting-down': return '#f59e0b';
        case 'terminated': return '#475569';
        default: return '#6b7280';
    }
}

function StateIcon({ state }: { state: string }) {
    const color = stateColor(state);
    if (state === 'running') return <CheckCircle size={14} style={{ color }} />;
    if (state === 'stopped') return <XCircle size={14} style={{ color }} />;
    if (state === 'pending' || state === 'stopping' || state === 'shutting-down')
        return <Loader size={14} style={{ color }} className="animate-spin" />;
    if (state === 'terminated') return <Circle size={14} style={{ color }} />;
    return <AlertCircle size={14} style={{ color }} />;
}

function formatLaunchTime(iso: string | null): string {
    if (!iso) return '–';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

// ── SSM Port Forward Modal ─────────────────────────────────────────────────────

interface SsmPortForwardModalProps {
    inst: Ec2Instance;
    onConfirm: (remoteHost: string, remotePort: number, localPort: number) => void;
    onClose: () => void;
    starting: boolean;
    error: string | null;
}

function SsmPortForwardModal({ inst, onConfirm, onClose, starting, error }: SsmPortForwardModalProps) {
    const [remoteHost, setRemoteHost] = useState('');
    const [remotePort, setRemotePort] = useState(5432);
    const [localPort, setLocalPort] = useState(15432);
    const displayName = inst.name ?? inst.instance_id;

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!remoteHost.trim()) return;
        onConfirm(remoteHost.trim(), remotePort, localPort);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
                    <Database size={16} className="text-microtermix-neon" />
                    <h3 className="text-sm font-semibold text-slate-200">SSM Port Forwarding</h3>
                    <span className="ml-2 text-xs text-slate-500 font-mono truncate">{displayName}</span>
                    <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-300">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
                    <p className="text-xs text-slate-400 leading-relaxed">
                        Crea un túnel SSM desde tu máquina local hasta un host privado (ej. RDS) a través de la instancia EC2.
                        Conecta tu cliente de BD a <span className="font-mono text-slateus-300">localhost:&lt;puerto local&gt;</span>.
                    </p>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-400 font-medium">Host remoto <span className="text-slate-600">(endpoint RDS u otro)</span></label>
                        <input
                            autoFocus
                            type="text"
                            value={remoteHost}
                            onChange={e => setRemoteHost(e.target.value)}
                            placeholder="my-db.xxxx.us-east-1.rds.amazonaws.com"
                            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-microtermix-neon placeholder-slate-600"
                        />
                    </div>

                    <div className="flex gap-4">
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-xs text-slate-400 font-medium">Puerto remoto</label>
                            <input
                                type="number"
                                min={1}
                                max={65535}
                                value={remotePort}
                                onChange={e => setRemotePort(parseInt(e.target.value) || 5432)}
                                className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-microtermix-neon"
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-xs text-slate-400 font-medium">Puerto local</label>
                            <input
                                type="number"
                                min={1024}
                                max={65535}
                                value={localPort}
                                onChange={e => setLocalPort(parseInt(e.target.value) || 15432)}
                                className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-microtermix-neon"
                            />
                        </div>
                    </div>

                    {remoteHost && (
                        <div className="bg-slate-800/60 border border-slate-700 rounded px-3 py-2 text-xs text-slate-400 font-mono">
                            localhost:{localPort} → {remoteHost}:{remotePort}
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 p-2 bg-red-900/20 border border-red-800/40 rounded text-red-400 text-xs">
                            <AlertCircle size={13} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3 justify-end pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-1.5 rounded text-sm text-slate-400 hover:text-slate-200 transition-colors">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={starting || !remoteHost.trim()}
                            className="px-4 py-1.5 bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30 rounded text-sm hover:bg-microtermix-neon/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {starting && <Loader size={13} className="animate-spin" />}
                            Iniciar túnel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Active Tunnels Panel ────────────────────────────────────────────────────────

interface ActiveTunnelsPanelProps {
    tunnels: ActiveTunnel[];
    onStop: (serviceId: string) => void;
}

function ActiveTunnelsPanel({ tunnels, onStop }: ActiveTunnelsPanelProps) {
    if (tunnels.length === 0) return null;
    return (
        <div className="mx-4 mb-3 border border-slate-700 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border-b border-slate-700">
                <Link2 size={13} className="text-microtermix-neon" />
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Túneles activos</span>
            </div>
            <div className="flex flex-col divide-y divide-slate-800">
                {tunnels.map(t => (
                    <div key={t.serviceId} className="flex items-center gap-3 px-3 py-2.5 bg-slate-900">
                        <div className="shrink-0">
                            {t.status === 'connecting'
                                ? <Loader size={13} className="animate-spin text-yellow-400" />
                                : t.status === 'active'
                                    ? <CheckCircle size={13} className="text-green-400" />
                                    : <XCircle size={13} className="text-slate-500" />
                            }
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-mono text-slate-200">
                                localhost:{t.localPort} <span className="text-slate-500">→</span> {t.remoteHost}:{t.remotePort}
                            </div>
                            <div className="text-xs text-slate-500 truncate">via {t.instanceName}</div>
                        </div>
                        <button
                            onClick={() => onStop(t.serviceId)}
                            className="px-2 py-0.5 rounded text-xs text-red-400 border border-red-800/40 hover:bg-red-900/20 transition-colors shrink-0"
                            title="Detener túnel"
                        >
                            Detener
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Settings Tab ───────────────────────────────────────────────────────────────

interface SettingsTabProps {
    creds: Ec2Credentials;
    setCreds: (c: Ec2Credentials) => void;
    ssh: SshDefaults;
    setSsh: (s: SshDefaults) => void;
    onSave: () => void;
    onTest: () => void;
    testing: boolean;
    testResult: string | null;
}

function SettingsTab({ creds, setCreds, ssh, setSsh, onSave, onTest, testing, testResult }: SettingsTabProps) {
    const [showSecret, setShowSecret] = useState(false);
    const [showToken, setShowToken] = useState(false);

    const field = (
        label: string,
        value: string,
        onChange: (v: string) => void,
        opts?: { type?: string; placeholder?: string; mono?: boolean }
    ) => (
        <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">{label}</label>
            <input
                type={opts?.type ?? 'text'}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={opts?.placeholder ?? ''}
                className={`bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-microtermix-neon placeholder-slate-600 ${opts?.mono ? 'font-mono' : ''}`}
            />
        </div>
    );

    return (
        <div className="p-6 flex flex-col gap-6 max-w-xl">
            <div className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">AWS Credentials</h3>

                {field('Region', creds.region, v => setCreds({ ...creds, region: v }), { placeholder: 'us-east-1', mono: true })}
                {field('Access Key ID', creds.access_key_id, v => setCreds({ ...creds, access_key_id: v }), { mono: true, placeholder: 'AKIA...' })}

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-medium">Secret Access Key</label>
                    <div className="flex gap-2">
                        <input
                            type={showSecret ? 'text' : 'password'}
                            value={creds.secret_access_key}
                            onChange={e => setCreds({ ...creds, secret_access_key: e.target.value })}
                            placeholder="••••••••"
                            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-microtermix-neon placeholder-slate-600"
                        />
                        <button
                            onClick={() => setShowSecret(s => !s)}
                            className="px-2 text-slate-500 hover:text-slate-300"
                        >
                            {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-medium">Session Token <span className="text-slate-600">(optional)</span></label>
                    <div className="flex gap-2">
                        <input
                            type={showToken ? 'text' : 'password'}
                            value={creds.session_token ?? ''}
                            onChange={e => setCreds({ ...creds, session_token: e.target.value || undefined })}
                            placeholder="For temporary credentials (STS)"
                            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-microtermix-neon placeholder-slate-600"
                        />
                        <button
                            onClick={() => setShowToken(s => !s)}
                            className="px-2 text-slate-500 hover:text-slate-300"
                        >
                            {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">SSH Defaults</h3>
                {field('Default Username', ssh.username, v => setSsh({ ...ssh, username: v }), { placeholder: 'ec2-user' })}
                {field('Private Key Path', ssh.keyPath, v => setSsh({ ...ssh, keyPath: v }), { placeholder: '/path/to/key.pem', mono: true })}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400 font-medium">Port</label>
                    <input
                        type="number"
                        value={ssh.port}
                        onChange={e => setSsh({ ...ssh, port: parseInt(e.target.value) || 22 })}
                        className="w-24 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-microtermix-neon"
                    />
                </div>
            </div>

            <div className="flex gap-3 items-center">
                <button
                    onClick={onSave}
                    className="px-4 py-1.5 bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30 rounded text-sm hover:bg-microtermix-neon/20 transition-colors"
                >
                    Save
                </button>
                <button
                    onClick={onTest}
                    disabled={testing}
                    className="px-4 py-1.5 bg-slate-700 text-slate-200 rounded text-sm hover:bg-slate-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {testing && <Loader size={13} className="animate-spin" />}
                    Test Connection
                </button>
                {testResult && (
                    <span className={`text-xs ${testResult.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                        {testResult}
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Instance Row ───────────────────────────────────────────────────────────────

interface InstanceRowProps {
    inst: Ec2Instance;
    ssh: SshDefaults;
    creds: Ec2Credentials;
    onAction: (action: 'start' | 'stop' | 'reboot', id: string) => void;
    pending: string | null; // action pending for this instance
    onTunnelStarted: (tunnel: ActiveTunnel) => void;
}

function InstanceRow({ inst, ssh, creds, onAction, pending, onTunnelStarted }: InstanceRowProps) {
    const [expanded, setExpanded] = useState(false);
    const [showTunnelModal, setShowTunnelModal] = useState(false);
    const [tunnelStarting, setTunnelStarting] = useState(false);
    const [tunnelError, setTunnelError] = useState<string | null>(null);
    const displayName = inst.name ?? inst.instance_id;
    const connectHost = inst.public_ip ?? inst.private_ip;
    const canConnect = !!connectHost && inst.state === 'running';
    const isRunning = inst.state === 'running';
    const isStopped = inst.state === 'stopped';

    async function handleStartTunnel(remoteHost: string, remotePort: number, localPort: number) {
        setTunnelStarting(true);
        setTunnelError(null);
        const serviceId = `ssm-tunnel::${inst.instance_id}::${localPort}`;
        try {
            await invoke('ssm_start_port_forward', {
                credentials: creds,
                instanceId: inst.instance_id,
                remoteHost,
                remotePort,
                localPort,
                serviceId,
            });
            onTunnelStarted({
                serviceId,
                instanceId: inst.instance_id,
                instanceName: displayName,
                remoteHost,
                remotePort,
                localPort,
                status: 'connecting',
            });
            setShowTunnelModal(false);
        } catch (e) {
            setTunnelError(String(e));
        } finally {
            setTunnelStarting(false);
        }
    }

    function buildSshCommand(): string {
        const keyFlag = ssh.keyPath ? ` -i "${ssh.keyPath}"` : '';
        const portFlag = ssh.port !== 22 ? ` -p ${ssh.port}` : '';
        return `ssh${keyFlag}${portFlag} ${ssh.username}@${connectHost}`;
    }

    async function handleConnect() {
        if (!canConnect) return;
        try {
            await invoke('ec2_open_terminal', { sshCommand: buildSshCommand() });
        } catch (e) {
            alert(`Failed to open terminal: ${e}`);
        }
    }

    const stateLabel = inst.state.charAt(0).toUpperCase() + inst.state.slice(1);

    return (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
            {/* Main row */}
            <div
                className="flex items-center gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800/70 cursor-pointer select-none"
                onClick={() => setExpanded(e => !e)}
            >
                <span className="text-slate-500">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>

                <StateIcon state={inst.state} />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-100 truncate">{displayName}</span>
                        {inst.name && (
                            <span className="text-xs text-slate-500 font-mono truncate">{inst.instance_id}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                        <span style={{ color: stateColor(inst.state) }}>{stateLabel}</span>
                        <span>{inst.instance_type}</span>
                        {inst.availability_zone && <span>{inst.availability_zone}</span>}
                        {connectHost && <span className="font-mono">{connectHost}</span>}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {pending ? (
                        <Loader size={14} className="animate-spin text-slate-400 mx-1" />
                    ) : (
                        <>
                            {isStopped && (
                                <button
                                    onClick={() => onAction('start', inst.instance_id)}
                                    className="p-1.5 rounded text-green-400 hover:bg-green-400/10 transition-colors"
                                    title="Start"
                                >
                                    <Play size={14} />
                                </button>
                            )}
                            {isRunning && (
                                <>
                                    <button
                                        onClick={() => onAction('stop', inst.instance_id)}
                                        className="p-1.5 rounded text-red-400 hover:bg-red-400/10 transition-colors"
                                        title="Stop"
                                    >
                                        <Square size={14} />
                                    </button>
                                    <button
                                        onClick={() => onAction('reboot', inst.instance_id)}
                                        className="p-1.5 rounded text-yellow-400 hover:bg-yellow-400/10 transition-colors"
                                        title="Reboot"
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                    <button
                                        onClick={handleConnect}
                                        disabled={!canConnect}
                                        className="px-2.5 py-1 rounded text-xs bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30 hover:bg-microtermix-neon/20 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                                        title={canConnect ? buildSshCommand() : 'No public/private IP available'}
                                    >
                                        <Terminal size={12} />
                                        SSH
                                    </button>
                                    <button
                                        onClick={() => { setTunnelError(null); setShowTunnelModal(true); }}
                                        className="px-2.5 py-1 rounded text-xs bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 transition-colors flex items-center gap-1.5"
                                        title="SSM Port Forwarding — conectar a bases de datos privadas"
                                    >
                                        <Database size={12} />
                                        Tunnel
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div className="bg-slate-950 border-t border-slate-800 px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    {[
                        ['Instance ID', inst.instance_id],
                        ['Type', inst.instance_type],
                        ['State', stateLabel],
                        ['Platform', inst.platform ?? 'Linux / Other'],
                        ['Public IP', inst.public_ip ?? '–'],
                        ['Private IP', inst.private_ip ?? '–'],
                        ['Key Pair', inst.key_name ?? '–'],
                        ['Image ID', inst.image_id ?? '–'],
                        ['VPC', inst.vpc_id ?? '–'],
                        ['Subnet', inst.subnet_id ?? '–'],
                        ['AZ', inst.availability_zone ?? '–'],
                        ['Launch Time', formatLaunchTime(inst.launch_time)],
                    ].map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                            <span className="text-slate-500 shrink-0 w-24">{k}</span>
                            <span className="text-slate-300 font-mono break-all">{v}</span>
                        </div>
                    ))}

                    {inst.tags.length > 0 && (
                        <div className="col-span-2 mt-1 flex flex-wrap gap-1.5">
                            {inst.tags.map(t => (
                                <span
                                    key={t.key}
                                    className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs"
                                >
                                    {t.key}: {t.value}
                                </span>
                            ))}
                        </div>
                    )}

                    {canConnect && (
                        <div className="col-span-2 mt-1">
                            <span className="text-slate-500">SSH command </span>
                            <span className="font-mono text-slate-300 select-all">{buildSshCommand()}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Port Forward Modal */}
            {showTunnelModal && (
                <SsmPortForwardModal
                    inst={inst}
                    onConfirm={handleStartTunnel}
                    onClose={() => setShowTunnelModal(false)}
                    starting={tunnelStarting}
                    error={tunnelError}
                />
            )}
        </div>
    );
}

// ── Instances Tab ──────────────────────────────────────────────────────────────

type StateFilter = 'all' | 'running' | 'stopped';

interface InstancesTabProps {
    creds: Ec2Credentials;
    ssh: SshDefaults;
}

function InstancesTab({ creds, ssh }: InstancesTabProps) {
    const [instances, setInstances] = useState<Ec2Instance[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingMap, setPendingMap] = useState<Record<string, string>>({});
    const [stateFilter, setStateFilter] = useState<StateFilter>('all');
    const [search, setSearch] = useState('');
    const [tunnels, setTunnels] = useState<ActiveTunnel[]>([]);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchInstances = useCallback(async () => {
        if (!creds.access_key_id || !creds.secret_access_key || !creds.region) return;
        setLoading(true);
        setError(null);
        try {
            const result = await invoke<Ec2Instance[]>('ec2_list_instances', { credentials: creds });
            setInstances(result);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [creds]);

    // Initial fetch + 30s auto-refresh
    useEffect(() => {
        fetchInstances();
        pollRef.current = setInterval(fetchInstances, 30_000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchInstances]);

    // Listen for service-stopped to mark tunnels as stopped
    useEffect(() => {
        let unlisten: (() => void) | null = null;
        listen<string>('service-stopped', ev => {
            const stoppedId = ev.payload;
            setTunnels(prev => prev.map(t =>
                t.serviceId === stoppedId ? { ...t, status: 'stopped' } : t
            ));
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    // Listen for first log line from tunnel to mark it active
    useEffect(() => {
        let unlisten: (() => void) | null = null;
        listen<{ service_id: string; line: string; is_error: boolean }>('service-logs', ev => {
            const { service_id } = ev.payload;
            if (!service_id.startsWith('ssm-tunnel::')) return;
            setTunnels(prev => prev.map(t =>
                t.serviceId === service_id && t.status === 'connecting'
                    ? { ...t, status: 'active' }
                    : t
            ));
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    function handleTunnelStarted(tunnel: ActiveTunnel) {
        setTunnels(prev => {
            // Replace if same serviceId already exists
            const without = prev.filter(t => t.serviceId !== tunnel.serviceId);
            return [...without, tunnel];
        });
    }

    async function handleStopTunnel(serviceId: string) {
        try {
            await invoke('kill_service', { serviceId });
        } catch { /* ignore */ }
        setTunnels(prev => prev.filter(t => t.serviceId !== serviceId));
    }

    async function handleAction(action: 'start' | 'stop' | 'reboot', id: string) {
        setPendingMap(p => ({ ...p, [id]: action }));
        try {
            const cmd = action === 'start' ? 'ec2_start_instance'
                : action === 'stop' ? 'ec2_stop_instance'
                    : 'ec2_reboot_instance';
            await invoke(cmd, { credentials: creds, instanceId: id });
            // Short delay then refresh to pick up state transition
            await new Promise(r => setTimeout(r, 1500));
            await fetchInstances();
        } catch (e) {
            alert(`Failed to ${action} instance: ${e}`);
        } finally {
            setPendingMap(p => { const n = { ...p }; delete n[id]; return n; });
        }
    }

    const filtered = instances.filter(i => {
        if (stateFilter !== 'all' && i.state !== stateFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            const name = (i.name ?? '').toLowerCase();
            return name.includes(q) || i.instance_id.toLowerCase().includes(q) ||
                (i.public_ip ?? '').includes(q) || (i.private_ip ?? '').includes(q);
        }
        return true;
    });

    const counts = {
        all: instances.length,
        running: instances.filter(i => i.state === 'running').length,
        stopped: instances.filter(i => i.state === 'stopped').length,
    };

    const needsCreds = !creds.access_key_id || !creds.secret_access_key || !creds.region;

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 shrink-0">
                {/* State filter tabs */}
                <div className="flex gap-1">
                    {(['all', 'running', 'stopped'] as StateFilter[]).map(f => (
                        <button
                            key={f}
                            onClick={() => setStateFilter(f)}
                            className={`px-3 py-1 rounded text-xs capitalize transition-colors ${stateFilter === f ? 'bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {f} <span className="opacity-60">({counts[f]})</span>
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 flex-1 max-w-xs">
                    <Search size={13} className="text-slate-500 shrink-0" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Filter by name or IP…"
                        className="bg-transparent text-sm text-slate-100 focus:outline-none placeholder-slate-600 w-full"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300">
                            <X size={13} />
                        </button>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    {loading && <Loader size={14} className="animate-spin text-slate-400" />}
                    <button
                        onClick={fetchInstances}
                        disabled={loading || needsCreds}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-40"
                        title="Refresh"
                    >
                        <RefreshCw size={15} />
                    </button>
                </div>
            </div>

            {/* Active tunnels */}
            <ActiveTunnelsPanel
                tunnels={tunnels.filter(t => t.status !== 'stopped')}
                onStop={handleStopTunnel}
            />

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {needsCreds && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                        <Monitor size={40} strokeWidth={1} />
                        <p className="text-sm">Configure your AWS credentials in the Settings tab.</p>
                    </div>
                )}

                {!needsCreds && error && (
                    <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-800/40 rounded text-red-400 text-sm">
                        <AlertCircle size={15} className="shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {!needsCreds && !error && !loading && instances.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                        <Monitor size={40} strokeWidth={1} />
                        <p className="text-sm">No instances found in <span className="text-slate-300">{creds.region}</span>.</p>
                    </div>
                )}

                {!needsCreds && filtered.length > 0 && (
                    <div className="flex flex-col gap-2">
                        {filtered.map(inst => (
                            <InstanceRow
                                key={inst.instance_id}
                                inst={inst}
                                ssh={ssh}
                                creds={creds}
                                onAction={handleAction}
                                pending={pendingMap[inst.instance_id] ?? null}
                                onTunnelStarted={handleTunnelStarted}
                            />
                        ))}
                    </div>
                )}

                {!needsCreds && !error && instances.length > 0 && filtered.length === 0 && (
                    <div className="text-center text-slate-500 text-sm pt-16">
                        No instances match the current filter.
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

type Tab = 'instances' | 'settings';

export function EC2Panel() {
    const [tab, setTab] = useState<Tab>('instances');
    const [creds, setCreds] = useState<Ec2Credentials>(loadCreds);
    const [ssh, setSsh] = useState<SshDefaults>(loadSshDefaults);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    function handleSave() {
        saveCreds(creds);
        saveSshDefaults(ssh);
        setTestResult(null);
        setTab('instances');
    }

    async function handleTest() {
        setTesting(true);
        setTestResult(null);
        try {
            await invoke<Ec2Instance[]>('ec2_list_instances', { credentials: creds });
            setTestResult('✓ Connection successful');
        } catch (e) {
            setTestResult(`✗ ${e}`);
        } finally {
            setTesting(false);
        }
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 shrink-0">
                <Monitor size={18} className="text-microtermix-neon" />
                <h2 className="text-sm font-semibold text-slate-200">AWS EC2</h2>

                <div className="flex gap-1 ml-4">
                    {(['instances', 'settings'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs capitalize transition-colors ${tab === t ? 'bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {t === 'settings' && <Settings size={12} />}
                            {t === 'instances' && <Monitor size={12} />}
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>

                {creds.region && (
                    <span className="ml-auto text-xs text-slate-500 font-mono">{creds.region}</span>
                )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
                {tab === 'instances' && <InstancesTab creds={creds} ssh={ssh} />}
                {tab === 'settings' && (
                    <div className="overflow-y-auto h-full">
                        <SettingsTab
                            creds={creds}
                            setCreds={setCreds}
                            ssh={ssh}
                            setSsh={setSsh}
                            onSave={handleSave}
                            onTest={handleTest}
                            testing={testing}
                            testResult={testResult}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
