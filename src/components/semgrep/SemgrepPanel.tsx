import React, { useState } from 'react';
import { 
    ShieldAlert, ShieldCheck, Play, RefreshCw, 
    AlertTriangle, Bug, Lock, FileCode,
    ChevronRight, CheckCircle2,
    Activity, TerminalSquare
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useSemgrepStore, SemgrepFinding } from '../../stores/semgrepStore';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { SemgrepFindingRemediator } from './SemgrepFindingRemediator';
import { open } from '@tauri-apps/plugin-dialog';
import { useSemgrepInstalled, useSemgrepScan } from '../../hooks/queries/useSemgrepQueries';
import { Terminal } from '../ui/terminal/Terminal';

const STORAGE_SEMGREP_PATH = 'microtermix-semgrep-selected-path';

export const SemgrepPanel: React.FC = () => {
    const { state } = useWorkspace();
    const projects = state.projects;
    
    const [selectedPath, setSelectedPath] = useState<string>(() => {
        const saved = localStorage.getItem(STORAGE_SEMGREP_PATH);
        if (saved && projects.some(p => p.path === saved)) return saved;
        return (projects[0]?.path as string) || '';
    });

    React.useEffect(() => {
        if (selectedPath) {
            localStorage.setItem(STORAGE_SEMGREP_PATH, selectedPath);
        }
    }, [selectedPath]);

    const [remediatingFinding, setRemediatingFinding] = useState<SemgrepFinding | null>(null);
    const [scanId, setScanId] = useState(0);
    const [terminalHeight, setTerminalHeight] = useState(256);
    const [currentAction, setCurrentAction] = useState<string>('IDLE');
    
    const findingsCache = useSemgrepStore(s => s.findings);
    const lastScan = useSemgrepStore(s => s.lastScan);
    const configPath = useSemgrepStore(s => s.configPath);
    const setConfigPath = useSemgrepStore(s => s.setConfigPath);

    const { data: isInstalled, isLoading: checkingInstalled } = useSemgrepInstalled();
    const scanMutation = useSemgrepScan();
    const isScanning = scanMutation.isPending;

    const currentFindings = findingsCache[selectedPath] || [];

    // Buscador de archivos nativo
    const handlePickConfig = async () => {
        const selected = await open({
            multiple: false,
            directory: false,
            filters: [{ name: 'Semgrep Config', extensions: ['yml', 'yaml', 'json'] }]
        });
        if (selected && !Array.isArray(selected)) {
            setConfigPath(selected);
            toast.success("Configuración de Semgrep actualizada");
        }
    };

    const handleRunScan = async () => {
        if (!selectedPath) return;
        
        setScanId(s => s + 1);
        setCurrentAction("INITIALIZING");
        toast.info("Lanzando escaneo de seguridad local...");
        
        try {
            await scanMutation.mutateAsync({
                projectPath: selectedPath,
                configPath,
                onProgress: (action) => setCurrentAction(action)
            });
            setCurrentAction("COMPLETED");
        } catch (e) {
            setCurrentAction("ERROR");
        }
    };

    const SEV_STYLE: Record<string, string> = {
        ERROR: 'bg-red-500/10 text-red-400 border-red-500/30',
        WARNING: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
        INFO: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    };

    if (isInstalled === false) {
        return (
            <div className="flex-1 flex items-center justify-center p-6 bg-slate-900 overflow-y-auto">
                <div className="max-w-2xl w-full space-y-8 animate-in fade-in zoom-in duration-500 pb-20">
                    <div className="text-center space-y-4">
                        <div className="inline-flex p-4 bg-orange-500/10 rounded-3xl border border-orange-500/20">
                            <ShieldAlert className="text-orange-500" size={48} />
                        </div>
                        <h2 className="text-2xl font-black text-slate-200 uppercase tracking-tight">Semgrep no detectado</h2>
                        <p className="text-slate-400 max-w-md mx-auto">Para realizar análisis de seguridad locales, necesitas instalar Semgrep en tu sistema operativo.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                            <p className="text-xs font-black text-blue-400 uppercase tracking-widest">macOS</p>
                            <code className="block p-3 bg-slate-950 rounded-lg text-[10px] text-slate-300 font-mono border border-slate-800">
                                brew install semgrep
                            </code>
                            <Button variant="outline" size="sm" className="w-full text-[10px] h-8 bg-slate-900" onClick={() => { navigator.clipboard.writeText('brew install semgrep'); toast.success("Copiado al portapapeles"); }}>Copiar</Button>
                        </div>
                        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                            <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">Linux / Ubuntu</p>
                            <code className="block p-3 bg-slate-950 rounded-lg text-[10px] text-slate-300 font-mono border border-slate-800 leading-relaxed">
                                sudo apt install semgrep
                                python3 -m pip install semgrep
                            </code>
                            <Button variant="outline" size="sm" className="w-full text-[10px] h-8 bg-slate-900" onClick={() => { navigator.clipboard.writeText('python3 -m pip install semgrep'); toast.success("Copiado al portapapeles"); }}>Copiar Pip</Button>
                        </div>
                        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Windows</p>
                            <code className="block p-3 bg-slate-950 rounded-lg text-[10px] text-slate-300 font-mono border border-slate-800">
                                python -m pip install semgrep
                            </code>
                            <Button variant="outline" size="sm" className="w-full text-[10px] h-8 bg-slate-900" onClick={() => { navigator.clipboard.writeText('python -m pip install semgrep'); toast.success("Copiado al portapapeles"); }}>Copiar</Button>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-4 pt-4 text-center">
                        <Button 
                            onClick={() => window.location.reload()} 
                            className="bg-microtermix-neon text-slate-900 font-black uppercase tracking-widest rounded-xl px-10 h-12 shadow-lg shadow-microtermix-neon/20 hover:bg-microtermix-neon/80"
                        >
                            Hecho, Re-verificar
                        </Button>
                        <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest">Una vez instalado, reinicia Microtermix o pulsa re-verificar</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-900 animate-in fade-in duration-500">
            {/* Header */}
            <div className="shrink-0 px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-4 flex-1">
                    <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                        <Lock className="text-emerald-400" size={22} />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-base font-black text-slate-200 uppercase tracking-tight flex items-center gap-2">
                            Semgrep Security
                            {checkingInstalled && <RefreshCw size={14} className="animate-spin text-slate-600 ml-2" />}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={handlePickConfig}
                                className="h-6 px-3 bg-slate-950 border-slate-800 hover:border-emerald-500/50 text-[9px] font-mono text-slate-400 gap-2 flex items-center max-w-[300px]"
                            >
                                <FileCode size={12} className="text-emerald-500" />
                                <span className="truncate">{configPath === 'p/default' ? 'Default Rules (p/default)' : configPath.split(/[/\\]/).pop()}</span>
                            </Button>
                            {configPath !== 'p/default' && (
                                <button 
                                    onClick={() => setConfigPath('p/default')}
                                    className="text-[9px] font-bold text-slate-600 hover:text-red-400 uppercase tracking-tighter transition-colors px-1"
                                    title="Reset to default rules"
                                >
                                    Reset
                                </button>
                            )}
                            {lastScan[selectedPath] && (
                                <span className="text-[9px] text-slate-700 uppercase font-bold tracking-widest ml-2 hidden lg:inline">
                                    • {new Date(lastScan[selectedPath]).toLocaleTimeString()}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                
                <Button 
                    onClick={handleRunScan} 
                    disabled={isScanning || !selectedPath}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-lg shadow-emerald-900/20 gap-2 h-9 px-6 rounded-xl transition-all"
                >
                    {isScanning ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} className="fill-current" />}
                    {isScanning ? 'Escaneando...' : 'Run Security Scan'}
                </Button>
            </div>

            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Sidebar: Proyectos */}
                <div className="w-64 shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950/20">
                    <div className="p-3 border-b border-slate-800/60 bg-slate-950/40 flex items-center justify-between">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Workspace</p>
                        <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-500">{projects.length}</Badge>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {projects.map(p => (
                            <div
                                key={p.path as string}
                                onClick={() => setSelectedPath(p.path as string)}
                                className={cn(
                                    "flex items-center justify-between px-4 py-3 cursor-pointer transition-all border-l-2 group",
                                    selectedPath === p.path 
                                        ? "bg-emerald-500/5 border-emerald-500 text-emerald-400" 
                                        : "border-transparent text-slate-400 hover:bg-slate-800/40"
                                )}
                            >
                                <div className="min-w-0">
                                    <p className="text-xs font-bold truncate">{p.name}</p>
                                    <p className="text-[9px] text-slate-600 font-mono truncate">{findingsCache[p.path as string]?.length || 0} issues</p>
                                </div>
                                {findingsCache[p.path as string]?.length > 0 && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm shadow-red-900/50" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-900/30">
                    {checkingInstalled && !isInstalled ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-20">
                            <Activity size={40} className="animate-pulse text-emerald-500" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Verificando Entorno...</p>
                        </div>
                    ) : selectedPath ? (
                        <div className="flex-1 flex flex-col overflow-hidden relative">
                            {/* Dashboard & Issues Area */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                                {/* Dashboard Stats */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Total Issues</p>
                                            <p className="text-3xl font-black text-slate-200">{currentFindings.length}</p>
                                        </div>
                                        <ShieldCheck className={cn("text-slate-800", currentFindings.length > 0 && "text-red-500/20")} size={32} />
                                    </div>
                                    <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-black text-red-500 uppercase mb-1">Críticos</p>
                                            <p className="text-3xl font-black text-red-400">{currentFindings.filter(f => f.severity === 'ERROR').length}</p>
                                        </div>
                                        <ShieldAlert className="text-red-500/20" size={32} />
                                    </div>
                                    <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-black text-yellow-500 uppercase mb-1">Proceso</p>
                                            <p className="text-xs font-black text-slate-400 mt-2 uppercase">{currentAction}</p>
                                        </div>
                                        <Activity className={cn("text-slate-800", isScanning && "text-emerald-500/20 animate-pulse")} size={32} />
                                    </div>
                                </div>

                                {/* Issues List */}
                                <div className="space-y-3 pb-10">
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <AlertTriangle size={14} className="text-orange-500" /> Detalle de Hallazgos
                                    </h3>
                                    
                                    {currentFindings.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-20 bg-slate-950/30 border-2 border-dashed border-slate-800 rounded-3xl opacity-50">
                                            <ShieldCheck size={48} className="text-emerald-500/50 mb-4" />
                                            <p className="text-slate-400 font-bold uppercase tracking-wider text-sm">No se han encontrado vulnerabilidades</p>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3">
                                            {currentFindings.map(finding => (
                                                <div 
                                                    key={finding.id}
                                                    onClick={() => setRemediatingFinding(finding)}
                                                    className="group bg-slate-950/40 border border-slate-800 rounded-xl p-4 hover:border-emerald-500/50 cursor-pointer transition-all flex gap-4"
                                                >
                                                    <div className={cn("px-2 py-1 h-fit rounded text-[9px] font-black border uppercase shrink-0", SEV_STYLE[finding.severity] || SEV_STYLE.INFO)}>
                                                        {finding.severity}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[11px] font-black text-slate-500 uppercase font-mono tracking-tighter mb-1 opacity-60 truncate">
                                                            {finding.ruleId}
                                                        </p>
                                                        <p className="text-[13px] text-slate-200 font-medium leading-relaxed group-hover:text-white transition-colors line-clamp-2">
                                                            {finding.message}
                                                        </p>
                                                        <div className="flex items-center gap-3 mt-3">
                                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                                                                <FileCode size={12} className="text-blue-400" />
                                                                {finding.path.split('/').pop()}:{finding.line}
                                                            </div>
                                                            <div className="h-3 w-px bg-slate-800" />
                                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-tighter hover:text-emerald-400 transition-colors">
                                                                <CheckCircle2 size={12} />
                                                                Auto-remediar
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <ChevronRight className="shrink-0 text-slate-700 group-hover:text-emerald-500 transition-all self-center" size={18} />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Collapsible Terminal at the very bottom */}
                            <Terminal
                                key={`semgrep-scan-${scanId}`}
                                mode="log-stream"
                                variant="panel"
                                defaultIsOpen={true}
                                resizable={true}
                                height={terminalHeight}
                                onHeightChange={setTerminalHeight}
                                className="z-10 shadow-2xl shadow-black"
                                title={
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] uppercase tracking-widest">Live Scan Logs</span>
                                        {isScanning && (
                                            <div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                                                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
                                                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-tighter">{currentAction}</span>
                                            </div>
                                        )}
                                    </div>
                                }
                                icon={<TerminalSquare size={14} className={cn("text-slate-600", isScanning && "text-emerald-500 animate-pulse")} />}
                                events={[{
                                    event: 'semgrep-log',
                                    outputFormat: 'json',
                                    format: (payload: unknown) => {
                                        const line = String(payload);
                                        if (line.startsWith('PROG:')) {
                                            return `\x1b[38;5;48m⚡ ${line.replace('PROG:', '').trim()}\x1b[0m`;
                                        }
                                        return line;
                                    }
                                }]}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-600">
                            <Bug size={48} className="opacity-20" />
                            <p className="text-sm font-bold uppercase tracking-widest opacity-30">Selecciona un proyecto para analizar</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Remediator Modal Especializado para Semgrep */}
            {remediatingFinding && (
                <SemgrepFindingRemediator
                    isOpen={!!remediatingFinding}
                    projectPath={selectedPath}
                    finding={remediatingFinding}
                    onClose={() => setRemediatingFinding(null)}
                />
            )}
        </div>
    );
};
