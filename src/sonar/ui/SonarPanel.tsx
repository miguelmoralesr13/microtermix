import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    Settings, Globe, TerminalSquare,
    Bug, ShieldAlert, FileSearch, Check, ExternalLink, RefreshCw, Copy
} from 'lucide-react';

import { useWorkspace } from '@/context/WorkspaceContext';
import { useProcessStore } from '@/stores/processStore';
import { useSonarStore, type SonarProjectLink } from '@/stores/sonarStore';
import { useQueryClient } from '@tanstack/react-query';

import { Terminal } from '@/components/ui/terminal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { normalizeSonarUrl } from '../domain';
import {
    useSonarMetrics, useSonarIssues, sonarKeys, useSonarLocalConfig
} from '@/hooks/queries/useSonarQueries';
import { useGitStatus } from '@/hooks/queries/useGitQueries';
import type { SonarIssue } from '../domain';
import { SEVERITY_ORDER } from '../domain';

// Sub-components
import { SonarHeader } from './components/SonarHeader';
import { SonarSidebar } from './components/SonarSidebar';
import { SonarSettingsDialog } from './components/SonarSettingsDialog';
import { SonarActivityConsole } from './components/SonarActivityConsole';
import { SonarDashboard } from './SonarDashboard';
import { SonarAccountsManager } from './SonarAccountsManager';
import { SonarIssueRemediator } from './SonarIssueRemediator';

const SEV_STYLE: Record<string, { bg: string; text: string; border: string; badge: string }> = {
    BLOCKER: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', badge: 'destructive' },
    CRITICAL: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', badge: 'destructive' },
    MAJOR: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', badge: 'secondary' },
    MINOR: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-600/30', badge: 'outline' },
    INFO: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30', badge: 'outline' },
};

const TYPE_ICONS: Record<string, React.ElementType> = {
    BUG: Bug,
    VULNERABILITY: ShieldAlert,
    CODE_SMELL: FileSearch,
};

const STORAGE_SONAR_PATH = 'microtermix-sonar-selected-path';
const STORAGE_SONAR_TAB = 'microtermix-sonar-active-tab';

