import { useState, useEffect, useMemo } from 'react';
import { 
    Search, Loader, RefreshCw, Box, Layers,
    Activity, ChevronRight, Server,
    AlertCircle, Database, Settings,
    Plus, Trash2
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEcsStore, ResourcePrefixes } from '../../stores/ecsStore';
import { useCwStore } from '../../stores/cwStore';
import { EcsContainerDefinition } from './ecsTypes';
import { 
    Popover, 
    PopoverContent, 
    PopoverTrigger 
} from '@/components//ui/popover';
import { Input } from '@/components//ui/input';
import { Button } from '@/components//ui/button';
import { cn } from '@/lib/utils';
import { 
    useEcsClusters, useEcsServices, useEcsTasks, 
    useEcsTaskDefinition, useEcsSecret, ecsKeys 
} from '../../hooks/queries/useEcsQueries';

function getResourceTheme(name: string, prefixes: ResourcePrefixes) {
    const isMs = prefixes.ms.some(p => name.toLowerCase().includes(p.toLowerCase()));
    const isTs = prefixes.ts.some(p => name.toLowerCase().includes(p.toLowerCase()));
    const isMfe = prefixes.mfe.some(p => name.toLowerCase().includes(p.toLowerCase()));

    if (isMs) return { 
        base: 'cyan', text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/50', accent: 'text-cyan-300', shadow: 'shadow-cyan-500/20', tag: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
        icon: Server
    };
    if (isTs) return { 
        base: 'amber', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/50', accent: 'text-amber-300', shadow: 'shadow-amber-500/20', tag: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        icon: Activity
    };
    if (isMfe) return { 
        base: 'pink', text: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/50', accent: 'text-pink-300', shadow: 'shadow-pink-500/20', tag: 'bg-pink-500/10 border-pink-500/30 text-pink-400',
        icon: Layers
    };
    return { 
        base: 'purple', text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/50', accent: 'text-purple-300', shadow: 'shadow-purple-500/20', tag: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
        icon: Box
    };
}

