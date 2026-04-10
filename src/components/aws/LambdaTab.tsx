import { useState, useMemo, useEffect } from 'react';
import { 
    Search, Loader, RefreshCw, Zap, X,
    Clock, Database, Code,
    ChevronRight, Activity,
    Terminal, Layers, Settings
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from '../../stores/awsStore';
import { useCwStore } from '../../stores/cwStore';
import { LambdaFunction } from './lambdaTypes';
import { cn } from '@/lib/utils';

const toRust = (cfg: any) => ({
    access_key_id: cfg.accessKeyId,
    secret_access_key: cfg.secretAccessKey,
    region: cfg.region,
    session_token: cfg.sessionToken || null,
});

export function LambdaTab() {
    const cfg = useAwsStore(s => s.credentials);
    const queryClient = useQueryClient();
    const { goToLogs, goToInvokeLambda, preloadedLambdaName, clearPreloadedLambdaName } = useCwStore();

    const [searchBuffer, setSearchBuffer] = useState('');
    const [appliedSearch, setAppliedSearch] = useState<string | null>(null);
    const [selectedName, setSelectedName] = useState<string | null>(null);

    const {
        data: functions = [],
        isLoading,
        error
    } = useQuery({
        queryKey: ['lambda-list', cfg?.accessKeyId, cfg?.region, appliedSearch],
        queryFn: () => invoke<LambdaFunction[]>('lambda_list_functions', { 
            credentials: toRust(cfg),
            searchTerm: appliedSearch
        }),
        staleTime: 5 * 60 * 1000,
        enabled: !!cfg?.accessKeyId && !!cfg?.region,
    });

    const {
        data: details,
        isLoading: isLoadingDetails,
    } = useQuery({
        queryKey: ['lambda-detail', cfg?.accessKeyId, cfg?.region, selectedName],
        queryFn: () => invoke<LambdaFunction>('lambda_get_function', { 
            credentials: toRust(cfg),
            functionName: selectedName
        }),
        enabled: !!selectedName && !!cfg?.accessKeyId,
        staleTime: 10 * 60 * 1000,
    });

    const selected = useMemo(() => 
        details || functions.find(f => f.function_name === selectedName),
        [functions, selectedName, details]
    );

    // Consume preloaded function name from Logs tab navigation
    useEffect(() => {
        if (!preloadedLambdaName) return;
        setSearchBuffer(preloadedLambdaName);
        setAppliedSearch(preloadedLambdaName);
        clearPreloadedLambdaName();
    }, [preloadedLambdaName, clearPreloadedLambdaName]);

    // Auto-select when functions load and exactly one matches
    useEffect(() => {
        if (!appliedSearch || functions.length === 0 || selectedName) return;
        const matches = functions.filter(f =>
            f.function_name.toLowerCase().includes(appliedSearch.toLowerCase())
        );
        if (matches.length === 1) setSelectedName(matches[0].function_name);
    }, [functions, appliedSearch, selectedName]);

    const handleRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['lambda-list'] });
        if (selectedName) {
            queryClient.invalidateQueries({ queryKey: ['lambda-detail', cfg?.accessKeyId, cfg?.region, selectedName] });
        }
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setAppliedSearch(searchBuffer.trim() || null);
        }
    };

    const handleGoToLogs = () => {
        if (selected) {
            goToLogs(`/aws/lambda/${selected.function_name}`);
        }
    };

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500">
            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/30">
                <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded px-2.5 py-1.5 flex-1 max-w-sm">
                    <Search size={13} className={cn("transition-colors", appliedSearch ? "text-amber-500" : "text-slate-500")} />
                    <input 
                        value={searchBuffer} 
                        onChange={e => setSearchBuffer(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        placeholder="Buscar lambdas (Enter para buscar)..."
                        className="bg-transparent text-xs text-slate-200 focus:outline-none placeholder-slate-700 w-full"
                    />
                    {appliedSearch && (
                        <button onClick={() => { setSearchBuffer(''); setAppliedSearch(null); }} className="text-slate-600 hover:text-slate-300">
                            <X size={10} />
                        </button>
                    )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                    {isLoading && <Loader size={12} className="animate-spin text-slate-500" />}
                    <button 
                        onClick={handleRefresh}
                        className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        title="Refrescar"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Function List */}
                <div className="w-[400px] border-r border-slate-800 flex flex-col bg-slate-950/20">
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                        {isLoading && functions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-slate-600 gap-3">
                                <Loader size={32} className="animate-spin text-amber-500/50" />
                                <p className="text-[10px] font-bold uppercase tracking-widest animate-pulse font-mono">Loading Lambda Functions...</p>
                            </div>
                        ) : (
                            <>
                                {functions.map((f: LambdaFunction) => {
                                    const isSelected = selectedName === f.function_name;
                                    return (
                                        <button
                                            key={f.function_arn}
                                            onClick={() => setSelectedName(f.function_name)}
                                            className={cn(
                                                "group relative flex flex-col p-3 rounded-lg border transition-all text-left",
                                                isSelected 
                                                    ? "bg-amber-500/10 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.05)]"
                                                    : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                                            )}
                                        >
                                            <div className="flex items-start justify-between mb-1.5">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className={cn(
                                                        "p-1.5 rounded",
                                                        isSelected ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-500"
                                                    )}>
                                                        <Zap size={13} fill={isSelected ? "currentColor" : "none"} />
                                                    </div>
                                                    <span className={cn(
                                                        "text-[12px] font-bold truncate",
                                                        isSelected ? "text-amber-300" : "text-slate-200"
                                                    )}>{f.function_name}</span>
                                                </div>
                                                <div className="text-[9px] font-mono text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/50">
                                                    {f.runtime}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <Database size={10} /> {f.memory_size} MB
                                                </span>
                                                <span className="flex items-center gap-1 opacity-60 italic">
                                                    <Clock size={10} /> {new Date(f.last_modified).toLocaleDateString()}
                                                </span>
                                            </div>
                                            {isSelected && (
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500">
                                                    <ChevronRight size={14} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                                {functions.length === 0 && !isLoading && (
                                    <div className="flex flex-col items-center justify-center p-12 text-slate-700 gap-2 opacity-30">
                                        <Zap size={32} strokeWidth={1} />
                                        <p className="text-xs uppercase tracking-widest font-bold">No functions found</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Function Details */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/40 relative">
                    {selected ? (
                        <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300 p-6">
                            {isLoadingDetails && !selected.environment.length && (
                                <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] flex items-center justify-center z-10 animate-in fade-in duration-300">
                                    <div className="flex flex-col items-center gap-2">
                                        <Loader size={24} className="animate-spin text-amber-500" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Obteniendo configuración...</span>
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex items-start justify-between mb-8">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                            <Zap size={20} />
                                        </div>
                                        <h2 className="text-xl font-bold text-white tracking-tight">{selected.function_name}</h2>
                                    </div>
                                    <code className="text-[10px] text-slate-500 block break-all max-w-2xl font-mono bg-slate-900/50 p-2 rounded border border-slate-800/50">
                                        {selected.function_arn}
                                    </code>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => goToInvokeLambda(selected.function_name)}
                                        className="px-4 py-2 rounded bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold text-amber-300 transition-all flex items-center gap-2 border border-amber-500/30 shadow-lg active:scale-95"
                                    >
                                        <Zap size={14} /> Test Invoke
                                    </button>
                                    <button
                                        onClick={handleGoToLogs}
                                        className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-all flex items-center gap-2 border border-slate-700/50 shadow-lg active:scale-95"
                                    >
                                        <Activity size={14} className="text-amber-400" /> Ver Logs
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4 mb-8">
                                <DetailCard label="Runtime" value={selected.runtime || 'N/A'} icon={<Code size={12} className="text-blue-400" />} />
                                <DetailCard label="Memory" value={`${selected.memory_size} MB`} icon={<Database size={12} className="text-purple-400" />} />
                                <DetailCard label="Timeout" value={`${selected.timeout}s`} icon={<Clock size={12} className="text-emerald-400" />} />
                                <DetailCard label="Version" value={selected.version} icon={<Layers size={12} className="text-amber-400" />} />
                            </div>

                            <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                                <section>
                                    <SectionTitle title="Información General" icon={<Settings size={12} className="text-slate-500" />} />
                                    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 space-y-3">
                                        <div className="flex justify-between items-center text-[11px]">
                                            <span className="text-slate-500 font-bold uppercase tracking-widest">Description</span>
                                            <span className="text-slate-300 italic">{selected.description || 'No description'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px]">
                                            <span className="text-slate-500 font-bold uppercase tracking-widest">IAM Role</span>
                                            <span className="text-slate-300 font-mono text-[10px] break-all max-w-md">{selected.role.split('/').pop()}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px]">
                                            <span className="text-slate-500 font-bold uppercase tracking-widest">Handler</span>
                                            <span className="text-amber-400 font-mono">{selected.handler}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px]">
                                            <span className="text-slate-500 font-bold uppercase tracking-widest">Package Size</span>
                                            <span className="text-slate-300 font-mono">{(selected.code_size / 1024 / 1024).toFixed(2)} MB</span>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <SectionTitle title="Environment Variables" count={selected.environment.length} icon={<Terminal size={12} className="text-slate-500" />} />
                                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800">
                                        {selected.environment.length > 0 ? (
                                            selected.environment.map(([k, v], i) => (
                                                <div key={i} className="flex flex-col p-3 hover:bg-slate-800/30 transition-colors">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mb-0.5">{k}</span>
                                                    <span className="text-[11px] text-slate-300 font-mono break-all">{v}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-8 text-center text-slate-600 italic text-[11px] uppercase tracking-widest font-bold opacity-30">
                                                No env vars defined
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-800 opacity-20 select-none">
                            <Zap size={64} className="mb-4" />
                            <p className="text-sm font-bold uppercase tracking-[0.2em] text-center px-8">Selecciona una función para ver detalles</p>
                        </div>
                    )}
                </div>
            </div>

            {error && (
                <div className="fixed bottom-4 right-4 max-w-sm p-4 bg-red-950/90 border border-red-500/50 rounded-lg shadow-2xl backdrop-blur-md flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 z-50">
                    <Activity className="text-red-400 shrink-0" size={18} />
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-red-200 uppercase tracking-wider">AWS Error</span>
                        <p className="text-[11px] text-red-300/80 leading-relaxed font-mono">{String(error)}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function DetailCard({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 group hover:border-slate-700 transition-colors shadow-lg">
            <div className="flex items-center gap-1.5 mb-1 text-slate-500">
                {icon}
                <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
            </div>
            <div className="text-sm font-extrabold text-slate-200 tracking-tight">{value}</div>
        </div>
    );
}

function SectionTitle({ title, count, icon }: { title: string, count?: number, icon?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            {icon}
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">{title}</h4>
            {count !== undefined && (
                <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[9px] font-mono text-slate-400 border border-slate-700/50">{count}</span>
            )}
        </div>
    );
}
