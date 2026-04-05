import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
    BarChart3, Play, Square, Settings,
    TerminalSquare, ShieldCheck, AlertCircle, LayoutDashboard,
    Activity, RefreshCw, ChevronDown, ChevronRight,
    Bug, ShieldAlert, FileSearch, Waves, Copy, Search, X,
    ExternalLink, Plus, Trash2, Globe, Server, Check
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useProcessStore } from '../../stores/processStore';
import { TerminalView } from '../services/TerminalView';
import { Badge } from '../ui/badge';
import { useSonarStore, SonarAccount, DEFAULT_SONAR_ACCOUNT } from '../../stores/sonarStore';
import { SonarIssueRemediator } from './SonarIssueRemediator';
import { SonarDashboard } from './SonarDashboard';
import { getSonarAuthHeader, normalizeSonarUrl } from '../../utils/sonarUtils';
import { useSonarMetrics, useSonarIssues, useSonarProjectSearch, useSonarRules, sonarKeys, SonarIssue } from '../../hooks/queries/useSonarQueries';
import { useGitStatus } from '../../hooks/queries/useGitQueries';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/Checkbox';
import { cn } from '../../lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────

const SEVERITY_ORDER: SonarIssue['severity'][] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
const SEV_STYLE: Record<string, { bg: string; text: string; border: string }> = {
    BLOCKER: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
    CRITICAL: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
    MAJOR: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    MINOR: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-600/30' },
    INFO: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
};

const STORAGE_SONAR_PATH = 'microtermix-sonar-selected-path';
const STORAGE_SONAR_TAB = 'microtermix-sonar-active-tab';

