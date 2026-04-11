import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    Settings, Globe, TerminalSquare,
    Bug, ShieldAlert, FileSearch, Check, ExternalLink, RefreshCw
} from 'lucide-react';

import { useWorkspace } from '../../context/WorkspaceContext';
import { useProcessStore } from '../../stores/processStore';
import { useSonarStore } from '../../stores/sonarStore';
import { useQueryClient } from '@tanstack/react-query';

import { Terminal } from '@/components/ui/terminal';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';
import { normalizeSonarUrl } from '../../utils/sonarUtils';
import {
    useSonarMetrics, useSonarIssues, sonarKeys, SonarIssue, useSonarLocalConfig
} from '../../hooks/queries/useSonarQueries';
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
    const rawProjectKey = link.projectKey || (projects.find(p => p.path === selectedPath)?.name as string || '');
    const projectKey = rawProjectKey.trim();

    const [activeTab, setActiveTab] = useState<'server' | 'analysis'>(() => {
        const saved = localStorage.getItem(STORAGE_SONAR_TAB);
        return (saved === 'server' || saved === 'analysis') ? saved : 'server';
    });
    useEffect(() => { localStorage.setItem(STORAGE_SONAR_TAB, activeTab); }, [activeTab]);

    const isProjectView = selectedPath !== 'dashboard' && selectedPath !== 'config';

    const { data: localConfig } = useSonarLocalConfig(isProjectView ? selectedPath : undefined);
    const { data: metrics, isLoading: loadingCloudMetrics } = useSonarMetrics(isProjectView && activeTab === 'server' ? selectedPath : undefined, projectKey);
    const { data: cloudIssues = [] } = useSonarIssues(isProjectView ? selectedPath : undefined, projectKey);

    const issues = useMemo(() => {
        const targetKey = projectKey.trim().toLowerCase();
        return cloudIssues.filter(i => {
            return (i.projectKey || '').trim().toLowerCase() === targetKey;
        });
    }, [cloudIssues, projectKey]);

    // Exportación automática de reporte simplificado
    useEffect(() => {
        if (activeTab === 'server' && issues.length > 0 && isProjectView) {
            const saveReport = async () => {
                try {
                    const relativeDir = '.microtermix/sonar';
                    // El comando Rust espera (base, path)
                    await invoke('ensure_directory', { base: selectedPath, path: relativeDir });

                    const simplified = {
                        projectKey,
                        lastUpdate: new Date().toISOString(),
                        total: issues.length,
                        issues: issues.map(i => ({
                            message: i.message,
                            severity: i.severity,
                            type: i.type,
                            file: i.component,
                            line: i.line
                        }))
                    };

                    // El comando Rust espera (base, file, content)
                    await invoke('write_file_content', {
                        base: selectedPath,
                        file: `${relativeDir}/report.json`,
                        content: JSON.stringify(simplified, null, 2)
                    });
                    console.log(`[Sonar] Reporte guardado en ${selectedPath}/${relativeDir}/report.json`);
                } catch (e) {
                    console.error('[Sonar] Error guardando reporte:', e);
                }
            };
            saveReport();
        }
    }, [activeTab, issues, isProjectView, selectedPath, projectKey]);

    const loadingMetrics = activeTab === 'server' ? loadingCloudMetrics : false;

    const [debugLogs, setDebugLogs] = useState<{ id: string, timestamp: string, type: string, message: string }[]>([]);
    const addLog = useCallback((type: string, message: string) => {
        setDebugLogs(prev => [{ id: Math.random().toString(36), timestamp: new Date().toLocaleTimeString(), type, message }, ...prev.slice(0, 50)]);
    }, []);

    // Log del Fetch de Cloud
    useEffect(() => {
        if (activeTab === 'server' && isProjectView && projectAccount) {
            const baseUrl = normalizeSonarUrl(localConfig?.serverUrl || projectAccount.serverUrl);
            const url = `${baseUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`;
            addLog('api', `Fetch Cloud: ${url}`);
        }
    }, [activeTab, isProjectView, projectAccount, projectKey, localConfig, addLog]);

    const { data: gitStatus } = useGitStatus(isProjectView ? selectedPath : null);
    const currentBranch = gitStatus?.currentBranch || null;

    const effectiveCommand = useMemo(() => {
        if (!projectAccount) return '';
        const { token, organization, serverUrl } = projectAccount;
        let cmd = link.customCommand || 'sonar-scanner';

        if (link.propertiesFileName) {
            cmd += ` -Dproject.settings=${link.propertiesFileName}`;
            if (serverUrl && link.includeHostUrl) cmd += ` -Dsonar.host.url=${normalizeSonarUrl(serverUrl)}`;
            if (token && link.includeToken) cmd += ` -Dsonar.token=${token}`;
            if (organization && link.includeOrganization) cmd += ` -Dsonar.organization=${organization}`;
        } else {
            cmd += ` -Dsonar.projectKey=${projectKey}`;
            if (serverUrl) cmd += ` -Dsonar.host.url=${normalizeSonarUrl(serverUrl)}`;
            if (token) cmd += ` -Dsonar.token=${token}`;
            if (organization) cmd += ` -Dsonar.organization=${organization}`;
            if (link.includeBranch && currentBranch) cmd += ` -Dsonar.branch.name=${currentBranch}`;
            if (link.sources) cmd += ` -Dsonar.sources=${link.sources}`;
        }

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
                toast.success("Análisis completado.", { description: "Mostrando resultados del servidor..." });
                setActiveTab('server');
            }, 3000);
        }
        prevStatusRef.current = processStatus;
    }, [processStatus, queryClient]);

    const handleRunAnalysis = async () => {
        if (!selectedPath || !effectiveCommand) return;
        addLog('cmd', `Ejecutando: ${effectiveCommand}`);
        setActiveTab('analysis');
        await executeProjectScript(selectedPath, effectiveCommand, { globalEnvName: 'none', incrementRestart: true, source: 'sonar' });
    };

    const handleStop = async () => {
        try { await invoke('kill_service', { serviceId }); updateProcessStatus(serviceId, 'stopped'); } catch (_) { }
    };

    const handleCopyUrl = () => {
        const baseUrl = normalizeSonarUrl(localConfig?.serverUrl || projectAccount?.serverUrl || '');
        const url = `${baseUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`;
        invoke('rust_copy_to_clipboard', { text: url });
        toast.success("URL copiada al portapapeles");
    };

    const currentProject = useMemo(() => projects.find(p => p.path === selectedPath), [projects, selectedPath]);
    const projectName = currentProject?.name || '';

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-900 font-sans">
            <SonarHeader
                isRunning={isRunning}
                canRun={isProjectView}
                onRun={handleRunAnalysis}
                onStop={handleStop}
                onRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: sonarKeys.all });
                    toast.success("Datos de Sonar actualizados");
                }}
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
                                    <TabsTrigger value="server" className="gap-2 px-0 text-[10px] font-black uppercase tracking-widest data-active:text-blue-400"><Globe size={14} /> Cloud</TabsTrigger>
                                    <TabsTrigger value="analysis" className="gap-2 px-0 text-[10px] font-black uppercase tracking-widest data-active:text-blue-400"><TerminalSquare size={14} /> Terminal</TabsTrigger>
                                </TabsList>
                                <div className="flex items-center gap-2 text-left">
                                    {localConfig?.isLocal && (
                                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[8px] uppercase px-2 py-0.5 rounded-md flex items-center gap-1 group relative">
                                            <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                                            Auto-Config
                                            <div className="absolute top-full right-0 mt-2 p-2 bg-slate-900 border border-slate-800 rounded-lg text-[10px] text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none shadow-2xl">
                                                Usando server: <span className="text-blue-300 font-mono">{normalizeSonarUrl(localConfig.serverUrl || '')}</span>
                                            </div>
                                        </Badge>
                                    )}
                                    <Button variant="ghost" size="sm" onClick={handleCopyUrl} className="h-6 px-2 text-[8px] font-black uppercase text-slate-600 hover:text-blue-400 hover:bg-blue-400/5 gap-1"><ExternalLink size={10} /> API URL</Button>
                                    <Badge title={`Raw Key: ${projectKey}`} variant="outline" className="bg-slate-900 text-[8px] font-mono border-white/5 text-slate-500 px-3 py-1 uppercase rounded-md tracking-widest font-black leading-none">{projectKey}</Badge>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8">
                                {activeTab === 'analysis' ? (
                                    <div className="h-full flex flex-col gap-6 animate-in fade-in duration-500">
                                        <div className="bg-[#05070a] p-4 rounded-2xl border border-white/5 font-mono text-[10px] text-blue-300 flex items-center gap-4 relative group text-left">
                                            <span className="text-blue-500 font-black opacity-40 select-none">$</span>
                                            <span className="flex-1 break-all leading-relaxed">{effectiveCommand}</span>
                                            <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className="h-8 w-8 text-slate-500 hover:text-blue-400 shrink-0 hover:bg-white/5 rounded-lg"><Settings size={14} /></Button>
                                        </div>
                                        <div className="flex-1 border border-white/5 rounded-2xl overflow-hidden bg-black/40">
                                            <Terminal
                                                key={serviceId}
                                                mode="log-stream"
                                                serviceId={serviceId}
                                                variant="full"
                                                autoClearOnRestart={true}
                                            />
                                        </div>
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
                                                                            <div key={i.key} onClick={() => setRemediatingIssue(i)} className="px-6 py-3 hover:bg-white/5 transition-colors cursor-pointer group/item text-left">
                                                                                <div className="flex items-start gap-4">
                                                                                    <Badge className={cn("shrink-0 text-[8px] font-black uppercase h-5 px-2 rounded-md", style.bg, style.text)}>{i.type}</Badge>
                                                                                    <div className="flex-1 min-w-0 space-y-1">
                                                                                        <p className="text-xs text-slate-200 font-medium truncate">{i.message}</p>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="text-[9px] text-slate-600 font-mono truncate">{i.component}:{i.line}</span>
                                                                                        </div>
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
                projectPath={selectedPath}
                projectName={projectName}
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
