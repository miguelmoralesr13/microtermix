import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
    BarChart3, Play, Square, Settings,
    TerminalSquare, ShieldCheck, AlertCircle, LayoutDashboard,
    Activity, RefreshCw, ChevronDown, ChevronRight,
    Bug, ShieldAlert, FileSearch, Waves, Copy, Search, X,
    ExternalLink,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useProcessStore } from '../stores/processStore';
import { TerminalView } from './TerminalView';
import { useGitStore } from '../stores/gitStore';
import { Badge } from './ui/badge';
import { useSonarStore } from '../stores/sonarStore';
import { SonarIssueRemediator } from './SonarIssueRemediator';
import { SonarDashboard } from './sonar/SonarDashboard';
import { getSonarAuthHeader, normalizeSonarUrl } from '../utils/sonarUtils';
import { useSonarMetrics, useSonarIssues, useSonarProjectSearch, sonarKeys, SonarIssue } from '../hooks/queries/useSonarQueries';
import { useQueryClient } from '@tanstack/react-query';

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

const QGBadge: React.FC<{ status?: 'OK' | 'ERROR' | 'NONE' }> = ({ status }) => {
    if (!status || status === 'NONE')
        return <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-600 font-bold">—</span>;
    return status === 'OK'
        ? <span className="text-[9px] px-1 py-0.5 rounded bg-microtermix-success/20 text-microtermix-success font-bold">OK</span>
        : <span className="text-[9px] px-1 py-0.5 rounded bg-microtermix-danger/20 text-microtermix-danger font-bold">ERR</span>;
};

