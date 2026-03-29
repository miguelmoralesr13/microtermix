import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Monitor, RefreshCw, Play, Square, RotateCcw,
    ChevronDown, ChevronRight, CheckCircle, XCircle, Circle, Loader,
    AlertCircle, Eye, EyeOff, Search, X, Database, Link2, Trash2, } from 'lucide-react';
import { useAwsStore } from '../stores/awsStore';
import { CwCredentials } from '../services/cloudwatchApi';
import { parseAwsCredentialBlock } from './cloudwatch/cwUtils';
import { Button } from './ui/button';
import { useEc2Instances, useEc2Actions, awsKeys } from '../hooks/queries/useAwsQueries';
import { useQueryClient } from '@tanstack/react-query';
import { Ec2Instance } from './cloudwatch/ec2Types';

interface SshDefaults {
    username: string;
    keyPath: string;
    port: number;
}

interface ActiveTunnelData {
    serviceId: string;
    instanceId: string;
    instanceName: string;
    remoteHost: string;
    remotePort: number;
    localPort: number;
    status: 'connecting' | 'active' | 'stopped';
}

const SSH_KEY = 'microtermix-ec2-ssh';

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
                    </p>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-400 font-medium">Host remoto</label>
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
                                value={remotePort}
                                onChange={e => setRemotePort(parseInt(e.target.value) || 5432)}
                                className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-microtermix-neon"
                            />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-xs text-slate-400 font-medium">Puerto local</label>
                            <input
                                type="number"
                                value={localPort}
                                onChange={e => setLocalPort(parseInt(e.target.value) || 15432)}
                                className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-microtermix-neon"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 p-2 bg-red-900/20 border border-red-800/40 rounded text-red-400 text-xs">
                            <AlertCircle size={13} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3 justify-end pt-1">
                        <button type="button" onClick={onClose} className="px-4 py-1.5 rounded text-sm text-slate-400 hover:text-slate-200">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={starting || !remoteHost.trim()}
                            className="px-4 py-1.5 bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30 rounded text-sm hover:bg-microtermix-neon/20 transition-colors flex items-center gap-2"
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

