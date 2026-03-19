import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    FlaskConical, Play, Square, RefreshCw, ExternalLink,
    Settings, Monitor, TerminalSquare, X, Search,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { TaskTerminal } from './ui/task-terminal';
import { useTaskStore } from '../stores/taskStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type TestLanguage = 'node' | 'python' | 'java' | 'go' | 'custom';

interface TestConfig {
    language: TestLanguage;
    command: string;
    testFilter: string;
    junitXmlPath: string;
    coverageXmlPath: string;
    coverageHtmlPath: string;
}

const DEFAULT_CONFIG: TestConfig = {
    language: 'node',
    command: 'npm run test',
    testFilter: '',
    junitXmlPath: 'junit.xml',
    coverageXmlPath: 'coverage/clover.xml',
    coverageHtmlPath: 'coverage/lcov-report/index.html',
};

const PRESETS: Record<TestLanguage, { label: string; config: TestConfig }> = {
    node: {
        label: 'Node (Vitest/Jest)',
        config: {
            language: 'node',
            command: 'npm run test',
            testFilter: '',
            junitXmlPath: 'junit.xml',
            coverageXmlPath: 'coverage/clover.xml',
            coverageHtmlPath: 'coverage/lcov-report/index.html'
        }
    },
    python: {
        label: 'Python (Pytest)',
        config: {
            language: 'python',
            command: 'pytest --junitxml=report.xml --cov=. --cov-report=xml --cov-report=html',
            testFilter: '',
            junitXmlPath: 'report.xml',
            coverageXmlPath: 'coverage.xml',
            coverageHtmlPath: 'htmlcov/index.html'
        }
    },
    java: {
        label: 'Java (Maven)',
        config: {
            language: 'java',
            command: 'mvn test',
            testFilter: '',
            junitXmlPath: 'target/surefire-reports/TEST-*.xml',
            coverageXmlPath: 'target/site/jacoco/jacoco.xml',
            coverageHtmlPath: 'target/site/jacoco/index.html'
        }
    },
    go: {
        label: 'Go',
        config: {
            language: 'go',
            command: 'go test ./... -v -coverprofile=coverage.out',
            testFilter: '',
            junitXmlPath: 'report.xml', // Requiere gotestsum
            coverageXmlPath: 'coverage.out',
            coverageHtmlPath: 'coverage.html'
        }
    },
    custom: {
        label: 'Custom',
        config: { ...DEFAULT_CONFIG, language: 'custom' }
    }
};