const MetricCard: React.FC<{
    label: string; value: string | number; rating?: string;
    icon: React.ElementType; colorClass: string;
}> = ({ label, value, rating, icon: Icon, colorClass }) => (
    <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex items-center gap-4 hover:border-slate-700 transition-all">
        <div className="p-3 rounded-lg bg-slate-800">
            <Icon className={colorClass} size={22} />
        </div>
        <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
            <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-200">{value}</span>
                {rating && (
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${rating === 'A' ? 'bg-microtermix-success/20 text-microtermix-success' : rating === 'B' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-microtermix-danger/20 text-microtermix-danger'}`}>
                        {rating}
                    </span>
                )}
            </div>
        </div>
    </div>
);

const DirectKeyForm: React.FC<{ onLink: (key: string) => void }> = ({ onLink }) => {
    const [val, setVal] = useState('');
    return (
        <div className="flex gap-2">
            <input
                type="text"
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onLink(val.trim()); setVal(''); } }}
                placeholder="my-project-key"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-blue-500 outline-none"
            />
            <button
                onClick={() => { if (val.trim()) { onLink(val.trim()); setVal(''); } }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg"
            >
                Vincular
            </button>
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const SonarPanel: React.FC = () => {
    const { state, executeProjectScript } = useWorkspace();
    const activeProcesses = useProcessStore(s => s.activeProcesses);
    const updateProcessStatus = useProcessStore(s => s.updateProcessStatus);
    const repos = useGitStore(s => s.repos);
    const queryClient = useQueryClient();

    const sonarConfig = useSonarStore(s => s.config);
    const setSonarConfig = useSonarStore(s => s.setConfig);
    const projectLinks = useSonarStore(s => s.projectLinks);
    const linkProject = useSonarStore(s => s.linkProject);

    const projects = state.projects;

    // ── Selection
    const [selectedPath, setSelectedPath] = useState<string>(() => {
        const saved = localStorage.getItem(STORAGE_SONAR_PATH);
        if (saved && (saved === 'dashboard' || projects.some(p => p.path === saved))) return saved;
        return 'dashboard';
    });

    const [remediatingIssue, setRemediatingIssue] = useState<SonarIssue | null>(null);
    const [configModalOpen, setConfigModalOpen] = useState(false);

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
    const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'issues'>(() => {
        const saved = localStorage.getItem(STORAGE_SONAR_TAB);
        return (saved === 'overview' || saved === 'analysis' || saved === 'issues') ? saved : 'overview';
    });
    useEffect(() => { localStorage.setItem(STORAGE_SONAR_TAB, activeTab); }, [activeTab]);

    // -- Queries --
    const { data: metrics, isLoading: loadingMetrics } = useSonarMetrics(selectedPath !== 'dashboard' ? projectKey : undefined);
    const { data: issues = [], isLoading: loadingIssues } = useSonarIssues(selectedPath !== 'dashboard' && activeTab === 'issues' ? projectKey : undefined);

    const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean | null; message: string } | null>(null);

    // ── Auto-link search
    const [searchingFor, setSearchingFor] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const { data: searchResults } = useSonarProjectSearch(searchQuery, !!searchingFor);

    const baseUrl = useMemo(() => normalizeSonarUrl(sonarConfig.serverUrl), [sonarConfig.serverUrl]);

    const currentBranch = useMemo(() => {
        if (!selectedPath || selectedPath === 'dashboard') return null;
        return repos[selectedPath]?.status.currentBranch || null;
    }, [selectedPath, repos]);

    const scanCommand = useMemo(() => {
        const { token, organization } = sonarConfig;
        let cmd = `npx sonar-scanner -Dsonar.projectKey=${projectKey} -Dsonar.host.url=${baseUrl} -Dsonar.token=${token}`;
        if (organization) cmd += ` -Dsonar.organization=${organization}`;
        if (currentBranch) cmd += ` -Dsonar.branch.name=${currentBranch}`;
        return cmd;
    }, [sonarConfig, baseUrl, projectKey, currentBranch]);

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

    const handleTestConnection = useCallback(async () => {
        if (!sonarConfig.token || !sonarConfig.serverUrl) {
            setTestResult({ ok: false, message: 'Completa Server URL y Token.' });
            return;
        }
        const testBase = normalizeSonarUrl(sonarConfig.serverUrl);
        const testAuth = getSonarAuthHeader(sonarConfig.authType, sonarConfig.token);
        const url = `${testBase}/api/authentication/validate`;
        setTestResult({ ok: null, message: 'Probando conexión...' });
        try {
            const resp = await tauriFetch(url, { headers: { Authorization: testAuth } });
            if (!resp.ok) {
                setTestResult({ ok: false, message: `HTTP ${resp.status} — Token inválido o URL incorrecta.` });
                return;
            }
            const data = await resp.json() as any;
            if (data.valid) {
                setTestResult({ ok: true, message: 'Token válido ✓.' });
            } else {
                setTestResult({ ok: false, message: 'El servidor responde pero el token no es válido.' });
            }
        } catch (e) {
            setTestResult({ ok: false, message: `Error de red: ${e}` });
        }
    }, [sonarConfig]);

    const handleLinkProject = useCallback((projectPath: string, result: SonarProjectResult) => {
        linkProject(projectPath, { projectKey: result.key });
        queryClient.invalidateQueries({ queryKey: sonarKeys.metrics(result.key) });
        setSearchingFor(null);
        addLog('info', `Vinculado → key: "${result.key}"`);
    }, [linkProject, queryClient, addLog]);

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

    const issuesByGroup = useMemo(() => {
        const map: Record<string, SonarIssue[]> = {};
        SEVERITY_ORDER.forEach(s => { map[s] = []; });
        issues.forEach(i => { map[i.severity]?.push(i); });
        return map;
    }, [issues]);

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
                    <button
                        onClick={() => setConfigModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition-colors"
                    >
                        <Settings size={13} /> Configuración
                    </button>
                    <button
                        onClick={isRunning ? handleStop : handleRunAnalysis}
                        disabled={!selectedPath || !projectKey || selectedPath === 'dashboard'}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-md ${isRunning
                            ? 'bg-microtermix-danger hover:bg-red-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed'}`}
                    >
                        {isRunning ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                        {isRunning ? 'Detener' : 'Run Analysis'}
                    </button>
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
                            className={`flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors border-l-2 mb-1 border-b border-b-slate-800/50 ${
                                selectedPath === 'dashboard'
                                    ? 'bg-blue-500/10 border-blue-500'
                                    : 'border-transparent hover:bg-slate-800/40 hover:border-slate-600'
                            }`}
                        >
                            <p className={`text-xs font-bold truncate ${selectedPath === 'dashboard' ? 'text-blue-400' : 'text-slate-300'}`}>
                                📊 Dashboard General
                            </p>
                        </div>

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
                                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors border-l-2 group ${selectedPath === path
                                        ? 'bg-blue-500/10 border-blue-500'
                                        : 'border-transparent hover:bg-slate-800/40 hover:border-slate-600'}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-medium truncate ${selectedPath === path ? 'text-blue-400' : 'text-slate-300'}`}>{name}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {!linked && <span className="text-[9px] text-slate-600 italic">sin vincular</span>}
                                            {running && <span className="w-1.5 h-1.5 rounded-full bg-microtermix-success animate-pulse" />}
                                        </div>
                                    </div>
                                    <button onClick={e => { e.stopPropagation(); setSearchingFor(path); setSearchQuery(name); }} className="p-1 rounded text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100"><Search size={12} /></button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {selectedPath === 'dashboard' ? (
                    <SonarDashboard projects={projects} onSelectProject={setSelectedPath} />
                ) : selectedPath ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="shrink-0 px-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                            <div className="flex">
                                {([['overview', LayoutDashboard, 'Overview'], ['analysis', TerminalSquare, 'Análisis'], ['issues', AlertCircle, 'Issues']] as const).map(([tab, Icon, label]) => (
                                    <button key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                                        <Icon size={13} />{label}
                                    </button>
                                ))}
                            </div>
                            {currentBranch && <div className="pr-3 flex items-center gap-1.5"><span className="text-[9px] font-bold text-slate-500 uppercase">Branch:</span><Badge variant="secondary" className="text-[10px] bg-slate-800 text-blue-400 border-blue-500/30">{currentBranch}</Badge></div>}
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {activeTab === 'overview' && (
                                <div className="space-y-5">
                                    {loadingMetrics ? (
                                        <div className="flex flex-col items-center py-20 gap-3 text-slate-500">
                                            <RefreshCw className="animate-spin" size={32} />
                                            <p className="text-xs font-bold uppercase tracking-widest animate-pulse">Obteniendo métricas...</p>
                                        </div>
                                    ) : metrics ? (
                                        <>
                                            <div className={`p-5 rounded-2xl border flex items-center justify-between ${metrics.qualityGate === 'OK' ? 'bg-microtermix-success/10 border-microtermix-success/30' : 'bg-microtermix-danger/10 border-microtermix-danger/30'}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-3 rounded-xl ${metrics.qualityGate === 'OK' ? 'bg-microtermix-success/20' : 'bg-microtermix-danger/20'}`}>
                                                        <ShieldCheck size={28} className={metrics.qualityGate === 'OK' ? 'text-microtermix-success' : 'text-microtermix-danger'} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-base font-black text-slate-200">Quality Gate {metrics.qualityGate}</h3>
                                                        <p className="text-xs text-slate-400 font-mono">{projectKey}</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => openUrl(`${baseUrl}/dashboard?id=${projectKey}`)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition-colors">
                                                    <ExternalLink size={13} /> Ver en Sonar
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-3 gap-4">
                                                <MetricCard label="Bugs" value={metrics.bugs} rating={metrics.reliability} icon={Bug} colorClass="text-microtermix-danger" />
                                                <MetricCard label="Vulnerabilidades" value={metrics.vulnerabilities} rating={metrics.security} icon={ShieldAlert} colorClass="text-yellow-400" />
                                                <MetricCard label="Code Smells" value={metrics.codeSmells} rating={metrics.maintainability} icon={FileSearch} colorClass="text-blue-400" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-5">
                                                    <div className="flex items-center justify-between mb-3"><h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Waves size={14} className="text-blue-400" /> Cobertura</h4><span className="text-2xl font-black text-slate-200">{metrics.coverage}%</span></div>
                                                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800"><div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${metrics.coverage}%` }} /></div>
                                                </div>
                                                <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-5">
                                                    <div className="flex items-center justify-between mb-3"><h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Copy size={14} className="text-yellow-400" /> Duplicaciones</h4><span className="text-2xl font-black text-slate-200">{metrics.duplications}%</span></div>
                                                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800"><div className="h-full bg-yellow-500 transition-all duration-700" style={{ width: `${Math.min(metrics.duplications * 5, 100)}%` }} /></div>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-20 bg-slate-950/20 border-2 border-dashed border-slate-800 rounded-3xl">
                                            <Activity size={40} className="text-slate-700 mb-4" />
                                            <p className="text-slate-400 font-medium">No hay métricas disponibles</p>
                                            <p className="text-xs text-slate-600 mt-1 max-w-xs text-center">Ejecuta un análisis o configura tu token para traer los datos del servidor.</p>
                                            <button onClick={() => queryClient.invalidateQueries({ queryKey: sonarKeys.metrics(projectKey) })} className="mt-6 px-4 py-2 bg-slate-800 text-xs font-bold rounded-xl hover:bg-slate-700 text-slate-300 flex items-center gap-2 transition-all">
                                                <RefreshCw size={14} /> Refrescar ahora
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'analysis' && (
                                <div className="h-full flex flex-col gap-4">
                                    <div className="shrink-0 p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                                        <div className="bg-black/40 p-2.5 rounded border border-slate-900 font-mono text-[11px] text-slate-200 break-all select-all">$ {scanCommand}</div>
                                    </div>
                                    {reportUrl && (
                                        <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-microtermix-success/10 border border-microtermix-success/30 rounded-xl">
                                            <ShieldCheck size={16} className="text-microtermix-success shrink-0" />
                                            <div className="flex-1 min-w-0"><p className="text-xs font-bold text-microtermix-success">Análisis completado</p><p className="text-[10px] font-mono text-slate-400 truncate">{reportUrl}</p></div>
                                            <button onClick={() => openUrl(reportUrl)} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-microtermix-success text-slate-900 text-xs font-black rounded-lg hover:bg-green-400 transition-colors"><ExternalLink size={13} /> Ver reporte</button>
                                        </div>
                                    )}
                                    <div className="flex-1 min-[200px] border border-slate-800 rounded-xl overflow-hidden">
                                        <TerminalView serviceId={serviceId} />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'issues' && (
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
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">Selecciona un proyecto para comenzar</div>
                )}
            </div>

            {/* Config Modal */}
            {configModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                            <div>
                                <h3 className="text-sm font-black text-slate-200 uppercase tracking-tight">Configuración Global Sonar</h3>
                                <p className="text-[10px] text-slate-500">Configura tu servidor y credenciales</p>
                            </div>
                            <button onClick={() => setConfigModalOpen(false)} className="p-1 hover:bg-slate-800 rounded-full transition-colors">
                                <X size={18} className="text-slate-500" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setSonarConfig({ serverUrl: 'https://sonarcloud.io', authType: 'bearer' })}
                                className={`py-2 text-[10px] font-bold rounded-xl border transition-all ${sonarConfig.serverUrl.includes('sonarcloud.io') ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                            >
                                SonarCloud (Public)
                            </button>
                            <button
                                onClick={() => setSonarConfig({ authType: 'basic' })}
                                className={`py-2 text-[10px] font-bold rounded-xl border transition-all ${!sonarConfig.serverUrl.includes('sonarcloud.io') ? 'bg-orange-600/20 border-orange-500 text-orange-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                            >
                                SonarQube (Private/Local)
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Server URL</label>
                                <input type="text" value={sonarConfig.serverUrl} onChange={e => setSonarConfig({ serverUrl: e.target.value })} placeholder="https://sonarcloud.io o http://localhost:9000" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 transition-colors" />
                            </div>

                            {sonarConfig.serverUrl.includes('sonarcloud.io') && (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Organización (Solo SonarCloud)</label>
                                    <input type="text" value={sonarConfig.organization || ''} onChange={e => setSonarConfig({ organization: e.target.value })} placeholder="mi-organizacion" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 transition-colors" />
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Token de Acceso</label>
                                <input type="password" value={sonarConfig.token} onChange={e => setSonarConfig({ token: e.target.value })} placeholder="squ_..." className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 transition-colors" />
                            </div>

                            <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-slate-200 uppercase">Tipo de Autenticación</span>
                                    <span className="text-[9px] text-slate-500 tracking-tight">Cloud usa Bearer, On-Premise suele usar Basic</span>
                                </div>
                                <select
                                    value={sonarConfig.authType}
                                    onChange={e => setSonarConfig({ authType: e.target.value as any })}
                                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none cursor-pointer"
                                >
                                    <option value="basic">HTTP Basic</option>
                                    <option value="bearer">Bearer Token</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={handleTestConnection}
                                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 hover:bg-slate-700 transition-colors"
                            >
                                Probar Conexión
                            </button>
                            <button
                                onClick={() => { setConfigModalOpen(false); }}
                                className="px-6 py-2.5 bg-blue-600 text-white text-xs font-black rounded-xl hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20"
                            >
                                Guardar Configuración
                            </button>
                        </div>

                        {testResult && (
                            <div className={`text-xs p-3 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-1 ${testResult.ok ? 'bg-green-900/20 text-green-400 border border-green-500/20' : 'bg-red-900/20 text-red-400 border border-red-500/20'}`}>
                                {testResult.ok ? <ShieldCheck size={14} /> : <AlertCircle size={14} />}
                                <span className="font-medium">{testResult.message}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Auto-link modal */}
            {searchingFor && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="flex justify-between items-center"><h3 className="text-sm font-bold text-slate-200">Vincular con Sonar</h3><button onClick={() => setSearchingFor(null)}><X size={15} /></button></div>
                        <div className="flex gap-2"><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearchQuery()} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200" placeholder="Nombre en Sonar..." /><button onClick={handleSearchQuery} className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg">Buscar</button></div>
                        {searchResults && <div className="space-y-1.5">{searchResults.map(r => <button key={r.key} onClick={() => handleLinkProject(searchingFor, r)} className="w-full text-left px-3 py-2 bg-slate-800 hover:bg-blue-600/20 border border-slate-700 rounded-lg"><p className="text-xs font-bold text-slate-200">{r.name}</p><p className="text-[10px] font-mono text-slate-500">{r.key}</p></button>)}</div>}
                        <div className="pt-2 border-t border-slate-800/60"><p className="text-[10px] font-bold text-slate-500 mb-2">Project Key directo:</p><DirectKeyForm onLink={key => handleLinkProject(searchingFor, { key, name: key })} /></div>
                    </div>
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
