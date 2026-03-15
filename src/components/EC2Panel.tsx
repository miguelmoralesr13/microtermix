import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
    Monitor, RefreshCw, Settings, Play, Square, RotateCcw, Terminal,
    ChevronDown, ChevronRight, CheckCircle, XCircle, Circle, Loader,
    AlertCircle, Eye, EyeOff, Search, X, Database, Link2, Plus, Trash2, Activity, ExternalLink, AlertTriangle
} from 'lucide-react';
import { useAwsStore, SsmTunnel } from '../stores/awsStore';
import { CwCredentials } from '../services/cloudwatchApi';
import { parseAwsCredentialBlock } from './cloudwatch/cwUtils';

// ── Components ────────────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── localStorage ───────────────────────────────────────────────────────────────

const SSH_KEY = 'microtermix-ec2-ssh';

interface SshDefaults {
    username: string;
    keyPath: string;
    port: number;
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

function ActiveTunnelsPanel() {
    const { ssm, toggleTunnel, removeTunnel } = useAwsStore();
    const [expanded, setExpanded] = useState(true);

    if (ssm.tunnels.length === 0) return null;

    return (
        <div className="mx-4 mb-3 border border-slate-700 rounded-lg overflow-hidden bg-slate-900/50 shadow-lg">
            <div 
                className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border-b border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors"
                onClick={() => setExpanded(!expanded)}
            >
                <Link2 size={13} className="text-microtermix-neon" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex-1">Túneles SSM Guardados</span>
                <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-1.5 py-0.5 rounded-full">{ssm.tunnels.length}</span>
                {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
            </div>
            
            {expanded && (
                <div className="flex flex-col divide-y divide-slate-800/50">
                    {ssm.tunnels.map(t => (
                        <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-900/30 group">
                            <div className="shrink-0 relative">
                                {t.active ? (
                                    <>
                                        <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-20" />
                                        <CheckCircle size={14} className="text-green-400 relative z-10" />
                                    </>
                                ) : (
                                    <XCircle size={14} className="text-slate-600" />
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-200">{t.name}</span>
                                    <span className="text-[10px] text-slate-500 font-mono truncate">via {t.instanceId}</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                                    localhost:<span className="text-microtermix-accent">{t.localPort}</span> 
                                    <span className="text-slate-600 mx-1">→</span> 
                                    {t.remoteHost}:<span className="text-slate-300">{t.remotePort}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => toggleTunnel(t.id)}
                                    className={`px-3 py-1 rounded text-[10px] font-bold border transition-all ${
                                        t.active 
                                        ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20' 
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                    }`}
                                >
                                    {t.active ? 'DETENER' : 'INICIAR'}
                                </button>
                                <button
                                    onClick={() => removeTunnel(t.id)}
                                    className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    title="Eliminar túnel"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
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
        <div className="border border-slate-800 rounded-lg overflow-hidden group/row">
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
                            <span className="text-[10px] text-slate-500 font-mono truncate">{inst.instance_id}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 font-mono">
                        <span style={{ color: stateColor(inst.state) }} className="font-bold">{stateLabel}</span>
                        <span>{inst.instance_type}</span>
                        {inst.availability_zone && <span>{inst.availability_zone}</span>}
                        {connectHost && <span className="text-microtermix-neon/60">{connectHost}</span>}
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
                                    
                                    <div className="h-4 w-px bg-slate-800 mx-1" />

                                    <button
                                        onClick={handleConnect}
                                        disabled={!canConnect}
                                        className="px-2.5 py-1 rounded text-[10px] font-bold bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30 hover:bg-microtermix-neon/20 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                                        title={canConnect ? buildSshCommand() : 'No public/private IP available'}
                                    >
                                        <Terminal size={12} />
                                        SSH
                                    </button>
                                    <button
                                        onClick={() => { setTunnelError(null); setShowTunnelModal(true); }}
                                        className="px-2.5 py-1 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 transition-colors flex items-center gap-1.5"
                                        title="SSM Port Forwarding — conectar a bases de datos privadas"
                                    >
                                        <Database size={12} />
                                        TUNNEL
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => {
                                    // Deep link logic could be handled by a global UI state or event
                                    // For now we can emit an event or just show a message
                                    console.log(`Deep link to logs for ${inst.instance_id}`);
                                }}
                                className="p-1.5 rounded text-slate-500 hover:text-microtermix-neon hover:bg-microtermix-neon/5 transition-colors"
                                title="Ver Logs en CloudWatch"
                            >
                                <ExternalLink size={14} />
                            </button>
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

function InstancesTab({ ssh }: { ssh: SshDefaults }) {
    const { 
        credentials, 
        ec2, 
        fetchInstances, 
        startInstance, 
        stopInstance,
        addTunnel 
    } = useAwsStore();
    
    const [pendingMap, setPendingMap] = useState<Record<string, string>>({});
    const [stateFilter, setStateFilter] = useState<StateFilter>('all');
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (credentials) fetchInstances();
    }, [credentials, fetchInstances]);

    async function handleAction(action: 'start' | 'stop' | 'reboot', id: string) {
        setPendingMap(p => ({ ...p, [id]: action }));
        try {
            if (action === 'start') await startInstance(id);
            else if (action === 'stop') await stopInstance(id);
            else await invoke('ec2_reboot_instance', { credentials, instanceId: id });
        } catch (e) {
            alert(`Failed to ${action} instance: ${e}`);
        } finally {
            setPendingMap(p => { const n = { ...p }; delete n[id]; return n; });
        }
    }

    const filtered = ec2.instances.filter(i => {
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
        all: ec2.instances.length,
        running: ec2.instances.filter(i => i.state === 'running').length,
        stopped: ec2.instances.filter(i => i.state === 'stopped').length,
    };

    const needsCreds = !credentials?.accessKeyId;

    return (
        <div className="flex flex-col h-full bg-slate-950/50">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 shrink-0 bg-slate-900/20">
                <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    {(['all', 'running', 'stopped'] as StateFilter[]).map(f => (
                        <button
                            key={f}
                            onClick={() => setStateFilter(f)}
                            className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-tighter transition-all ${stateFilter === f ? 'bg-microtermix-neon text-slate-950 shadow-[0_0_10px_-2px_rgba(34,211,238,0.6)]' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {f} <span className="opacity-60">({counts[f]})</span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 flex-1 max-w-xs transition-all focus-within:border-microtermix-neon/50">
                    <Search size={13} className="text-slate-500 shrink-0" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nombre, ID o IP…"
                        className="bg-transparent text-xs text-slate-100 focus:outline-none placeholder-slate-600 w-full"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="text-slate-500 hover:text-slate-300">
                            <X size={13} />
                        </button>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-3">
                    {ec2.loading && <Loader size={14} className="animate-spin text-microtermix-neon" />}
                    <button
                        onClick={() => fetchInstances(true)}
                        disabled={ec2.loading || needsCreds}
                        className="p-2 rounded-lg text-slate-400 hover:text-microtermix-neon hover:bg-microtermix-neon/10 transition-all disabled:opacity-40 border border-transparent hover:border-microtermix-neon/20"
                        title="Refrescar instancias"
                    >
                        <RefreshCw size={16} className={ec2.loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Active tunnels */}
            <ActiveTunnelsPanel />

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {needsCreds ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                        <div className="p-6 rounded-full bg-slate-900 border border-slate-800">
                            <Monitor size={48} strokeWidth={1} />
                        </div>
                        <p className="text-sm font-medium">Configura tus credenciales AWS en la pestaña de ajustes.</p>
                    </div>
                ) : ec2.error ? (
                    <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm max-w-2xl mx-auto">
                        <AlertTriangle size={18} className="shrink-0" />
                        <div className="flex flex-col gap-1">
                            <span className="font-bold uppercase text-[10px]">Error de Conexión</span>
                            <span className="font-mono text-xs">{ec2.error}</span>
                        </div>
                    </div>
                ) : !ec2.loading && ec2.instances.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                        <Monitor size={40} strokeWidth={1} />
                        <p className="text-sm">No se encontraron instancias en <span className="text-slate-300 font-mono">{credentials?.region}</span>.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 max-w-5xl mx-auto">
                        {filtered.map(inst => (
                            <InstanceRow
                                key={inst.instance_id}
                                inst={inst}
                                ssh={ssh}
                                creds={{
                                    access_key_id: credentials!.accessKeyId,
                                    secret_access_key: credentials!.secretAccessKey,
                                    region: credentials!.region,
                                    session_token: credentials!.sessionToken
                                }}
                                onAction={handleAction}
                                pending={pendingMap[inst.instance_id] ?? null}
                                onTunnelStarted={(t) => {
                                    addTunnel({
                                        name: t.instanceName,
                                        instanceId: t.instanceId,
                                        remoteHost: t.remoteHost,
                                        remotePort: t.remotePort,
                                        localPort: t.localPort
                                    });
                                }}
                            />
                        ))}
                        {filtered.length === 0 && ec2.instances.length > 0 && (
                            <div className="text-center text-slate-500 text-sm pt-16 italic">
                                Ninguna instancia coincide con los filtros actuales.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

type Tab = 'instances' | 'settings';

export function EC2Panel() {
    const { credentials } = useAwsStore();
    const [tab, setTab] = useState<Tab>('instances');
    const [ssh, setSsh] = useState<SshDefaults>(loadSshDefaults);

    function handleSave() {
        saveSshDefaults(ssh);
        setTab('instances');
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-100">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 shrink-0 bg-slate-900/40">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-microtermix-neon/10 border border-microtermix-neon/30">
                        <Monitor size={18} className="text-microtermix-neon" />
                    </div>
                    <h2 className="text-sm font-bold text-slate-200 tracking-tight">AWS EC2</h2>
                </div>

                <div className="flex gap-1 ml-6 bg-slate-900/50 p-1 rounded-xl border border-slate-800">
                    {(['instances', 'settings'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${tab === t ? 'bg-slate-800 text-microtermix-neon shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {t === 'settings' ? <Settings size={13} /> : <Activity size={13} />}
                            {t === 'instances' ? 'Instancias' : 'Ajustes'}
                        </button>
                    ))}
                </div>

                {credentials?.region && (
                    <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-full">
                        <div className="w-1.5 h-1.5 rounded-full bg-microtermix-neon animate-pulse" />
                        <span className="text-[10px] text-slate-400 font-mono font-bold">{credentials.region}</span>
                    </div>
                )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-hidden">
                {tab === 'instances' && <InstancesTab ssh={ssh} />}
                {tab === 'settings' && (
                    <div className="overflow-y-auto h-full bg-slate-950/20">
                        <SettingsTab
                            ssh={ssh}
                            setSsh={setSsh}
                            onSave={handleSave}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
