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
import { TerminalView } from './TerminalView';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-project: linked Sonar key + optional token (overrides global). */
interface ProjectLink {
    projectKey?: string;
    token?: string;
}

interface GlobalSonarConfig {
    serverUrl: string;
    token: string;
    organization?: string;
    /** 'basic' = token como usuario HTTP (compatible con todas las versiones).
     *  'bearer' = Authorization: Bearer (SonarQube 10+ / SonarCloud moderno). */
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
    const { state, executeProjectScript, updateProcessStatus } = useWorkspace();
    const projects = state.projects;

    // ── Selection
    const [selectedPath, setSelectedPath] = useState<string>(() =>
        projects.length > 0 ? projects[0].path as string : ''
    );
    useEffect(() => {
        if (!selectedPath && projects.length > 0) setSelectedPath(projects[0].path as string);
    }, [projects, selectedPath]);

    // ── Config
    const [globalConfig, setGlobalConfig] = useState<GlobalSonarConfig>(loadGlobalConfig);
    const [configModalOpen, setConfigModalOpen] = useState(false);

    // Per-project: project key + token (editable directly in the panel)
    const [link, setLink] = useState<ProjectLink>(() => selectedPath ? loadLink(selectedPath) : {});
    // Draft del token de proyecto — el usuario lo edita y guarda explícitamente
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

    /** Guarda el token de proyecto actual en localStorage y actualiza el estado. */
    const saveProjectToken = useCallback(() => {
        if (!selectedPath) return;
        const current = loadLink(selectedPath);
        const updated: ProjectLink = { ...current, token: projectTokenDraft || undefined };
        saveLink(selectedPath, updated);
        setLink(updated);
        // Invalidar caché de métricas para que se refresquen con el nuevo token
        setMetricsCache(prev => { const n = { ...prev }; delete n[selectedPath]; return n; });
        addLog('info', `Token de proyecto ${projectTokenDraft ? 'guardado' : 'eliminado'} para: ${selectedPath}`);
    }, [selectedPath, projectTokenDraft]);

    // ── Metrics cache (persisted in localStorage, fetched fresh on enter)
    const [metricsCache, setMetricsCache] = useState<Record<string, SonarMetrics>>(loadMetricsCache);

