import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDockerStore } from '@/stores/dockerStore';
import { Editor } from '@monaco-editor/react';
import { invoke } from '@tauri-apps/api/core';
import { 
    Info, FileJson, 
    Layers, Cpu, HardDrive, 
    Calendar, User, Lock, Terminal, Loader2, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const DockerInspectModal: React.FC = () => {
    const { inspectResourceId, setInspectResourceId } = useDockerStore();
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab ] = useState<'details' | 'json'>('details');

    useEffect(() => {
        if (inspectResourceId) {
            fetchData();
            setActiveTab('details');
        } else {
            setData(null);
        }
    }, [inspectResourceId]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const res = await invoke<any>('docker_inspect', { id: inspectResourceId });
            setData(res);
        } catch (err) {
            console.error('Failed to inspect resource', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (!inspectResourceId) return null;

    const renderSummary = () => {
        if (!data) return null;

        // Basic identification
        const imageId = data.Id?.substring(0, 12);
        const repoTag = data.RepoTags?.[0] || 'Unlabeled';
        const created = new Date(data.Created).toLocaleString();
        const arch = data.Architecture || 'unknown';
        const os = data.Os || 'unknown';
        const size = (data.Size / 1024 / 1024).toFixed(2) + ' MB';
        const author = data.Author || 'Unknown Author';

        return (
            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                {/* Header Card */}
                <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800 shadow-inner relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                        <Layers size={120} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="px-2 py-0.5 bg-microtermix-neon/10 text-microtermix-neon text-[9px] font-black uppercase tracking-widest rounded border border-microtermix-neon/20">
                                Image Metadata
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">{imageId}</span>
                        </div>
                        <h3 className="text-2xl font-black text-slate-100 tracking-tight break-all">{repoTag}</h3>
                        <p className="text-xs text-slate-400 mt-2 flex items-center gap-2">
                            <User size={12} className="text-slate-600" /> {author}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoCard icon={<Cpu size={16}/>} label="Architecture" value={`${arch} / ${os}`} />
                    <InfoCard icon={<HardDrive size={16}/>} label="Virtual Size" value={size} color="text-microtermix-accent" />
                    <InfoCard icon={<Calendar size={16}/>} label="Created At" value={created} />
                    <InfoCard icon={<Lock size={16}/>} label="Docker Version" value={data.DockerVersion || 'N/A'} />
                    <InfoCard icon={<Info size={16}/>} label="Graph Driver" value={data.GraphDriver?.Name || 'N/A'} />
                </div>

                {/* Config section */}
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Terminal size={14} className="text-slate-600" /> Runtime Config
                    </h4>
                    <div className="grid grid-cols-1 gap-3">
                         <div className="bg-slate-950 p-4 rounded-xl border border-slate-900">
                             <span className="text-[9px] font-bold text-slate-600 uppercase block mb-1.5">Cmd / Entrypoint</span>
                             <div className="font-mono text-[11px] text-slate-300 space-y-1">
                                 {data.Config?.Entrypoint && (
                                     <div className="flex gap-2">
                                         <span className="text-microtermix-neon">ENTRYPOINT</span>
                                         <span>{JSON.stringify(data.Config.Entrypoint)}</span>
                                     </div>
                                 )}
                                 {data.Config?.Cmd && (
                                     <div className="flex gap-2">
                                         <span className="text-microtermix-accent">CMD</span>
                                         <span>{JSON.stringify(data.Config.Cmd)}</span>
                                     </div>
                                 )}
                             </div>
                         </div>
                         
                         {data.Config?.Env && (
                             <div className="bg-slate-950 p-4 rounded-xl border border-slate-900">
                                <span className="text-[9px] font-bold text-slate-600 uppercase block mb-1.5">Environment Variables</span>
                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {data.Config.Env.map((env: string, i: number) => {
                                        const [k, v] = env.split('=');
                                        return (
                                            <div key={i} className="flex gap-4 font-mono text-[10px] py-1 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors px-1 rounded">
                                                <span className="text-slate-500 shrink-0 w-32 truncate">{k}</span>
                                                <span className="text-slate-300 break-all">{v}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                             </div>
                         )}

                         <div className="bg-slate-950 p-4 rounded-xl border border-slate-900">
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-[9px] font-bold text-slate-600 uppercase block mb-1.5">Exposed Ports</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {data.Config?.ExposedPorts ? Object.keys(data.Config.ExposedPorts).map(p => (
                                            <span key={p} className="px-2 py-0.5 bg-slate-900 text-slate-300 text-[10px] font-mono rounded border border-slate-800">{p}</span>
                                        )) : <span className="text-[10px] text-slate-600 italic">None</span>}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[9px] font-bold text-slate-600 uppercase block mb-1.5">Volumes</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {data.Config?.Volumes ? Object.keys(data.Config.Volumes).map(v => (
                                            <span key={v} className="px-2 py-0.5 bg-slate-900 text-slate-300 text-[10px] font-mono rounded border border-slate-800">{v}</span>
                                        )) : <span className="text-[10px] text-slate-600 italic">None</span>}
                                    </div>
                                </div>
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Dialog open={!!inspectResourceId} onOpenChange={(open) => !open && setInspectResourceId(null)}>
            <DialogContent className="bg-[#020617] border-slate-800 text-white max-w-[1000px] w-[90vw] h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl ring-1 ring-white/10 rounded-2xl">
                <DialogHeader className="p-4 border-b border-slate-800 bg-[#0f172a]/50 shrink-0">
                    <DialogTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-microtermix-neon/10 rounded-lg">
                                <Info size={20} className="text-microtermix-neon" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold tracking-tight">Resource Inspection</span>
                                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">Deep Metadata Analysis</span>
                            </div>
                        </div>
                        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                            <Button
                                variant="ghost" size="xs"
                                onClick={() => setActiveTab('details')}
                                className={cn("h-7 px-3 text-[10px] font-bold tracking-tight gap-2", activeTab === 'details' ? "bg-slate-800 text-white" : "text-slate-500")}
                            >
                                <Info size={12} /> Details
                            </Button>
                            <Button
                                variant="ghost" size="xs"
                                onClick={() => setActiveTab('json')}
                                className={cn("h-7 px-3 text-[10px] font-bold tracking-tight gap-2", activeTab === 'json' ? "bg-slate-800 text-white" : "text-slate-500")}
                            >
                                <FileJson size={12} /> Raw JSON
                            </Button>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden relative flex flex-col min-h-0 bg-[#020617]">
                    {isLoading && (
                        <div className="absolute inset-0 z-50 bg-[#020617]/80 backdrop-blur-sm flex flex-col items-center justify-center">
                            <Loader2 size={32} className="animate-spin text-microtermix-neon mb-4" />
                            <span className="text-xs font-mono text-slate-400">Querying Docker Daemon...</span>
                        </div>
                    )}

                    {!data && !isLoading ? (
                         <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                             <X size={48} className="opacity-10 mb-4" />
                             <span>Failed to load details</span>
                         </div>
                    ) : (
                        activeTab === 'details' ? renderSummary() : (
                            <div className="flex-1 min-h-0 py-2">
                                <Editor
                                    height="100%"
                                    defaultLanguage="json"
                                    theme="vs-dark"
                                    value={JSON.stringify(data, null, 4)}
                                    options={{
                                        readOnly: true,
                                        minimap: { enabled: true },
                                        fontSize: 12,
                                        fontFamily: 'JetBrains Mono, monospace',
                                        backgroundColor: '#020617',
                                        lineNumbers: 'on',
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                        padding: { top: 10, bottom: 10 }
                                    }}
                                />
                            </div>
                        )
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

interface InfoCardProps {
    icon: React.ReactNode;
    label: string;
    value: string;
    color?: string;
}

const InfoCard: React.FC<InfoCardProps> = ({ icon, label, value, color = "text-slate-200" }) => (
    <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/50 hover:border-slate-700/50 transition-all shadow-sm">
        <div className="flex items-center gap-2 mb-2 text-slate-500">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
        </div>
        <div className={cn("text-xs font-mono font-medium truncate", color)} title={value}>
            {value}
        </div>
    </div>
);
