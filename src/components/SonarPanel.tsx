import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
    BarChart3, Play, Square, Settings,
    TerminalSquare, ShieldCheck, AlertCircle, LayoutDashboard,
    ListFilter, RefreshCw, ChevronDown, ChevronRight,
    Bug, ShieldAlert, FileSearch, Waves, Copy, Activity, Search, X,
    ExternalLink,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useProcessStore } from '../stores/processStore';
import { TerminalView } from './TerminalView';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectLink {
    projectKey?: string;
    token?: string;
}

interface GlobalSonarConfig {
    serverUrl: string;
    token: string;
    organization?: string;
    authType?: 'basic' | 'bearer';
}

interface SonarMetrics {
    qualityGate: 'OK' | 'ERROR' | 'NONE';
    reliability: string;
    security: string;
    maintainability: string;
    bugs: number;
    vulnerabilities: number;
    codeSmells: number;
    coverage: number;
    duplications: number;
}

interface SonarRule {
    key: string;
    name: string;
    severity: string;
    type: string;
    langName: string;
}

interface SonarIssue {
    key: string;
    severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
    type: string;
    message: string;
    component: string;
    line?: number;
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

// ─── Storage ──────────────────────────────────────────────────────────────────

const GLOBAL_KEY = 'nexus-sonar-global-config';
const METRICS_CACHE_KEY = 'nexus-sonar-metrics-cache';
const STORAGE_SONAR_PATH = 'nexus-sonar-selected-path';
const STORAGE_SONAR_TAB = 'nexus-sonar-active-tab';
const DEFAULT_GLOBAL: GlobalSonarConfig = { serverUrl: 'https://sonarcloud.io', token: '', authType: 'basic' };

function loadGlobalConfig(): GlobalSonarConfig {
    try {
        const raw = localStorage.getItem(GLOBAL_KEY);
        if (raw) return { ...DEFAULT_GLOBAL, ...JSON.parse(raw) };
    } catch (_) { }
    return { ...DEFAULT_GLOBAL };
}
function saveGlobalConfig(cfg: GlobalSonarConfig) {
    try { localStorage.setItem(GLOBAL_KEY, JSON.stringify(cfg)); } catch (_) { }
}

function loadMetricsCache(): Record<string, SonarMetrics> {
    try {
        const raw = localStorage.getItem(METRICS_CACHE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) { }
    return {};
}

const RULES_KEY = 'nexus-sonar-rules';
function loadRules(): SonarRule[] {
    try { const r = localStorage.getItem(RULES_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}

function issuesCacheKey(path: string) {
    return `nexus-sonar-issues-${path.replace(/[/\\:]/g, '_')}`;
}
function loadIssuesCache(path: string): SonarIssue[] {
    try { const r = localStorage.getItem(issuesCacheKey(path)); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveIssuesCache(path: string, items: SonarIssue[]) {
    try { localStorage.setItem(issuesCacheKey(path), JSON.stringify(items)); } catch { }
}

function linkKey(path: string) {
    return `nexus-sonar-link-${path.replace(/[/\\:]/g, '_')}`;
}
function loadLink(path: string): ProjectLink {
    try {
        const raw = localStorage.getItem(linkKey(path));
        if (raw) return JSON.parse(raw);
    } catch (_) { }
    return {};
}
function saveLink(path: string, link: ProjectLink) {
    try { localStorage.setItem(linkKey(path), JSON.stringify(link)); } catch (_) { }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function extractReportUrl(logs: string[]): string | null {
    for (let i = logs.length - 1; i >= 0; i--) {
        const match = stripAnsi(logs[i]).match(/you can find the results at:\s*(https?:\/\/\S+)/i);
        if (match) return match[1];
    }
    return null;
}

function extractLocalQG(logs: string[]): 'PASSED' | 'FAILED' | null {
    for (let i = logs.length - 1; i >= 0; i--) {
        const clean = stripAnsi(logs[i]).toUpperCase();
        if (clean.includes('QUALITY GATE STATUS: PASSED')) return 'PASSED';
        if (clean.includes('QUALITY GATE STATUS: FAILED') || clean.includes('QUALITY GATE STATUS: ERROR')) return 'FAILED';
    }
    return null;
}

// ─── Small components ─────────────────────────────────────────────────────────

const QGBadge: React.FC<{ status?: 'OK' | 'ERROR' | 'NONE' }> = ({ status }) => {
    if (!status || status === 'NONE')
        return <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-600 font-bold">—</span>;
    return status === 'OK'
        ? <span className="text-[9px] px-1 py-0.5 rounded bg-nexus-success/20 text-nexus-success font-bold">OK</span>
        : <span className="text-[9px] px-1 py-0.5 rounded bg-nexus-danger/20 text-nexus-danger font-bold">ERR</span>;
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
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${rating === 'A' ? 'bg-nexus-success/20 text-nexus-success' : rating === 'B' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-nexus-danger/20 text-nexus-danger'}`}>
                        {rating}
                    </span>
                )}
            </div>
        </div>
    </div>
);

const SEVERITY_ORDER: SonarIssue['severity'][] = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
const SEV_STYLE: Record<string, { bg: string; text: string; border: string }> = {
    BLOCKER: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
    CRITICAL: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
    MAJOR: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    MINOR: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-600/30' },
    INFO: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
};

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
    
    const projects = state.projects;

    // ── Selection
    const [selectedPath, setSelectedPath] = useState<string>(() => {
        const saved = localStorage.getItem(STORAGE_SONAR_PATH);
        if (saved && projects.some(p => p.path === saved)) return saved;
        return projects.length > 0 ? projects[0].path as string : '';
    });
    useEffect(() => {
        if (!selectedPath && projects.length > 0) setSelectedPath(projects[0].path as string);
    }, [projects, selectedPath]);
    useEffect(() => {
        if (selectedPath) localStorage.setItem(STORAGE_SONAR_PATH, selectedPath);
    }, [selectedPath]);

    // ── Config
    const [globalConfig, setGlobalConfig] = useState<GlobalSonarConfig>(loadGlobalConfig);
    const [configModalOpen, setConfigModalOpen] = useState(false);

    // Per-project: project key + token
    const [link, setLink] = useState<ProjectLink>(() => selectedPath ? loadLink(selectedPath) : {});
    const [projectTokenDraft, setProjectTokenDraft] = useState<string>(() =>
        selectedPath ? (loadLink(selectedPath).token ?? '') : ''
    );

    useEffect(() => {
        if (selectedPath) {
            const loaded = loadLink(selectedPath);
            setLink(loaded);
            setProjectTokenDraft(loaded.token ?? '');
            setIssues(loadIssuesCache(selectedPath));
            setMetricsError(null);
            setIssuesError(null);
            setRulesError(null);
        }
    }, [selectedPath]);

    const saveProjectToken = useCallback(() => {
        if (!selectedPath) return;
        const current = loadLink(selectedPath);
        const updated: ProjectLink = { ...current, token: projectTokenDraft || undefined };
        saveLink(selectedPath, updated);
        setLink(updated);
        setMetricsCache(prev => { const n = { ...prev }; delete n[selectedPath]; return n; });
        addLog('info', `Token de proyecto ${projectTokenDraft ? 'guardado' : 'eliminado'} para: ${selectedPath}`);
    }, [selectedPath, projectTokenDraft]);

    // ── Metrics cache
    const [metricsCache, setMetricsCache] = useState<Record<string, SonarMetrics>>(loadMetricsCache);

    useEffect(() => {
        try { localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify(metricsCache)); } catch (_) { }
    }, [metricsCache]);
    const metrics = metricsCache[selectedPath] ?? null;
    const [loadingMetrics, setLoadingMetrics] = useState(false);

    // ── Issues
    const [issues, setIssues] = useState<SonarIssue[]>([]);
    const [loadingIssues, setLoadingIssues] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['MINOR', 'INFO']));

    // ── Rules
    const [rules, setRules] = useState<SonarRule[]>(loadRules);
    const [rulesSearch, setRulesSearch] = useState('');
    useEffect(() => {
        try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch { }
    }, [rules]);

    // ── UI
    const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'rules' | 'issues'>(() => {
        const saved = localStorage.getItem(STORAGE_SONAR_TAB);
        return (saved === 'overview' || saved === 'analysis' || saved === 'rules' || saved === 'issues') ? saved : 'overview';
    });
    useEffect(() => { localStorage.setItem(STORAGE_SONAR_TAB, activeTab); }, [activeTab]);
    const [metricsError, setMetricsError] = useState<string | null>(null);
    const [issuesError, setIssuesError] = useState<string | null>(null);
    const [rulesError, setRulesError] = useState<string | null>(null);
    const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean | null; message: string } | null>(null);

    // ── Auto-link search
    const [searchingFor, setSearchingFor] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<SonarProjectResult[] | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // ── Derived config
    const projectKey = link.projectKey || (projects.find(p => p.path === selectedPath)?.name as string || '');
    const effectiveToken = link.token || globalConfig.token;

    const scanCommand = useMemo(() => {
        const { serverUrl, token, organization } = globalConfig;
        let cmd = `npx sonar-scanner -Dsonar.projectKey=${projectKey} -Dsonar.host.url=${serverUrl} -Dsonar.token=${token}`;
        if (organization) cmd += ` -Dsonar.organization=${organization}`;
        return cmd;
    }, [globalConfig, projectKey]);

    const serviceId = useMemo(() => `${selectedPath}::${scanCommand} `, [selectedPath, scanCommand]);
    const processState = activeProcesses[serviceId];
    const isRunning = processState?.status === 'running';
    const processStatus = processState?.status;

    const reportUrl = useMemo(() => {
        const logs = processState?.logs ?? [];
        return extractReportUrl(logs);
    }, [processState?.logs]);

    const localQG = useMemo(() => {
        const logs = processState?.logs ?? [];
        return extractLocalQG(logs);
    }, [processState?.logs]);

    const addLog = useCallback((type: DebugLog['type'], message: string) => {
        setDebugLogs(prev => [
            { id: Math.random().toString(36).substring(7), timestamp: new Date().toLocaleTimeString(), type, message },
            ...prev.slice(0, 99),
        ]);
    }, []);

    const baseUrl = globalConfig.serverUrl.replace(/\/+$/, '');

    const authHeader = (token: string) =>
        globalConfig.authType === 'bearer'
            ? `Bearer ${token}`
            : `Basic ${btoa(token + ':')}`;

    const handleTestConnection = useCallback(async () => {
        if (!globalConfig.token || !globalConfig.serverUrl) {
            setTestResult({ ok: false, message: 'Completa Server URL y Token.' });
            return;
        }
        const testBase = globalConfig.serverUrl.replace(/\/+$/, '');
        const testAuth = globalConfig.authType === 'bearer'
            ? `Bearer ${globalConfig.token}`
            : `Basic ${btoa(globalConfig.token + ':')}`;
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
    }, [globalConfig]);

    const fetchMetrics = useCallback(async () => {
        if (!projectKey || !effectiveToken || !globalConfig.serverUrl) {
            setMetricsError('Configura el Server URL y Token en Configuración Global.');
            return;
        }
        setLoadingMetrics(true);
        setMetricsError(null);
        const metricKeys = 'alert_status,bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,reliability_rating,security_rating,sqale_rating';
        const url = `${baseUrl}/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=${metricKeys}`;
        addLog('network', `GET ${url}`);
        try {
            const resp = await tauriFetch(url, { headers: { Authorization: authHeader(effectiveToken) } });
            if (!resp.ok) {
                if (resp.status === 403) throw new Error('HTTP 403 — Permiso denegado.');
                if (resp.status === 401) throw new Error('HTTP 401 — Token inválido o expirado.');
                throw new Error(`HTTP ${resp.status}`);
            }
            const data = await resp.json() as any;
            const measures = data.component?.measures || [];
            const getVal = (k: string) => measures.find((m: any) => m.metric === k)?.value;
            const grade = (v?: string) => {
                if (!v) return 'N/A';
                const n = parseFloat(v);
                return n <= 1 ? 'A' : n <= 2 ? 'B' : n <= 3 ? 'C' : n <= 4 ? 'D' : 'E';
            };
            const result: SonarMetrics = {
                qualityGate: (getVal('alert_status') as any) || 'NONE',
                reliability: grade(getVal('reliability_rating')),
                security: grade(getVal('security_rating')),
                maintainability: grade(getVal('sqale_rating')),
                bugs: parseInt(getVal('bugs') || '0'),
                vulnerabilities: parseInt(getVal('vulnerabilities') || '0'),
                codeSmells: parseInt(getVal('code_smells') || '0'),
                coverage: parseFloat(getVal('coverage') || '0'),
                duplications: parseFloat(getVal('duplicated_lines_density') || '0'),
            };
            setMetricsCache(prev => ({ ...prev, [selectedPath]: result }));
            addLog('info', `Metrics OK → ${projectKey}`);
        } catch (e: any) {
            addLog('error', `Metrics failed: ${e.message || e}`);
            setMetricsError(`Error al obtener métricas: ${e.message || e}`);
        } finally {
            setLoadingMetrics(false);
        }
    }, [selectedPath, projectKey, effectiveToken, globalConfig, addLog, baseUrl]);

    const fetchMetricsRef = useRef(fetchMetrics);
    useEffect(() => { fetchMetricsRef.current = fetchMetrics; });

    const fetchRules = useCallback(async () => {
        if (!effectiveToken) { setRulesError('Configura el Token en Configuración Global.'); return; }
        setLoadingMetrics(true);
        setRulesError(null);
        const url = `${baseUrl}/api/rules/search?activation=true&ps=100`;
        addLog('network', `GET ${url}`);
        try {
            const resp = await tauriFetch(url, { headers: { Authorization: authHeader(effectiveToken) } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json() as any;
            if (data.rules) {
                setRules(data.rules.map((r: any) => ({ key: r.key, name: r.name, severity: r.severity, type: r.type, langName: r.langName })));
                addLog('info', `${data.rules.length} reglas cargadas.`);
            }
        } catch (e) {
            addLog('error', `Rules failed: ${e}`);
            setRulesError(`Error al obtener reglas: ${e}`);
        } finally {
            setLoadingMetrics(false);
        }
    }, [effectiveToken, globalConfig, addLog, baseUrl]);

    const fetchIssues = useCallback(async () => {
        if (!projectKey || !effectiveToken) {
            setIssuesError('Vincula el proyecto y configura el Token para ver issues.');
            return;
        }
        setLoadingIssues(true);
        setIssuesError(null);
        const url = `${baseUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey)}&resolved=false&ps=100`;
        addLog('network', `GET ${url}`);
        try {
            const resp = await tauriFetch(url, { headers: { Authorization: authHeader(effectiveToken) } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json() as any;
            const mapped: SonarIssue[] = (data.issues || []).map((i: any) => ({
                key: i.key,
                severity: i.severity as SonarIssue['severity'],
                type: i.type || 'CODE_SMELL',
                message: i.message || '',
                component: (i.component || '').split(':').slice(1).join(':') || i.component || '',
                line: i.line,
            }));
            setIssues(mapped);
            saveIssuesCache(selectedPath, mapped);
            addLog('info', `${mapped.length} issues abiertos encontrados.`);
        } catch (e) {
            addLog('error', `Issues failed: ${e}`);
            setIssuesError(`Error al obtener issues: ${e}`);
        } finally {
            setLoadingIssues(false);
        }
    }, [selectedPath, projectKey, effectiveToken, globalConfig, addLog, baseUrl]);

    const handleSearch = useCallback(async (projectPath: string, initialName: string) => {
        setSearchingFor(projectPath);
        setSearchQuery(initialName);
        setSearchResults(null);
        setSearchLoading(true);
        const url = `${baseUrl}/api/projects/search?q=${encodeURIComponent(initialName)}&ps=5`;
        addLog('network', `GET ${url} (auto-link)`);
        try {
            const resp = await tauriFetch(url, { headers: { Authorization: authHeader(globalConfig.token) } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json() as any;
            setSearchResults((data.components || []).map((c: any) => ({ key: c.key, name: c.name })));
            addLog('info', `Auto-link: ${(data.components || []).length} resultado(s)`);
        } catch (e) {
            addLog('error', `Search failed: ${e}`);
            setSearchResults([]);
        } finally {
            setSearchLoading(false);
        }
    }, [globalConfig, addLog, baseUrl]);

    const handleSearchQuery = useCallback(async () => {
        if (!searchingFor || !searchQuery.trim() || !globalConfig.token) return;
        setSearchResults(null);
        setSearchLoading(true);
        const url = `${baseUrl}/api/projects/search?q=${encodeURIComponent(searchQuery)}&ps=5`;
        addLog('network', `GET ${url}`);
        try {
            const resp = await tauriFetch(url, { headers: { Authorization: authHeader(globalConfig.token) } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json() as any;
            setSearchResults((data.components || []).map((c: any) => ({ key: c.key, name: c.name })));
        } catch (_) {
            setSearchResults([]);
        } finally {
            setSearchLoading(false);
        }
    }, [searchingFor, searchQuery, globalConfig, addLog, baseUrl]);

    const handleLinkProject = useCallback((projectPath: string, result: SonarProjectResult) => {
        const existing = loadLink(projectPath);
        const newLink: ProjectLink = { ...existing, projectKey: result.key };
        saveLink(projectPath, newLink);
        if (projectPath === selectedPath) {
            setLink(newLink);
            setProjectTokenDraft(newLink.token ?? '');
        }
        setMetricsCache(prev => { const next = { ...prev }; delete next[projectPath]; return next; });
        setSearchingFor(null);
        setSearchResults(null);
        addLog('info', `Vinculado → key: "${result.key}"`);
    }, [selectedPath, addLog]);

    useEffect(() => {
        if (!selectedPath || !projectKey || !effectiveToken || !globalConfig.serverUrl) return;
        fetchMetricsRef.current();
    }, [selectedPath, projectKey, effectiveToken]);

    const prevStatusRef = useRef<typeof processStatus>(undefined);
    useEffect(() => {
        if (prevStatusRef.current === 'running' && processStatus === 'stopped') {
            const t = setTimeout(() => {
                setMetricsCache(prev => { const next = { ...prev }; delete next[selectedPath]; return next; });
                fetchMetricsRef.current();
            }, 3000);
            return () => clearTimeout(t);
        }
        prevStatusRef.current = processStatus;
    }, [processStatus, selectedPath]);

    const fetchIssuesRef = useRef(fetchIssues);
    useEffect(() => { fetchIssuesRef.current = fetchIssues; });
    useEffect(() => {
        if (activeTab === 'issues' && projectKey && effectiveToken) {
            fetchIssuesRef.current();
        }
    }, [activeTab, selectedPath, projectKey, effectiveToken]);

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

    const filteredRules = rules.filter(r =>
        r.name.toLowerCase().includes(rulesSearch.toLowerCase()) ||
        r.key.toLowerCase().includes(rulesSearch.toLowerCase())
    );

    const issuesByGroup = useMemo(() => {
        const map: Record<string, SonarIssue[]> = {};
        SEVERITY_ORDER.forEach(s => { map[s] = []; });
        issues.forEach(i => { map[i.severity]?.push(i); });
        return map;
    }, [issues]);

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900">
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
                        disabled={!selectedPath || !projectKey}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-md ${isRunning
                            ? 'bg-nexus-danger hover:bg-red-600 text-white'
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
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Proyectos ({projects.length})</p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {projects.map(p => {
                            const path = p.path as string;
                            const name = p.name as string;
                            const qg = metricsCache[path]?.qualityGate;
                            const savedLink = loadLink(path);
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
                                            <QGBadge status={qg} />
                                            {!linked && <span className="text-[9px] text-slate-600 italic">sin vincular</span>}
                                            {running && <span className="w-1.5 h-1.5 rounded-full bg-nexus-success animate-pulse" />}
                                        </div>
                                    </div>
                                    <button onClick={e => { e.stopPropagation(); handleSearch(path, name); }} className="p-1 rounded text-slate-600 hover:text-blue-400 opacity-0 group-hover:opacity-100"><Search size={12} /></button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {selectedPath ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="shrink-0 px-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                            <div className="flex">
                                {([['overview', LayoutDashboard, 'Overview'], ['analysis', TerminalSquare, 'Análisis'], ['rules', ListFilter, 'Reglas'], ['issues', AlertCircle, 'Issues']] as const).map(([tab, Icon, label]) => (
                                    <button key={tab} onClick={() => setActiveTab(tab)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                                        <Icon size={13} />{label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {activeTab === 'overview' && metrics && (
                                <div className="space-y-5">
                                    <div className={`p-5 rounded-2xl border flex items-center justify-between ${metrics.qualityGate === 'OK' ? 'bg-nexus-success/10 border-nexus-success/30' : 'bg-nexus-danger/10 border-nexus-danger/30'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-xl ${metrics.qualityGate === 'OK' ? 'bg-nexus-success/20' : 'bg-nexus-danger/20'}`}>
                                                <ShieldCheck size={28} className={metrics.qualityGate === 'OK' ? 'text-nexus-success' : 'text-nexus-danger'} />
                                            </div>
                                            <div>
                                                <h3 className="text-base font-black text-slate-200">Quality Gate {metrics.qualityGate}</h3>
                                                <p className="text-xs text-slate-400 font-mono">{projectKey}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => openUrl(`${globalConfig.serverUrl}/dashboard?id=${projectKey}`)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition-colors">
                                            <ExternalLink size={13} /> Ver en Sonar
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <MetricCard label="Bugs" value={metrics.bugs} rating={metrics.reliability} icon={Bug} colorClass="text-nexus-danger" />
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
                                </div>
                            )}

                            {activeTab === 'analysis' && (
                                <div className="h-full flex flex-col gap-4">
                                    <div className="shrink-0 p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                                        <div className="bg-black/40 p-2.5 rounded border border-slate-900 font-mono text-[11px] text-slate-200 break-all select-all">$ {scanCommand}</div>
                                    </div>
                                    {reportUrl && (
                                        <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-nexus-success/10 border border-nexus-success/30 rounded-xl">
                                            <ShieldCheck size={16} className="text-nexus-success shrink-0" />
                                            <div className="flex-1 min-w-0"><p className="text-xs font-bold text-nexus-success">Análisis completado</p><p className="text-[10px] font-mono text-slate-400 truncate">{reportUrl}</p></div>
                                            <button onClick={() => openUrl(reportUrl)} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-nexus-success text-slate-900 text-xs font-black rounded-lg hover:bg-green-400 transition-colors"><ExternalLink size={13} /> Ver reporte</button>
                                        </div>
                                    )}
                                    <div className="flex-1 min-h-[200px] border border-slate-800 rounded-xl overflow-hidden">
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
                                                {!collapsed && <div className="divide-y divide-slate-800/40">{group.slice(0, 10).map(i => <div key={i.key} className="px-4 py-2.5 hover:bg-slate-800/30 transition-colors"><div className="flex items-start gap-2"><span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase mt-0.5 ${s.bg} ${s.text}`}>{i.type}</span><div className="flex-1 min-w-0"><p className="text-xs text-slate-200 leading-snug">{i.message}</p><p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">{i.component}{i.line ? `:${i.line}` : ''}</p></div></div></div>)}</div>}
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
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-4"><h3 className="text-sm font-black text-slate-200">Configuración Global Sonar</h3><button onClick={() => setConfigModalOpen(false)}><X size={18} className="text-slate-500" /></button></div>
                        <input type="text" value={globalConfig.serverUrl} onChange={e => setGlobalConfig(g => ({ ...g, serverUrl: e.target.value }))} placeholder="Server URL" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 outline-none" />
                        <input type="password" value={globalConfig.token} onChange={e => setGlobalConfig(g => ({ ...g, token: e.target.value }))} placeholder="Global Token" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 outline-none" />
                        <div className="flex justify-end gap-3"><button onClick={handleTestConnection} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl border border-slate-700">Probar Token</button><button onClick={() => { saveGlobalConfig(globalConfig); setConfigModalOpen(false); }} className="px-6 py-2.5 bg-blue-600 text-white text-xs font-black rounded-xl">Guardar</button></div>
                        {testResult && <p className={`text-xs p-2 rounded ${testResult.ok ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>{testResult.message}</p>}
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
        </div>
    );
};
