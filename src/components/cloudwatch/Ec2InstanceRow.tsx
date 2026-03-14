import { useState } from 'react';
import {
    ChevronDown, ChevronRight, Play, Square, RotateCcw, Terminal, Loader
} from 'lucide-react';
import { Ec2Instance, SshDefaults, ec2StateColor, formatLaunchTime } from './ec2Types';
import { Ec2StateIcon } from './Ec2StateIcon';

interface Ec2InstanceRowProps {
    inst: Ec2Instance;
    ssh: SshDefaults;
    onAction: (action: 'start' | 'stop' | 'reboot', id: string) => void;
    pending: string | null;
    onSshConnect: (inst: Ec2Instance, cmd: string) => void;
    onSsmConnect: (inst: Ec2Instance) => void;
    connecting: string | null; // which connect mode is active: 'ssh' | 'ssm'
    ssmAvailable: boolean | null; // null=checking, false=not found
}

export function Ec2InstanceRow({
    inst, ssh, onAction, pending, onSshConnect, onSsmConnect, connecting, ssmAvailable
}: Ec2InstanceRowProps) {
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
                                    className="px-2.5 py-1 rounded text-xs bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30 hover:bg-microtermix-neon/20 flex items-center gap-1.5 disabled:opacity-40"
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
