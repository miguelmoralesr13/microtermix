import { useState, useEffect, useMemo } from 'react';
import {
    Zap, Play, Search, Loader, RefreshCw, X,
    CheckCircle, AlertTriangle, Terminal, Clock, Database,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from '../../stores/awsStore';
import { LambdaFunction } from './lambdaTypes';
import { InvokerJsonEditor } from './InvokerJsonEditor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn, formatAwsError } from '@/lib/utils';
import { toast } from 'sonner';
import { useWorkspace } from '../../context/WorkspaceContext';
import { LambdaHistory, LambdaHistoryItem, LambdaInvokeResult } from './lambdaTypes';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Copy, ArrowRightLeft } from 'lucide-react';

type InvokeTarget = 'aws' | 'local';
type InvocationType = 'RequestResponse' | 'Event' | 'DryRun';


const toRust = (cfg: any) => ({
    access_key_id: cfg.accessKeyId,
    secret_access_key: cfg.secretAccessKey,
    region: cfg.region,
    session_token: cfg.sessionToken || null,
});

export function LambdaInvoker() {
    const cfg = useAwsStore(s => s.credentials);

    // Function list state
    const [searchBuffer, setSearchBuffer] = useState('');
    const [appliedSearch, setAppliedSearch] = useState<string | null>(null);
    const [selectedName, setSelectedName] = useState<string | null>(null);

    // Invocation config
    const [target, setTarget] = useState<InvokeTarget>('aws');
    const [localEndpoint, setLocalEndpoint] = useState('http://localhost:3001');
    const [invocationType, setInvocationType] = useState<InvocationType>('RequestResponse');
    const [eventJson, setEventJson] = useState('{}');

    const [result, setResult] = useState<LambdaInvokeResult | null>(null);
    const [history, setHistory] = useState<LambdaHistoryItem[]>([]);
    const [viewingHistoryItem, setViewingHistoryItem] = useState<LambdaHistoryItem | null>(null);
    const { state: workspaceState } = useWorkspace();
    const workspacePath = workspaceState.currentPath;
    const workspaceProjects = workspaceState.projects;

    // Optimized name set for O(1) lookup
    const localProjectNames = useMemo(() => {
        return new Set(workspaceProjects.map(p => p.name.toLowerCase()));
    }, [workspaceProjects]);

    const { data: functions = [], isLoading, refetch } = useQuery({
        queryKey: ['lambda-list-invoker', cfg?.accessKeyId, cfg?.region, appliedSearch],
        queryFn: () => invoke<LambdaFunction[]>('lambda_list_functions', {
            credentials: toRust(cfg),
            searchTerm: appliedSearch,
        }),
        staleTime: 5 * 60 * 1000,
        enabled: !!cfg?.accessKeyId && !!cfg?.region,
    });

    const invokeMutation = useMutation({
        mutationFn: async () => {
            if (!selectedName) throw new Error('No function selected');

            let res: LambdaInvokeResult;
            if (target === 'aws') {
                res = await invoke<LambdaInvokeResult>('lambda_invoke', {
                    credentials: toRust(cfg),
                    functionName: selectedName,
                    payload: eventJson,
                    invocationType,
                });
            } else {
                res = await invoke<LambdaInvokeResult>('lambda_invoke_local', {
                    functionName: selectedName,
                    payload: eventJson,
                    endpointUrl: localEndpoint,
                    invocationType,
                });
            }
            return res;
        },
        onSuccess: (res) => {
            setResult(res);
            if (res.function_error) {
                toast.error(`Function error: ${res.function_error}`);
            } else {
                toast.success(`Invocación exitosa (${res.status_code})`);
            }
            if (selectedName && workspacePath) {
                saveHistoryEntry(selectedName, eventJson, res);
            }
        },
        onError: (e) => toast.error(formatAwsError(e)),
    });

    const loadLocalHistory = async (name: string) => {
        if (!workspacePath) return;
        const historyPath = `${workspacePath}/.microtermix/test/${name}/jsons/history.json`;
        
        try {
            // 1. Try to load from Microtermix history first
            const content = await invoke<string>('read_text_file', { path: historyPath });
            const data: LambdaHistory = JSON.parse(content);
            setHistory(data.executions || []);
            if (data.executions && data.executions.length > 0) {
                setEventJson(data.executions[0].payload);
                return; // Loaded successfuly
            }
        } catch {
            setHistory([]);
        }

        // 2. If no history, and it's a LOCAL project, try to load a default event from its folder
        const localProject = workspaceProjects.find(lp => lp.name.toLowerCase() === name.toLowerCase());
        if (localProject) {
            const commonEventFiles = ['event.json', 'payload.json', 'events/event.json', 'test-event.json'];
            for (const fileName of commonEventFiles) {
                try {
                    const localPath = `${localProject.path}/${fileName}`;
                    const content = await invoke<string>('read_text_file', { path: localPath });
                    if (content && content.trim()) {
                        setEventJson(content);
                        console.log(`[LambdaInvoker] Loaded default event from local project: ${fileName}`);
                        break;
                    }
                } catch {
                    // File not found, try next
                }
            }
        }
    };

    const saveHistoryEntry = async (name: string, payload: string, res: LambdaInvokeResult) => {
        if (!workspacePath) {
            console.warn("[LambdaInvoker] No workspace path found, skipping save.");
            return;
        }
        const baseDir = `${workspacePath}/.microtermix/test/${name}/jsons`;
        const historyPath = `${baseDir}/history.json`;

        try {
            console.log(`[LambdaInvoker] Saving execution files to ${baseDir}...`);
            await invoke('ensure_directory', { 
                base: workspacePath, 
                path: `.microtermix/test/${name}/jsons` 
            });

            // 1. Save Request/Response individual files (latest)
            // Try to format them as pretty JSON if they are valid JSON strings
            const formatJson = (str: string) => {
                try {
                    const obj = JSON.parse(str);
                    return JSON.stringify(obj, null, 2);
                } catch {
                    return str;
                }
            };

            await invoke('write_file', {
                path: `${baseDir}/request.json`,
                content: formatJson(payload)
            });
            await invoke('write_file', {
                path: `${baseDir}/response.json`,
                content: formatJson(res.payload)
            });

            // 2. Update unified history.json
            let currentExecutions: LambdaHistoryItem[] = [];
            try {
                const content = await invoke<string>('read_text_file', { path: historyPath });
                const parsed = JSON.parse(content);
                currentExecutions = parsed.executions || [];
            } catch (e) { 
                console.log("[LambdaInvoker] Starting new history file.");
            }

            const newItem: LambdaHistoryItem = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                target,
                payload,
                response: res.payload,
                status: res.status_code,
                error: res.function_error,
                duration: res.duration_ms
            };

            const updatedHistory = [newItem, ...currentExecutions].slice(0, 50);
            await invoke('write_file', {
                path: historyPath,
                content: JSON.stringify({ executions: updatedHistory }, null, 2)
            });

            setHistory(updatedHistory);
            toast.success(`Ejecución guardada en .microtermix/test/${name}/jsons`);
        } catch (e) {
            console.error("Failed to save history:", e);
            toast.error("Error al persistir archivos de ejecución");
        }
    };


    useEffect(() => {
        setResult(null);
        setEventJson('{}');
        
        if (selectedName) {
            loadLocalHistory(selectedName);
        } else {
            setHistory([]);
        }
    }, [selectedName, workspacePath]);


    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') setAppliedSearch(searchBuffer.trim() || null);
    };

    const isJsonValid = (() => {
        try { JSON.parse(eventJson); return true; } catch { return false; }
    })();

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* ── Left: Function list ── */}
            <div className="w-[320px] shrink-0 border-r border-slate-800 flex flex-col bg-slate-950/20">
                {/* Search */}
                <div className="p-3 border-b border-slate-800">
                    <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded px-2.5 py-1.5">
                        <Search size={12} className={cn("transition-colors", appliedSearch ? "text-amber-500" : "text-slate-500")} />
                        <input
                            value={searchBuffer}
                            onChange={e => setSearchBuffer(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="Buscar función (Enter)..."
                            className="bg-transparent text-xs text-slate-200 focus:outline-none placeholder-slate-700 w-full"
                        />
                        {appliedSearch && (
                            <button onClick={() => { setSearchBuffer(''); setAppliedSearch(null); }} className="text-slate-600 hover:text-slate-300">
                                <X size={10} />
                            </button>
                        )}
                    </div>
                    <div className="flex justify-end mt-1.5">
                        <button onClick={() => refetch()} className="text-slate-600 hover:text-slate-300 p-0.5">
                            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* List container */}
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 custom-scrollbar">
                    {isLoading && functions.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-slate-600 gap-2">
                            <Loader size={20} className="animate-spin text-amber-500/50" />
                        </div>
                    ) : (
                        functions.map((f: LambdaFunction) => {
                            const isSelected = selectedName === f.function_name;
                            const hasLocal = localProjectNames.has(f.function_name.toLowerCase());

                            return (
                                <button
                                    key={f.function_arn}
                                    onClick={() => setSelectedName(f.function_name)}
                                    className={cn(
                                        "flex flex-col p-2.5 rounded-lg border text-left transition-all border-l-4 relative",
                                        isSelected
                                            ? "bg-amber-500/10 border-amber-500/60 text-amber-300"
                                            : "bg-slate-900/40 border-slate-800 text-slate-300 hover:border-slate-700",
                                        hasLocal
                                            ? "border-l-microtermix-neon bg-microtermix-neon/5"
                                            : "border-l-slate-800/50"
                                    )}
                                >
                                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                                        <div className="flex items-center gap-1.5 truncate">
                                            <Zap size={11} className={isSelected ? 'text-amber-400' : 'text-slate-600'} />
                                            <span className="text-[11px] font-semibold truncate">{f.function_name}</span>
                                        </div>
                                        {hasLocal && (
                                            <span className="flex items-center gap-1 text-[8px] font-black text-microtermix-neon/80 tracking-tighter uppercase px-1 bg-microtermix-neon/10 rounded border border-microtermix-neon/20">
                                                LOCAL
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[9px] font-mono text-slate-600 mt-0.5 ml-[18px]">{f.runtime}</span>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Right: Invoke panel ── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {selectedName ? (
                    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar">
                        {/* Header */}
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/30">
                                <Zap size={16} className="text-amber-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">{selectedName}</h3>
                                <span className="text-[10px] text-slate-500">Lambda Invoker</span>
                            </div>
                        </div>

                        <Separator className="bg-slate-800" />

                        {/* Target selector */}
                        <div className="flex flex-col gap-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Destino</span>
                            <div className="flex gap-2">
                                {(['aws', 'local'] as InvokeTarget[]).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setTarget(t)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-lg border text-xs font-bold transition-all",
                                            target === t
                                                ? "bg-microtermix-neon/10 border-microtermix-neon/40 text-microtermix-neon"
                                                : "bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300",
                                        )}
                                    >
                                        {t === 'aws' ? '☁ AWS' : '⚙ Local / SAM'}
                                    </button>
                                ))}
                            </div>
                            {target === 'local' && (
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] text-slate-600">Endpoint local (SAM local / LocalStack)</span>
                                    <Input
                                        value={localEndpoint}
                                        onChange={e => setLocalEndpoint(e.target.value)}
                                        placeholder="http://localhost:3001"
                                        className="h-8 text-xs font-mono bg-slate-900 border-slate-700"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Invocation type */}
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Tipo</span>
                            <Select value={invocationType} onValueChange={(v) => setInvocationType(v as InvocationType)}>
                                <SelectTrigger size="sm" className="h-7 text-xs bg-slate-900 border-slate-700 w-[200px]">
                                    {invocationType}
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                    <SelectItem value="RequestResponse" className="text-xs focus:bg-slate-800">RequestResponse</SelectItem>
                                    <SelectItem value="Event" className="text-xs focus:bg-slate-800">Event (async)</SelectItem>
                                    <SelectItem value="DryRun" className="text-xs focus:bg-slate-800">DryRun</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Event JSON */}
                        <InvokerJsonEditor
                            label="Event JSON"
                            value={eventJson}
                            onChange={setEventJson}
                            placeholder={'{\n  "key": "value"\n}'}
                            minHeight="140px"
                        />

                        {/* Invoke button */}
                        <Button
                            onClick={() => invokeMutation.mutate()}
                            disabled={invokeMutation.isPending || !isJsonValid}
                            className="self-start bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs gap-2"
                        >
                            {invokeMutation.isPending
                                ? <Loader size={13} className="animate-spin" />
                                : <Play size={13} fill="currentColor" />}
                            {invokeMutation.isPending ? 'Invocando...' : 'Invoke'}
                        </Button>

                        {/* Result */}
                        {result && (
                            <>
                                <Separator className="bg-slate-800" />
                                <InvokeResultPanel result={result} />
                            </>
                        )}

                        {/* History */}
                        {history.length > 0 && (
                            <div className="flex flex-col gap-4 mt-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Historial Reciente</span>
                                    <Badge variant="outline" className="text-[9px] opacity-50">{history.length} ejecuciones</Badge>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    {history.map((h) => (
                                        <button
                                            key={h.id}
                                            onClick={() => setViewingHistoryItem(h)}
                                            className="group flex flex-col p-2.5 bg-slate-950/40 border border-slate-800 rounded-lg hover:border-amber-500/30 transition-all text-left"
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <Badge className={cn(
                                                        "text-[8px] px-1 py-0 h-4 font-black",
                                                        h.status < 400 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                                    )}>
                                                        {h.status}
                                                    </Badge>
                                                    <span className="text-[9px] text-slate-500 font-mono">
                                                        {new Date(h.timestamp).toLocaleTimeString()} - {new Date(h.timestamp).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[8px] text-amber-500/80 font-bold">LOAD PAYLOAD</span>
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-slate-400 truncate font-mono bg-black/20 p-1 rounded border border-slate-800/50">
                                                {h.payload.substring(0, 80)}...
                                            </div>
                                            {h.duration && (
                                                <div className="flex justify-end mt-1 text-[8px] text-slate-600 font-mono uppercase tracking-tighter">
                                                    {h.duration.toFixed(0)}ms
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-800 opacity-20 select-none gap-3">
                        <Zap size={48} strokeWidth={1} />
                        <p className="text-xs font-bold uppercase tracking-widest">Selecciona una función</p>
                    </div>
                )}
            </div>

            {/* History Detail Modal */}
            <Dialog open={!!viewingHistoryItem} onOpenChange={(open) => !open && setViewingHistoryItem(null)}>
                <DialogContent className="sm:max-w-4xl bg-slate-950 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-500">
                            <Clock size={16} /> Detalle de Ejecución
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-[11px] font-mono">
                            {viewingHistoryItem && (
                                <>ID: {viewingHistoryItem.id} • {new Date(viewingHistoryItem.timestamp).toLocaleString()}</>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {viewingHistoryItem && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 max-h-[60vh] overflow-hidden">
                            {/* Request side */}
                            <div className="flex flex-col gap-2 min-h-0">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Request</span>
                                    <Button 
                                        variant="ghost" 
                                        size="icon-sm" 
                                        onClick={() => {
                                            navigator.clipboard.writeText(viewingHistoryItem.payload);
                                            toast.success("Copiado al portapapeles");
                                        }}
                                        className="h-6 w-6 text-slate-600 hover:text-slate-200"
                                    >
                                        <Copy size={12} />
                                    </Button>
                                </div>
                                <div className="flex-1 bg-black/40 border border-slate-800 rounded p-3 overflow-auto custom-scrollbar">
                                    <pre className="text-[11px] font-mono text-emerald-400/90 whitespace-pre-wrap">
                                        {(() => {
                                            try { return JSON.stringify(JSON.parse(viewingHistoryItem.payload), null, 2); }
                                            catch { return viewingHistoryItem.payload; }
                                        })()}
                                    </pre>
                                </div>
                            </div>

                            {/* Response side */}
                            <div className="flex flex-col gap-2 min-h-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Response</span>
                                        <Badge className={cn(
                                            "text-[9px] px-1 py-0 h-4 font-black",
                                            viewingHistoryItem.status < 400 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                                        )}>
                                            Status {viewingHistoryItem.status}
                                        </Badge>
                                    </div>
                                    <Button 
                                        variant="ghost" 
                                        size="icon-sm" 
                                        onClick={() => {
                                            navigator.clipboard.writeText(viewingHistoryItem.response);
                                            toast.success("Copiado al portapapeles");
                                        }}
                                        className="h-6 w-6 text-slate-600 hover:text-slate-200"
                                    >
                                        <Copy size={12} />
                                    </Button>
                                </div>
                                <div className="flex-1 bg-black/40 border border-slate-800 rounded p-3 overflow-auto custom-scrollbar">
                                    <pre className={cn(
                                        "text-[11px] font-mono whitespace-pre-wrap",
                                        viewingHistoryItem.status < 400 ? "text-slate-300" : "text-rose-400/90"
                                    )}>
                                        {(() => {
                                            try { return JSON.stringify(JSON.parse(viewingHistoryItem.response), null, 2); }
                                            catch { return viewingHistoryItem.response; }
                                        })()}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="mt-4 gap-2">
                        <Button 
                            variant="outline" 
                            className="text-xs bg-slate-900 border-slate-800 hover:bg-slate-800"
                            onClick={() => setViewingHistoryItem(null)}
                        >
                            Cerrar
                        </Button>
                        <Button 
                            className="text-xs bg-amber-600 hover:bg-amber-500 gap-2"
                            onClick={() => {
                                if (viewingHistoryItem) {
                                    setEventJson(viewingHistoryItem.payload);
                                    setViewingHistoryItem(null);
                                    toast.success("Payload cargado al editor");
                                }
                            }}
                        >
                            <ArrowRightLeft size={12} /> Cargar al Editor
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function InvokeResultPanel({ result }: { result: LambdaInvokeResult }) {
    const hasError = !!result.function_error;

    const formattedPayload = (() => {
        try { return JSON.stringify(JSON.parse(result.payload), null, 2); }
        catch { return result.payload; }
    })();

    return (
        <div className="flex flex-col gap-4 animate-in fade-in duration-300">
            {/* Status row */}
            <div className="flex items-center gap-4 flex-wrap">
                <Badge className={cn(
                    "text-[10px] font-bold gap-1",
                    hasError ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                )}>
                    {hasError ? <AlertTriangle size={10} /> : <CheckCircle size={10} />}
                    HTTP {result.status_code}
                </Badge>
                {result.function_error && (
                    <Badge className="text-[10px] font-bold gap-1 bg-red-500/20 text-red-300 border-red-500/30">
                        {result.function_error}
                    </Badge>
                )}
                {result.duration_ms != null && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Clock size={10} className="text-amber-500" /> {result.duration_ms.toFixed(2)} ms
                    </span>
                )}
                {result.max_memory_used_mb != null && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <Database size={10} className="text-purple-400" /> {result.max_memory_used_mb} MB
                    </span>
                )}
            </div>

            {/* Response payload */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Response</span>
                <pre className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-60 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                    {formattedPayload || '(empty)'}
                </pre>
            </div>

            {/* Log tail */}
            {result.log_tail && (
                <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <Terminal size={10} /> Log Tail
                    </span>
                    <pre className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-[10px] font-mono text-slate-400 overflow-x-auto max-h-48 overflow-y-auto custom-scrollbar whitespace-pre">
                        {result.log_tail}
                    </pre>
                </div>
            )}
        </div>
    );
}