function ActiveTunnelsPanel() {
    const { ssm, toggleTunnel, removeTunnel } = useAwsStore();
    const [expanded, setExpanded] = useState(true);

    if (ssm.tunnels.length === 0) return null;

    return (
        <div className="mx-4 mb-3 border border-slate-700 rounded-lg overflow-hidden bg-slate-900/50">
            <div 
                className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 border-b border-slate-700 cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                <Link2 size={13} className="text-microtermix-neon" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex-1">Túneles SSM</span>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
            {expanded && (
                <div className="flex flex-col divide-y divide-slate-800/50">
                    {ssm.tunnels.map(t => (
                        <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-slate-900/30 group">
                            <div className="shrink-0">
                                {t.active ? <CheckCircle size={14} className="text-green-400" /> : <XCircle size={14} className="text-slate-600" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-200">{t.name}</div>
                                <div className="text-[10px] font-mono text-slate-500">localhost:{t.localPort} → {t.remoteHost}:{t.remotePort}</div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => toggleTunnel(t.id)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${t.active ? 'text-red-400 border-red-500/30' : 'text-emerald-400 border-emerald-500/30'}`}
                                >
                                    {t.active ? 'DETENER' : 'INICIAR'}
                                </button>
                                <button onClick={() => removeTunnel(t.id)} className="p-1 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface InstanceRowProps {
    inst: Ec2Instance;
    ssh: SshDefaults;
    creds: CwCredentials;
    onAction: (action: 'start' | 'stop' | 'reboot', id: string) => void;
    pending: boolean;
    onTunnelStarted: (tunnel: ActiveTunnelData) => void;
}

function InstanceRow({ inst, ssh, creds, onAction, pending, onTunnelStarted }: InstanceRowProps) {
    const [expanded, setExpanded] = useState(false);
    const [showTunnelModal, setShowTunnelModal] = useState(false);
    const [tunnelStarting, setTunnelStarting] = useState(false);
    const [tunnelError, setTunnelError] = useState<string | null>(null);
    const displayName = inst.name ?? inst.instance_id;
    const connectHost = inst.public_ip ?? inst.private_ip;
    const canConnect = !!connectHost && inst.state === 'running';

    async function handleStartTunnel(remoteHost: string, remotePort: number, localPort: number) {
        setTunnelStarting(true);
        setTunnelError(null);
        const serviceId = `ssm-tunnel::${inst.instance_id}::${localPort}`;
        try {
            const rustCreds = {
                access_key_id: creds.accessKeyId,
                secret_access_key: creds.secretAccessKey,
                region: creds.region,
                session_token: creds.sessionToken || null,
            };
            await invoke('ssm_start_port_forward', {
                credentials: rustCreds,
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

    return (
        <div className="border border-slate-800 rounded-lg overflow-hidden group/row">
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800/70 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
                <span className="text-slate-500">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <StateIcon state={inst.state} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-100 truncate">{displayName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{inst.instance_id}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 font-mono">
                        <span style={{ color: stateColor(inst.state) }} className="font-bold capitalize">{inst.state}</span>
                        <span>{inst.instance_type}</span>
                        {connectHost && <span className="text-microtermix-neon/60">{connectHost}</span>}
                    </div>
                </div>
                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                    {pending ? <Loader size={14} className="animate-spin text-slate-400 mx-1" /> : (
                        <>
                            {inst.state === 'stopped' && <button onClick={() => onAction('start', inst.instance_id)} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded"><Play size={14} /></button>}
                            {inst.state === 'running' && (
                                <>
                                    <button onClick={() => onAction('stop', inst.instance_id)} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded"><Square size={14} /></button>
                                    <button onClick={() => onAction('reboot', inst.instance_id)} className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded"><RotateCcw size={14} /></button>
                                    <button onClick={() => invoke('ec2_open_terminal', { sshCommand: buildSshCommand() })} disabled={!canConnect} className="px-2 py-1 bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30 rounded text-[10px] font-bold">SSH</button>
                                    <button onClick={() => setShowTunnelModal(true)} className="px-2 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded text-[10px] font-bold">TUNNEL</button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
            {expanded && (
                <div className="bg-slate-950 border-t border-slate-800 px-4 py-3 grid grid-cols-2 gap-2 text-[11px]">
                    {[ ['Type', inst.instance_type], ['Public IP', inst.public_ip ?? '–'], ['VPC', inst.vpc_id ?? '–'], ['Launch', formatLaunchTime(inst.launch_time)] ].map(([k, v]) => (
                        <div key={k} className="flex gap-2"><span className="text-slate-500 w-20">{k}</span><span className="text-slate-300 font-mono">{v}</span></div>
                    ))}
                </div>
            )}
            {showTunnelModal && <SsmPortForwardModal inst={inst} onConfirm={handleStartTunnel} onClose={() => setShowTunnelModal(false)} starting={tunnelStarting} error={tunnelError} />}
        </div>
    );
}

function SettingsTab({ ssh, setSsh, onSave }: { ssh: SshDefaults; setSsh: (s: SshDefaults) => void; onSave: () => void }) {
    const { credentials, setCredentials } = useAwsStore();
    const [localCreds, setLocalCreds] = useState<CwCredentials>(() => credentials || { accessKeyId: '', secretAccessKey: '', region: 'us-east-1' });
    const [showSecret, setShowSecret] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    const handlePaste = async () => {
        const text = await navigator.clipboard.readText();
        const parsed = parseAwsCredentialBlock(text);
        if (parsed.accessKeyId) {
            setLocalCreds(prev => ({ ...prev, ...parsed }));
            setTestResult('✓ Credenciales detectadas');
        }
    };

    return (
        <div className="p-6 flex flex-col gap-6 max-w-2xl mx-auto">
            <div className="grid grid-cols-2 gap-8">
                <div className="flex flex-col gap-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">AWS Credentials</h3>
                    <Button  size="sm" variant="secondary" onClick={handlePaste} className="text-[10px] h-7 bg-slate-800">Pegar desde portapapeles</Button>
                    <input value={localCreds.region} onChange={e => setLocalCreds({ ...localCreds, region: e.target.value })} placeholder="Region" className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm font-mono" />
                    <input value={localCreds.accessKeyId} onChange={e => setLocalCreds({ ...localCreds, accessKeyId: e.target.value })} placeholder="Access Key ID" className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm font-mono" />
                    <div className="flex gap-2">
                        <input type={showSecret ? 'text' : 'password'} value={localCreds.secretAccessKey} onChange={e => setLocalCreds({ ...localCreds, secretAccessKey: e.target.value })} placeholder="Secret Key" className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm font-mono" />
                        <button onClick={() => setShowSecret(!showSecret)} className="text-slate-500">{showSecret ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    </div>
                    <textarea value={localCreds.sessionToken || ''} onChange={e => setLocalCreds({ ...localCreds, sessionToken: e.target.value })} placeholder="Session Token (Optional)" className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-[10px] font-mono h-20 resize-none" />
                </div>
                <div className="flex flex-col gap-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">SSH Defaults</h3>
                    <input value={ssh.username} onChange={e => setSsh({ ...ssh, username: e.target.value })} placeholder="Username" className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm" />
                    <input value={ssh.keyPath} onChange={e => setSsh({ ...ssh, keyPath: e.target.value })} placeholder="Key Path" className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm font-mono" />
                    <input type="number" value={ssh.port} onChange={e => setSsh({ ...ssh, port: parseInt(e.target.value) || 22 })} placeholder="Port" className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm" />
                </div>
            </div>
            <div className="flex items-center gap-4 pt-4 border-t border-slate-800">
                <Button onClick={() => { setCredentials(localCreds); onSave(); }} className="bg-microtermix-neon text-slate-900 font-bold px-8">Guardar</Button>
                {testResult && <span className="text-[10px] font-mono text-emerald-400">{testResult}</span>}
            </div>
        </div>
    );
}

function InstancesTab({ ssh }: { ssh: SshDefaults }) {
    const { credentials, addTunnel } = useAwsStore();
    const [search, setSearch] = useState('');
    const queryClient = useQueryClient();
    
    const { data: instances = [], isLoading } = useEc2Instances();
    const { startInstance, stopInstance, isStarting, isStopping } = useEc2Actions();

    const filtered = instances.filter(i => {
        const q = search.toLowerCase();
        return (i.name ?? '').toLowerCase().includes(q) || i.instance_id.toLowerCase().includes(q) || (i.public_ip ?? '').includes(q);
    });

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/20">
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 flex-1 max-w-xs">
                    <Search size={13} className="text-slate-500" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar..." className="bg-transparent text-xs outline-none w-full" />
                </div>
                <button onClick={() => queryClient.invalidateQueries({ queryKey: awsKeys.instances() })} disabled={isLoading} className="p-2 text-slate-400 hover:text-microtermix-neon"><RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} /></button>
            </div>
            <ActiveTunnelsPanel />
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {filtered.map(inst => (
                    <InstanceRow 
                        key={inst.instance_id} 
                        inst={inst} 
                        ssh={ssh} 
                        creds={credentials!} 
                        onAction={(a, id) => a === 'start' ? startInstance(id) : stopInstance(id)} 
                        pending={isStarting || isStopping} 
                        onTunnelStarted={t => addTunnel({ name: t.instanceName, instanceId: t.instanceId, remoteHost: t.remoteHost, remotePort: t.remotePort, localPort: t.localPort })} 
                    />
                ))}
            </div>
        </div>
    );
}

export function EC2Panel() {
    const { credentials } = useAwsStore();
    const [tab, setTab] = useState<'instances' | 'settings'>('instances');
    const [ssh, setSsh] = useState<SshDefaults>(loadSshDefaults);

    return (
        <div className="flex flex-col h-full bg-slate-950">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/40">
                <div className="flex items-center gap-2"><Monitor size={18} className="text-microtermix-neon" /><h2 className="text-sm font-bold">AWS EC2</h2></div>
                <div className="flex gap-1 ml-6 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    { (['instances', 'settings'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} className={`px-4 py-1 rounded text-[10px] font-bold uppercase transition-all ${tab === t ? 'bg-slate-800 text-microtermix-neon' : 'text-slate-500 hover:text-slate-300'}`}>{t === 'instances' ? 'Instancias' : 'Ajustes'}</button>
                    ))}
                </div>
                {credentials?.region && <div className="ml-auto text-[10px] font-mono text-slate-500">{credentials.region}</div>}
            </div>
            <div className="flex-1 overflow-hidden">
                {tab === 'instances' ? <InstancesTab ssh={ssh} /> : <SettingsTab ssh={ssh} setSsh={setSsh} onSave={() => { saveSshDefaults(ssh); setTab('instances'); }} />}
            </div>
        </div>
    );
}