    // Persist whenever metricsCache changes
    useEffect(() => {
        try { localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify(metricsCache)); } catch (_) { }
    }, [metricsCache]);
    const metrics = metricsCache[selectedPath] ?? null;
    const [loadingMetrics, setLoadingMetrics] = useState(false);

    // ── Issues (cached per-project in localStorage)
    const [issues, setIssues] = useState<SonarIssue[]>([]);
    const [loadingIssues, setLoadingIssues] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['MINOR', 'INFO']));

    // ── Rules (cached globally in localStorage)
    const [rules, setRules] = useState<SonarRule[]>(loadRules);
    const [rulesSearch, setRulesSearch] = useState('');
    useEffect(() => {
        try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); } catch { }
    }, [rules]);

    // ── UI — errores separados por sección para evitar contaminación entre tabs
    const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'rules' | 'issues'>('overview');
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
    /** Token a usar: el del proyecto si está configurado, si no el global */
    const effectiveToken = link.token || globalConfig.token;

    const scanCommand = useMemo(() => {
        const { serverUrl, token, organization } = globalConfig;
        let cmd = `npx sonar-scanner -Dsonar.projectKey=${projectKey} -Dsonar.host.url=${serverUrl} -Dsonar.token=${token}`;
        if (organization) cmd += ` -Dsonar.organization=${organization}`;
        return cmd;
    }, [globalConfig, projectKey]);

    const serviceId = useMemo(() => `${selectedPath}::${scanCommand} `, [selectedPath, scanCommand]);
    const processState = state.activeProcesses[serviceId];
    const isRunning = processState?.status === 'running';
    const processStatus = processState?.status;

    // Extract report URL and local QG status from terminal logs after a successful analysis
    const reportUrl = useMemo(() => {
        const logs = processState?.logs ?? [];
        return extractReportUrl(logs);
    }, [processState?.logs]);

    const localQG = useMemo(() => {
        const logs = processState?.logs ?? [];
        return extractLocalQG(logs);
    }, [processState?.logs]);

    // ── Debug log
    const addLog = useCallback((type: DebugLog['type'], message: string) => {
        setDebugLogs(prev => [
            { id: Math.random().toString(36).substring(7), timestamp: new Date().toLocaleTimeString(), type, message },
            ...prev.slice(0, 99),
        ]);
    }, []);

    // Normaliza el serverUrl quitando barras finales
    const baseUrl = globalConfig.serverUrl.replace(/\/+$/, '');

    // Basic: token como usuario HTTP (compatible con todas las versiones de SonarQube).
    // Bearer: sólo SonarQube 10+ y SonarCloud moderno.
    const authHeader = (token: string) =>
        globalConfig.authType === 'bearer'
            ? `Bearer ${token}`
            : `Basic ${btoa(token + ':')}`;

    // Prueba si el token es válido (independiente de permisos de proyecto)
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
                setTestResult({ ok: true, message: 'Token válido ✓. Si sigues con 403 en métricas, el problema es de permisos "Browse" del proyecto en SonarQube (Admin → Project Settings → Permissions).' });
            } else {
                setTestResult({ ok: false, message: 'El servidor responde pero el token no es válido. Genera un nuevo token de usuario en SonarQube.' });
            }
        } catch (e) {
            setTestResult({ ok: false, message: `Error de red: ${e}` });
        }
    }, [globalConfig]);

    // ── Fetch metrics
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
                if (resp.status === 403) throw new Error('HTTP 403 — Permiso denegado. Asegúrate de usar un User Token (squ_...) — los tokens de análisis (sqa_, sqp_) no sirven para leer la API. Verifica también que el usuario tenga permiso "Browse" en el proyecto.');
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
    }, [selectedPath, projectKey, effectiveToken, globalConfig, addLog]);

    const fetchMetricsRef = useRef(fetchMetrics);
    useEffect(() => { fetchMetricsRef.current = fetchMetrics; });

    // ── Fetch rules
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
    }, [effectiveToken, globalConfig, addLog]);

    // ── Fetch issues
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
            if (!resp.ok) throw new Error(`HTTP ${resp.status} — verifica el token y el Project Key`);
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
            saveIssuesCache(selectedPath, mapped); // Persistir
            addLog('info', `${mapped.length} issues abiertos encontrados.`);
        } catch (e) {
            addLog('error', `Issues failed: ${e}`);
            setIssuesError(`Error al obtener issues: ${e}`);
        } finally {
            setLoadingIssues(false);
        }
    }, [selectedPath, projectKey, effectiveToken, globalConfig, addLog]);

    // ── Auto-link search
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
    }, [globalConfig, addLog]);

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
    }, [searchingFor, searchQuery, globalConfig, addLog]);

    const handleLinkProject = useCallback((projectPath: string, result: SonarProjectResult) => {
        // Preserva el token existente al cambiar solo el projectKey
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

    // ── Auto-fetch metrics when project or key changes (show cached immediately, refresh in background)
    useEffect(() => {
        if (!selectedPath || !projectKey || !effectiveToken || !globalConfig.serverUrl) return;
        fetchMetricsRef.current();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPath, projectKey, effectiveToken]);

    // ── Auto-refresh metrics when analysis completes
    const prevStatusRef = useRef<typeof processStatus>(undefined);
    useEffect(() => {
        if (prevStatusRef.current === 'running' && processStatus === 'stopped') {
            // Small delay to let the server process the uploaded report
            const t = setTimeout(() => {
                setMetricsCache(prev => { const next = { ...prev }; delete next[selectedPath]; return next; });
                fetchMetricsRef.current();
            }, 3000);
            return () => clearTimeout(t);
        }
        prevStatusRef.current = processStatus;
    }, [processStatus, selectedPath]);

    // ── Auto-fetch issues cuando el tab está activo O cambia el proyecto (muestra cache, refresca en background)
    const fetchIssuesRef = useRef(fetchIssues);
    useEffect(() => { fetchIssuesRef.current = fetchIssues; });
    useEffect(() => {
        if (activeTab === 'issues' && projectKey && effectiveToken) {
            fetchIssuesRef.current();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, selectedPath]);

    // ── Run / Stop
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

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900">

            {/* ── Header ──────────────────────────────────────────────────────── */}
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

            {/* ── Body ────────────────────────────────────────────────────────── */}
            <div className="flex-1 flex min-h-0 overflow-hidden">

                {/* ── Left sidebar ──────────────────────────────────────────── */}
                <div className="w-56 shrink-0 border-r border-slate-800 flex flex-col overflow-hidden bg-slate-950/30">
                    <div className="shrink-0 px-3 py-2 border-b border-slate-800/60 bg-slate-950/50">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Proyectos ({projects.length})
                        </p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {projects.length === 0 && (
                            <p className="px-3 py-4 text-xs text-slate-600 text-center">Sin proyectos</p>
                        )}
                        {projects.map(p => {
                            const path = p.path as string;
                            const name = p.name as string;
                            const qg = metricsCache[path]?.qualityGate;
                            const savedLink = loadLink(path);
                            const linked = !!savedLink.projectKey;
                            const hasOwnToken = !!savedLink.token;
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
                                        <p className={`text-xs font-medium truncate ${selectedPath === path ? 'text-blue-400' : 'text-slate-300'}`}>
                                            {name}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <QGBadge status={qg} />
                                            {running && (
                                                <span className="flex items-center gap-1 text-[9px] text-nexus-success">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-nexus-success animate-pulse inline-block" />
                                                    running
                                                </span>
                                            )}
                                            {!linked && (
                                                <span className="text-[9px] text-slate-600 italic">sin vincular</span>
                                            )}
                                            {hasOwnToken && (
                                                <span title="Token de proyecto configurado" className="text-[9px] text-blue-500">🔑</span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={e => { e.stopPropagation(); handleSearch(path, name); }}
                                        title="Buscar y vincular en Sonar"
                                        className="ml-1 shrink-0 p-1 rounded text-slate-600 hover:text-blue-400 hover:bg-slate-800 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Search size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Right area ────────────────────────────────────────────── */}
                {selectedPath ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                        {/* Tab bar */}
                        <div className="shrink-0 px-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                            <div className="flex">
                                {([
                                    ['overview', LayoutDashboard, 'Overview'],
                                    ['analysis', TerminalSquare, 'Análisis'],
                                    ['rules', ListFilter, 'Reglas'],
                                    ['issues', AlertCircle, 'Issues'],
                                ] as const).map(([tab, Icon, label]) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === tab
                                            ? 'border-blue-500 text-blue-400'
                                            : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                                    >
                                        <Icon size={13} />{label}
                                    </button>
                                ))}
                            </div>
                            <div className="pr-2 flex items-center gap-1">
                                {/* Project key indicator */}
                                {projectKey && (
                                    <span className="text-[10px] font-mono text-slate-600 max-w-[180px] truncate">{projectKey}</span>
                                )}
                                {activeTab === 'overview' && (
                                    <button onClick={fetchMetrics} disabled={loadingMetrics} title="Refrescar métricas" className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors disabled:opacity-30">
                                        <RefreshCw size={13} className={loadingMetrics ? 'animate-spin' : ''} />
                                    </button>
                                )}
                                {activeTab === 'issues' && (
                                    <button onClick={fetchIssues} disabled={loadingIssues} title="Refrescar issues" className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition-colors disabled:opacity-30">
                                        <RefreshCw size={13} className={loadingIssues ? 'animate-spin' : ''} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ── Token de proyecto — siempre visible, guardado explícitamente ── */}
                        {(() => {
                            const isAnalysisToken = /^sqa_|^sqp_/i.test(projectTokenDraft);
                            const isSaved = projectTokenDraft === (link.token ?? '');
                            return (
                                <div className="shrink-0 border-b border-slate-800/50 bg-slate-950/20">
                                    <div className="px-4 py-2 flex items-center gap-2">
                                        <ShieldCheck size={12} className={link.token ? 'text-blue-400' : 'text-slate-600'} />
                                        <span className="text-[10px] font-bold text-slate-600 shrink-0 uppercase tracking-wider">Token proyecto</span>
                                        <input
                                            type="password"
                                            value={projectTokenDraft}
                                            onChange={e => setProjectTokenDraft(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && saveProjectToken()}
                                            placeholder={link.token ? '••••••••••••' : 'Dejar vacío = usar token global (squ_...)'}
                                            className={`flex-1 bg-transparent border-0 border-b text-[11px] text-slate-300 font-mono px-1 py-0.5 outline-none placeholder:text-slate-700 transition-colors ${isAnalysisToken ? 'border-yellow-500 focus:border-yellow-400' : 'border-slate-800 focus:border-blue-500'}`}
                                        />
                                        {!isSaved && (
                                            <button
                                                onClick={saveProjectToken}
                                                disabled={isAnalysisToken}
                                                className="shrink-0 px-2 py-0.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-bold rounded transition-colors"
                                            >
                                                Guardar
                                            </button>
                                        )}
                                        {link.token && isSaved && !isAnalysisToken && (
                                            <span className="shrink-0 text-[9px] text-nexus-success font-bold">✓ activo</span>
                                        )}
                                    </div>
                                    {isAnalysisToken && (
                                        <div className="px-4 pb-2 flex items-start gap-1.5">
                                            <AlertCircle size={11} className="text-yellow-400 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-yellow-400 leading-snug">
                                                <strong>Token de análisis</strong> ({projectTokenDraft.startsWith('sqa_') ? 'sqa_' : 'sqp_'}...) — solo sirve para ejecutar sonar-scanner, <strong>no para leer la API</strong>.
                                                Crea un <strong>User Token</strong> (squ_...) en SonarQube: <em>Mi cuenta → Security → Generate Token → tipo "User Token"</em>.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Error bar — each tab shows its own error */}
                        {activeTab === 'overview' && metricsError && (
                            <div className="shrink-0 mx-4 mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-xl flex items-center gap-2">
                                <AlertCircle className="text-red-400 shrink-0" size={15} />
                                <span className="text-xs text-red-200 flex-1">{metricsError}</span>
                                <button onClick={() => setMetricsError(null)} className="text-red-500 hover:text-red-300 shrink-0"><X size={13} /></button>
                            </div>
                        )}
                        {activeTab === 'issues' && issuesError && (
                            <div className="shrink-0 mx-4 mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-xl flex items-center gap-2">
                                <AlertCircle className="text-red-400 shrink-0" size={15} />
                                <span className="text-xs text-red-200 flex-1">{issuesError}</span>
                                <button onClick={() => setIssuesError(null)} className="text-red-500 hover:text-red-300 shrink-0"><X size={13} /></button>
                            </div>
                        )}
                        {activeTab === 'rules' && rulesError && (
                            <div className="shrink-0 mx-4 mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-xl flex items-center gap-2">
                                <AlertCircle className="text-red-400 shrink-0" size={15} />
                                <span className="text-xs text-red-200 flex-1">{rulesError}</span>
                                <button onClick={() => setRulesError(null)} className="text-red-500 hover:text-red-300 shrink-0"><X size={13} /></button>
                            </div>
                        )}

                        {/* Tab content */}
                        <div className="flex-1 overflow-y-auto p-5">

                            {/* ── OVERVIEW ────────────────────────────────── */}
                            {activeTab === 'overview' && (
                                <div className="space-y-5">

                                    {/* ── Resultado del último análisis local ── */}
                                    {(localQG || reportUrl) && (
                                        <div className={`p-4 rounded-xl border flex items-center gap-4 ${localQG === 'PASSED' ? 'bg-nexus-success/10 border-nexus-success/30' : localQG === 'FAILED' ? 'bg-nexus-danger/10 border-nexus-danger/30' : 'bg-slate-800/50 border-slate-700'}`}>
                                            <div className={`p-2.5 rounded-lg shrink-0 ${localQG === 'PASSED' ? 'bg-nexus-success/20' : localQG === 'FAILED' ? 'bg-nexus-danger/20' : 'bg-slate-700'}`}>
                                                <TerminalSquare size={18} className={localQG === 'PASSED' ? 'text-nexus-success' : localQG === 'FAILED' ? 'text-nexus-danger' : 'text-slate-400'} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Último análisis local</p>
                                                {localQG && (
                                                    <p className={`text-sm font-black ${localQG === 'PASSED' ? 'text-nexus-success' : 'text-nexus-danger'}`}>
                                                        Quality Gate: {localQG}
                                                    </p>
                                                )}
                                                {reportUrl && (
                                                    <p className="text-[10px] font-mono text-slate-500 truncate">{reportUrl}</p>
                                                )}
                                            </div>
                                            {reportUrl && (
                                                <button
                                                    onClick={() => openUrl(reportUrl)}
                                                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-nexus-success text-slate-900 text-xs font-black rounded-lg hover:bg-green-400 transition-colors"
                                                >
                                                    <ExternalLink size={13} /> Ver reporte
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Métricas del servidor ── */}
                                    {loadingMetrics && !metrics && (
                                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                                            <RefreshCw className="text-blue-400 animate-spin" size={28} />
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest animate-pulse">Obteniendo métricas del servidor...</p>
                                        </div>
                                    )}
                                    {!loadingMetrics && !metrics && !metricsError && !localQG && (
                                        <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                                            <LayoutDashboard size={44} className="opacity-20" />
                                            <p className="text-sm font-medium">Sin datos de análisis</p>
                                            <p className="text-xs text-slate-600 text-center max-w-xs">
                                                Configura el token global y vincula el proyecto con el botón 🔍 del sidebar
                                            </p>
                                        </div>
                                    )}
                                    {metrics && (
                                        <div className="space-y-5">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Métricas del servidor</span>
                                                {loadingMetrics && <RefreshCw size={11} className="text-slate-600 animate-spin" />}
                                            </div>
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
                                                <button
                                                    onClick={() => openUrl(`${globalConfig.serverUrl}/dashboard?id=${projectKey}`)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition-colors"
                                                >
                                                    <ExternalLink size={13} /> Ver en Sonar
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-3 gap-4">
                                                <MetricCard label="Fiabilidad" value={metrics.bugs} rating={metrics.reliability} icon={Bug} colorClass="text-nexus-danger" />
                                                <MetricCard label="Seguridad" value={metrics.vulnerabilities} rating={metrics.security} icon={ShieldAlert} colorClass="text-yellow-400" />
                                                <MetricCard label="Mantenibilidad" value={metrics.codeSmells} rating={metrics.maintainability} icon={FileSearch} colorClass="text-blue-400" />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-5">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                            <Waves size={14} className="text-blue-400" /> Cobertura
                                                        </h4>
                                                        <span className="text-2xl font-black text-slate-200">{metrics.coverage}%</span>
                                                    </div>
                                                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                                        <div className="h-full bg-blue-500 transition-all duration-700" style={{ width: `${metrics.coverage}%` }} />
                                                    </div>
                                                </div>
                                                <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-5">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                            <Copy size={14} className="text-yellow-400" /> Duplicaciones
                                                        </h4>
                                                        <span className="text-2xl font-black text-slate-200">{metrics.duplications}%</span>
                                                    </div>
                                                    <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                                        <div className="h-full bg-yellow-500 transition-all duration-700" style={{ width: `${Math.min(metrics.duplications * 5, 100)}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── ANALYSIS ────────────────────────────────── */}
                            {activeTab === 'analysis' && (
                                <div className="h-full flex flex-col gap-4">
                                    {/* Command display */}
                                    <div className="shrink-0 p-4 bg-slate-950/50 border border-slate-800 rounded-xl">
                                        <h3 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-2 uppercase tracking-tight">
                                            <TerminalSquare size={13} className="text-blue-400" /> Comando a ejecutar
                                        </h3>
                                        <div className="bg-black/40 p-2.5 rounded border border-slate-900 font-mono text-[11px] text-slate-200 break-all select-all">
                                            $ {scanCommand}
                                        </div>
                                        <p className="mt-2 text-[10px] text-slate-500 italic">
                                            Tip: asegúrate de tener <code className="text-slate-400">sonar-scanner</code> en tu PATH, o usa <code className="text-slate-400">npx sonar-scanner</code>.
                                        </p>
                                    </div>

                                    {/* Report URL banner — appears after successful analysis */}
                                    {reportUrl && (
                                        <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-nexus-success/10 border border-nexus-success/30 rounded-xl">
                                            <ShieldCheck size={16} className="text-nexus-success shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-nexus-success">Análisis completado</p>
                                                <p className="text-[10px] font-mono text-slate-400 truncate">{reportUrl}</p>
                                            </div>
                                            <button
                                                onClick={() => openUrl(reportUrl)}
                                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-nexus-success text-slate-900 text-xs font-black rounded-lg hover:bg-green-400 transition-colors"
                                            >
                                                <ExternalLink size={13} /> Ver reporte
                                            </button>
                                        </div>
                                    )}

                                    {/* Terminal */}
                                    <div className="flex-1 min-h-[200px] border border-slate-800 rounded-xl overflow-hidden">
                                        <TerminalView serviceId={serviceId} />
                                    </div>
                                </div>
                            )}

                            {/* ── RULES ───────────────────────────────────── */}
                            {activeTab === 'rules' && (
                                <div className="h-full flex flex-col gap-4">
                                    <div className="shrink-0 flex items-center gap-3">
                                        <div className="relative flex-1">
                                            <ListFilter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
                                            <input
                                                type="text"
                                                placeholder="Buscar reglas..."
                                                value={rulesSearch}
                                                onChange={e => setRulesSearch(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-4 py-2 outline-none focus:border-blue-500"
                                            />
                                        </div>
                                        <button
                                            onClick={fetchRules}
                                            disabled={loadingMetrics}
                                            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            <RefreshCw size={13} className={loadingMetrics ? 'animate-spin' : ''} /> Cargar
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/30">
                                        {rules.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-3">
                                                <FileSearch size={36} className="opacity-20" />
                                                <p className="text-xs font-bold uppercase tracking-widest">No hay reglas cargadas</p>
                                            </div>
                                        ) : (
                                            <table className="w-full text-left text-xs">
                                                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10">
                                                    <tr>
                                                        <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-tight">Regla</th>
                                                        <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-tight">Tipo</th>
                                                        <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-tight">Severidad</th>
                                                        <th className="px-4 py-2.5 font-bold text-slate-500 uppercase tracking-tight">Clave</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800/50">
                                                    {filteredRules.map(rule => (
                                                        <tr key={rule.key} className="hover:bg-slate-800/30 transition-colors group">
                                                            <td className="px-4 py-2.5">
                                                                <div className="font-semibold text-slate-300 group-hover:text-blue-400 transition-colors">{rule.name}</div>
                                                                <div className="text-[10px] text-slate-600">{rule.langName}</div>
                                                            </td>
                                                            <td className="px-4 py-2.5">
                                                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold uppercase">{rule.type}</span>
                                                            </td>
                                                            <td className="px-4 py-2.5">
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${rule.severity === 'BLOCKER' || rule.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-400' : rule.severity === 'MAJOR' ? 'bg-orange-500/10 text-orange-400' : 'bg-slate-700/50 text-slate-500'}`}>
                                                                    {rule.severity}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 font-mono text-[10px] text-slate-600">{rule.key}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── ISSUES ──────────────────────────────────── */}
                            {activeTab === 'issues' && (
                                <div className="space-y-3">
                                    {loadingIssues && (
                                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                                            <RefreshCw className="text-blue-400 animate-spin" size={24} />
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest animate-pulse">Cargando issues...</p>
                                        </div>
                                    )}
                                    {!loadingIssues && issues.length === 0 && !issuesError && (
                                        <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-3">
                                            <AlertCircle size={36} className="opacity-20" />
                                            <p className="text-sm">Sin issues abiertos encontrados</p>
                                        </div>
                                    )}
                                    {!loadingIssues && SEVERITY_ORDER.map(severity => {
                                        const group = issuesByGroup[severity];
                                        if (!group || group.length === 0) return null;
                                        const s = SEV_STYLE[severity];
                                        const collapsed = collapsedGroups.has(severity);
                                        return (
                                            <div key={severity} className={`rounded-xl border ${s.border} overflow-hidden`}>
                                                <button
                                                    onClick={() => setCollapsedGroups(prev => {
                                                        const next = new Set(prev);
                                                        collapsed ? next.delete(severity) : next.add(severity);
                                                        return next;
                                                    })}
                                                    className={`w-full flex items-center justify-between px-4 py-2.5 ${s.bg} hover:opacity-80 transition-opacity`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs font-black uppercase tracking-wider ${s.text}`}>{severity}</span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>{group.length}</span>
                                                    </div>
                                                    {collapsed ? <ChevronRight size={13} className={s.text} /> : <ChevronDown size={13} className={s.text} />}
                                                </button>
                                                {!collapsed && (
                                                    <div className="divide-y divide-slate-800/40">
                                                        {group.slice(0, 10).map(issue => (
                                                            <div key={issue.key} className="px-4 py-2.5 hover:bg-slate-800/30 transition-colors">
                                                                <div className="flex items-start gap-2">
                                                                    <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase mt-0.5 ${s.bg} ${s.text}`}>{issue.type}</span>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-xs text-slate-200 leading-snug">{issue.message}</p>
                                                                        <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate">
                                                                            {issue.component}{issue.line ? `:${issue.line}` : ''}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {group.length > 10 && (
                                                            <div className="px-4 py-2 text-center">
                                                                <button
                                                                    onClick={() => openUrl(`${globalConfig.serverUrl}/project/issues?id=${projectKey}&types=${issuesByGroup[severity][0]?.type || ''}&severities=${severity}&resolved=false`)}
                                                                    className="text-[10px] text-blue-400 hover:underline"
                                                                >
                                                                    +{group.length - 10} más — ver en SonarQube →
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                        </div>{/* /tab content */}
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                        <div className="text-center">
                            <BarChart3 size={44} className="opacity-20 mx-auto mb-2" />
                            <p>Selecciona un proyecto para comenzar</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Auto-link search modal ───────────────────────────────────── */}
            {searchingFor !== null && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setSearchingFor(null); setSearchResults(null); }}>
                    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Search size={15} className="text-blue-400" />
                                <h3 className="text-sm font-bold text-slate-200">Vincular con Sonar</h3>
                                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[160px]">
                                    {projects.find(p => p.path === searchingFor)?.name as string}
                                </span>
                            </div>
                            <button onClick={() => { setSearchingFor(null); setSearchResults(null); }} className="text-slate-500 hover:text-white"><X size={15} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Búsqueda por nombre */}
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearchQuery()}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 focus:border-blue-500 outline-none"
                                        placeholder="Nombre del proyecto en Sonar..."
                                        autoFocus
                                    />
                                </div>
                                <button
                                    onClick={handleSearchQuery}
                                    disabled={searchLoading}
                                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                                >
                                    {searchLoading ? <RefreshCw size={13} className="animate-spin" /> : 'Buscar'}
                                </button>
                            </div>

                            {searchLoading && (
                                <div className="flex items-center justify-center py-4 gap-2 text-slate-500">
                                    <RefreshCw size={15} className="animate-spin" />
                                    <span className="text-xs">Buscando en Sonar...</span>
                                </div>
                            )}
                            {!searchLoading && searchResults !== null && (
                                searchResults.length === 0 ? (
                                    <div className="text-center py-2">
                                        <p className="text-xs text-slate-500">No se encontraron proyectos.</p>
                                        <p className="text-[10px] text-slate-600 mt-1">El API de búsqueda requiere permiso de administrador. Ingresa la clave abajo.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Selecciona:</p>
                                        {searchResults.map(result => (
                                            <button
                                                key={result.key}
                                                onClick={() => handleLinkProject(searchingFor!, result)}
                                                className="w-full text-left px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-blue-600/20 border border-slate-700 hover:border-blue-500 transition-colors group"
                                            >
                                                <p className="text-xs font-bold text-slate-200 group-hover:text-blue-400">{result.name}</p>
                                                <p className="text-[10px] font-mono text-slate-500">{result.key}</p>
                                            </button>
                                        ))}
                                    </div>
                                )
                            )}

                            {/* Clave directa */}
                            <div className="pt-2 border-t border-slate-800/60 space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                    O ingresa el Project Key directamente:
                                </p>
                                <DirectKeyForm onLink={(key) => handleLinkProject(searchingFor!, { key, name: key })} />
                                <p className="text-[9px] text-slate-600 italic">
                                    Encuéntralo en Sonar: Proyecto → Project Information → Project Key.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Global Config Modal ──────────────────────────────────────── */}
            {configModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 rounded-xl"><Settings size={18} className="text-blue-400" /></div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-200">Configuración Global Sonar</h3>
                                    <p className="text-[10px] text-slate-500">Se aplica a todos los proyectos</p>
                                </div>
                            </div>
                            <button onClick={() => setConfigModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500"><X size={18} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                    <Activity size={11} className="text-blue-400" /> Server URL
                                </label>
                                <input
                                    type="text"
                                    value={globalConfig.serverUrl}
                                    onChange={e => setGlobalConfig(g => ({ ...g, serverUrl: e.target.value }))}
                                    placeholder="https://sonarcloud.io"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                    <ShieldCheck size={11} className="text-blue-400" /> Auth Token
                                </label>
                                <input
                                    type="password"
                                    value={globalConfig.token}
                                    onChange={e => setGlobalConfig(g => ({ ...g, token: e.target.value }))}
                                    placeholder="squ_..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:border-blue-500 outline-none"
                                />
                                <p className="text-[9px] text-slate-600 italic mt-1">
                                    Debe ser un <strong className="text-slate-500">User Token (squ_...)</strong>. Los tokens de análisis (sqa_, sqp_) <strong className="text-slate-500">no funcionan</strong> para leer métricas. Crea uno en: Mi cuenta → Security → Generate Token → tipo "User Token".
                                </p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                    Tipo de autenticación
                                </label>
                                <div className="flex gap-2">
                                    {(['basic', 'bearer'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setGlobalConfig(g => ({ ...g, authType: type }))}
                                            className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${(globalConfig.authType ?? 'basic') === type ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600'}`}
                                        >
                                            {type === 'basic' ? 'Basic (todos los SonarQube)' : 'Bearer (SonarQube 10+ / SonarCloud)'}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[9px] text-slate-600 italic mt-1">
                                    Si tienes HTTP 403, prueba cambiando el tipo. <span className="text-slate-500">Basic</span> es el más compatible.
                                </p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                                    Organization <span className="text-slate-600 normal-case font-normal">(solo SonarCloud)</span>
                                </label>
                                <input
                                    type="text"
                                    value={globalConfig.organization || ''}
                                    onChange={e => setGlobalConfig(g => ({ ...g, organization: e.target.value }))}
                                    placeholder="mi-organizacion"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:border-blue-500 outline-none"
                                />
                            </div>
                            {/* Test result */}
                            {testResult && (
                                <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${testResult.ok === true ? 'bg-nexus-success/10 border border-nexus-success/30 text-nexus-success' : testResult.ok === false ? 'bg-red-900/20 border border-red-500/30 text-red-300' : 'bg-slate-800 border border-slate-700 text-slate-400'}`}>
                                    <span className="leading-snug">{testResult.message}</span>
                                </div>
                            )}

                            <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between gap-3">
                                <button
                                    onClick={handleTestConnection}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-colors"
                                >
                                    <Activity size={13} /> Probar Token
                                </button>
                                <button
                                    onClick={() => { saveGlobalConfig(globalConfig); setTestResult(null); setConfigModalOpen(false); }}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl transition-colors shadow-md"
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Debug Console ────────────────────────────────────────────── */}
            <div className={`shrink-0 border-t border-slate-800 bg-slate-950 transition-all duration-300 flex flex-col ${isConsoleOpen ? 'h-48' : 'h-8'}`}>
                <div onClick={() => setIsConsoleOpen(o => !o)} className="flex-none h-8 px-4 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors group">
                    <div className="flex items-center gap-2">
                        <TerminalSquare size={12} className={isConsoleOpen ? 'text-orange-500' : 'text-slate-600'} />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 group-hover:text-slate-400">Activity Console</span>
                        {debugLogs.length > 0 && !isConsoleOpen && (
                            <span className="ml-2 text-[9px] text-orange-400 max-w-[220px] truncate">{debugLogs[0].message}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={e => { e.stopPropagation(); setDebugLogs([]); }} className="text-[9px] font-bold text-slate-600 hover:text-slate-400 uppercase">Clear</button>
                        <ChevronDown size={13} className={`text-slate-600 transition-transform duration-300 ${isConsoleOpen ? '' : 'rotate-180'}`} />
                    </div>
                </div>
                {isConsoleOpen && (
                    <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] space-y-0.5 bg-[#0a0c10]">
                        {debugLogs.length === 0
                            ? <div className="flex items-center justify-center h-full text-slate-700 italic">Esperando actividad...</div>
                            : debugLogs.map(log => (
                                <div key={log.id} className="flex gap-2 hover:bg-slate-900/40 px-2 py-0.5 rounded">
                                    <span className="text-slate-700 shrink-0">[{log.timestamp}]</span>
                                    <span className={`font-bold shrink-0 uppercase ${log.type === 'error' ? 'text-red-500' : log.type === 'network' ? 'text-blue-400' : log.type === 'cmd' ? 'text-orange-400' : 'text-slate-600'}`}>{log.type}:</span>
                                    <span className={`break-all ${log.type === 'error' ? 'text-red-400' : 'text-slate-400'}`}>{log.message}</span>
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>

        </div>
    );
};