/** Compact metric display for the header bar */
const MetricBadge: React.FC<{ label: string; value: string | number; rating?: string; icon: React.ElementType; color: string }> = ({
    label, value, rating, icon: Icon, color
}) => (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded border border-border/50">
        <Icon size={11} className={color} />
        <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
            <span className="text-xs font-bold text-foreground">{value}</span>
            {rating && (
                <Badge variant="outline" className={cn(
                    "h-4 px-1 text-[9px] font-bold",
                    rating === 'A' ? "text-emerald-400 border-emerald-500/30" :
                    rating === 'B' ? "text-yellow-400 border-yellow-500/30" :
                    rating === 'C' ? "text-orange-400 border-orange-500/30" :
                    "text-red-400 border-red-500/30"
                )}>{rating}</Badge>
            )}
        </div>
    </div>
);

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

    const link = (projectLinks[selectedPath] || {}) as Partial<SonarProjectLink>;
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
        return cloudIssues.filter(i => (i.projectKey || '').trim().toLowerCase() === targetKey);
    }, [cloudIssues, projectKey]);

    // Auto-export report
    useEffect(() => {
        if (activeTab === 'server' && issues.length > 0 && isProjectView) {
            const saveReport = async () => {
                try {
                    const relativeDir = '.microtermix/sonar';
                    await invoke('ensure_directory', { base: selectedPath, path: relativeDir });
                    const simplified = {
                        projectKey,
                        lastUpdate: new Date().toISOString(),
                        total: issues.length,
                        issues: issues.map(i => ({ message: i.message, severity: i.severity, type: i.type, file: i.component, line: i.line }))
                    };
                    await invoke('write_file_content', {
                        base: selectedPath, file: `${relativeDir}/report.json`,
                        content: JSON.stringify(simplified, null, 2)
                    });
                } catch (e) { console.error('[Sonar] Error saving report:', e); }
            };
            saveReport();
        }
    }, [activeTab, issues, isProjectView, selectedPath, projectKey]);

    const loadingMetrics = activeTab === 'server' ? loadingCloudMetrics : false;

    const [debugLogs, setDebugLogs] = useState<{ id: string, timestamp: string, type: string, message: string }[]>([]);
    const addLog = useCallback((type: string, message: string) => {
        setDebugLogs(prev => [{ id: Math.random().toString(36), timestamp: new Date().toLocaleTimeString(), type, message }, ...prev.slice(0, 50)]);
    }, []);

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

    // ── Compact issues table row ──
    const IssueRow: React.FC<{ issue: SonarIssue }> = ({ issue }) => {
        const style = SEV_STYLE[issue.severity] || SEV_STYLE.INFO;
        const TypeIcon = TYPE_ICONS[issue.type] || FileSearch;
        const file = issue.component?.split(':').pop() || issue.component || '';
        return (
            <TableRow
                onClick={() => setRemediatingIssue(issue)}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
            >
                <TableCell className="py-1.5 px-2 w-8">
                    <TypeIcon size={12} className={style.text} />
                </TableCell>
                <TableCell className="py-1.5 px-2">
                    <Badge variant="outline" className={cn("h-4 px-1.5 text-[9px] font-bold", style.bg, style.text)}>
                        {issue.severity}
                    </Badge>
                </TableCell>
                <TableCell className="py-1.5 px-2 max-w-[300px]">
                    <span className="text-xs text-foreground truncate block" title={issue.message}>{issue.message}</span>
                </TableCell>
                <TableCell className="py-1.5 px-2">
                    <span className="text-[10px] text-muted-foreground font-mono truncate block" title={file}>{file}</span>
                </TableCell>
                <TableCell className="py-1.5 px-2 w-10 text-right">
                    <span className="text-[10px] text-muted-foreground font-mono">{issue.line || '-'}</span>
                </TableCell>
                <TableCell className="py-1.5 px-2 w-6">
                    <ExternalLink size={11} className="text-muted-foreground/50 hover:text-blue-400 transition-colors" />
                </TableCell>
            </TableRow>
        );
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-background font-sans">
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

                <div className="flex-1 flex flex-col bg-background overflow-hidden">
                    {selectedPath === 'dashboard' ? (
                        <SonarDashboard projects={projects} onSelectProject={setSelectedPath} />
                    ) : selectedPath === 'config' ? (
                        <SonarAccountsManager />
                    ) : (
                        <Tabs value={activeTab} onValueChange={val => setActiveTab(val as 'server' | 'analysis')} className="flex-1 flex flex-col min-h-0">
                            {/* Tab bar + toolbar */}
                            <div className="px-3 border-b border-border flex items-center justify-between bg-muted/10 shrink-0 h-9">
                                <TabsList variant="line" className="h-7 gap-4">
                                    <TabsTrigger value="server" className="gap-1.5 px-1 text-[9px] font-bold uppercase tracking-wide data-active:text-blue-400"><Globe size={12} /> Cloud</TabsTrigger>
                                    <TabsTrigger value="analysis" className="gap-1.5 px-1 text-[9px] font-bold uppercase tracking-wide data-active:text-blue-400"><TerminalSquare size={12} /> Terminal</TabsTrigger>
                                </TabsList>
                                <div className="flex items-center gap-1.5">
                                    {localConfig?.isLocal && (
                                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[8px] uppercase px-1.5 py-0 h-4 rounded">
                                            <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse mr-1" />
                                            Auto
                                        </Badge>
                                    )}
                                    <Button variant="ghost" size="sm" onClick={handleCopyUrl} className="h-5 px-1.5 text-[8px] font-bold uppercase text-muted-foreground hover:text-blue-400 hover:bg-blue-400/5 gap-1"><Copy size={9} /> API URL</Button>
                                    <Badge title={`Key: ${projectKey}`} variant="outline" className="bg-muted text-[8px] font-mono border-border text-muted-foreground px-1.5 py-0 h-4 uppercase rounded">{projectKey}</Badge>
                                </div>
                            </div>

                            <TabsContent value="server" className="flex-1 flex flex-col min-h-0 m-0 p-0 overflow-hidden">
                                {loadingMetrics ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                                        <RefreshCw className="animate-spin" size={20} strokeWidth={1.5} />
                                        <p className="text-[9px] font-bold uppercase tracking-widest">Sincronizando...</p>
                                    </div>
                                ) : metrics ? (
                                    <div className="flex-1 flex flex-col overflow-hidden">
                                        {/* Metrics bar */}
                                        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/10 shrink-0">
                                            <MetricBadge label="Bugs" value={metrics.bugs} rating={metrics.reliability} icon={Bug} color="text-red-400" />
                                            <MetricBadge label="Vulns" value={metrics.vulnerabilities} rating={metrics.security} icon={ShieldAlert} color="text-yellow-400" />
                                            <MetricBadge label="Smells" value={metrics.codeSmells} rating={metrics.maintainability} icon={FileSearch} color="text-blue-400" />
                                            <div className="flex-1" />
                                            <span className="text-[9px] text-muted-foreground font-bold">
                                                {issues.length} issues
                                            </span>
                                        </div>

                                        {/* Issues table */}
                                        <div className="flex-1 overflow-auto">
                                            {issues.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground/50">
                                                    <Check size={24} strokeWidth={1} />
                                                    <p className="text-[9px] font-bold uppercase tracking-widest">Sin issues</p>
                                                </div>
                                            ) : (
                                                <Accordion className="px-2 py-1">
                                                    {SEVERITY_ORDER.map(s => {
                                                        const group = issues.filter(i => i.severity === s);
                                                        if (group.length === 0) return null;
                                                        const style = SEV_STYLE[s];
                                                        return (
                                                            <AccordionItem key={s} value={s} className="border-border/50">
                                                                <AccordionTrigger className={cn("py-1 px-2 hover:no-underline", style.bg)}>
                                                                    <div className="flex items-center gap-2 w-full">
                                                                        <Badge variant="outline" className={cn("h-4 px-1.5 text-[9px] font-bold", style.bg, style.text)}>
                                                                            {s}
                                                                        </Badge>
                                                                        <span className="text-[10px] text-muted-foreground">{group.length} issues</span>
                                                                    </div>
                                                                </AccordionTrigger>
                                                                <AccordionContent className="p-0">
                                                                    <Table>
                                                                        <TableHeader>
                                                                            <TableRow className="border-border/50">
                                                                                <TableHead className="w-8 py-1 px-2 text-[9px] text-muted-foreground font-bold"></TableHead>
                                                                                <TableHead className="w-16 py-1 px-2 text-[9px] text-muted-foreground font-bold">Sev</TableHead>
                                                                                <TableHead className="py-1 px-2 text-[9px] text-muted-foreground font-bold">Message</TableHead>
                                                                                <TableHead className="py-1 px-2 text-[9px] text-muted-foreground font-bold">File</TableHead>
                                                                                <TableHead className="w-10 py-1 px-2 text-[9px] text-muted-foreground font-bold text-right">Line</TableHead>
                                                                                <TableHead className="w-6 py-1 px-2"></TableHead>
                                                                            </TableRow>
                                                                        </TableHeader>
                                                                        <TableBody>
                                                                            {group.map(i => <IssueRow key={i.key} issue={i} />)}
                                                                        </TableBody>
                                                                    </Table>
                                                                </AccordionContent>
                                                            </AccordionItem>
                                                        );
                                                    })}
                                                </Accordion>
                                            )}
                                        </div>
                                    </div>
                                ) : null}
                            </TabsContent>

                            <TabsContent value="analysis" className="flex-1 flex flex-col min-h-0 m-0 p-0 overflow-hidden">
                                <div className="flex flex-col h-full p-2 gap-1.5">
                                    {/* Command bar */}
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded border border-border/50 font-mono text-[10px] text-blue-400">
                                        <span className="text-blue-500/40 select-none shrink-0">$</span>
                                        <span className="flex-1 truncate">{effectiveCommand}</span>
                                        <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className="h-5 w-5 text-muted-foreground hover:text-blue-400 shrink-0 hover:bg-white/5 rounded"><Settings size={11} /></Button>
                                    </div>
                                    {/* Terminal */}
                                    <div className="flex-1 border border-border rounded overflow-hidden bg-muted/30">
                                        <Terminal
                                            key={serviceId}
                                            mode="log-stream"
                                            serviceId={serviceId}
                                            variant="full"
                                            autoClearOnRestart={true}
                                        />
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </div>

            <SonarSettingsDialog
                isOpen={isSettingsOpen}
                onOpenChange={setIsSettingsOpen}
                link={link}
                onLinkChange={(patch) => linkProject(selectedPath, { ...link, ...patch } as SonarProjectLink)}
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
