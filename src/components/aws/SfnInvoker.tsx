import { useState, useMemo, useEffect } from 'react';
import {
    GitBranch, Play, Loader, CheckCircle, AlertTriangle,
    ExternalLink, FolderOpen, LayoutTemplate, Terminal,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from '../../stores/awsStore';
import { useSfnMachines, useSfnDefinition } from '../../hooks/queries/useSfnQueries';
import { SfnMachine } from '../../stores/sfnStore';
import { InvokerJsonEditor } from './InvokerJsonEditor';
import { SfnAslDiagram } from './SfnAslDiagram';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn, formatAwsError } from '@/lib/utils';
import { toast } from 'sonner';
import { useWorkspace, Project } from '../../context/WorkspaceContext';
import { useCwStore } from '../../stores/cwStore';
import { SfnHistory, SfnHistoryItem } from './sfnTypes';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Clock, Clock3, Copy, ArrowRightLeft, Database, Zap, ScrollText, Settings2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type InvokeTarget  = 'aws' | 'local';
type RightTab      = 'diagram' | 'execute';

// ─── Local project matching ────────────────────────────────────────────────────

function norm(s: string) { return s.toLowerCase().replace(/[-_\s]/g, ''); }

function matchProject(machineName: string, projects: Project[]): Project | null {
    const nm = norm(machineName);
    return (
        projects.find(p => norm(p.name) === nm) ??                        // exact
        projects.find(p => nm.includes(norm(p.name)) && norm(p.name).length > 3) ??  // machine contains project
        projects.find(p => norm(p.name).includes(nm) && nm.length > 3) ?? // project contains machine
        null
    );
}

// ─── Credentials helper ───────────────────────────────────────────────────────

const getRustCreds = () => {
    const c = useAwsStore.getState().credentials;
    if (!c) return null;
    return {
        access_key_id: c.accessKeyId,
        secret_access_key: c.secretAccessKey,
        region: c.region,
        session_token: c.sessionToken || null,
    };
};

// ─── Main component ────────────────────────────────────────────────────────────

