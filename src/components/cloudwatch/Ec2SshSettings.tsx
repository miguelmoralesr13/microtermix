import { SshDefaults, saveSshDefaults } from './ec2Types';

interface Ec2SshSettingsProps {
    ssh: SshDefaults;
    setSsh: (s: SshDefaults) => void;
}

export function Ec2SshSettings({ ssh, setSsh }: Ec2SshSettingsProps) {
    const handleUpdate = (updates: Partial<SshDefaults>) => {
        const updated = { ...ssh, ...updates };
        setSsh(updated);
        saveSshDefaults(updated);
    };

    return (
        <div className="border-t border-slate-800 px-4 py-2 flex flex-wrap gap-4 items-end bg-slate-900/40 shrink-0">
            <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">SSH User</label>
                <input
                    value={ssh.username}
                    onChange={e => handleUpdate({ username: e.target.value })}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-microtermix-neon w-28"
                />
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-w-40">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Key (.pem)</label>
                <input
                    value={ssh.keyPath}
                    onChange={e => handleUpdate({ keyPath: e.target.value })}
                    placeholder="/path/to/key.pem"
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-microtermix-neon placeholder-slate-600"
                />
            </div>
            <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Port</label>
                <input
                    type="number"
                    value={ssh.port}
                    onChange={e => handleUpdate({ port: parseInt(e.target.value) || 22 })}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-microtermix-neon w-20"
                />
            </div>
        </div>
    );
}
