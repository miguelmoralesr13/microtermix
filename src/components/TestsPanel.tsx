import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    FlaskConical, Play, Square, RefreshCw, ExternalLink,
    Settings, ChevronDown, ChevronRight, Monitor, TerminalSquare,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { TerminalView } from './TerminalView';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TestConfig {
    command: string;
    coverageXmlPath: string;
    coverageHtmlPath: string;
}

const DEFAULT_CONFIG: TestConfig = {
    command: 'npm run test',
    coverageXmlPath: 'coverage/clover.xml',
    coverageHtmlPath: 'coverage/lcov-report/index.html',
};

const PRESETS: { label: string; config: TestConfig }[] = [
    {
        label: 'Vitest',
        config: {
            command: 'npm run test',
            coverageXmlPath: 'coverage/clover.xml',
            coverageHtmlPath: 'coverage/lcov-report/index.html',
        },
    },
    {
        label: 'Jest',
        config: {
            command: 'npx jest --coverage',
            coverageXmlPath: 'coverage/clover.xml',
            coverageHtmlPath: 'coverage/lcov-report/index.html',
        },
    },
    {
        label: 'Maven / JaCoCo',
        config: {
            command: 'mvn test',
            coverageXmlPath: 'target/site/jacoco/jacoco.xml',
            coverageHtmlPath: 'target/site/jacoco/index.html',
        },
    },
    {
        label: 'Gradle / JaCoCo',
        config: {
            command: './gradlew test jacocoTestReport',
            coverageXmlPath: 'build/reports/jacoco/test/jacocoTestReport.xml',
            coverageHtmlPath: 'build/reports/jacoco/test/html/index.html',
        },
    },
];