function PrefixConfigPopover() {
    const { resourcePrefixes, setResourcePrefixes } = useEcsStore();
    const [local, setLocal] = useState(resourcePrefixes);

    const handleAdd = (type: keyof ResourcePrefixes) => {
        setLocal(prev => ({ ...prev, [type]: [...prev[type], ''] }));
    };

    const handleChange = (type: keyof ResourcePrefixes, idx: number, val: string) => {
        const next = [...local[type]];
        next[idx] = val;
        setLocal(prev => ({ ...prev, [type]: next }));
    };

    const handleRemove = (type: keyof ResourcePrefixes, idx: number) => {
        setLocal(prev => ({ ...prev, [type]: prev[type].filter((_, i) => i !== idx) }));
    };

    const handleSave = () => {
        setResourcePrefixes(local);
    };

    return (
        <Popover>
            <PopoverTrigger render={
                <button className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors" title="Configurar identificación">
                    <Settings size={14} />
                </button>
            } />
            <PopoverContent className="w-80 bg-slate-900 border-slate-800 shadow-2xl p-4">
                <div className="space-y-4">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Identificación de Recursos</h5>
                    
                    {(['ms', 'ts', 'mfe'] as const).map(type => (
                        <div key={type} className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[9px] font-bold uppercase text-slate-500">{type === 'ms' ? 'Microservices' : type === 'ts' ? 'Tasks' : 'Microfrontends'}</label>
                                <button onClick={() => handleAdd(type)} className="text-microtermix-neon hover:text-white transition-colors"><Plus size={10} /></button>
                            </div>
                            <div className="space-y-1">
                                {local[type].map((p, i) => (
                                    <div key={i} className="flex gap-1">
                                        <Input 
                                            value={p} 
                                            onChange={e => handleChange(type, i, e.target.value)}
                                            className="h-7 text-[10px] bg-slate-950 border-slate-800"
                                            placeholder="Prefijo o substring..."
                                        />
                                        <button onClick={() => handleRemove(type, i)} className="text-slate-600 hover:text-red-400"><Trash2 size={10} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    <Button onClick={handleSave} className="w-full h-8 text-[10px] uppercase font-bold tracking-widest bg-microtermix-neon hover:bg-cyan-500 text-slate-950">
                        Guardar Cambios
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function SectionTitle({ title, count }: { title: string, count: number }) {
    return (
        <div className="flex items-center gap-2 mb-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</h4>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-[9px] font-mono text-slate-400 border border-slate-700/50">{count}</span>
        </div>
    );
}

function ConfigRow({ k, v, isSecret = false }: { k: string, v: string, isSecret?: boolean }) {
    const [show, setShow] = useState(true); // REVEAL by default per user request
    const { data: resolvedValue, isLoading: resolving } = useEcsSecret(isSecret ? v : undefined);

    const handleToggle = () => setShow(!show);

    return (
        <div className={`flex items-center justify-between p-3 transition-colors border-b border-slate-800 last:border-0 group/row ${resolving ? 'bg-purple-500/5 animate-pulse' : 'bg-slate-900/40 hover:bg-slate-900/80'}`}>
            <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-0.5">
                    <div className="text-[10px] text-slate-500 font-mono uppercase tracking-tighter">{k}</div>
                    {resolving && (
                        <div className="flex items-center gap-1">
                            <Loader size={8} className="animate-spin text-purple-400" />
                            <span className="text-[8px] text-purple-400/70 font-bold uppercase tracking-widest">Resolviendo...</span>
                        </div>
                    )}
                </div>
                <div className={`text-[11px] font-mono break-all ${resolving ? 'text-slate-500 italic' : 'text-slate-200'}`}>
                    {resolving ? 'Consultando AWS Secrets...' : (show ? (resolvedValue || v) : '••••••••••••••••')}
                </div>
            </div>
            {isSecret && (
                <button 
                    onClick={handleToggle}
                    disabled={resolving}
                    className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors opacity-0 group-hover/row:opacity-100 disabled:opacity-50"
                >
                    {show ? <Activity size={12} /> : <Search size={12} />}
                </button>
            )}
        </div>
    );
}

export function EcsTab() {
    const queryClient = useQueryClient();
    const { 
        selectedClusterArn, selectedServiceArn, resourcePrefixes,
        setSelectedClusterArn, setSelectedServiceArn
    } = useEcsStore();
    
    const { goToLogs, preloadedEcsServiceName, clearPreloadedEcsServiceName } = useCwStore();
    const [search, setSearch] = useState('');
    const [detailTab, setDetailTab] = useState<'tasks' | 'config'>('tasks');

    // -- Queries --
    const {
        data: clusters = [],
        isLoading: loadingClusters,
        error: clusterError
    } = useEcsClusters();

    const {
        data: services = [],
        isLoading: loadingServices,
        error: serviceError
    } = useEcsServices(selectedClusterArn);

    const selectedService = useMemo(() => 
        services.find(s => s.service_arn === selectedServiceArn),
        [services, selectedServiceArn]
    );

    const {
        data: tasks = [],
        isLoading: loadingTasks,
        error: taskError
    } = useEcsTasks(selectedClusterArn, selectedService?.service_name);

    const {
        data: taskDef,
        isLoading: loadingTd
    } = useEcsTaskDefinition(detailTab === 'config' ? selectedService?.task_definition_arn : undefined);

    const combinedError = clusterError || serviceError || taskError;

    // Consume preloaded service name from Logs tab navigation
    useEffect(() => {
        if (!preloadedEcsServiceName) return;
        setSearch(preloadedEcsServiceName);
        clearPreloadedEcsServiceName();
        if (!selectedClusterArn && clusters.length > 0) {
            setSelectedClusterArn(clusters[0].cluster_arn.toString());
        }
    }, [preloadedEcsServiceName, clearPreloadedEcsServiceName, selectedClusterArn, clusters, setSelectedClusterArn]);

    // Auto-select service when services load and filter matches exactly one
    useEffect(() => {
        if (!search || services.length === 0 || selectedServiceArn) return;
        const matches = services.filter(s =>
            s.service_name.toLowerCase().includes(search.toLowerCase())
        );
        if (matches.length === 1) setSelectedServiceArn(matches[0].service_arn);
    }, [services, search, selectedServiceArn, setSelectedServiceArn]);

    useEffect(() => {
        setDetailTab('tasks');
    }, [selectedServiceArn]);

    const handleRefreshAll = () => {
        queryClient.invalidateQueries({ queryKey: ecsKeys.all });
    };

    const handleRefreshTasks = () => {
        queryClient.invalidateQueries({ queryKey: ecsKeys.tasks(selectedClusterArn, selectedService?.service_name) });
    };

    const handleGoToLogs = async () => {
        if (!selectedService) return;
        
        if (taskDef && taskDef.container_definitions?.length > 0) {
            const logGroup = taskDef.container_definitions[0].log_group;
            if (logGroup) {
                goToLogs(logGroup);
                return;
            }
        }

        const cleanName = selectedService.service_name.replace(/^srv-/, '');
        goToLogs(`/ecs/${cleanName}`);
    };

    return (
        <div className="flex h-full min-h-0 bg-slate-950">
            {/* Sidebar Clusters */}
            <div className="w-64 border-r border-slate-800 flex flex-col shrink-0">
                <div className="p-3 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Layers size={12} className="text-purple-400" /> Clusters
                    </h3>
                    <button onClick={handleRefreshAll} disabled={loadingClusters} className="text-slate-500 hover:text-slate-300 transition-colors">
                        <RefreshCw size={12} className={loadingClusters ? 'animate-spin' : ''} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                    {loadingClusters && clusters.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-8 gap-2 text-slate-600">
                            <Loader size={20} className="animate-spin" />
                        </div>
                    )}
                    {clusters.map(c => (
                        <button
                            key={c.cluster_arn.toString()}
                            onClick={() => setSelectedClusterArn(c.cluster_arn.toString())}
                            className={`flex flex-col gap-1 p-2.5 rounded text-left transition-all ${selectedClusterArn === c.cluster_arn ? 'bg-purple-500/10 border border-purple-500/30 ring-1 ring-purple-500/20' : 'hover:bg-slate-900 border border-transparent text-slate-400'}`}
                        >
                            <span className={`text-xs font-bold leading-tight ${selectedClusterArn === c.cluster_arn ? 'text-purple-300' : 'text-slate-300'}`}>
                                {c.cluster_name}
                            </span>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-[9px] flex items-center gap-1 opacity-60">
                                    <Activity size={8} /> {c.running_tasks_count} tasks
                                </span>
                                <span className="text-[9px] flex items-center gap-1 opacity-60">
                                    <Box size={8} /> {c.active_services_count} services
                                </span>
                            </div>
                        </button>
                    ))}
                    {!loadingClusters && clusters.length === 0 && (
                        <p className="text-[10px] text-center text-slate-600 mt-4 italic">No clusters found</p>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {!selectedClusterArn ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4 opacity-50">
                        <div className="w-16 h-16 rounded-full border-2 border-slate-800 flex items-center justify-center">
                            <Server size={32} strokeWidth={1} />
                        </div>
                        <p className="text-sm font-medium">Selecciona un cluster para ver sus servicios</p>
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/20">
                            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 flex-1 max-w-sm">
                                <Search size={13} className="text-slate-500" />
                                <input 
                                    value={search} 
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Filtrar servicios..."
                                    className="bg-transparent text-xs text-slate-200 focus:outline-none placeholder-slate-700 w-full"
                                />
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                {loadingServices && <Loader size={12} className="animate-spin text-slate-500" />}
                                <PrefixConfigPopover />
                                <button 
                                    onClick={handleRefreshAll}
                                    className="p-1.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                                    title="Refrescar todo"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 flex min-h-0 overflow-hidden">
                            {/* Services List */}
                            <div className="w-[450px] border-r border-slate-800 flex flex-col overflow-hidden">
                                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                                    {loadingServices && services.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center p-12 text-slate-600 gap-3">
                                            <Loader size={32} className="animate-spin text-purple-500/50" />
                                            <p className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Cargando servicios...</p>
                                        </div>
                                    ) : (
                                        <>
                                            {services.filter(s => s.service_name.toLowerCase().includes(search.toLowerCase())).map(s => {
                                                const theme = getResourceTheme(s.service_name, resourcePrefixes);
                                                const isActiveItem = selectedServiceArn === s.service_arn;
                                                const Icon = theme.icon;
                                                
                                                return (
                                                    <div 
                                                        key={s.service_arn}
                                                        onClick={() => setSelectedServiceArn(s.service_arn)}
                                                        className={cn(
                                                            "group relative flex flex-col p-4 rounded-lg border transition-all cursor-pointer",
                                                            isActiveItem 
                                                                ? `bg-slate-900 ${theme.border} shadow-lg ${theme.shadow}`
                                                                : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                                                        )}
                                                    >
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className={cn(
                                                                    "p-1.5 rounded transition-colors",
                                                                    s.status === 'ACTIVE' 
                                                                        ? `${theme.bg} ${theme.text}` 
                                                                        : 'bg-slate-800 text-slate-400'
                                                                )}>
                                                                    <Icon size={14} />
                                                                </div>
                                                                <span className={cn(
                                                                    "text-sm font-bold truncate",
                                                                    isActiveItem ? theme.text : "text-slate-100"
                                                                )}>{s.service_name}</span>
                                                            </div>
                                                            <div className={cn(
                                                                "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                                                                theme.tag
                                                            )}>
                                                                {s.launch_type}
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-3 gap-2 mt-1">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tight">Status</span>
                                                                <span className={`text-xs font-medium ${s.status === 'ACTIVE' ? 'text-emerald-500' : 'text-slate-400'}`}>{s.status}</span>
                                                            </div>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tight">Running</span>
                                                                <span className="text-xs font-mono text-slate-200">{s.running_count} / {s.desired_count}</span>
                                                            </div>
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tight">Pending</span>
                                                                <span className="text-xs font-mono text-slate-400">{s.pending_count}</span>
                                                            </div>
                                                        </div>

                                                        {isActiveItem && (
                                                            <div className={cn("absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity", theme.text)}>
                                                                <ChevronRight size={16} />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {services.filter(s => s.service_name.toLowerCase().includes(search.toLowerCase())).length === 0 && !loadingServices && (
                                                <div className="flex flex-col items-center justify-center p-12 text-slate-600 gap-2">
                                                    <Search size={24} strokeWidth={1} />
                                                    <p className="text-xs">No services found</p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Service / Task Details */}
                            <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/50">
                                {selectedServiceArn ? (
                                    <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                                        {/* Header Info */}
                                        <div className="p-6 border-b border-slate-800 bg-slate-900/10">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h2 className="text-xl font-bold text-white mb-1">{selectedService?.service_name}</h2>
                                                    <code className="text-[10px] text-slate-500 block break-all mb-4 max-w-md">{selectedServiceArn}</code>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={handleGoToLogs}
                                                        className="px-3 py-1.5 rounded bg-slate-800 text-[11px] font-bold text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                                                    >
                                                        <Database size={13} /> Ver Logs
                                                    </button>
                                                </div>
                                            </div>

                                        <div className="grid grid-cols-4 gap-4 mt-2">
                                            <StatBox label="Health" value={selectedService?.status === 'ACTIVE' ? 'HEALTHY' : 'UNKNOWN'} color={selectedService?.status === 'ACTIVE' ? 'emerald' : 'slate'} />
                                            <StatBox label="Launch Type" value={selectedService?.launch_type || ''} color={getResourceTheme(selectedService?.service_name || '', resourcePrefixes).base} />
                                            <StatBox label="Desired Tasks" value={String(selectedService?.desired_count || 0)} />
                                            <StatBox label="Running Tasks" value={String(selectedService?.running_count || 0)} color="emerald" />
                                        </div>
                                        </div>

                                        {/* Tabs for Service Details */}
                                        <div className="flex border-b border-slate-800 shrink-0 px-6 bg-slate-900/5">
                                            <button 
                                                onClick={() => setDetailTab('tasks')}
                                                className={cn(
                                                    "px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors",
                                                    detailTab === 'tasks' ? `${getResourceTheme(selectedService?.service_name || '', resourcePrefixes).text} border-current` : 'border-transparent text-slate-500 hover:text-slate-300'
                                                )}
                                            >
                                                Tasks
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    setDetailTab('config');
                                                }}
                                                className={cn(
                                                    "px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors",
                                                    detailTab === 'config' ? `${getResourceTheme(selectedService?.service_name || '', resourcePrefixes).text} border-current` : 'border-transparent text-slate-500 hover:text-slate-300'
                                                )}
                                            >
                                                Config & Envs
                                            </button>
                                        </div>

                                        {/* Tab Content */}
                                        <div className="flex-1 flex flex-col overflow-hidden">
                                            {detailTab === 'tasks' ? (
                                                <>
                                                    <div className="px-6 py-3 border-b border-slate-800/50 bg-slate-900/5 flex items-center justify-between">
                                                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Running Tasks ({tasks.length})</h4>
                                                        <button onClick={handleRefreshTasks} className="p-1 px-1.5 rounded hover:bg-slate-800 text-slate-600 hover:text-slate-400 transition-colors" title="Refrescar tareas">
                                                            <RefreshCw size={10} className={loadingTasks ? 'animate-spin' : ''} />
                                                        </button>
                                                    </div>
                                                    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                                                        {loadingTasks && tasks.length === 0 && (
                                                            <div className="flex justify-center p-8 text-slate-600">
                                                                <Loader size={20} className="animate-spin" />
                                                            </div>
                                                        )}
                                                        {tasks.map(t => {
                                                            const theme = getResourceTheme(selectedService?.service_name || '', resourcePrefixes);
                                                            return (
                                                                <div key={t.task_arn} className={cn("p-4 rounded-lg bg-slate-900/60 border border-slate-800/50 hover:border-slate-700 transition-colors group", theme.shadow)}>
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className={cn(
                                                                                "w-2 h-2 rounded-full",
                                                                                t.last_status === 'RUNNING' ? `bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]` : 'bg-amber-500'
                                                                            )} />
                                                                            <span className="text-[11px] font-mono text-slate-300 truncate max-w-[200px]">{t.task_arn.split('/').pop()}</span>
                                                                        </div>
                                                                        <span className={`text-[10px] font-bold uppercase tracking-tight ${t.last_status === 'RUNNING' ? 'text-emerald-400' : 'text-slate-400'}`}>
                                                                            {t.last_status}
                                                                        </span>
                                                                    </div>

                                                                    <div className="flex gap-4 mb-4">
                                                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                                                            <Activity size={10} className="text-blue-400" />
                                                                            CPU: <span className="text-slate-300 font-mono font-bold">{t.cpu}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                                                            <Database size={10} className={theme.text} />
                                                                            Mem: <span className="text-slate-300 font-mono font-bold">{t.memory}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                                                            <AlertCircle size={10} className={t.health_status === 'HEALTHY' ? 'text-emerald-400' : 'text-red-400'} />
                                                                            Health: <span className={t.health_status === 'HEALTHY' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{t.health_status}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-2 border-t border-slate-800 pt-3">
                                                                        {t.containers.map((c, i) => (
                                                                            <div key={i} className="flex flex-col gap-1">
                                                                                <div className="flex items-center justify-between">
                                                                                    <span className={cn("text-[11px] font-bold", theme.accent)}>{c.name}</span>
                                                                                    <span className="text-[9px] text-slate-500 font-mono truncate max-w-[150px]">{c.image}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Status</span>
                                                                                    <span className="text-[10px] font-medium text-slate-400">{c.last_status}</span>
                                                                                    {c.exit_code !== undefined && (
                                                                                        <>
                                                                                            <span className="text-slate-800">|</span>
                                                                                            <span className="text-[10px] text-red-400">Exit: {c.exit_code}</span>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                          ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        {tasks.length === 0 && !loadingTasks && (
                                                            <p className="text-center text-[11px] text-slate-600 italic">No tasks currently running</p>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-in fade-in duration-300">
                                                    {loadingTd ? (
                                                        <div className="flex flex-col items-center justify-center p-20 gap-3 text-slate-600">
                                                            <Loader size={32} className="animate-spin text-purple-500/50" />
                                                            <p className="text-[10px] font-bold uppercase tracking-widest">Obteniendo configuración...</p>
                                                        </div>
                                                    ) : taskDef ? (
                                                        taskDef.container_definitions.map((cd: EcsContainerDefinition, idx: number) => (
                                                            <div key={idx} className="space-y-6">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-2 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                                        <Box size={18} />
                                                                    </div>
                                                                    <div>
                                                                        <h3 className="text-sm font-bold text-white leading-none">{cd.name}</h3>
                                                                        <span className="text-[10px] text-slate-500 font-mono leading-none">{cd.image}</span>
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-4">
                                                                    <SectionTitle title="Environment Variables" count={cd.environment.length} />
                                                                    <div className="grid grid-cols-1 gap-px bg-slate-800 rounded-lg border border-slate-800 overflow-hidden shadow-xl">
                                                                        {cd.environment.map(([k, v]: [string, string], i: number) => (
                                                                            <ConfigRow key={i} k={k} v={v} />
                                                                        ))}
                                                                        {cd.environment.length === 0 && (
                                                                            <p className="p-4 text-xs text-slate-600 italic bg-slate-900/50 text-center uppercase tracking-widest font-bold">No env vars defined</p>
                                                                        )}
                                                                    </div>

                                                                    {cd.secrets.length > 0 && (
                                                                        <>
                                                                            <SectionTitle title="Secrets" count={cd.secrets.length} />
                                                                            <div className="grid grid-cols-1 gap-px bg-slate-800 rounded-lg border border-slate-800 overflow-hidden shadow-xl">
                                                                                {cd.secrets.map(([k, v]: [string, string], i: number) => (
                                                                                    <ConfigRow key={i} k={k} v={v} isSecret />
                                                                                ))}
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center p-20 text-slate-600 gap-3">
                                                            <AlertCircle size={32} />
                                                            <p className="text-xs">No se pudo cargar la configuración</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-700 bg-slate-900/10">
                                        <Layers size={48} className="mb-4 opacity-20" />
                                        <p className="text-sm font-medium opacity-50 uppercase tracking-widest text-center px-4">Selecciona un servicio para ver detalles</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {combinedError && (
                <div className="fixed bottom-4 right-4 max-w-sm p-4 bg-red-950/80 border border-red-500/50 rounded-lg shadow-2xl backdrop-blur-md flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 transition-all z-50">
                    <AlertCircle className="text-red-400 shrink-0" size={18} />
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-red-200 uppercase tracking-wider">Error AWS</span>
                        <p className="text-[11px] text-red-300/80 leading-relaxed font-mono">{String(combinedError)}</p>
                    </div>
                    <button onClick={handleRefreshAll} className="absolute top-2 right-2 text-red-400/50 hover:text-red-400">
                        <RefreshCw size={12} />
                    </button>
                </div>
            )}
        </div>
    );
}

function StatBox({ label, value, color = 'slate' }: { label: string, value: string, color?: string }) {
    const colors: Record<string, string> = {
        emerald: 'text-emerald-400',
        purple: 'text-purple-400',
        blue: 'text-blue-400',
        slate: 'text-slate-400',
        amber: 'text-amber-400'
    };

    return (
        <div className="flex flex-col gap-1">
            <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">{label}</span>
            <span className={`text-sm font-extrabold ${colors[color] || colors.slate}`}>{value}</span>
        </div>
    );
}