// ─── Helpers ───────────────────────────────────────────────────────────────

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const MetricCard: React.FC<{
    label: string; value: string | number; rating?: string;
    icon: React.ElementType; colorClass: string;
}> = ({ label, value, rating, icon: Icon, colorClass }) => (
    <Card className="bg-slate-950/50 border-slate-800 p-4 flex items-center gap-4 hover:border-slate-700 transition-all shadow-none">
        <div className="p-3 rounded-lg bg-slate-800">
            <Icon className={colorClass} size={22} />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">{label}</p>
            <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-slate-200">{value}</span>
                {rating && (
                    <Badge variant="outline" className={cn(
                        "text-[10px] font-bold h-5 px-1.5 min-w-[20px] justify-center",
                        rating === 'A' ? "text-emerald-400 border-emerald-500/30" :
                        rating === 'B' ? "text-yellow-400 border-yellow-500/30" :
                        rating === 'C' ? "text-orange-400 border-orange-500/30" :
                        "text-red-400 border-red-500/30"
                    )}>
                        {rating}
                    </Badge>
                )}
            </div>
        </div>
    </Card>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const SonarPanel: React.FC = () => {
    const { state, executeProjectScript } = useWorkspace();
    const queryClient = useQueryClient();
    const activeProcesses = useProcessStore(s => s.activeProcesses);
    const updateProcessStatus = useProcessStore(s => s.updateProcessStatus);

    const accounts = useSonarStore(s => s.accounts);
    const activeAccountId = useSonarStore(s => s.activeAccountId);
    const getProjectAccount = useSonarStore(s => s.getProjectAccount);
    const projectLinks = useSonarStore(s => s.projectLinks);
    const linkProject = useSonarStore(s => s.linkProject);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);
    const projects = state.projects;

    const [selectedPath, setSelectedPath] = useState<string>(() => {
        const saved = localStorage.getItem(STORAGE_SONAR_PATH);
        if (saved && (saved === 'dashboard' || saved === 'config' || projects.some(p => p.path === saved))) return saved;
        return 'dashboard';
    });

    const activeAccount = useMemo(() => accounts.find(a => a.id === activeAccountId), [accounts, activeAccountId]);
    const projectAccount = useMemo(() => {
        if (selectedPath === 'dashboard' || selectedPath === 'config') return activeAccount;
        return getProjectAccount(selectedPath);
    }, [selectedPath, activeAccount, getProjectAccount]);

    const [remediatingIssue, setRemediatingIssue] = useState<SonarIssue | null>(null);

    useEffect(() => {
        if (!selectedPath && projects.length > 0) setSelectedPath('dashboard');
    }, [projects, selectedPath]);

    useEffect(() => {
        if (selectedPath) localStorage.setItem(STORAGE_SONAR_PATH, selectedPath);
    }, [selectedPath]);

    const link = projectLinks[selectedPath] || {};
    const projectKey = link.projectKey || (projects.find(p => p.path === selectedPath)?.name as string || '');

    const [activeTab, setActiveTab] = useState<'local' | 'server' | 'analysis' | 'rules'>(() => {
        const saved = localStorage.getItem(STORAGE_SONAR_TAB);
        return (saved === 'local' || saved === 'server' || saved === 'analysis' || saved === 'rules') ? saved : 'local';
    });
    useEffect(() => { localStorage.setItem(STORAGE_SONAR_TAB, activeTab); }, [activeTab]);

    const [localIssues, setLocalIssues] = useState<SonarIssue[]>([]);
    
    // -- Queries --
    const isProjectView = selectedPath !== 'dashboard' && selectedPath !== 'config';
    const isLocalMode = link.localAuditMode !== false;
    
    const { data: cloudMetrics, isLoading: loadingCloudMetrics } = useSonarMetrics(isProjectView && activeTab === 'server' ? selectedPath : undefined, projectKey);
    const { data: cloudIssues = [], isLoading: loadingCloudIssues } = useSonarIssues(isProjectView ? selectedPath : undefined, projectKey);

    const metrics = useMemo(() => cloudMetrics, [cloudMetrics]);
    const issues = useMemo(() => (activeTab === 'local' && localIssues.length > 0 ? localIssues : cloudIssues), [activeTab, localIssues, cloudIssues]);
    const loadingMetrics = activeTab === 'server' ? loadingCloudMetrics : false;
    const loadingIssues = activeTab === 'server' ? loadingCloudIssues : false;

    const [debugLogs, setDebugLogs] = useState<{id:string, timestamp:string, type:string, message:string}[]>([]);
    const addLog = useCallback((type: string, message: string) => {
        setDebugLogs(prev => [{ id: Math.random().toString(36), timestamp: new Date().toLocaleTimeString(), type, message }, ...prev.slice(0, 50)]);
    }, []);

    const baseUrl = useMemo(() => normalizeSonarUrl(projectAccount?.serverUrl), [projectAccount?.serverUrl]);
    const { data: gitStatus } = useGitStatus(isProjectView ? selectedPath : null);
    const currentBranch = gitStatus?.currentBranch || null;

    // COMANDO DE SONAR-SCANNER REAL
    const effectiveCommand = useMemo(() => {
        if (!projectAccount) return '';
        const { token, organization, serverUrl } = projectAccount;
        
        let cmd = link.customCommand || 'sonar-scanner';
        cmd += ` -Dsonar.projectKey=${projectKey}`;
        
        if (serverUrl) cmd += ` -Dsonar.host.url=${normalizeSonarUrl(serverUrl)}`;
        if (token) cmd += ` -Dsonar.token=${token}`;
        if (organization) cmd += ` -Dsonar.organization=${organization}`;
        
        if (link.includeBranch && currentBranch) {
            cmd += ` -Dsonar.branch.name=${currentBranch}`;
        }
        
        if (link.sources) cmd += ` -Dsonar.sources=${link.sources}`;
        if (link.extraProps) cmd += ` ${link.extraProps}`;
        if (link.debug) cmd += ' -X';
        
        return cmd;
    }, [projectAccount, projectKey, baseUrl, currentBranch, link]);

    const serviceId = useMemo(() => `${selectedPath}::${effectiveCommand} `, [selectedPath, effectiveCommand]);
    const processState = activeProcesses[serviceId];
    const isRunning = processState?.status === 'running';
    const processStatus = processState?.status;

    const prevStatusRef = useRef<typeof processStatus>(undefined);
    useEffect(() => {
        if (prevStatusRef.current === 'running' && processStatus === 'stopped') {
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: sonarKeys.all });
                toast.success("Análisis completado. Refrescando reporte local.");
                if (isLocalMode) setActiveTab('local');
            }, 3000);
        }
        prevStatusRef.current = processStatus;
    }, [processStatus, queryClient, isLocalMode]);

    const handleRunAnalysis = async () => {
        if (!selectedPath || !effectiveCommand) return;
        addLog('cmd', `Ejecutando Sonar-Scanner: ${effectiveCommand}`);
        setActiveTab('analysis');
        await executeProjectScript(selectedPath, effectiveCommand, { globalEnvName: 'none', incrementRestart: true });
    };

    const handleStop = async () => {
        addLog('info', 'Deteniendo proceso...');
        try { await invoke('kill_service', { serviceId }); updateProcessStatus(serviceId, 'stopped'); } catch (_) { }
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-900 font-sans">
            {/* Header Principal */}
            <div className="shrink-0 px-8 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 backdrop-blur-xl">
                <div className="flex items-center gap-5">
                    <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-blue-400 shadow-inner">
                        <BarChart3 size={24} />
                    </div>
                    <div className="text-left">
                        <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight leading-none">Sonar Manager</h2>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1.5">Official Scanner Engine</p>
                    </div>
                </div>
                <Button 
                    onClick={isRunning ? handleStop : handleRunAnalysis} 
                    disabled={!selectedPath || selectedPath === 'dashboard' || selectedPath === 'config'} 
                    variant={isRunning ? "destructive" : "default"} 
                    className="font-black px-10 h-11 shadow-2xl rounded-2xl ring-1 ring-white/10 active:scale-95 transition-all"
                >
                    {isRunning ? <Square size={16} className="mr-2 fill-current" /> : <Play size={16} className="mr-2 fill-current" />}
                    {isRunning ? 'DETENER' : 'RUN ANALYSIS'}
                </Button>
            </div>

            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Sidebar */}
                <div className="w-72 shrink-0 border-r border-slate-800 flex flex-col bg-[#05070a]">
                    <div className="p-6 border-b border-slate-800/60 bg-slate-900/20">
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Navegación</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {['dashboard', 'config'].map(id => (
                            <div key={id} onClick={() => setSelectedPath(id)} className={cn(
                                "px-5 py-4 rounded-2xl cursor-pointer transition-all flex items-center gap-4 border",
                                selectedPath === id ? "bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-lg" : "border-transparent text-slate-500 hover:bg-slate-800/50 hover:text-slate-300"
                            )}>
                                {id === 'dashboard' ? <LayoutDashboard size={18} /> : <Settings size={18} />}
                                <span className="text-sm font-bold uppercase tracking-tight">{id === 'dashboard' ? 'Dashboard' : 'Cuentas'}</span>
                            </div>
                        ))}
                        <div className="h-px bg-slate-800/60 my-6 mx-2" />
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-4 mb-4">Proyectos</p>
                        {projects.map(p => (
                            <div key={p.path} onClick={() => setSelectedPath(p.path)} className={cn(
                                "group flex items-center justify-between px-5 py-3 rounded-2xl cursor-pointer transition-all border",
                                selectedPath === p.path ? "bg-blue-600/5 border-blue-500/30 text-blue-400 shadow-sm" : "border-transparent text-slate-500 hover:bg-slate-800/30 hover:text-slate-300"
                            )}>
                                <span className="text-xs font-semibold truncate flex-1">{p.name}</span>
                                <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); setIsSettingsOpen(true); }} className="h-8 w-8 opacity-0 group-hover:opacity-100 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg"><Settings size={14} /></Button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col bg-[#020617] overflow-hidden">
                    {selectedPath === 'dashboard' ? (
                        <SonarDashboard projects={projects} onSelectProject={setSelectedPath} />
                    ) : selectedPath === 'config' ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-700 opacity-30 gap-6"><Server size={80} strokeWidth={1} /><p className="text-lg font-black uppercase tracking-[0.4em]">Configuración Global</p></div>
                    ) : (
                        <Tabs value={activeTab} onValueChange={val => setActiveTab(val as any)} className="flex-1 flex flex-col min-h-0">
                            <div className="px-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/30 shrink-0">
                                <TabsList variant="line" className="h-14 gap-10">
                                    <TabsTrigger value="local" className="gap-2 px-0 text-[11px] font-black uppercase tracking-widest data-active:text-blue-400"><ShieldCheck size={16} /> Local Audit</TabsTrigger>
                                    <TabsTrigger value="server" className="gap-2 px-0 text-[11px] font-black uppercase tracking-widest data-active:text-blue-400"><Globe size={16} /> Cloud Report</TabsTrigger>
                                    <TabsTrigger value="analysis" className="gap-2 px-0 text-[11px] font-black uppercase tracking-widest data-active:text-blue-400"><TerminalSquare size={16} /> Terminal</TabsTrigger>
                                </TabsList>
                                <Badge variant="outline" className="bg-slate-950 text-[10px] font-mono border-slate-800 text-slate-500 px-4 py-1.5 uppercase rounded-full tracking-wider">{projectKey}</Badge>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10">
                                {activeTab === 'analysis' ? (
                                    <div className="h-full flex flex-col gap-8 animate-in fade-in duration-500">
                                        <div className="bg-[#05070a] p-6 rounded-3xl border border-slate-800/50 font-mono text-[11px] text-blue-300 flex items-center gap-6 shadow-2xl relative group ring-1 ring-white/5">
                                            <span className="text-blue-500 font-black opacity-40 select-none">$</span>
                                            <span className="flex-1 break-all leading-relaxed">{effectiveCommand}</span>
                                            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className="h-10 w-10 text-slate-500 hover:text-blue-400 shrink-0 hover:bg-white/5 rounded-xl"><Settings size={18} /></Button>
                                        </div>
                                        <div className="flex-1 border border-slate-800 rounded-[2.5rem] overflow-hidden bg-black/40 shadow-2xl ring-1 ring-white/5">
                                            <TerminalView serviceId={serviceId} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                        {loadingMetrics ? <div className="flex flex-col items-center py-40 gap-6 text-slate-600"><RefreshCw className="animate-spin" size={48} strokeWidth={1} /><p className="text-xs font-black uppercase tracking-[0.4em] animate-pulse">Sincronizando...</p></div> : metrics && (
                                            <>
                                                <div className="grid grid-cols-3 gap-8">
                                                    <MetricCard label="Bugs" value={metrics.bugs} rating={metrics.reliability} icon={Bug} colorClass="text-red-400" />
                                                    <MetricCard label="Vulnerabilidades" value={metrics.vulnerabilities} rating={metrics.security} icon={ShieldAlert} colorClass="text-yellow-400" />
                                                    <MetricCard label="Code Smells" value={metrics.codeSmells} rating={metrics.maintainability} icon={FileSearch} colorClass="text-blue-400" />
                                                </div>
                                                
                                                <div className="pt-10 border-t border-slate-800/50">
                                                    <div className="flex items-center justify-between mb-10">
                                                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Detalle de Hallazgos ({issues.length})</h3>
                                                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] uppercase px-3 py-1 rounded-lg">Vista: {activeTab === 'local' ? 'Recientes' : 'Oficiales'}</Badge>
                                                    </div>
                                                    
                                                    <div className="space-y-6">
                                                        {issues.length === 0 ? (
                                                            <div className="py-32 flex flex-col items-center justify-center bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-[4rem] text-slate-700 gap-6">
                                                                <Check size={64} strokeWidth={1} className="opacity-20" />
                                                                <p className="text-sm font-black uppercase tracking-[0.2em]">Escaneo Limpio</p>
                                                            </div>
                                                        ) : SEVERITY_ORDER.map(s => {
                                                            const group = issues.filter(i => i.severity === s);
                                                            if (group.length === 0) return null;
                                                            const style = SEV_STYLE[s];
                                                            return (
                                                                <div key={s} className={cn("rounded-3xl border overflow-hidden transition-all hover:shadow-2xl hover:border-slate-600 bg-slate-900/10", style.border)}>
                                                                    <div className={cn("px-6 py-4 flex items-center justify-between", style.bg)}>
                                                                        <span className={cn("text-[11px] font-black uppercase tracking-widest", style.text)}>{s} ({group.length})</span>
                                                                    </div>
                                                                    <div className="divide-y divide-slate-800/40 bg-slate-900/20">
                                                                        {group.map(i => (
                                                                            <div key={i.key} className="px-8 py-5 hover:bg-slate-800/40 transition-colors cursor-pointer group/item">
                                                                                <div className="flex items-start gap-6">
                                                                                    <Badge className={cn("shrink-0 text-[9px] font-black uppercase h-6 px-3 rounded-lg", style.bg, style.text)}>{i.type}</Badge>
                                                                                    <div className="flex-1 min-w-0 space-y-2">
                                                                                        <p className="text-sm text-slate-200 leading-relaxed font-medium group-hover/item:text-white transition-colors">{i.message}</p>
                                                                                        <p className="text-[10px] text-slate-500 font-mono truncate opacity-50 uppercase tracking-tight">{i.component}:{i.line}</p>
                                                                                    </div>
                                                                                    <ExternalLink size={16} className="text-slate-700 group-hover/item:text-blue-400 transition-all shrink-0 mt-1" />
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Tabs>
                    )}
                </div>
            </div>

            {/* Modal de Ajustes - DISEÑO BALANCEADO */}
            {isSettingsOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/95 backdrop-blur-2xl p-4 animate-in fade-in duration-500">
                    <Card className="w-full max-w-2xl bg-slate-900 border-slate-800 p-0 overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] rounded-[3rem] ring-1 ring-white/10 animate-in zoom-in-95 flex flex-col">
                        <CardHeader className="px-12 py-10 border-b border-slate-800 bg-slate-900/50 flex flex-row justify-between items-center shrink-0">
                            <div className="flex items-center gap-6 text-left">
                                <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-blue-400 shadow-xl"><Settings size={28} /></div>
                                <div className="space-y-1">
                                    <CardTitle className="text-xl font-black text-slate-100 uppercase tracking-tight">Ajustes del Proyecto</CardTitle>
                                    <p className="text-xs text-slate-500 font-medium tracking-wide">Configura el comportamiento del scanner oficial</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(false)} className="rounded-full hover:bg-slate-800 h-12 w-12 text-slate-500 hover:text-white transition-all"><X size={28} /></Button>
                        </CardHeader>
                        
                        <CardContent className="p-12 space-y-12 overflow-y-auto scrollbar-hide flex-1">
                            <div className="flex flex-col gap-12">
                                <div className="grid grid-cols-2 gap-10">
                                    <div className="space-y-4 text-left">
                                        <Label className="text-[11px] text-slate-400 uppercase font-black tracking-[0.2em] ml-1">Project Key (Oficial)</Label>
                                        <Input value={link.projectKey || ''} onChange={e => linkProject(selectedPath, { ...link, projectKey: e.target.value })} className="h-14 bg-black/40 border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500/30 font-mono text-sm text-white" />
                                    </div>
                                    <div className="space-y-4 text-left">
                                        <Label className="text-[11px] text-slate-400 uppercase font-black tracking-[0.2em] ml-1">Carpetas (Sources)</Label>
                                        <Input value={link.sources || '.'} onChange={e => linkProject(selectedPath, { ...link, sources: e.target.value })} className="h-14 bg-black/40 border-slate-800 rounded-2xl focus:ring-2 focus:ring-blue-500/30 font-mono text-sm text-white" />
                                    </div>
                                </div>

                                <div className="p-10 bg-slate-950/40 border border-slate-800 rounded-[2.5rem] space-y-8 shadow-inner ring-1 ring-white/5">
                                    <Label className="text-[11px] text-slate-500 uppercase font-black tracking-[0.2em] ml-1">Parámetros Automáticos</Label>
                                    <div className="grid grid-cols-2 gap-x-12 gap-y-6 text-left">
                                        {['includeHostUrl', 'includeToken', 'includeOrganization', 'includeBranch', 'debug'].map(id => (
                                            <div key={id} className="flex items-center justify-between border-b border-slate-800/50 pb-4 transition-colors hover:border-slate-700">
                                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{id.replace('include', '').replace('ProjectKey', 'Key')}</span>
                                                <Checkbox checked={link[id] ?? (id !== 'debug')} onChange={e => linkProject(selectedPath, { ...link, [id]: e.target.checked })} />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="group flex items-center justify-between p-6 bg-blue-500/5 border border-blue-500/20 rounded-[1.5rem] hover:bg-blue-500/10 transition-all shadow-sm">
                                    <div className="flex items-center gap-5">
                                        <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400"><ShieldCheck size={22} /></div>
                                        <div className="flex flex-col text-left">
                                            <span className="text-sm font-black text-blue-400 uppercase tracking-widest leading-none">Priorizar Vista Local</span>
                                            <span className="text-[11px] text-slate-500 font-medium mt-1.5">Muestra los resultados del último escaneo en la pestaña Local</span>
                                        </div>
                                    </div>
                                    <Checkbox checked={link.localAuditMode ?? true} onChange={e => linkProject(selectedPath, { ...link, localAuditMode: e.target.checked })} className="scale-150 border-blue-500/50 data-[state=checked]:bg-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                        
                        <div className="p-10 bg-slate-950 border-t border-slate-800 flex justify-end gap-6 shadow-2xl shrink-0">
                            <Button variant="ghost" onClick={() => setIsSettingsOpen(false)} className="px-10 text-xs font-black uppercase tracking-[0.3em] text-slate-500 hover:text-white transition-colors">CERRAR</Button>
                            <Button onClick={() => setIsSettingsOpen(false)} className="bg-blue-600 hover:bg-blue-500 text-white font-black px-16 h-14 rounded-3xl shadow-2xl shadow-blue-600/30 uppercase tracking-[0.2em] text-sm transition-all active:scale-95">GUARDAR AJUSTES</Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Activity Monitor */}
            <div className={`shrink-0 border-t border-slate-800 bg-slate-950 transition-all flex flex-col ${isConsoleOpen ? 'h-56' : 'h-10'}`}>
                <div onClick={() => setIsConsoleOpen(!isConsoleOpen)} className="h-10 px-6 flex items-center justify-between cursor-pointer flex-shrink-0 bg-black/40 hover:bg-black/60 transition-colors border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <TerminalSquare size={14} className={cn("transition-colors", isConsoleOpen ? 'text-blue-400' : 'text-slate-600')} />
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Activity Console</span>
                    </div>
                    <ChevronDown size={16} className={cn("text-slate-600 transition-transform duration-300", isConsoleOpen ? "" : "rotate-180")} />
                </div>
                {isConsoleOpen && (
                    <div className="flex-1 overflow-y-auto p-6 font-mono text-[10px] bg-[#05070a] space-y-2.5 scrollbar-hide shadow-inner">
                        {debugLogs.map(l => (
                            <div key={l.id} className="flex gap-6 animate-in slide-in-from-left-2 duration-300">
                                <span className="text-slate-800 shrink-0 select-none">[{l.timestamp}]</span>
                                <span className={cn("font-black uppercase shrink-0 w-20 text-center rounded px-1.5 py-0.5", 
                                    l.type === 'error' ? 'bg-red-500/10 text-red-500' : 
                                    l.type === 'cmd' ? 'bg-emerald-500/10 text-emerald-500' : 
                                    'bg-blue-500/10 text-blue-500'
                                )}>{l.type}</span>
                                <span className="text-slate-400 flex-1 leading-relaxed">{l.message}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {remediatingIssue && <SonarIssueRemediator isOpen={!!remediatingIssue} issue={remediatingIssue} projectPath={selectedPath} onClose={() => setRemediatingIssue(null)} />}
        </div>
    );
};