interface CoverageStat { covered: number; total: number; }
interface CoverageSummary {
    lines: CoverageStat;
    branches: CoverageStat;
    functions: CoverageStat;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_TESTS_PATH = 'microtermix-tests-selected-path';
const STORAGE_TESTS_TAB = 'microtermix-tests-active-tab';

function detectLanguage(project: any): TestLanguage {
    const type = (project.project_type || '').toLowerCase();
    const framework = (project.framework || '').toLowerCase();

    if (type === 'bun') return 'node'; // Bun use Node preset for now or we could add one
    if (type === 'node') return 'node';
    if (type === 'python') return 'python';
    if (type === 'java' || type === 'maven') return 'java';
    if (type === 'go') return 'go';

    // Framework based fallbacks
    if (framework === 'spring-boot') return 'java';
    if (framework === 'django' || framework === 'fastapi' || framework === 'flask') return 'python';

    return 'custom';
}

function buildFinalCommand(config: TestConfig): string {
    const { command, testFilter, language } = config;
    if (!testFilter.trim()) return command;

    switch (language) {
        case 'node':
            return `${command} -- -t "${testFilter}"`;
        case 'python':
            return `${command} -k "${testFilter}"`;
        case 'java':
            return `${command} -Dtest=${testFilter}`;
        case 'go':
            return `${command} -run ${testFilter}`;
        default:
            return `${command} ${testFilter}`;
    }
}

function configStorageKey(projectPath: string): string {
    return `microtermix-test-config-${projectPath.replace(/[/\\:]/g, '_')}`;
}
function loadConfig(projectPath: string): TestConfig {
    try {
        const raw = localStorage.getItem(configStorageKey(projectPath));
        if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (_) { }
    return { ...DEFAULT_CONFIG };
}
function saveConfig(projectPath: string, config: TestConfig): void {
    try { localStorage.setItem(configStorageKey(projectPath), JSON.stringify(config)); } catch (_) { }
}
function dirOf(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    return idx >= 0 ? normalized.substring(0, idx) : normalized;
}

function parseCoverageXml(content: string): CoverageSummary | null {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');

        // 1. Clover (Node)
        const cloverMetrics = doc.querySelector('project > metrics');
        if (cloverMetrics) {
            return {
                lines: { covered: parseInt(cloverMetrics.getAttribute('coveredstatements') || '0'), total: parseInt(cloverMetrics.getAttribute('statements') || '0') },
                branches: { covered: parseInt(cloverMetrics.getAttribute('coveredconditionals') || '0'), total: parseInt(cloverMetrics.getAttribute('conditionals') || '0') },
                functions: { covered: parseInt(cloverMetrics.getAttribute('coveredmethods') || '0'), total: parseInt(cloverMetrics.getAttribute('methods') || '0') },
            };
        }

        // 2. JaCoCo (Java)
        const reportEl = doc.querySelector('report');
        if (reportEl) {
            const getCounter = (type: string): CoverageStat => {
                const el = Array.from(doc.querySelectorAll('report > counter')).find(c => c.getAttribute('type') === type);
                if (el) {
                    const covered = parseInt(el.getAttribute('covered') || '0');
                    const missed = parseInt(el.getAttribute('missed') || '0');
                    return { covered, total: covered + missed };
                }
                return { covered: 0, total: 0 };
            };
            return { lines: getCounter('LINE'), branches: getCounter('BRANCH'), functions: getCounter('METHOD') };
        }

        // 3. Cobertura/Coverage.py (Python)
        const coverageEl = doc.querySelector('coverage');
        if (coverageEl) {
            const linesValid = parseInt(coverageEl.getAttribute('lines-valid') || '0');
            const linesCovered = parseInt(coverageEl.getAttribute('lines-covered') || '0');
            const branchRate = parseFloat(coverageEl.getAttribute('branch-rate') || '0');
            return {
                lines: { covered: linesCovered, total: linesValid },
                branches: { covered: Math.round(branchRate * 100), total: 100 },
                functions: { covered: 0, total: 0 },
            };
        }
        return null;
    } catch (_) { return null; }
}

function pct(stat: CoverageStat): number {
    if (stat.total === 0) return 0;
    return Math.round((stat.covered / stat.total) * 100);
}
function pctColor(p: number) {
    if (p >= 80) return { text: 'text-microtermix-success', bar: 'bg-microtermix-success' };
    if (p >= 60) return { text: 'text-yellow-400', bar: 'bg-yellow-400' };
    return { text: 'text-microtermix-danger', bar: 'bg-microtermix-danger' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CoverageStatBar: React.FC<{ label: string; stat: CoverageStat }> = ({ label, stat }) => {
    const p = pct(stat);
    const { text, bar } = pctColor(p);
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
                <span className={cn('text-sm font-bold', text)}>{p}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${p}%` }} />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">{stat.covered} / {stat.total}</p>
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const TestsPanel: React.FC = () => {
    const { state } = useWorkspace();
    const projects = state.projects;
    const { activeTasks, setTaskStatus } = useTaskStore();

    const [selectedPath, setSelectedPath] = useState<string>(() => {
        const saved = localStorage.getItem(STORAGE_TESTS_PATH);
        if (saved && projects.some(p => p.path === saved)) return saved;
        return projects.length > 0 ? projects[0].path as string : '';
    });
    useEffect(() => {
        if (!selectedPath && projects.length > 0) setSelectedPath(projects[0].path as string);
    }, [projects, selectedPath]);
    useEffect(() => {
        if (selectedPath) localStorage.setItem(STORAGE_TESTS_PATH, selectedPath);
    }, [selectedPath]);

    const [config, setConfig] = useState<TestConfig>(() => selectedPath ? loadConfig(selectedPath) : { ...DEFAULT_CONFIG });
    const [configOpen, setConfigOpen] = useState(false);
    const [coverageMap, setCoverageMap] = useState<Record<string, CoverageSummary | null>>({});
    const [coverageLoading, setCoverageLoading] = useState(false);
    const [coverageError, setCoverageError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'execution' | 'report'>(() => {
        const saved = localStorage.getItem(STORAGE_TESTS_TAB);
        return saved === 'report' ? 'report' : 'execution';
    });
    useEffect(() => { localStorage.setItem(STORAGE_TESTS_TAB, activeTab); }, [activeTab]);
    const [coverageServerPort, setCoverageServerPort] = useState<number | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // ── File Autocomplete state
    const [testFiles, setTestFiles] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const suggestions = useMemo(() => {
        const filter = (config.testFilter || '').toLowerCase();
        if (!filter || !showSuggestions) return [];
        return testFiles.filter(f => f.toLowerCase().includes(filter)).slice(0, 10);
    }, [testFiles, config.testFilter, showSuggestions]);

    const finalCmd = useMemo(() => buildFinalCommand(config), [config]);
    const taskId = useMemo(() => `tests-${selectedPath.replace(/[/\\:]/g, '_')}`, [selectedPath]);
    
    const taskState = activeTasks[taskId];
    const isRunning = taskState?.status === 'running';
    const processStatus = taskState?.status;

    // Fetch test files when project or language changes
    useEffect(() => {
        if (!selectedPath) {
            setTestFiles([]);
            return;
        }
        invoke<string[]>('list_test_files', { projectPath: selectedPath, language: config.language })
            .then(setTestFiles)
            .catch(err => {
                console.error('Failed to list test files', err);
                setTestFiles([]);
            });
    }, [selectedPath, config.language]);

    useEffect(() => {
        return () => { invoke('stop_coverage_server').catch(() => { }); };
    }, []);

    const stopCoverageServer = useCallback(async () => {
        try { await invoke('stop_coverage_server'); } catch (_) { }
        setCoverageServerPort(null);
        setActiveTab('execution');
    }, []);

    const handleSelectProject = (path: string) => {
        stopCoverageServer();
        setSelectedPath(path);

        // Auto-detección si no hay config guardada o es la primera vez
        const saved = localStorage.getItem(configStorageKey(path));
        if (!saved) {
            const project = projects.find(p => p.path === path);
            const lang = detectLanguage(project);
            const autoPreset = PRESETS[lang].config;
            setConfig(autoPreset);
            saveConfig(path, autoPreset);
        } else {
            setConfig(loadConfig(path));
        }
        setCoverageError(null);
    };

    const handleConfigChange = (patch: Partial<TestConfig>) => {
        const next = { ...config, ...patch };
        setConfig(next);
        if (selectedPath) saveConfig(selectedPath, next);
    };

    const handleRun = async () => {
        if (!selectedPath || !config.command) return;
        setTaskStatus(taskId, 'running');
        try {
            const exitCode = await invoke<number>('execute_ephemeral_task', {
                projectPath: selectedPath,
                command: finalCmd,
                taskId: taskId
            });
            setTaskStatus(taskId, exitCode === 0 ? 'success' : 'error', exitCode);
            loadCoverage();
        } catch (e) {
            console.error("Test execution failed", e);
            setTaskStatus(taskId, 'error');
        }
    };

    const handleStop = async () => {
        // En un futuro podríamos añadir un comando kill_ephemeral_task en Rust
        setTaskStatus(taskId, 'canceled');
    };

    const loadCoverage = useCallback(async () => {
        if (!selectedPath || !config.coverageXmlPath) return;
        setCoverageLoading(true);
        setCoverageError(null);
        try {
            const xmlPath = `${selectedPath}/${config.coverageXmlPath}`.replace(/\\/g, '/');
            const content = await invoke<string>('read_file_at_path', { path: xmlPath });
            const summary = parseCoverageXml(content);
            if (summary) {
                setCoverageMap(prev => ({ ...prev, [selectedPath]: summary }));
            } else {
                setCoverageError('No se pudo parsear el XML. Verifica el formato o la ruta.');
            }
        } catch (_) {
            setCoverageError(`No encontrado: ${config.coverageXmlPath} — ejecuta los tests primero.`);
        } finally {
            setCoverageLoading(false);
        }
    }, [selectedPath, config.coverageXmlPath]);

    const prevStatusRef = useRef<typeof processStatus>(undefined);
    useEffect(() => {
        if (prevStatusRef.current === 'running' && processStatus !== 'running') {
            loadCoverage();
            // Live Server Logic: Recargar iframe si está abierto y el servidor está activo
            if (coverageServerPort && iframeRef.current) {
                const currentSrc = iframeRef.current.src;
                iframeRef.current.src = 'about:blank';
                setTimeout(() => {
                    if (iframeRef.current) iframeRef.current.src = currentSrc;
                }, 50);
            }
        }
        prevStatusRef.current = processStatus;
    }, [processStatus, loadCoverage, coverageServerPort]);

    useEffect(() => {
        if (selectedPath) loadCoverage();
    }, [selectedPath, loadCoverage]);

    const handleOpenInAppReport = async () => {
        if (!selectedPath || !config.coverageHtmlPath) return;
        if (coverageServerPort !== null) { setActiveTab('report'); return; }
        setReportLoading(true);
        try {
            const htmlFullPath = `${selectedPath}/${config.coverageHtmlPath}`.replace(/\\/g, '/');
            const port = await invoke<number>('start_coverage_server', { htmlDir: dirOf(htmlFullPath) });
            setCoverageServerPort(port);
            setActiveTab('report');
        } catch (e) {
            setCoverageError(`No se pudo iniciar el servidor de reporte: ${e}`);
        } finally {
            setReportLoading(false);
        }
    };

    const coverage = coverageMap[selectedPath] ?? null;

    const statusBadge = taskState ? (
        <Badge className={cn(
            'ml-auto text-[10px] font-semibold rounded-full border-0',
            isRunning ? 'bg-microtermix-success/20 text-microtermix-success' :
                taskState.status === 'error' ? 'bg-microtermix-danger/20 text-microtermix-danger' :
                    'bg-slate-700 text-slate-400'
        )}>
            {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-microtermix-success animate-pulse mr-1 inline-block" />}
            {taskState.status}
        </Badge>
    ) : null;

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-900">
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <FlaskConical size={16} className="text-microtermix-neon" />
                <h2 className="text-sm font-bold text-slate-200">Tests & Coverage</h2>
            </div>

            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* ── Left: project list ──────────────────────────────────── */}
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
                            const cov = coverageMap[path];
                            const linesP = cov ? pct(cov.lines) : null;
                            const tid = `tests-${path.replace(/[/\\:]/g, '_')}`;
                            const running = activeTasks[tid]?.status === 'running';
                            const isSelected = selectedPath === path;
                            return (
                                <div
                                    key={path}
                                    onClick={() => handleSelectProject(path)}
                                    className={cn(
                                        'flex items-center justify-between px-3 py-2 cursor-pointer transition-colors border-l-2',
                                        isSelected
                                            ? 'bg-microtermix-neon/10 border-microtermix-neon'
                                            : 'border-transparent hover:bg-slate-800/40 hover:border-slate-600',
                                    )}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className={cn('text-xs font-medium truncate', isSelected ? 'text-microtermix-neon' : 'text-slate-300')}>
                                            {p.name as string}
                                        </p>
                                        {running && (
                                            <span className="text-[9px] text-microtermix-success flex items-center gap-1 mt-0.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-microtermix-success animate-pulse inline-block" />
                                                running
                                            </span>
                                        )}
                                    </div>
                                    {linesP !== null && (
                                        <Badge className={cn(
                                            'ml-2 shrink-0 text-[10px] font-bold border-0 rounded',
                                            pctColor(linesP).text, 'bg-slate-800',
                                        )}>
                                            {linesP}%
                                        </Badge>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Right ─────────────────────────────────────────────── */}
                {selectedPath ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                        {/* Action bar */}
                        <div className="shrink-0 px-4 py-2 border-b border-slate-800 flex items-center gap-2 bg-slate-900/80">
                            {isRunning ? (
                                <Button
                                    size="sm"
                                    onClick={handleStop}
                                    className="bg-microtermix-danger/20 text-microtermix-danger hover:bg-microtermix-danger/30 border border-microtermix-danger/40 font-bold gap-1.5 h-7 text-xs"
                                >
                                    <Square size={12} fill="currentColor" /> Stop
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    onClick={handleRun}
                                    disabled={!config.command}
                                    className="bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/80 font-bold gap-1.5 h-7 text-xs"
                                >
                                    <Play size={12} fill="currentColor" /> Run tests
                                </Button>
                            )}

                            <div className="relative flex-1 max-w-xs group">
                                <Search size={12} className={cn(
                                    "absolute left-2.5 top-1/2 -translate-y-1/2 transition-colors",
                                    config.testFilter ? "text-microtermix-neon" : "text-slate-500"
                                )} />
                                <input
                                    type="text"
                                    value={config.testFilter || ''}
                                    onChange={e => {
                                        handleConfigChange({ testFilter: e.target.value });
                                        setShowSuggestions(true);
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    placeholder={
                                        config.language === 'node' ? "Filtrar (archivo/regex)..." :
                                            config.language === 'python' ? "Filtrar (archivo/keyword)..." :
                                                config.language === 'java' ? "Filtrar (ClassName)..." :
                                                    "Filtrar tests..."
                                    }
                                    className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-7 py-1.5 text-[11px] text-slate-300 outline-none focus:border-microtermix-neon/50 focus:ring-1 focus:ring-microtermix-neon/20 transition-all"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !isRunning) {
                                            handleRun();
                                            setShowSuggestions(false);
                                        }
                                    }}
                                />
                                {config.testFilter && (
                                    <button
                                        onClick={() => handleConfigChange({ testFilter: '' })}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-microtermix-danger transition-colors p-0.5"
                                        title="Limpiar filtro"
                                    >
                                        <X size={12} />
                                    </button>
                                )}

                                {/* Autocomplete Dropdown */}
                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-md shadow-2xl z-50 max-h-60 overflow-y-auto py-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div className="px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest bg-slate-950/50 mb-1 border-b border-slate-800">
                                            Archivos de test detectados
                                        </div>
                                        {suggestions.map((file, i) => (
                                            <button
                                                key={i}
                                                className="w-full text-left px-3 py-1.5 text-[10px] text-slate-300 hover:bg-microtermix-neon/10 hover:text-microtermix-neon transition-colors truncate font-mono"
                                                onClick={() => {
                                                    handleConfigChange({ testFilter: file });
                                                    setShowSuggestions(false);
                                                }}
                                            >
                                                {file}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Separator orientation="vertical" className="h-4 bg-slate-700" />

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={loadCoverage}
                                disabled={coverageLoading || isRunning}
                                className="border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 gap-1.5 h-7 text-xs"
                            >
                                <RefreshCw size={11} className={coverageLoading ? 'animate-spin' : ''} />
                                {coverageLoading ? 'Cargando...' : 'Refresh coverage'}
                            </Button>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleOpenInAppReport}
                                disabled={reportLoading || isRunning}
                                className="border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 gap-1.5 h-7 text-xs"
                            >
                                <Monitor size={11} />
                                {reportLoading ? 'Iniciando...' : 'Open report'}
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => setConfigOpen(true)}
                                className="text-slate-500 hover:text-slate-200 ml-1"
                                title="Configuración"
                            >
                                <Settings size={13} />
                            </Button>

                            {statusBadge}
                        </div>

                        {/* Tab bar */}
                        <div className="shrink-0 flex border-b border-slate-800 bg-slate-950/40">
                            {(['execution', 'report'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => tab === 'report'
                                        ? (coverageServerPort ? setActiveTab('report') : handleOpenInAppReport())
                                        : setActiveTab('execution')
                                    }
                                    className={cn(
                                        'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors',
                                        activeTab === tab
                                            ? 'border-microtermix-neon text-microtermix-neon'
                                            : 'border-transparent text-slate-500 hover:text-slate-300',
                                    )}
                                >
                                    {tab === 'execution'
                                        ? <><TerminalSquare size={12} /> Ejecución</>
                                        : <><ExternalLink size={12} /> Reporte
                                            {coverageServerPort && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-microtermix-success inline-block" />}
                                        </>
                                    }
                                </button>
                            ))}
                        </div>

                        {/* ── Execution tab ──────────────────────────────── */}
                        {activeTab === 'execution' && (
                            <div className="flex-1 flex min-h-0 overflow-hidden">
                                <div className="flex-1 min-w-0 p-2 flex flex-col overflow-hidden">
                                    <TaskTerminal taskId={taskId} />
                                </div>

                                {/* Coverage sidebar */}
                                <div className="w-60 shrink-0 border-l border-slate-800 flex flex-col overflow-y-auto p-4 gap-4 bg-slate-950/30">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Coverage</p>

                                    {coverageError && !coverage && (
                                        <p className="text-[11px] text-slate-500 italic leading-relaxed">{coverageError}</p>
                                    )}

                                    {coverage ? (
                                        <div className="space-y-4">
                                            <CoverageStatBar label="Lines" stat={coverage.lines} />
                                            {coverage.branches.total > 0 && <CoverageStatBar label="Branches" stat={coverage.branches} />}
                                            {coverage.functions.total > 0 && <CoverageStatBar label="Functions" stat={coverage.functions} />}
                                        </div>
                                    ) : !coverageError && (
                                        <p className="text-[11px] text-slate-600 italic">
                                            Sin datos. Ejecuta los tests y haz click en "Refresh coverage".
                                        </p>
                                    )}

                                    {coverage && (
                                        <>
                                            <Separator className="bg-slate-800" />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleOpenInAppReport}
                                                disabled={reportLoading}
                                                className="w-full border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 gap-1.5"
                                            >
                                                <Monitor size={12} /> Abrir reporte completo
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Report tab (iframe) ────────────────────────── */}
                        {activeTab === 'report' && (
                            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                {coverageServerPort ? (
                                    <>
                                        <div className="shrink-0 px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 flex items-center gap-2">
                                            <span className="text-[10px] font-mono text-slate-500">
                                                http://127.0.0.1:{coverageServerPort}/
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="xs"
                                                onClick={stopCoverageServer}
                                                className="ml-auto text-slate-500 hover:text-microtermix-danger h-auto py-0.5"
                                            >
                                                Cerrar servidor
                                            </Button>
                                        </div>
                                        <iframe
                                            key={coverageServerPort}
                                            src={`http://127.0.0.1:${coverageServerPort}/`}
                                            className="flex-1 w-full border-0 bg-white"
                                            title="Coverage Report"
                                        />
                                    </>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                                        <div className="text-center">
                                            <Monitor size={28} className="mx-auto mb-2 text-slate-700" />
                                            <p>Haz click en "Open report" para ver el reporte aquí</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                        Selecciona un proyecto para comenzar
                    </div>
                )}
            </div>

            {/* ── Config Dialog ─────────────────────────────────────────── */}
            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
                <DialogContent className="max-w-lg bg-slate-900 border-slate-700 p-0" showCloseButton={false}>
                    <DialogHeader className="flex flex-row items-center gap-2 px-4 py-3 border-b border-slate-700">
                        <Settings size={14} className="text-microtermix-neon" />
                        <DialogTitle className="text-slate-200 flex-1">Configuración de tests</DialogTitle>
                        <Button variant="ghost" size="icon-sm" onClick={() => setConfigOpen(false)} className="text-slate-500 hover:text-slate-200">
                            <X size={15} />
                        </Button>
                    </DialogHeader>

                    <div className="px-4 py-4 space-y-4">
                        {/* Presets */}
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Preset de Lenguaje</label>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(PRESETS).map(([id, preset]) => {
                                    const isActive = config.language === id;
                                    return (
                                        <Button
                                            key={id}
                                            size="xs"
                                            variant={isActive ? 'default' : 'outline'}
                                            onClick={() => {
                                                setConfig(preset.config);
                                                if (selectedPath) saveConfig(selectedPath, preset.config);
                                            }}
                                            className={cn(
                                                "justify-start gap-2 h-9 px-3",
                                                isActive
                                                    ? 'bg-microtermix-neon/20 text-microtermix-neon border-microtermix-neon/40'
                                                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                                            )}
                                        >
                                            <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-microtermix-neon shadow-[0_0_8px_rgba(56,189,248,0.6)]" : "bg-slate-700")} />
                                            {preset.label}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>

                        <Separator className="bg-slate-800" />

                        <div className="space-y-3">
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 text-microtermix-neon/70">Comando Base</label>
                                <Input
                                    value={config.command}
                                    onChange={e => handleConfigChange({ command: e.target.value })}
                                    className="bg-slate-950 border-slate-800 focus-visible:border-microtermix-neon text-slate-200 font-mono text-xs"
                                />
                                <p className="text-[9px] text-slate-600 mt-1">El filtro se añadirá automáticamente al final según el lenguaje.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">JUnit XML (Resultados)</label>
                                    <Input
                                        value={config.junitXmlPath}
                                        onChange={e => handleConfigChange({ junitXmlPath: e.target.value })}
                                        className="bg-slate-950 border-slate-800 text-slate-300 font-mono text-[10px] h-8"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Clover/JaCoCo XML</label>
                                    <Input
                                        value={config.coverageXmlPath}
                                        onChange={e => handleConfigChange({ coverageXmlPath: e.target.value })}
                                        className="bg-slate-950 border-slate-800 text-slate-300 font-mono text-[10px] h-8"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">HTML Report Path</label>
                                <Input
                                    value={config.coverageHtmlPath}
                                    onChange={e => handleConfigChange({ coverageHtmlPath: e.target.value })}
                                    className="bg-slate-950 border-slate-800 text-slate-300 font-mono text-[10px] h-8"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end px-4 py-3 border-t border-slate-700">
                        <Button onClick={() => setConfigOpen(false)} className="bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/80 font-bold">
                            Listo
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