interface CoverageStat { covered: number; total: number; }
interface CoverageSummary {
    lines: CoverageStat;
    branches: CoverageStat;
    functions: CoverageStat;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_TESTS_PATH = 'nexus-tests-selected-path';
const STORAGE_TESTS_TAB = 'nexus-tests-active-tab';

function configStorageKey(projectPath: string): string {
    return `nexus-test-config-${projectPath.replace(/[/\\:]/g, '_')}`;
}

function loadConfig(projectPath: string): TestConfig {
    try {
        const raw = localStorage.getItem(configStorageKey(projectPath));
        if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (_) { }
    return { ...DEFAULT_CONFIG };
}

function saveConfig(projectPath: string, config: TestConfig): void {
    try {
        localStorage.setItem(configStorageKey(projectPath), JSON.stringify(config));
    } catch (_) { }
}

/** Extracts the directory from a file path */
function dirOf(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    return idx >= 0 ? normalized.substring(0, idx) : normalized;
}

function parseCoverageXml(content: string): CoverageSummary | null {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');

        // Clover format (Vitest / Jest)
        const cloverMetrics = doc.querySelector('project > metrics');
        if (cloverMetrics) {
            return {
                lines: {
                    covered: parseInt(cloverMetrics.getAttribute('coveredstatements') || '0'),
                    total: parseInt(cloverMetrics.getAttribute('statements') || '0'),
                },
                branches: {
                    covered: parseInt(cloverMetrics.getAttribute('coveredconditionals') || '0'),
                    total: parseInt(cloverMetrics.getAttribute('conditionals') || '0'),
                },
                functions: {
                    covered: parseInt(cloverMetrics.getAttribute('coveredmethods') || '0'),
                    total: parseInt(cloverMetrics.getAttribute('methods') || '0'),
                },
            };
        }

        // JaCoCo XML format (Maven / Gradle)
        const reportEl = doc.querySelector('report');
        if (reportEl) {
            const getCounter = (type: string): CoverageStat => {
                for (const el of Array.from(doc.querySelectorAll('report > counter'))) {
                    if (el.getAttribute('type') === type) {
                        const covered = parseInt(el.getAttribute('covered') || '0');
                        const missed = parseInt(el.getAttribute('missed') || '0');
                        return { covered, total: covered + missed };
                    }
                }
                return { covered: 0, total: 0 };
            };
            return {
                lines: getCounter('LINE'),
                branches: getCounter('BRANCH'),
                functions: getCounter('METHOD'),
            };
        }

        // Cobertura format
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
    } catch (_) {
        return null;
    }
}

function pct(stat: CoverageStat): number {
    if (stat.total === 0) return 0;
    return Math.round((stat.covered / stat.total) * 100);
}
function pctTextColor(p: number): string {
    if (p >= 80) return 'text-nexus-success';
    if (p >= 60) return 'text-yellow-400';
    return 'text-nexus-danger';
}
function pctBarColor(p: number): string {
    if (p >= 80) return 'bg-nexus-success';
    if (p >= 60) return 'bg-yellow-400';
    return 'bg-nexus-danger';
}

// ─── Coverage stat bar ────────────────────────────────────────────────────────

const CoverageStatBar: React.FC<{ label: string; stat: CoverageStat }> = ({ label, stat }) => {
    const p = pct(stat);
    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
                <span className={`text-sm font-bold ${pctTextColor(p)}`}>{p}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${pctBarColor(p)}`} style={{ width: `${p}%` }} />
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">{stat.covered} / {stat.total}</p>
        </div>
    );
};

// ─── Main component ──────────────────────────────────────────────────────────

export const TestsPanel: React.FC = () => {
    const { state, executeProjectScript, updateProcessStatus } = useWorkspace();
    const projects = state.projects;

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

    const [config, setConfig] = useState<TestConfig>(() =>
        selectedPath ? loadConfig(selectedPath) : { ...DEFAULT_CONFIG }
    );
    const [configOpen, setConfigOpen] = useState(false);

    // Coverage data
    const [coverageMap, setCoverageMap] = useState<Record<string, CoverageSummary | null>>({});
    const [coverageLoading, setCoverageLoading] = useState(false);
    const [coverageError, setCoverageError] = useState<string | null>(null);

    // In-app report viewer
    const [activeTab, setActiveTab] = useState<'execution' | 'report'>(() => {
        const saved = localStorage.getItem(STORAGE_TESTS_TAB);
        return saved === 'report' ? 'report' : 'execution';
    });
    useEffect(() => { localStorage.setItem(STORAGE_TESTS_TAB, activeTab); }, [activeTab]);
    const [coverageServerPort, setCoverageServerPort] = useState<number | null>(null);
    const [reportLoading, setReportLoading] = useState(false);

    const serviceId = useMemo(() => `${selectedPath}::${config.command} `, [selectedPath, config.command]);
    const processState = state.activeProcesses[serviceId];
    const isRunning = processState?.status === 'running';
    const processStatus = processState?.status;

    // Auto-load coverage when tests finish naturally
    const prevStatusRef = useRef<typeof processStatus>(undefined);
    useEffect(() => {
        if (prevStatusRef.current === 'running' && processStatus === 'stopped') {
            loadCoverage();
        }
        prevStatusRef.current = processStatus;
    }, [processStatus]);

    // Stop coverage server when unmounting or switching project
    useEffect(() => {
        return () => {
            invoke('stop_coverage_server').catch(() => { });
        };
    }, []);

    const stopCoverageServer = useCallback(async () => {
        try { await invoke('stop_coverage_server'); } catch (_) { }
        setCoverageServerPort(null);
        setActiveTab('execution');
    }, []);

    const handleSelectProject = (path: string) => {
        stopCoverageServer();
        setSelectedPath(path);
        setConfig(loadConfig(path));
        setCoverageError(null);
    };

    const handleConfigChange = (patch: Partial<TestConfig>) => {
        const next = { ...config, ...patch };
        setConfig(next);
        if (selectedPath) saveConfig(selectedPath, next);
    };

    const applyPreset = (preset: TestConfig) => {
        setConfig(preset);
        if (selectedPath) saveConfig(selectedPath, preset);
    };

    // Run / Stop
    const handleRun = async () => {
        if (!selectedPath || !config.command) return;
        await executeProjectScript(selectedPath, config.command, { globalEnvName: 'none' });
    };

    const handleStop = async () => {
        try {
            await invoke('kill_service', { serviceId });
            updateProcessStatus(serviceId, 'stopped');
        } catch (_) { }
    };

    // Load coverage XML
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
                setCoverageError('No se pudo parsear el archivo XML. Verifica el formato o la ruta.');
            }
        } catch (_) {
            setCoverageError(`No encontrado: ${config.coverageXmlPath} — ejecuta los tests primero.`);
        } finally {
            setCoverageLoading(false);
        }
    }, [selectedPath, config.coverageXmlPath]);

    // Auto-load when project changes
    useEffect(() => {
        if (selectedPath) loadCoverage();
    }, [selectedPath]); // eslint-disable-line react-hooks/exhaustive-deps

    // Open in-app report: start coverage server → switch to report tab
    // If a server is already running, just navigate to the report tab.
    const handleOpenInAppReport = async () => {
        if (!selectedPath || !config.coverageHtmlPath) return;
        if (coverageServerPort !== null) {
            setActiveTab('report');
            return;
        }
        setReportLoading(true);
        try {
            const htmlFullPath = `${selectedPath}/${config.coverageHtmlPath}`.replace(/\\/g, '/');
            const htmlDir = dirOf(htmlFullPath);
            const port = await invoke<number>('start_coverage_server', { htmlDir });
            setCoverageServerPort(port);
            setActiveTab('report');
        } catch (e) {
            setCoverageError(`No se pudo iniciar el servidor de reporte: ${e}`);
        } finally {
            setReportLoading(false);
        }
    };

    const coverage = coverageMap[selectedPath] ?? null;

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900">
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <FlaskConical size={16} className="text-nexus-neon" />
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
                            const sid = `${path}::${config.command} `;
                            const running = state.activeProcesses[sid]?.status === 'running';
                            return (
                                <div
                                    key={path}
                                    onClick={() => handleSelectProject(path)}
                                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors border-l-2 ${selectedPath === path
                                        ? 'bg-nexus-neon/10 border-nexus-neon'
                                        : 'border-transparent hover:bg-slate-800/40 hover:border-slate-600'
                                        }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-medium truncate ${selectedPath === path ? 'text-nexus-neon' : 'text-slate-300'}`}>
                                            {p.name as string}
                                        </p>
                                        {running && (
                                            <span className="text-[9px] text-nexus-success flex items-center gap-1 mt-0.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-nexus-success animate-pulse inline-block" />
                                                running
                                            </span>
                                        )}
                                    </div>
                                    {linesP !== null && (
                                        <span className={`ml-2 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${pctTextColor(linesP)} bg-slate-800`}>
                                            {linesP}%
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Right ─────────────────────────────────────────────── */}
                {selectedPath ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        {/* Config (collapsible) */}
                        <div className="shrink-0 border-b border-slate-800 bg-slate-950/50">
                            <button
                                type="button"
                                onClick={() => setConfigOpen(o => !o)}
                                className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 transition-colors"
                            >
                                {configOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                <Settings size={12} />
                                <span>Configuración</span>
                                <span className="ml-auto font-mono text-[10px] text-slate-500 truncate max-w-xs">{config.command}</span>
                            </button>

                            {configOpen && (
                                <div className="px-4 pb-4 pt-1 space-y-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {PRESETS.map(preset => (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => applyPreset(preset.config)}
                                                className={`px-2.5 py-1 text-[10px] font-semibold rounded border transition-colors ${config.command === preset.config.command && config.coverageXmlPath === preset.config.coverageXmlPath
                                                    ? 'bg-nexus-neon/20 text-nexus-neon border-nexus-neon/40'
                                                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500'
                                                    }`}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Comando</label>
                                        <input
                                            type="text"
                                            value={config.command}
                                            onChange={e => handleConfigChange({ command: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 focus:border-nexus-neon rounded px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none transition-colors"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">XML Coverage</label>
                                            <input
                                                type="text"
                                                value={config.coverageXmlPath}
                                                onChange={e => handleConfigChange({ coverageXmlPath: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 focus:border-nexus-neon rounded px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">HTML Report</label>
                                            <input
                                                type="text"
                                                value={config.coverageHtmlPath}
                                                onChange={e => handleConfigChange({ coverageHtmlPath: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 focus:border-nexus-neon rounded px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none transition-colors"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action bar */}
                        <div className="shrink-0 px-4 py-2 border-b border-slate-800 flex items-center gap-2 bg-slate-900/80">
                            {isRunning ? (
                                <button
                                    onClick={handleStop}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-nexus-danger/20 text-nexus-danger font-bold text-xs rounded border border-nexus-danger/40 hover:bg-nexus-danger/30 transition-colors"
                                >
                                    <Square size={13} fill="currentColor" /> Stop
                                </button>
                            ) : (
                                <button
                                    onClick={handleRun}
                                    disabled={!config.command}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-nexus-neon text-slate-900 font-bold text-xs rounded hover:bg-[#00ffd5] transition-colors disabled:opacity-50"
                                >
                                    <Play size={13} fill="currentColor" /> Run tests
                                </button>
                            )}

                            <div className="w-px h-4 bg-slate-700 mx-1" />

                            <button
                                onClick={loadCoverage}
                                disabled={coverageLoading || isRunning}
                                title="Recargar coverage desde XML"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded border border-slate-700 transition-colors disabled:opacity-50"
                            >
                                <RefreshCw size={12} className={coverageLoading ? 'animate-spin' : ''} />
                                {coverageLoading ? 'Cargando...' : 'Refresh coverage'}
                            </button>

                            <button
                                onClick={handleOpenInAppReport}
                                disabled={reportLoading || isRunning}
                                title="Abrir reporte HTML dentro de la app"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded border border-slate-700 transition-colors disabled:opacity-50"
                            >
                                <Monitor size={12} />
                                {reportLoading ? 'Iniciando...' : 'Open report'}
                            </button>

                            {processState && (
                                <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${isRunning ? 'bg-nexus-success/20 text-nexus-success'
                                    : processState.status === 'error' ? 'bg-nexus-danger/20 text-nexus-danger'
                                        : 'bg-slate-700 text-slate-400'
                                    }`}>
                                    {processState.status}
                                </span>
                            )}
                        </div>

                        {/* Tab bar */}
                        <div className="shrink-0 flex border-b border-slate-800 bg-slate-950/40">
                            <button
                                onClick={() => setActiveTab('execution')}
                                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'execution'
                                    ? 'border-nexus-neon text-nexus-neon'
                                    : 'border-transparent text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                <TerminalSquare size={12} /> Ejecución
                            </button>
                            <button
                                onClick={() => coverageServerPort ? setActiveTab('report') : handleOpenInAppReport()}
                                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${activeTab === 'report'
                                    ? 'border-nexus-neon text-nexus-neon'
                                    : 'border-transparent text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                <ExternalLink size={12} /> Reporte
                                {coverageServerPort && (
                                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-nexus-success inline-block" />
                                )}
                            </button>
                        </div>

                        {/* ── Execution tab ─────────────────────────────── */}
                        {activeTab === 'execution' && (
                            <div className="flex-1 flex min-h-0 overflow-hidden">
                                {/* Terminal */}
                                <div className="flex-1 min-w-0 p-2 flex flex-col overflow-hidden">
                                    {processState ? (
                                        <TerminalView serviceId={serviceId} />
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm bg-slate-950 rounded-lg border border-slate-800">
                                            <div className="text-center">
                                                <FlaskConical size={28} className="mx-auto mb-2 text-slate-700" />
                                                <p>Ejecuta los tests para ver el output aquí</p>
                                                <p className="text-xs mt-1 font-mono text-slate-700">{config.command}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Coverage stats sidebar */}
                                <div className="w-60 shrink-0 border-l border-slate-800 flex flex-col overflow-y-auto p-4 gap-5 bg-slate-950/30">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Coverage</p>

                                        {coverageError && !coverage && (
                                            <p className="text-[11px] text-slate-500 italic leading-relaxed">{coverageError}</p>
                                        )}

                                        {coverage ? (
                                            <div className="space-y-4">
                                                <CoverageStatBar label="Lines" stat={coverage.lines} />
                                                {coverage.branches.total > 0 && (
                                                    <CoverageStatBar label="Branches" stat={coverage.branches} />
                                                )}
                                                {coverage.functions.total > 0 && (
                                                    <CoverageStatBar label="Functions" stat={coverage.functions} />
                                                )}
                                            </div>
                                        ) : !coverageError && (
                                            <p className="text-[11px] text-slate-600 italic">
                                                Sin datos. Ejecuta los tests y haz click en "Refresh coverage".
                                            </p>
                                        )}
                                    </div>

                                    {coverage && (
                                        <button
                                            onClick={handleOpenInAppReport}
                                            disabled={reportLoading}
                                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded border border-slate-700 transition-colors disabled:opacity-50"
                                        >
                                            <Monitor size={12} /> Abrir reporte completo
                                        </button>
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
                                            <button
                                                onClick={stopCoverageServer}
                                                className="ml-auto text-[10px] text-slate-500 hover:text-nexus-danger transition-colors"
                                            >
                                                Cerrar servidor
                                            </button>
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
        </div>
    );
};