export function SfnInvoker() {
    const { state: { projects, currentPath } } = useWorkspace();
    const workspacePath = currentPath;
    const { preloadedInvokerType, preloadedInvokerName, clearPreloadedInvoker, goToLogs, goToSfn } = useCwStore();

    const [selectedArn, setSelectedArn]     = useState<string | null>(null);
    const [machineSearch, setMachineSearch] = useState('');
    const [rightTab, setRightTab]           = useState<RightTab>('diagram');

    // Execution form state
    const [target, setTarget]               = useState<InvokeTarget>('aws');
    const [localEndpoint, setLocalEndpoint] = useState('http://localhost:8083');
    const [executionName, setExecutionName] = useState('');
    const [inputJson, setInputJson]         = useState('{}');
    const [resultArn, setResultArn]         = useState<string | null>(null);
    const [history, setHistory]             = useState<SfnHistoryItem[]>([]);
    const [viewingHistoryItem, setViewingHistoryItem] = useState<SfnHistoryItem | null>(null);

    // Local definition editing
    const [localDef, setLocalDef]           = useState<string | null>(null);

    const { data: machines = [], isLoading } = useSfnMachines();
    const { data: defData, isLoading: loadingDef } = useSfnDefinition(selectedArn);

    const definition = defData?.definition ?? null;

    // Apply preloaded machine name from SFN/Logs navigation
    useEffect(() => {
        if (preloadedInvokerType !== 'sfn' || !preloadedInvokerName) return;
        setMachineSearch(preloadedInvokerName);
        clearPreloadedInvoker();
    }, [preloadedInvokerType, preloadedInvokerName, clearPreloadedInvoker]);

    // Auto-select when exactly one machine matches the search
    useEffect(() => {
        if (!machineSearch || machines.length === 0 || selectedArn) return;
        const matches = machines.filter(m =>
            m.name.toLowerCase().includes(machineSearch.toLowerCase())
        );
        if (matches.length === 1) handleSelectMachine(matches[0].arn);
    }, [machines, machineSearch, selectedArn]);

    // Reset state when a different machine is selected
    const handleSelectMachine = (arn: string) => {
        if (arn === selectedArn) return;
        const m = machines.find(m => m.arn === arn);
        setSelectedArn(arn);
        setLocalDef(null);
        setResultArn(null);
        setRightTab('diagram');
        setResultArn(null);
        setInputJson('{}');
        if (m) loadSfnHistory(m.name);
    };

    const loadSfnHistory = async (name: string) => {
        if (!workspacePath) return;
        const historyPath = `${workspacePath}/.microtermix/test/${name}/jsons/history.json`;
        
        try {
            // 1. Try to load from Microtermix history first
            const content = await invoke<string>('read_text_file', { path: historyPath });
            const data: SfnHistory = JSON.parse(content);
            setHistory(data.executions || []);
            if (data.executions && data.executions.length > 0) {
                setInputJson(data.executions[0].input);
                return;
            }
        } catch {
            setHistory([]);
        }

        // 2. Fallback: Local project event.json
        const lp = matchProject(name, projects);
        if (lp) {
            const commonEventFiles = ['event.json', 'payload.json', 'events/event.json'];
            for (const fileName of commonEventFiles) {
                try {
                    const localPath = `${lp.path}/${fileName}`;
                    const content = await invoke<string>('read_text_file', { path: localPath });
                    if (content && content.trim()) {
                        setInputJson(content);
                        console.log(`[SfnInvoker] Loaded default event from local project: ${fileName}`);
                        break;
                    }
                } catch { }
            }
        }
    };

    const saveSfnHistory = async (name: string, input: string, arn: string) => {
        if (!workspacePath) {
            console.warn("[SfnInvoker] No workspace path found, skipping save.");
            return;
        }
        const baseDir = `${workspacePath}/.microtermix/test/${name}/jsons`;
        const historyPath = `${baseDir}/history.json`;

        try {
            console.log(`[SfnInvoker] Saving SFN history to ${baseDir}...`);
            await invoke('ensure_directory', { 
                base: workspacePath, 
                path: `.microtermix/test/${name}/jsons` 
            });

            // Save individual request.json (formatted)
            let formattedInput = input;
            try { formattedInput = JSON.stringify(JSON.parse(input), null, 2); } catch { }
            
            await invoke('write_file', {
                path: `${baseDir}/request.json`,
                content: formattedInput
            });

            // Update history.json
            let currentExecutions: SfnHistoryItem[] = [];
            try {
                const content = await invoke<string>('read_text_file', { path: historyPath });
                currentExecutions = JSON.parse(content).executions || [];
            } catch { }

            const newItem: SfnHistoryItem = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                target,
                input,
                executionArn: arn,
                status: 'RUNNING'
            };

            const updatedHistory = [newItem, ...currentExecutions].slice(0, 50);
            await invoke('write_file', {
                path: historyPath,
                content: JSON.stringify({ executions: updatedHistory }, null, 2)
            });

            setHistory(updatedHistory);
            toast.success(`Ejecución guardada en local`);
        } catch (e) {
            console.error("Failed to save SFN history:", e);
        }
    };

    const filteredMachines = useMemo(() =>
        machines.filter((m: SfnMachine) =>
            m.name.toLowerCase().includes(machineSearch.toLowerCase())
        ), [machines, machineSearch]);

    const selectedMachine = machines.find((m: SfnMachine) => m.arn === selectedArn) ?? null;
    const localMatch      = selectedMachine ? matchProject(selectedMachine.name, projects) : null;

    // ── Start execution mutation ──────────────────────────────────────────────

    const startMutation = useMutation({
        mutationFn: async () => {
            if (!selectedArn) throw new Error('No state machine selected');

            if (target === 'aws') {
                return invoke<string>('sfn_start_execution', {
                    credentials: getRustCreds(),
                    machineArn: selectedArn,
                    input: inputJson,
                });
            } else {
                return invoke<string>('sfn_start_execution_local', {
                    machineArn: selectedArn,
                    input: inputJson,
                    executionName: executionName.trim() || null,
                    endpointUrl: localEndpoint,
                });
            }
        },
        onSuccess: (arn) => { 
            setResultArn(arn); 
            toast.success('Execution iniciada'); 
            if (selectedMachine) {
                saveSfnHistory(selectedMachine.name, inputJson, arn);
            }
        },
        onError: (e) => toast.error(formatAwsError(e)),
    });

    // ── Push to SFN Local mutation ────────────────────────────────────────────

    const pushMutation = useMutation({
        mutationFn: async () => {
            if (!selectedMachine || !localDef) throw new Error('Nada que subir');
            return invoke<string>('sfn_upsert_local_machine', {
                machineName: selectedMachine.name,
                definition: localDef,
                endpointUrl: localEndpoint,
            });
        },
        onSuccess: (arn) => {
            toast.success('State machine actualizada en SFN Local');
            setSelectedArn(arn);   // update to local ARN
        },
        onError: (e) => toast.error(formatAwsError(e)),
    });

    const isJsonValid = (() => { try { JSON.parse(inputJson); return true; } catch { return false; } })();

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* ── Left: machine list ── */}
            <div className="w-[300px] shrink-0 border-r border-slate-800 flex flex-col bg-slate-950/20">
                <div className="p-2.5 border-b border-slate-800">
                    <input
                        value={machineSearch}
                        onChange={e => setMachineSearch(e.target.value)}
                        placeholder="Buscar state machine…"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none placeholder-slate-700"
                    />
                </div>

                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader size={20} className="animate-spin text-microtermix-neon/40" />
                        </div>
                    ) : filteredMachines.length === 0 ? (
                        <div className="text-center py-8 text-slate-700 text-xs opacity-30">Sin resultados</div>
                    ) : (
                        filteredMachines.map((m: SfnMachine) => {
                            const isSelected  = selectedArn === m.arn;
                            const projectHit  = matchProject(m.name, projects);
                            return (
                                <button
                                    key={m.arn}
                                    onClick={() => handleSelectMachine(m.arn)}
                                    className={cn(
                                        'flex flex-col p-2.5 rounded-lg border text-left transition-all',
                                        isSelected
                                            ? projectHit 
                                                ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]'
                                                : 'bg-microtermix-neon/10 border-microtermix-neon/40'
                                            : 'bg-slate-900/40 border-slate-800 hover:border-slate-700',
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-1 w-full">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <GitBranch size={11}
                                                className={isSelected ? 'text-microtermix-neon shrink-0' : 'text-slate-600 shrink-0'} />
                                            <span className={cn(
                                                'text-[11px] font-semibold truncate',
                                                isSelected ? 'text-microtermix-neon' : 'text-slate-300',
                                            )}>
                                                {m.name}
                                            </span>
                                        </div>
                                        {/* LOCAL badge */}
                                        {projectHit && (
                                            <span className="shrink-0 flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                <FolderOpen size={8} /> local
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 ml-[18px]">
                                        <span className="text-[9px] font-mono text-slate-600">{m.machineType}</span>
                                        {projectHit && (
                                            <span className="text-[9px] text-emerald-600 truncate">
                                                {projectHit.name}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* --- RECENT HISTORY (Under list) --- */}
                <div className="h-[40%] border-t border-slate-800 flex flex-col bg-slate-900/20 overflow-hidden">
                    <div className="p-2 border-b border-slate-800 flex items-center justify-between bg-black/20">
                        <div className="flex items-center gap-2">
                            <Clock size={11} className="text-amber-500" />
                            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Historial Reciente</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 custom-scrollbar">
                        {history.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 text-slate-800 select-none gap-2 opacity-30">
                                <Database size={20} />
                                <p className="text-[9px] uppercase tracking-widest font-bold">Sin registros</p>
                            </div>
                        ) : (
                            history.map((h: SfnHistoryItem) => (
                                <button
                                    key={h.id}
                                    onClick={() => setViewingHistoryItem(h)}
                                    className="group flex flex-col p-2 bg-slate-950/40 border border-slate-800 rounded hover:border-amber-500/30 transition-all text-left"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[8px] font-mono text-slate-600">
                                            {new Date(h.timestamp).toLocaleTimeString()}
                                        </span>
                                        <Badge className="text-[7px] bg-slate-800 text-slate-500 border-none px-1 h-3.5 capitalize">
                                            {h.target}
                                        </Badge>
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-mono truncate opacity-60">
                                        {h.input.substring(0, 30)}...
                                    </div>
                                    <div className="flex items-center gap-1 mt-1">
                                        <Zap size={8} className="text-emerald-500" />
                                        <span className="text-[8px] text-slate-600 font-mono truncate">
                                            {h.executionArn.split(':').at(-1)}
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* ── Right panel ── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {selectedMachine ? (
                    <>
                        {/* Header */}
                        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/40">
                            <GitBranch size={14} className="text-microtermix-neon" />
                            <span className="text-sm font-bold text-white truncate">{selectedMachine.name}</span>
                            <span className="text-[9px] font-mono text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                                {selectedMachine.machineType}
                            </span>

                            {/* LOCAL MATCH indicator */}
                            {localMatch && (
                                <div className="flex items-center gap-1.5 ml-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <FolderOpen size={11} className="text-emerald-400" />
                                    <span className="text-[10px] font-bold text-emerald-400">
                                        {localMatch.name}
                                    </span>
                                </div>
                            )}

                            {/* Navigation buttons */}
                            <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                <button
                                    onClick={() => goToLogs(
                                        `/aws/vendedlogs/states/${selectedMachine.name}-Logs`
                                    )}
                                    className="flex items-center gap-1 px-2 py-1 rounded border border-slate-700 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                                    title="Ver logs en CloudWatch"
                                >
                                    <ScrollText size={11} /> Logs
                                </button>
                                <button
                                    onClick={() => goToSfn(selectedMachine.name)}
                                    className="flex items-center gap-1 px-2 py-1 rounded border border-microtermix-neon/30 text-[10px] text-microtermix-neon hover:bg-microtermix-neon/10 transition-all"
                                    title="Ver ejecuciones y configuración"
                                >
                                    <Settings2 size={11} /> Config
                                </button>
                            </div>

                            {/* Sub-tab toggle */}
                            <div className="ml-auto flex items-center gap-0.5 bg-slate-800/60 rounded-lg p-0.5">
                                <button
                                    onClick={() => setRightTab('diagram')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                                        rightTab === 'diagram'
                                            ? 'bg-slate-700 text-white'
                                            : 'text-slate-500 hover:text-slate-300',
                                    )}
                                >
                                    <LayoutTemplate size={10} /> Diagrama
                                </button>
                                <button
                                    onClick={() => setRightTab('execute')}
                                    className={cn(
                                        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all',
                                        rightTab === 'execute'
                                            ? 'bg-slate-700 text-white'
                                            : 'text-slate-500 hover:text-slate-300',
                                    )}
                                >
                                    <Terminal size={10} /> Ejecutar
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-h-0 overflow-hidden">

                            {/* ── Diagram tab ── */}
                            {rightTab === 'diagram' && (
                                loadingDef ? (
                                    <div className="flex items-center justify-center h-40 gap-2 text-slate-600">
                                        <Loader size={18} className="animate-spin" />
                                        <span className="text-xs">Cargando definición…</span>
                                    </div>
                                ) : definition ? (
                                    <SfnAslDiagram
                                        definition={definition}
                                        localDef={localDef}
                                        onLocalDefChange={setLocalDef}
                                        onPushLocal={localMatch ? () => pushMutation.mutate() : undefined}
                                        pushingLocal={pushMutation.isPending}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-40 text-slate-600 text-xs italic">
                                        No se pudo cargar la definición
                                    </div>
                                )
                            )}

                            {/* ── Execute tab ── */}
                            {rightTab === 'execute' && (
                                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar h-full">

                                    {/* Target selector */}
                                    <div className="flex flex-col gap-3">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Destino</span>
                                        <div className="flex gap-2">
                                            {(['aws', 'local'] as InvokeTarget[]).map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => setTarget(t)}
                                                    className={cn(
                                                        'px-4 py-1.5 rounded-lg border text-xs font-bold transition-all',
                                                        target === t
                                                            ? 'bg-microtermix-neon/10 border-microtermix-neon/40 text-microtermix-neon'
                                                            : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300',
                                                    )}
                                                >
                                                    {t === 'aws' ? '☁ AWS' : '⚙ Local (SFN Local)'}
                                                </button>
                                            ))}
                                        </div>

                                        {target === 'local' && (
                                            <div className="flex flex-col gap-1.5">
                                                <span className="text-[10px] text-slate-600">
                                                    Endpoint — Step Functions Local Docker
                                                </span>
                                                <Input
                                                    value={localEndpoint}
                                                    onChange={e => setLocalEndpoint(e.target.value)}
                                                    placeholder="http://localhost:8083"
                                                    className="h-8 text-xs font-mono bg-slate-900 border-slate-700"
                                                />
                                                {localMatch && (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-500">
                                                        <FolderOpen size={10} />
                                                        Proyecto local detectado: <strong>{localMatch.name}</strong>
                                                        — puedes editar la definición en la pestaña Diagrama y subirla antes de ejecutar
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Execution name */}
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                            Nombre ejecución{' '}
                                            <span className="text-slate-700 normal-case font-normal">(opcional)</span>
                                        </span>
                                        <Input
                                            value={executionName}
                                            onChange={e => setExecutionName(e.target.value)}
                                            placeholder="my-test-run-1"
                                            className="h-8 text-xs font-mono bg-slate-900 border-slate-700"
                                        />
                                    </div>

                                    {/* Input JSON */}
                                    <InvokerJsonEditor
                                        label="Input JSON"
                                        value={inputJson}
                                        onChange={setInputJson}
                                        placeholder={'{\n  "key": "value"\n}'}
                                        minHeight="160px"
                                    />

                                    {/* Start button */}
                                    <Button
                                        onClick={() => startMutation.mutate()}
                                        disabled={startMutation.isPending || !isJsonValid}
                                        className="self-start bg-microtermix-neon/80 hover:bg-microtermix-neon text-black font-bold text-xs gap-2"
                                    >
                                        {startMutation.isPending
                                            ? <Loader size={13} className="animate-spin" />
                                            : <Play size={13} fill="currentColor" />}
                                        {startMutation.isPending ? 'Iniciando…' : 'Start Execution'}
                                    </Button>

                                    {/* Result */}
                                    {resultArn && (
                                        <>
                                            <Separator className="bg-slate-800" />
                                            <ExecutionStartedPanel arn={resultArn} />
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-800 opacity-20 select-none gap-3">
                        <GitBranch size={48} strokeWidth={1} />
                        <p className="text-xs font-bold uppercase tracking-widest">Selecciona un State Machine</p>
                    </div>
                )}
            </div>

            {/* History Detail Modal */}
            <Dialog open={!!viewingHistoryItem} onOpenChange={(open) => !open && setViewingHistoryItem(null)}>
                <DialogContent className="sm:max-w-4xl bg-slate-950 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-500">
                            <Clock3 size={16} /> Detalles SFN Execution
                        </DialogTitle>
                        <DialogDescription className="text-slate-500 text-[11px] font-mono">
                            {viewingHistoryItem && (
                                <>ID: {viewingHistoryItem.id} • {new Date(viewingHistoryItem.timestamp).toLocaleString()}</>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {viewingHistoryItem && (
                        <div className="grid grid-cols-1 gap-4 mt-2 max-h-[60vh] overflow-hidden">
                            <div className="flex flex-col gap-2 min-h-0">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Input (JSON)</span>
                                    <Button 
                                        variant="ghost" size="icon-sm" 
                                        onClick={() => { navigator.clipboard.writeText(viewingHistoryItem.input); toast.success("Copiado"); }}
                                        className="h-6 w-6 text-slate-600 hover:text-slate-200"
                                    >
                                        <Copy size={12} />
                                    </Button>
                                </div>
                                <div className="bg-black/40 border border-slate-800 rounded p-3 overflow-auto custom-scrollbar max-h-60">
                                    <pre className="text-[11px] font-mono text-emerald-400/90 whitespace-pre-wrap">
                                        {(() => {
                                            try { return JSON.stringify(JSON.parse(viewingHistoryItem.input), null, 2); }
                                            catch { return viewingHistoryItem.input; }
                                        })()}
                                    </pre>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Execution ARN</span>
                                <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded p-2 text-[10px] font-mono text-slate-400 break-all select-all">
                                    {viewingHistoryItem.executionArn}
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
                                    setInputJson(viewingHistoryItem.input);
                                    setViewingHistoryItem(null);
                                    toast.success("Input cargado al editor");
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

// ─── Execution result panel ───────────────────────────────────────────────────

function ExecutionStartedPanel({ arn }: { arn: string }) {
    const copy = () => { navigator.clipboard.writeText(arn); toast.success('ARN copiado'); };
    return (
        <div className="flex flex-col gap-3 animate-in fade-in duration-300">
            <Badge className="self-start bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1 text-[10px] font-bold">
                <CheckCircle size={10} /> Execution iniciada
            </Badge>
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Execution ARN</span>
                <div className="flex items-center gap-2">
                    <code className="flex-1 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-[10px] font-mono text-slate-300 break-all">
                        {arn}
                    </code>
                    <button onClick={copy} className="p-2 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition-colors shrink-0">
                        <Copy size={14} />
                    </button>
                </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                <AlertTriangle size={10} className="text-amber-500" />
                Ve al tab <strong className="text-slate-400">Step Functions</strong> para ver el estado
                <ExternalLink size={10} />
            </div>
        </div>
    );
}
