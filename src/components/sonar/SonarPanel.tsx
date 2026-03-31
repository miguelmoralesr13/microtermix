import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SonarRule {
    key: string;
    name: string;
    type: string;
}

interface SonarProjectResult {
    key: string;
    name: string;
}

interface DebugLog {
    id: string;
    timestamp: string;
    type: 'info' | 'error' | 'network' | 'cmd';
    message: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SEVERITY_ORDER: SonarIssue['severity'][] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
const SEV_STYLE: Record<string, { bg: string; text: string; border: string }> = {
    BLOCKER: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
    CRITICAL: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
    MAJOR: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    MINOR: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-600/30' },
    INFO: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_SONAR_PATH = 'microtermix-sonar-selected-path';
const STORAGE_SONAR_TAB = 'microtermix-sonar-active-tab';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function extractReportUrl(logs: string[]): string | null {
    for (let i = logs.length - 1; i >= 0; i--) {
        const match = stripAnsi(logs[i]).match(/you can find the results at:\s*(https?:\/\/\S+)/i);
        if (match) return match[1];
    }
    return null;
}

// ─── Small components ─────────────────────────────────────────────────────────

const MetricCard: React.FC<{
    label: string; value: string | number; rating?: string;
    icon: React.ElementType; colorClass: string;
}> = ({ label, value, rating, icon: Icon, colorClass }) => (
    <Card className="bg-slate-950/50 border-slate-800 p-4 flex items-center gap-4 hover:border-slate-700 transition-all shadow-none">
        <div className="p-3 rounded-lg bg-slate-800">
            <Icon className={colorClass} size={22} />
        </div>
        <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
            <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-200">{value}</span>
                {rating && (
                    <span className={cn(
                        "text-xs font-bold px-1.5 py-0.5 rounded",
                        rating === 'A' ? 'bg-microtermix-success/20 text-microtermix-success' :
                            rating === 'B' ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-microtermix-danger/20 text-microtermix-danger'
                    )}>
                        {rating}
                    </span>
                )}
            </div>
        </div>
    </Card>
);

const DirectKeyForm: React.FC<{ onLink: (key: string) => void }> = ({ onLink }) => {
    const [val, setVal] = useState('');
    return (
        <div className="flex gap-2">
            <Input
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onLink(val.trim()); setVal(''); } }}
                placeholder="my-project-key"
                className="flex-1 font-mono text-xs"
            />
            <Button
                onClick={() => { if (val.trim()) { onLink(val.trim()); setVal(''); } }}
                size="sm"
            >
                Vincular
            </Button>
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const SonarPanel: React.FC = () => {
    const { state, executeProjectScript } = useWorkspace();
    const activeProcesses = useProcessStore(s => s.activeProcesses);
    const updateProcessStatus = useProcessStore(s => s.updateProcessStatus);
    const queryClient = useQueryClient();

    const accounts = useSonarStore(s => s.accounts);
    const activeAccountId = useSonarStore(s => s.activeAccountId);
    const getProjectAccount = useSonarStore(s => s.getProjectAccount);
    const setActiveAccount = useSonarStore(s => s.setActiveAccount);
    const addAccount = useSonarStore(s => s.addAccount);
    const updateAccount = useSonarStore(s => s.updateAccount);
    const removeAccount = useSonarStore(s => s.removeAccount);
    const projectLinks = useSonarStore(s => s.projectLinks);
    const linkProject = useSonarStore(s => s.linkProject);

    const projects = state.projects;

    // ── Selection
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
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!selectedPath && projects.length > 0) setSelectedPath('dashboard');
    }, [projects, selectedPath]);

    useEffect(() => {
        if (selectedPath) localStorage.setItem(STORAGE_SONAR_PATH, selectedPath);
    }, [selectedPath]);

    // Per-project: project key + token
    const link = projectLinks[selectedPath] || {};
    const projectKey = link.projectKey || (projects.find(p => p.path === selectedPath)?.name as string || '');

    // ── UI
    const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'issues' | 'rules'>(() => {
        const saved = localStorage.getItem(STORAGE_SONAR_TAB);
        return (saved === 'overview' || saved === 'analysis' || saved === 'issues' || saved === 'rules') ? saved : 'overview';
    });
    useEffect(() => { localStorage.setItem(STORAGE_SONAR_TAB, activeTab); }, [activeTab]);

    // -- Queries --
    const isProjectView = selectedPath !== 'dashboard' && selectedPath !== 'config';
    const { data: metrics, isLoading: loadingMetrics } = useSonarMetrics(isProjectView ? selectedPath : undefined, isProjectView ? projectKey : undefined);
    const { data: issues = [], isLoading: loadingIssues } = useSonarIssues(isProjectView ? selectedPath : undefined, isProjectView && activeTab === 'issues' ? projectKey : undefined);

    const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean | null; message: string } | null>(null);

    // ── Auto-link search
    const [searchingFor, setSearchingFor] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const { data: searchResults } = useSonarProjectSearch(searchQuery, !!searchingFor);

    const [rulesSearchQuery, setRulesSearchQuery] = useState('');
    const { data: rules = [], isLoading: loadingRules } = useSonarRules(isProjectView ? selectedPath : undefined, isProjectView ? projectKey : undefined, rulesSearchQuery);

    const baseUrl = useMemo(() => normalizeSonarUrl(projectAccount?.serverUrl), [projectAccount?.serverUrl]);

    // Get Git status for the current branch
    const { data: gitStatus } = useGitStatus(selectedPath !== 'dashboard' && selectedPath !== 'config' ? selectedPath : null);
    const currentBranch = gitStatus?.currentBranch || null;

    const scanCommand = useMemo(() => {
        if (!projectAccount) return '';
        const { token, organization } = projectAccount;

        const {
            customCommand = 'sonar-scanner',
            includeProjectKey = true,
            includeHostUrl = true,
            includeToken = true,
            includeOrganization = true,
            includeBranch = true
        } = link;

        let cmd = customCommand;
        if (includeProjectKey) cmd += ` -Dsonar.projectKey=${projectKey}`;
        if (includeHostUrl) cmd += ` -Dsonar.host.url=${baseUrl}`;
        if (includeToken) cmd += ` -Dsonar.token=${token}`;
        if (includeOrganization && organization) cmd += ` -Dsonar.organization=${organization}`;
        if (includeBranch && currentBranch) cmd += ` -Dsonar.branch.name=${currentBranch}`;

        return cmd;
    }, [projectAccount, baseUrl, projectKey, currentBranch, link]);

    const serviceId = useMemo(() => `${selectedPath}::${scanCommand} `, [selectedPath, scanCommand]);
    const processState = activeProcesses[serviceId];
    const isRunning = processState?.status === 'running';
    const processStatus = processState?.status;

    const reportUrl = useMemo(() => {
        const logs = processState?.logs ?? [];
        return extractReportUrl(logs);
    }, [processState?.logs]);

    const addLog = useCallback((type: DebugLog['type'], message: string) => {
        setDebugLogs(prev => [
            { id: Math.random().toString(36).substring(7), timestamp: new Date().toLocaleTimeString(), type, message },
            ...prev.slice(0, 99),
        ]);
    }, []);

    const handleSearchQuery = useCallback(() => {
        if (!searchQuery.trim()) return;
        queryClient.invalidateQueries({ queryKey: sonarKeys.search(projectAccount?.id || 'none', searchQuery) });
    }, [searchQuery, queryClient, projectAccount]);

    const handleTestConnection = useCallback(async (accountToTest?: SonarAccount) => {
        const target = accountToTest || projectAccount;
        if (!target?.token || !target?.serverUrl) {
            setTestResult({ ok: false, message: 'Completa Server URL y Token.' });
            return;
        }
        const testBase = normalizeSonarUrl(target.serverUrl);
        const testAuth = getSonarAuthHeader(target.authType, target.token);
        const url = `${testBase}/api/authentication/validate`;
        setTestResult({ ok: null, message: 'Probando conexión...' });
        try {
            const response = await invoke('execute_http_request', {
                request: {
                    url,
                    method: 'GET',
                    headers: { Authorization: testAuth },
                    body: null
                }
            }) as any;

            if (response.is_error) {
                setTestResult({ ok: false, message: `Error nativo: ${response.error_msg}` });
                return;
            }

            if (response.status >= 400) {
                setTestResult({ ok: false, message: `HTTP ${response.status} — Token inválido o URL incorrecta.` });
                return;
            }

            const data = JSON.parse(response.body);
            if (data.valid) {
                setTestResult({ ok: true, message: 'Token válido ✓.' });
            } else {
                setTestResult({ ok: false, message: 'El servidor responde pero el token no es válido.' });
            }
        } catch (e: any) {
            setTestResult({ ok: false, message: `Error de red: ${e.message || e}` });
        }
    }, [projectAccount]);

    const handleLinkProject = useCallback((projectPath: string, result: SonarProjectResult) => {
        linkProject(projectPath, { ...projectLinks[projectPath], projectKey: result.key });
        queryClient.invalidateQueries({ queryKey: sonarKeys.metrics(projectAccount?.id || 'none', result.key) });
        setSearchingFor(null);
        addLog('info', `Vinculado → key: "${result.key}"`);
    }, [linkProject, queryClient, addLog, projectLinks, projectAccount]);

    const prevStatusRef = useRef<typeof processStatus>(undefined);
    useEffect(() => {
        if (prevStatusRef.current === 'running' && processStatus === 'stopped') {
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: sonarKeys.all });
            }, 3000);
        }
        prevStatusRef.current = processStatus;
    }, [processStatus, queryClient]);

    const handleRunAnalysis = async () => {
        if (!selectedPath || !projectKey) return;
        addLog('cmd', `Starting: ${scanCommand}`);
        setActiveTab('analysis');
        await executeProjectScript(selectedPath, scanCommand, { globalEnvName: 'none', incrementRestart: true });
    };

    const handleStop = async () => {
        addLog('info', 'Stopping analysis...');
        try { await invoke('kill_service', { serviceId }); updateProcessStatus(serviceId, 'stopped'); } catch (_) { }
    };

    const mapperIssues = () => {
        const map: Record<string, SonarIssue[]> = {};
        SEVERITY_ORDER.forEach(s => { map[s] = []; });
        issues.forEach(i => { map[i.severity]?.push(i); });
        return map;
    };

    const issuesByGroup = useMemo(mapperIssues, [issues]);

    const renderConfigTab = () => {
        const current = accounts.find(a => a.id === activeAccountId) || accounts[0];
        if (!current) return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4">
                <Settings size={48} className="opacity-20" />
                <p className="text-sm font-bold uppercase tracking-widest">No hay cuentas configuradas</p>
                <Button onClick={() => addAccount({ ...DEFAULT_SONAR_ACCOUNT, id: crypto.randomUUID(), name: 'Nueva Cuenta' })}>
                    <Plus size={16} className="mr-2" /> Añadir Primera Cuenta
                </Button>
            </div>
        );

        return (
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Lista de Cuentas */}
                <div className="w-64 shrink-0 border-r border-slate-800 bg-slate-950/20 flex flex-col">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cuentas</h3>
                        <Button
                            variant="ghost" size="icon"
                            onClick={() => addAccount({ ...DEFAULT_SONAR_ACCOUNT, id: crypto.randomUUID(), name: 'Nueva Cuenta' })}
                            className="h-7 w-7 text-blue-400"
                        >
                            <Plus size={16} />
                        </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {accounts.map(acc => (
                            <div
                                key={acc.id}
                                onClick={() => setActiveAccount(acc.id)}
                                className={cn(
                                    "group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border",
                                    activeAccountId === acc.id
                                        ? "bg-blue-600/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-600/5"
                                        : "bg-transparent border-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                )}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    {acc.serverUrl.includes('sonarcloud.io') ? <Globe size={14} /> : <Server size={14} />}
                                    <span className="text-xs font-bold truncate">{acc.name}</span>
                                </div>
                                {accounts.length > 1 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeAccount(acc.id); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all font-bold"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Formulario de Edición */}
                <div className="flex-1 overflow-y-auto bg-slate-900/30">
                    <div className="max-w-2xl mx-auto p-8 space-y-8">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
                            <div>
                                <h2 className="text-xl font-black text-slate-100 tracking-tight">Configuración de Cuenta</h2>
                                <p className="text-xs text-slate-500 mt-1">Personaliza el acceso a tu instancia de SonarQube</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleTestConnection(current)} className="border-slate-700 bg-slate-800 hover:bg-slate-700">
                                    <RefreshCw size={14} className="mr-2" /> Probar Conexión
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Amigable</Label>
                                <Input
                                    value={current.name}
                                    onChange={e => updateAccount(current.id, { name: e.target.value })}
                                    placeholder="Ej: Producción, Mi Clon Local..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Auth</Label>
                                <Select
                                    value={current.authType}
                                    onValueChange={val => updateAccount(current.id, { authType: val as any })}
                                >
                                    <SelectTrigger className="w-full h-11 bg-slate-950 border-slate-800">
                                        <SelectValue placeholder="Selecciona tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="basic">HTTP Basic (Server Auth)</SelectItem>
                                        <SelectItem value="bearer">Bearer Token (SonarCloud)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Server URL</Label>
                            <Input
                                value={current.serverUrl}
                                onChange={e => updateAccount(current.id, { serverUrl: e.target.value })}
                                placeholder="https://sonarcloud.io o http://localhost:9000"
                                className="font-mono bg-slate-950 border-slate-800"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Token de Acceso</Label>
                            <Input
                                type="password"
                                value={current.token}
                                onChange={e => updateAccount(current.id, { token: e.target.value })}
                                placeholder="squ_..."
                                className="font-mono bg-slate-950 border-slate-800"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Organización (Opcional)</Label>
                            <Input
                                value={current.organization || ''}
                                onChange={e => updateAccount(current.id, { organization: e.target.value })}
                                placeholder="mi-organizacion (Requerido en SonarCloud)"
                                className="bg-slate-950 border-slate-800"
                            />
                        </div>

                        {testResult && (
                            <div className={cn(
                                "p-4 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200 border",
                                testResult.ok
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                    : "bg-red-500/10 border-red-500/20 text-red-400"
                            )}>
                                {testResult.ok ? <ShieldCheck size={20} /> : <AlertCircle size={20} />}
                                <div className="flex-1">
                                    <p className="text-[11px] font-black uppercase tracking-tight">{testResult.ok ? 'Conexión Exitosa' : 'Error de Conexión'}</p>
                                    <p className="text-xs font-medium opacity-80">{testResult.message}</p>
                                </div>
                                {testResult.ok && <Check size={20} className="text-emerald-500" />}
                            </div>
                        )}

                        <Card className="bg-slate-950/40 p-4 border-slate-800/50 flex items-center justify-between shadow-none">
                            <div className="flex items-center gap-2 text-slate-500">
                                <ShieldCheck size={16} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Persistencia Activa</span>
                            </div>
                            <span className="text-[10px] font-medium leading-tight max-w-[280px] text-right text-slate-500">
                                Estos cambios se guardan automáticamente en tu archivo <b>microtermix.json</b>.
                            </span>
                        </Card>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-900">
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <BarChart3 className="text-blue-400" size={20} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-slate-200">SonarQube / SonarCloud</h2>
                        <p className="text-[10px] text-slate-500">Análisis de calidad y seguridad de código</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={isRunning ? handleStop : handleRunAnalysis}
                        disabled={!selectedPath || !projectKey || selectedPath === 'dashboard' || selectedPath === 'config'}
                        variant={isRunning ? "destructive" : "default"}
                        size="sm"
                        className="shadow-md font-bold px-4 h-9"
                    >
                        {isRunning ? <Square size={13} fill="currentColor" className="mr-1.5" /> : <Play size={13} fill="currentColor" className="mr-1.5" />}
                        {isRunning ? 'Detener' : 'Run Analysis'}
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex min-h-0 overflow-hidden">
                <div className="w-56 shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950/30">
                    <div className="shrink-0 px-3 py-2 border-b border-slate-800/60 bg-slate-950/50">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vistas y Proyectos</p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <div
                            onClick={() => setSelectedPath('dashboard')}
                            className={cn(
                                "flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors border-l-2 mb-1 border-b border-b-slate-800/50",
                                selectedPath === 'dashboard'
                                    ? 'bg-blue-500/10 border-blue-500'
                                    : 'border-transparent hover:bg-slate-800/40 hover:border-slate-600'
                            )}
                        >
                            <p className={cn("text-xs font-bold truncate", selectedPath === 'dashboard' ? 'text-blue-400' : 'text-slate-300')}>
                                📊 Dashboard General
                            </p>
                        </div>

                        <div
                            onClick={() => setSelectedPath('config')}
                            className={cn(
                                "flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors border-l-2 mb-1 border-b border-b-slate-800/50",
                                selectedPath === 'config'
                                    ? 'bg-orange-500/10 border-orange-500'
                                    : 'border-transparent hover:bg-slate-800/40 hover:border-slate-600'
                            )}
                        >
                            <p className={cn("text-xs font-bold truncate", selectedPath === 'config' ? 'text-orange-400' : 'text-slate-300')}>
                                ⚙️ Configuración
                            </p>
                        </div>

                        <div className="h-px bg-slate-800/60 my-2" />

                        {projects.map(p => {
                            const path = p.path as string;
                            const name = p.name as string;
                            const savedLink = projectLinks[path] || {};
                            const linked = !!savedLink.projectKey;
                            const running = path === selectedPath && isRunning;
                            return (
                                <div
                                    key={path}
                                    onClick={() => setSelectedPath(path)}
                                    className={cn(
                                        "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors border-l-2 group",
                                        selectedPath === path
                                            ? 'bg-blue-500/10 border-blue-500'
                                            : 'border-transparent hover:bg-slate-800/40 hover:border-slate-600'
                                    )}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className={cn("text-xs font-medium truncate", selectedPath === path ? 'text-blue-400' : 'text-slate-300')}>{name}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {!linked && <span className="text-[9px] text-slate-600 italic">sin vincular</span>}
                                            {running && <span className="w-1.5 h-1.5 rounded-full bg-microtermix-success animate-pulse" />}
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); setSearchingFor(path); setSearchQuery(name); }} className="h-7 w-7 text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100 h-6 w-6"><Search size={12} /></Button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 bg-slate-900/30">
                    {selectedPath === 'config' ? (
                        renderConfigTab()
                    ) : selectedPath === 'dashboard' ? (
                        <SonarDashboard projects={projects} onSelectProject={setSelectedPath} />
                    ) : selectedPath ? (
                        <Tabs
                            value={activeTab}
                            onValueChange={val => setActiveTab(val as any)}
                            className="flex-1 flex flex-col min-h-0"
                        >
                            <div className="shrink-0 px-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                                <TabsList variant="line" className="h-9">
                                    <TabsTrigger value="overview" className="gap-1.5 px-3 py-2 text-xs font-semibold h-full data-active:text-blue-400">
                                        <LayoutDashboard size={13} /> Overview
                                    </TabsTrigger>
                                    <TabsTrigger value="analysis" className="gap-1.5 px-3 py-2 text-xs font-semibold h-full data-active:text-blue-400">
                                        <TerminalSquare size={13} /> Análisis
                                    </TabsTrigger>
                                    <TabsTrigger value="issues" className="gap-1.5 px-3 py-2 text-xs font-semibold h-full data-active:text-blue-400">
                                        <AlertCircle size={13} /> Issues
                                    </TabsTrigger>
                                    <TabsTrigger value="rules" className="gap-1.5 px-3 py-2 text-xs font-semibold h-full data-active:text-blue-400">
                                        <ShieldCheck size={13} /> Reglas
                                    </TabsTrigger>
                                </TabsList>
                                <div className="pr-3 flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase">Cuenta:</span>
                                        <Select
                                            value={projectAccount?.id || (activeAccountId ?? undefined)}
                                            onValueChange={(newAccountId) => {
                                                linkProject(selectedPath, {
                                                    ...link,
                                                    projectKey,
                                                    accountId: (newAccountId === 'none' || newAccountId === null) ? undefined : newAccountId
                                                });
                                            }}
                                        >
                                            <SelectTrigger className="bg-slate-800 border-slate-700 h-7 text-[10px] text-blue-400 min-w-[140px]">
                                                <SelectValue placeholder="Global por defecto" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Global por defecto</SelectItem>
                                                {accounts.map(acc => (
                                                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {currentBranch && <div className="flex items-center gap-1.5"><span className="text-[9px] font-bold text-slate-500 uppercase">Branch:</span><Badge variant="secondary" className="text-[10px] bg-slate-800 text-blue-400 border-blue-500/30">{currentBranch}</Badge></div>}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5">
                                <TabsContent value="overview" className="m-0 border-none outline-none">
                                    <div className="space-y-5">
                                        {loadingMetrics ? (
                                            <div className="flex flex-col items-center py-20 gap-3 text-slate-500">
                                                <RefreshCw className="animate-spin" size={32} />
                                                <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Obteniendo métricas...</p>
                                            </div>
                                        ) : metrics ? (
                                            <>
                                                <Card className={cn(
                                                    "p-5 border-none shadow-none flex items-center justify-between",
                                                    metrics.qualityGate === 'OK' ? 'bg-microtermix-success/10' : 'bg-microtermix-danger/10'
                                                )}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn(
                                                            "p-3 rounded-xl",
                                                            metrics.qualityGate === 'OK' ? 'bg-microtermix-success/20' : 'bg-microtermix-danger/20'
                                                        )}>
                                                            <ShieldCheck size={28} className={metrics.qualityGate === 'OK' ? 'text-microtermix-success' : 'text-microtermix-danger'} />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-base font-black text-slate-200">Quality Gate {metrics.qualityGate}</h3>
                                                            <p className="text-xs text-slate-400 font-mono">{projectKey}</p>
                                                        </div>
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={() => openUrl(`${baseUrl}/dashboard?id=${projectKey}`)} className="bg-slate-800 hover:bg-slate-700 border-slate-700">
                                                        <ExternalLink size={13} className="mr-1.5" /> Ver en Sonar
                                                    </Button>
                                                </Card>
                                                <div className="grid grid-cols-3 gap-4">
                                                    <MetricCard label="Bugs" value={metrics.bugs} rating={metrics.reliability} icon={Bug} colorClass="text-microtermix-danger" />
                                                    <MetricCard label="Vulnerabilidades" value={metrics.vulnerabilities} rating={metrics.security} icon={ShieldAlert} colorClass="text-yellow-400" />
                                                    <MetricCard label="Code Smells" value={metrics.codeSmells} rating={metrics.maintainability} icon={FileSearch} colorClass="text-blue-400" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <Card className="bg-slate-950/40 border-slate-800 p-5 shadow-none">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                                <Waves size={14} className="text-blue-400" /> Cobertura
                                                            </h4>
                                                            <span className="text-2xl font-black text-slate-200">{metrics.coverage}%</span>
                                                        </div>
                                                        <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                                            <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${metrics.coverage}%` }} />
                                                        </div>
                                                    </Card>
                                                    <Card className="bg-slate-950/40 border-slate-800 p-5 shadow-none">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                                <Copy size={14} className="text-yellow-400" /> Duplicaciones
                                                            </h4>
                                                            <span className="text-2xl font-black text-slate-200">{metrics.duplications}%</span>
                                                        </div>
                                                        <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                                            <div className="h-full bg-yellow-500 transition-all duration-700" style={{ width: `${Math.min(metrics.duplications * 5, 100)}%` }} />
                                                        </div>
                                                    </Card>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-20 bg-slate-950/20 border-2 border-dashed border-slate-800 rounded-3xl">
                                                <Activity size={40} className="text-slate-700 mb-4" />
                                                <p className="text-slate-400 font-medium">No hay métricas disponibles</p>
                                                <p className="text-xs text-slate-600 mt-1 max-w-xs text-center">Ejecuta un análisis o configura tu token para traer los datos del servidor.</p>
                                                <Button onClick={() => queryClient.invalidateQueries({ queryKey: sonarKeys.metrics(projectAccount?.id || 'none', projectKey) })} variant="secondary" size="sm" className="mt-6 flex items-center gap-2">
                                                    <RefreshCw size={14} /> Refrescar ahora
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>

                                <TabsContent value="analysis" className="m-0 border-none outline-none h-full">
                                    <div className="h-full flex flex-col gap-4">
                                        <Card className="shrink-0 p-4 bg-slate-950/50 border-slate-800 shadow-none flex flex-col gap-4">
                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                                                <div className="flex flex-col gap-1.5 min-w-[200px] flex-1">
                                                    <Label className="text-[10px] text-slate-500 uppercase font-black tracking-widest pl-0.5">Base Command</Label>
                                                    <Input
                                                        value={link.customCommand || 'sonar-scanner'}
                                                        onChange={e => linkProject(selectedPath, { ...link, customCommand: e.target.value })}
                                                        className="h-8 bg-black/40 font-mono text-[11px] border-slate-800"
                                                        placeholder="sonar-scanner"
                                                    />
                                                </div>
                                                <div className="flex flex-wrap items-center gap-4 pt-4">
                                                    <Checkbox
                                                        label="Key"
                                                        checked={link.includeProjectKey ?? true}
                                                        onChange={e => linkProject(selectedPath, { ...link, includeProjectKey: e.target.checked })}
                                                    />
                                                    <Checkbox
                                                        label="Host"
                                                        checked={link.includeHostUrl ?? true}
                                                        onChange={e => linkProject(selectedPath, { ...link, includeHostUrl: e.target.checked })}
                                                    />
                                                    <Checkbox
                                                        label="Token"
                                                        checked={link.includeToken ?? true}
                                                        onChange={e => linkProject(selectedPath, { ...link, includeToken: e.target.checked })}
                                                    />
                                                    <Checkbox
                                                        label="Org"
                                                        checked={link.includeOrganization ?? true}
                                                        onChange={e => linkProject(selectedPath, { ...link, includeOrganization: e.target.checked })}
                                                    />
                                                    <Checkbox
                                                        label="Branch"
                                                        checked={link.includeBranch ?? true}
                                                        onChange={e => linkProject(selectedPath, { ...link, includeBranch: e.target.checked })}
                                                    />
                                                </div>
                                            </div>
                                            <div className="bg-black/40 p-2.5 rounded border border-slate-950 font-mono text-[11px] text-slate-400 break-all select-all flex items-start gap-2">
                                                <span className="text-blue-500 shrink-0 select-none">$</span>
                                                <span>{scanCommand}</span>
                                            </div>
                                        </Card>
                                        {reportUrl && (
                                            <Card className="shrink-0 flex items-center gap-3 px-4 py-3 bg-microtermix-success/10 border-microtermix-success/30 shadow-none">
                                                <ShieldCheck size={16} className="text-microtermix-success shrink-0" />
                                                <div className="flex-1 min-w-0"><p className="text-xs font-bold text-microtermix-success">Análisis completado</p><p className="text-[10px] font-mono text-slate-400 truncate">{reportUrl}</p></div>
                                                <Button onClick={() => { openUrl(reportUrl); setActiveTab('overview'); }} size="sm" className="bg-microtermix-success text-slate-900 hover:bg-green-400 font-black h-8">
                                                    <ExternalLink size={13} className="mr-1.5" /> Ver reporte
                                                </Button>
                                            </Card>
                                        )}
                                        <div className="flex-1 min-[200px] border border-slate-800 rounded-xl overflow-hidden">
                                            <TerminalView serviceId={serviceId} />
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="issues" className="m-0 border-none outline-none">
                                    <div className="space-y-3">
                                        {loadingIssues && <div className="flex flex-col items-center py-16 gap-4"><RefreshCw className="text-blue-400 animate-spin" size={24} /><p className="text-xs text-slate-500 font-bold uppercase animate-pulse">Cargando issues...</p></div>}
                                        {!loadingIssues && SEVERITY_ORDER.map(severity => {
                                            const group = issuesByGroup[severity];
                                            if (!group || group.length === 0) return null;
                                            const s = SEV_STYLE[severity];
                                            const collapsed = collapsedGroups.has(severity);
                                            return (
                                                <div key={severity} className={`rounded-xl border ${s.border} overflow-hidden`}>
                                                    <button onClick={() => setCollapsedGroups(prev => { const next = new Set(prev); collapsed ? next.delete(severity) : next.add(severity); return next; })} className={`w-full flex items-center justify-between px-4 py-2.5 ${s.bg}`}>
                                                        <div className="flex items-center gap-2"><span className={`text-xs font-black uppercase ${s.text}`}>{severity}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.border} ${s.text}`}>{group.length}</span></div>
                                                        {collapsed ? <ChevronRight size={13} className={s.text} /> : <ChevronDown size={13} className={s.text} />}
                                                    </button>
                                                    {!collapsed && <div className="divide-y divide-slate-800/40">{group.map(i => (
                                                        <div
                                                            key={i.key}
                                                            onClick={() => setRemediatingIssue(i)}
                                                            className="px-4 py-2.5 hover:bg-slate-800/30 cursor-pointer transition-colors group/issue"
                                                        >
                                                            <div className="flex items-start gap-2">
                                                                <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase mt-0.5 ${s.bg} ${s.text}`}>{i.type}</span>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-xs text-slate-200 leading-snug group-hover/issue:text-white transition-colors">{i.message}</p>
                                                                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate group-hover/issue:text-slate-400">
                                                                        {i.component}{i.line ? `:${i.line}` : ''}
                                                                    </p>
                                                                </div>
                                                                <ExternalLink size={12} className="shrink-0 text-slate-700 opacity-0 group-hover/issue:opacity-100 transition-all" />
                                                            </div>
                                                        </div>
                                                    ))}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                 </TabsContent>

                                <TabsContent value="rules" className="flex-1 overflow-hidden m-0 p-4 outline-none">
                                    <div className="h-full flex flex-col gap-4">
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                                <Input 
                                                    placeholder="Buscar reglas por nombre o clave..." 
                                                    value={rulesSearchQuery}
                                                    onChange={e => setRulesSearchQuery(e.target.value)}
                                                    className="pl-9 h-9 bg-slate-950 border-slate-800"
                                                />
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => setRulesSearchQuery('')} className="shrink-0 h-9">Limpiar</Button>
                                        </div>

                                        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1 custom-scrollbar">
                                            {loadingRules ? (
                                                <div className="flex flex-col items-center justify-center h-48 gap-4">
                                                    <RefreshCw className="text-blue-400 animate-spin" size={24} />
                                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest animate-pulse">Cargando catálogo de reglas...</p>
                                                </div>
                                            ) : rules.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-16 text-slate-500 italic bg-slate-900/20 rounded-xl border border-dashed border-slate-800">
                                                    <FileSearch size={24} className="mb-3 opacity-20" />
                                                    <p className="text-xs">No se encontraron reglas aplicables.</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 gap-2">
                                                    {rules.map((rule: any) => (
                                                        <Card key={rule.key} className="bg-slate-900/40 border-slate-800 shadow-none hover:border-slate-700 transition-colors group">
                                                            <CardContent className="p-3">
                                                                <div className="flex items-start justify-between gap-4">
                                                                    <div className="min-w-0">
                                                                        <h4 className="text-[11px] font-bold text-slate-200 group-hover:text-blue-400 transition-colors leading-tight">{rule.name}</h4>
                                                                        <p className="text-[9px] font-mono text-slate-500 mt-1">{rule.key}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <Badge variant="outline" className={cn(
                                                                            "text-[8px] h-4 uppercase font-black tracking-widest",
                                                                            rule.severity === 'BLOCKER' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                                                            rule.severity === 'CRITICAL' ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' :
                                                                            rule.severity === 'MAJOR' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                                                                            'bg-slate-500/10 border-slate-500/30 text-slate-400'
                                                                        )}>
                                                                            {rule.severity}
                                                                        </Badge>
                                                                        <Badge variant="outline" className="text-[8px] h-4 uppercase font-black tracking-widest bg-blue-500/10 border-blue-500/30 text-blue-400">
                                                                            {(rule.type || 'CODE_SMELL').replace('_', ' ')}
                                                                        </Badge>
                                                                    </div>
                                                                </div>
                                                                <p className="text-[9px] text-slate-400 mt-2 flex items-center gap-1.5">
                                                                    {rule.langName && (
                                                                        <>
                                                                            <span className="font-bold text-slate-500 uppercase tracking-tighter">{rule.langName}</span>
                                                                            <span className="w-0.5 h-0.5 rounded-full bg-slate-700" />
                                                                        </>
                                                                    )}
                                                                    <span className={cn(
                                                                        "font-black uppercase tracking-widest",
                                                                        rule.status === 'READY' ? 'text-emerald-500/80' : 'text-slate-600'
                                                                    )}>{rule.status}</span>
                                                                </p>
                                                            </CardContent>
                                                        </Card>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TabsContent>
                            </div>
                        </Tabs>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">Selecciona un proyecto para comenzar</div>
                    )}
                </div>
            </div>

            {/* Auto-link modal */}
            {searchingFor && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <Card className="w-full max-w-md bg-slate-900 border-slate-800 p-0 overflow-hidden shadow-2xl">
                        <CardHeader className="flex flex-row justify-between items-center px-5 py-4 border-b border-slate-800">
                            <CardTitle className="text-sm font-bold text-slate-200">Vincular con Sonar</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setSearchingFor(null)} className="h-8 w-8 text-slate-400">
                                <X size={15} />
                            </Button>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4">
                            <div className="flex gap-2">
                                <Input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSearchQuery()}
                                    placeholder="Nombre en Sonar..."
                                    className="bg-slate-950 border-slate-800"
                                />
                                <Button onClick={handleSearchQuery} size="sm">Buscar</Button>
                            </div>
                            {searchResults && (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {searchResults.map((r: any) => (
                                        <button
                                            key={r.key}
                                            onClick={() => handleLinkProject(searchingFor, r)}
                                            className="w-full text-left px-3 py-2 bg-slate-800/50 hover:bg-blue-600/20 border border-slate-800 rounded-lg transition-colors group"
                                        >
                                            <p className="text-xs font-bold text-slate-200 group-hover:text-blue-400">{r.name}</p>
                                            <p className="text-[10px] font-mono text-slate-500">{r.key}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="pt-4 border-t border-slate-800/60">
                                <p className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Project Key directo:</p>
                                <DirectKeyForm onLink={key => handleLinkProject(searchingFor, { key, name: key })} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Activity Console */}
            <div className={`shrink-0 border-t border-slate-800 bg-slate-950 transition-all flex flex-col ${isConsoleOpen ? 'h-48' : 'h-8'}`}>
                <div onClick={() => setIsConsoleOpen(!isConsoleOpen)} className="h-8 px-4 flex items-center justify-between cursor-pointer"><div className="flex items-center gap-2"><TerminalSquare size={12} className={isConsoleOpen ? 'text-orange-500' : 'text-slate-600'} /><span className="text-[10px] font-bold text-slate-600">Activity Console</span></div><ChevronDown size={13} className={`text-slate-600 transition-transform ${isConsoleOpen ? '' : 'rotate-180'}`} /></div>
                {isConsoleOpen && <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] bg-[#0a0c10]">{debugLogs.map(l => <div key={l.id} className="flex gap-2"><span className="text-slate-700">[{l.timestamp}]</span><span className={`font-bold uppercase ${l.type === 'error' ? 'text-red-500' : 'text-blue-400'}`}>{l.type}:</span><span className="text-slate-400">{l.message}</span></div>)}</div>}
            </div>

            {/* Modal de Remediación de Issues (3 Paneles) con shadcn/ui */}
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
