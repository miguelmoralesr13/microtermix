import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {Settings, ShieldCheck, Globe, TerminalSquare, 
    Bug, ShieldAlert, FileSearch, Check, ExternalLink, FileCode, RefreshCw
} from 'lucide-react';

import { useWorkspace } from '../../context/WorkspaceContext';
import { useProcessStore } from '../../stores/processStore';
import { useSonarStore } from '../../stores/sonarStore';
import { useQueryClient } from '@tanstack/react-query';

import { TerminalView } from '../services/TerminalView';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';
import { normalizeSonarUrl } from '../../utils/sonarUtils';
import { useSonarMetrics, useSonarIssues, sonarKeys, SonarIssue, useSonarRules } from '../../hooks/queries/useSonarQueries';
import { useGitStatus } from '../../hooks/queries/useGitQueries';

// Sub-components
import { SonarHeader } from './components/SonarHeader';
import { SonarSidebar } from './components/SonarSidebar';
import { SonarMetricCard } from './components/SonarMetricCard';
import { SonarSettingsDialog } from './components/SonarSettingsDialog';
import { SonarActivityConsole } from './components/SonarActivityConsole';
import { SonarDashboard } from './SonarDashboard';
import { SonarAccountsManager } from './SonarAccountsManager';
import { SonarIssueRemediator } from './SonarIssueRemediator';

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

    const [localIssues] = useState<SonarIssue[]>([]);
    const isProjectView = selectedPath !== 'dashboard' && selectedPath !== 'config';
    
    const { data: metrics, isLoading: loadingCloudMetrics } = useSonarMetrics(isProjectView && activeTab === 'server' ? selectedPath : undefined, projectKey);
    const { data: cloudIssues = [] } = useSonarIssues(isProjectView ? selectedPath : undefined, projectKey);
    const { data: rules = [], isLoading: loadingRules } = useSonarRules(isProjectView ? selectedPath : undefined, projectKey);
    const issues = useMemo(() => (activeTab === 'local' && localIssues.length > 0 ? localIssues : cloudIssues), [activeTab, localIssues, cloudIssues]);
    const loadingMetrics = activeTab === 'server' ? loadingCloudMetrics : false;

    const [debugLogs, setDebugLogs] = useState<{id:string, timestamp:string, type:string, message:string}[]>([]);
    const addLog = useCallback((type: string, message: string) => {
        setDebugLogs(prev => [{ id: Math.random().toString(36), timestamp: new Date().toLocaleTimeString(), type, message }, ...prev.slice(0, 50)]);
    }, []);

    const { data: gitStatus } = useGitStatus(isProjectView ? selectedPath : null);
    const currentBranch = gitStatus?.currentBranch || null;

    const effectiveCommand = useMemo(() => {
        if (!projectAccount) return '';
        const { token, organization, serverUrl } = projectAccount;
        let cmd = link.customCommand || 'sonar-scanner';
        cmd += ` -Dsonar.projectKey=${projectKey}`;
        if (serverUrl) cmd += ` -Dsonar.host.url=${normalizeSonarUrl(serverUrl)}`;
        if (token) cmd += ` -Dsonar.token=${token}`;
        if (organization) cmd += ` -Dsonar.organization=${organization}`;
        if (link.includeBranch && currentBranch) cmd += ` -Dsonar.branch.name=${currentBranch}`;
        if (link.sources) cmd += ` -Dsonar.sources=${link.sources}`;
        if (link.extraProps) cmd += ` ${link.extraProps}`;
        if (link.debug) cmd += ' -X';
        return cmd;
    }, [projectAccount, projectKey, currentBranch, link]);

    const serviceId = useMemo(() => `${selectedPath}::${effectiveCommand} `, [selectedPath, effectiveCommand]);
    const processState = activeProcesses[serviceId];
    const isRunning = processState?.status === 'running';
    const processStatus = processState?.status;

    const prevStatusRef = useRef<typeof processStatus>(undefined);
    useEffect(() => {
        if (prevStatusRef.current === 'running' && processStatus === 'stopped') {
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: sonarKeys.all });
                toast.success("Análisis completado.");
                setActiveTab('local');
            }, 3000);
        }
        prevStatusRef.current = processStatus;
    }, [processStatus, queryClient]);

    const handleRunAnalysis = async () => {
        if (!selectedPath || !effectiveCommand) return;
        addLog('cmd', `Ejecutando: ${effectiveCommand}`);
        setActiveTab('analysis');
        await executeProjectScript(selectedPath, effectiveCommand, { globalEnvName: 'none', incrementRestart: true });
    };

    const handleStop = async () => {
        try { await invoke('kill_service', { serviceId }); updateProcessStatus(serviceId, 'stopped'); } catch (_) { }
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-900 font-sans">
            <SonarHeader 
                isRunning={isRunning} 
                canRun={isProjectView} 
                onRun={handleRunAnalysis} 
                onStop={handleStop} 
            />

            <div className="flex-1 flex min-h-0 overflow-hidden">
                <SonarSidebar 
                    projects={projects} 
                    selectedPath={selectedPath} 
                    onSelectPath={setSelectedPath} 
                    onOpenSettings={() => setIsSettingsOpen(true)} 
                />

                <div className="flex-1 flex flex-col bg-[#020617] overflow-hidden">
                    {selectedPath === 'dashboard' ? (
                        <SonarDashboard projects={projects} onSelectProject={setSelectedPath} />
                    ) : selectedPath === 'config' ? (
                        <SonarAccountsManager />
                    ) : (
                        <Tabs value={activeTab} onValueChange={val => setActiveTab(val as any)} className="flex-1 flex flex-col min-h-0">
                            <div className="px-6 border-b border-white/5 flex items-center justify-between bg-slate-950/20 shrink-0">
                                <TabsList variant="line" className="h-10 gap-6 sm:gap-8">
                                    <TabsTrigger value="local" className="gap-2 px-0 text-[10px] font-black uppercase tracking-widest data-active:text-blue-400"><ShieldCheck size={14} /> Audit</TabsTrigger>
                                    <TabsTrigger value="server" className="gap-2 px-0 text-[10px] font-black uppercase tracking-widest data-active:text-blue-400"><Globe size={14} /> Cloud</TabsTrigger>
                                    <TabsTrigger value="rules" className="gap-2 px-0 text-[10px] font-black uppercase tracking-widest data-active:text-blue-400"><FileCode size={14} /> Rules</TabsTrigger>
                                    <TabsTrigger value="analysis" className="gap-2 px-0 text-[10px] font-black uppercase tracking-widest data-active:text-blue-400"><TerminalSquare size={14} /> Terminal</TabsTrigger>
                                </TabsList>
                                <Badge variant="outline" className="bg-slate-900 text-[8px] font-mono border-white/5 text-slate-500 px-3 py-1 uppercase rounded-md tracking-widest font-black leading-none">{projectKey}</Badge>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8">
                                {activeTab === 'analysis' ? (
                                    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-500">
                                        <div className="bg-[#05070a] p-4 rounded-2xl border border-white/5 font-mono text-[10px] text-blue-300 flex items-center gap-4 relative group">
                                            <span className="text-blue-500 font-black opacity-40 select-none">$</span>
                                            <span className="flex-1 break-all leading-relaxed text-left">{effectiveCommand}</span>
                                            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className="h-8 w-8 text-slate-500 hover:text-blue-400 shrink-0 hover:bg-white/5 rounded-lg"><Settings size={14} /></Button>
                                        </div>
                                        <div className="flex-1 border border-white/5 rounded-2xl overflow-hidden bg-black/40">
                                            <TerminalView serviceId={serviceId} />
                                        </div>
                                    </div>
                                ) : activeTab === 'rules' ? (
                                    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-500 text-left">
                                        <div className="flex items-center justify-between shrink-0">
                                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reglas del Servidor ({rules.length})</h3>
                                        </div>
                                        
                                        {loadingRules ? (
                                            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-700">
                                                <RefreshCw className="animate-spin" size={24} strokeWidth={1} />
                                                <p className="text-[10px] font-black uppercase tracking-widest leading-none">Cargando Catálogo...</p>
                                            </div>
                                        ) : rules.length === 0 ? (
                                            <div className="grid grid-cols-1 gap-2">
                                                <div className="p-4 bg-slate-900/40 border border-white/5 rounded-xl text-xs text-slate-400 italic">
                                                    No se encontraron reglas activas para <span className="text-blue-400 font-bold">{projectKey}</span>.
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                                <div className="space-y-3">
                                                    {rules.map((rule: any) => (
                                                        <div key={rule.key} className="p-4 bg-slate-900/10 border border-white/5 rounded-2xl hover:bg-white/5 transition-all group">
                                                            <div className="flex items-start justify-between gap-6">
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="text-[11px] font-bold text-slate-200 mb-2 truncate group-hover:text-blue-400 transition-colors uppercase tracking-tight">{rule.name}</h4>
                                                                    <div className="flex items-center gap-2">
                                                                        <Badge variant="outline" className="text-[8px] font-mono uppercase px-2 py-0.5 border-white/5 bg-slate-950 text-slate-500 rounded-md">{rule.langName || rule.lang}</Badge>
                                                                        <Badge variant="outline" className={cn("text-[8px] font-black uppercase px-2 py-0.5 border-none rounded-md", 
                                                                            rule.severity === 'BLOCKER' || rule.severity === 'CRITICAL' ? "bg-red-500/10 text-red-400" :
                                                                            rule.severity === 'MAJOR' ? "bg-orange-500/10 text-orange-400" : "bg-blue-500/10 text-blue-400"
                                                                        )}>{rule.severity}</Badge>
                                                                        <Badge variant="outline" className="text-[8px] font-black uppercase px-2 py-0.5 border-white/5 bg-slate-900/50 text-slate-600 rounded-md">{rule.type}</Badge>
                                                                    </div>
                                                                </div>
                                                                <span className="text-[8px] font-mono text-slate-800 group-hover:text-slate-600 transition-colors shrink-0 pt-1">{rule.key}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-10 animate-in fade-in duration-700">
                                        {loadingMetrics ? (
                                            <div className="flex flex-col items-center py-40 gap-4 text-slate-700">
                                                <RefreshCw className="animate-spin" size={32} strokeWidth={1} />
                                                <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando...</p>
                                            </div>
                                        ) : metrics && (
                                            <>
                                                <div className="grid grid-cols-3 gap-6">
                                                    <SonarMetricCard label="Bugs" value={metrics.bugs} rating={metrics.reliability} icon={Bug} colorClass="text-red-400" />
                                                    <SonarMetricCard label="Vulnerabilidades" value={metrics.vulnerabilities} rating={metrics.security} icon={ShieldAlert} colorClass="text-yellow-400" />
                                                    <SonarMetricCard label="Code Smells" value={metrics.codeSmells} rating={metrics.maintainability} icon={FileSearch} colorClass="text-blue-400" />
                                                </div>
                                                
                                                <div className="pt-8 border-t border-white/5">
                                                    <div className="flex items-center justify-between mb-8">
                                                        <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em]">Detalle de Hallazgos ({issues.length})</h3>
                                                        <Badge className="bg-blue-500/10 text-blue-400 border-white/5 text-[8px] uppercase px-2 py-0.5 rounded-md">Varios Severidades</Badge>
                                                    </div>
                                                    
                                                    <div className="space-y-3">
                                                        {issues.length === 0 ? (
                                                            <div className="py-20 flex flex-col items-center justify-center bg-slate-900/10 border border-dashed border-white/5 rounded-[2rem] text-slate-700 gap-4">
                                                                <Check size={40} strokeWidth={1} className="opacity-10" />
                                                                <p className="text-[10px] font-black uppercase tracking-widest">Reporte Limpio</p>
                                                            </div>
                                                        ) : SEVERITY_ORDER.map(s => {
                                                            const group = issues.filter(i => i.severity === s);
                                                            if (group.length === 0) return null;
                                                            const style = SEV_STYLE[s];
                                                            return (
                                                                <div key={s} className={cn("rounded-2xl border overflow-hidden transition-all bg-slate-900/20", style.border)}>
                                                                    <div className={cn("px-4 py-2 flex items-center justify-between", style.bg)}>
                                                                        <span className={cn("text-[9px] font-black uppercase tracking-widest", style.text)}>{s} ({group.length})</span>
                                                                    </div>
                                                                    <div className="divide-y divide-white/5 bg-slate-900/10">
                                                                        {group.map(i => (
                                                                            <div key={i.key} className="px-6 py-3 hover:bg-white/5 transition-colors cursor-pointer group/item">
                                                                                <div className="flex items-start gap-4 text-left">
                                                                                    <Badge className={cn("shrink-0 text-[8px] font-black uppercase h-5 px-2 rounded-md", style.bg, style.text)}>{i.type}</Badge>
                                                                                    <div className="flex-1 min-w-0 space-y-1">
                                                                                        <p className="text-xs text-slate-200 font-medium truncate">{i.message}</p>
                                                                                        <p className="text-[9px] text-slate-600 font-mono truncate">{i.component}:{i.line}</p>
                                                                                    </div>
                                                                                    <ExternalLink size={12} className="text-slate-700 group-hover/item:text-blue-400 transition-all shrink-0 mt-1" />
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

            <SonarSettingsDialog 
                isOpen={isSettingsOpen} 
                onOpenChange={setIsSettingsOpen} 
                link={link} 
                onLinkChange={(patch) => linkProject(selectedPath, { ...link, ...patch })} 
            />

            <SonarActivityConsole 
                isOpen={isConsoleOpen} 
                onToggle={() => setIsConsoleOpen(!isConsoleOpen)} 
                logs={debugLogs} 
            />

            {remediatingIssue && (
                <SonarIssueRemediator 
                    isOpen={!!remediatingIssue} 
                    issue={remediatingIssue} 
                    projectPath={selectedPath} 
                    onClose={() => setRemediatingIssue(null)} 
                />
            )}
        </div>
    );
};
