import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    FlaskConical, Play, Square, RefreshCw, ExternalLink,
    Settings, Monitor, TerminalSquare, X, Search,
} from 'lucide-react';
import { TestsSidebarList } from './TestsSidebarList';
import { useWorkspace } from '../../context/WorkspaceContext';
import { TaskTerminal } from '../ui/task-terminal';
import { useTaskStore } from '../../stores/taskStore';
import { useCoverageStore, type CoverageStat } from '../../stores/coverageStore';
import { Button } from '@/components//ui/button';
import { Input } from '@/components//ui/input';
import { Badge } from '@/components//ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components//ui/dialog';
import { Separator } from '@/components//ui/separator';
import { cn } from '@/lib/utils';
import { TestConfig, DEFAULT_CONFIG, PRESETS, detectLanguage, buildFinalCommand, configStorageKey, loadConfig, saveConfig, dirOf, parseCoverageXml, pct, pctColor } from '../../utils/testUtils';
import { TestsDashboard } from '../tests/TestsDashboard';

const STORAGE_TESTS_PATH = 'microtermix-tests-selected-path';
const STORAGE_TESTS_TAB = 'microtermix-tests-active-tab';

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
    const { coverageMap, setCoverage } = useCoverageStore();

    const [selectedPath, setSelectedPath] = useState<string>(() => {
        const saved = localStorage.getItem(STORAGE_TESTS_PATH);
        if (saved && (saved === 'dashboard' || projects.some(p => p.path === saved))) return saved;
        return 'dashboard';
    });
    useEffect(() => {
        if (!selectedPath && projects.length > 0) setSelectedPath(projects[0].path as string);
    }, [projects, selectedPath]);
    useEffect(() => {
        if (selectedPath) localStorage.setItem(STORAGE_TESTS_PATH, selectedPath);
    }, [selectedPath]);

    const [config, setConfig] = useState<TestConfig>(() => selectedPath && selectedPath !== 'dashboard' ? loadConfig(selectedPath) : { ...DEFAULT_CONFIG });
    const [configOpen, setConfigOpen] = useState(false);
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
        
        if (path === 'dashboard') return;

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
        setTaskStatus(taskId, 'canceled');
    };

    const loadCoverage = useCallback(async () => {
        if (!selectedPath || selectedPath === 'dashboard' || !config.coverageXmlPath) return;
        setCoverageLoading(true);
        setCoverageError(null);
        try {
            const xmlPath = `${selectedPath}/${config.coverageXmlPath}`.replace(/\\/g, '/');
            const content = await invoke<string>('read_file_at_path', { path: xmlPath });
            const summary = parseCoverageXml(content);
            if (summary) {
                setCoverage(selectedPath, summary);
            } else {
                setCoverageError('No se pudo parsear el XML.');
            }
        } catch (_) {
            setCoverageError(`No encontrado: ${config.coverageXmlPath}`);
        } finally {
            setCoverageLoading(false);
        }
    }, [selectedPath, config.coverageXmlPath, setCoverage]);

    const prevStatusRef = useRef<typeof processStatus>(undefined);
    useEffect(() => {
        if (prevStatusRef.current === 'running' && processStatus !== 'running') {
            loadCoverage();
            if (coverageServerPort && iframeRef.current) {
                const src = iframeRef.current.src;
                iframeRef.current.src = 'about:blank';
                setTimeout(() => { if (iframeRef.current) iframeRef.current.src = src; }, 50);
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
                taskState.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                    'bg-slate-700 text-slate-400'
        )}>
            {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-microtermix-success animate-pulse mr-1 inline-block" />}
            {taskState.status}
        </Badge>
    ) : null;

    return (
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-slate-900">
            <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <FlaskConical size={16} className="text-microtermix-neon" />
                <h2 className="text-sm font-bold text-slate-200">Tests & Coverage</h2>
            </div>

            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* ── Left: project list ──────────────────────────────────── */}
                <TestsSidebarList
                    projects={projects}
                    selectedPath={selectedPath}
                    onSelectPath={handleSelectProject}
                />

                {/* ── Right ─────────────────────────────────────────────── */}
                {selectedPath === 'dashboard' ? (
                    <TestsDashboard projects={projects} onSelectProject={handleSelectProject} />
                ) : selectedPath ? (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="shrink-0 px-4 py-2 border-b border-slate-800 flex items-center gap-2 bg-slate-900/80">
                            {isRunning ? (
                                <Button size="sm" onClick={handleStop} className="bg-microtermix-danger/20 text-microtermix-danger hover:bg-microtermix-danger/30 border border-microtermix-danger/40 font-bold gap-1.5 h-7 text-xs">
                                    <Square size={12} fill="currentColor" /> Stop
                                </Button>
                            ) : (
                                <Button size="sm" onClick={handleRun} disabled={!config.command} className="bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/80 font-bold gap-1.5 h-7 text-xs">
                                    <Play size={12} fill="currentColor" /> Run tests
                                </Button>
                            )}

                            <div className="relative flex-1 max-w-xs group">
                                <Search size={12} className={cn("absolute left-2.5 top-1/2 -translate-y-1/2", config.testFilter ? "text-microtermix-neon" : "text-slate-500")} />
                                <input
                                    type="text"
                                    value={config.testFilter || ''}
                                    onChange={e => { handleConfigChange({ testFilter: e.target.value }); setShowSuggestions(true); }}
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                    placeholder="Filtrar tests..."
                                    className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-7 py-1.5 text-[11px] text-slate-300 outline-none focus:border-microtermix-neon/50 transition-all"
                                    onKeyDown={e => { if (e.key === 'Enter' && !isRunning) { handleRun(); setShowSuggestions(false); } }}
                                />
                                {config.testFilter && (
                                    <button onClick={() => handleConfigChange({ testFilter: '' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-microtermix-danger p-0.5"><X size={12} /></button>
                                )}
                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-md shadow-2xl z-50 max-h-60 overflow-y-auto py-1">
                                        {suggestions.map((file, i) => (
                                            <button key={i} className="w-full text-left px-3 py-1.5 text-[10px] text-slate-300 hover:bg-microtermix-neon/10 hover:text-microtermix-neon truncate font-mono" onClick={() => { handleConfigChange({ testFilter: file }); setShowSuggestions(false); }}>{file}</button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Separator orientation="vertical" className="h-4 bg-slate-700" />
                            <Button variant="outline" size="sm" onClick={loadCoverage} disabled={coverageLoading || isRunning} className="border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 gap-1.5 h-7 text-xs">
                                <RefreshCw size={11} className={coverageLoading ? 'animate-spin' : ''} /> {coverageLoading ? 'Cargando...' : 'Refresh coverage'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleOpenInAppReport} disabled={reportLoading || isRunning} className="border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 gap-1.5 h-7 text-xs">
                                <Monitor size={11} /> {reportLoading ? 'Iniciando...' : 'Open report'}
                            </Button>
                            <Button variant="ghost" size="icon-xs" onClick={() => setConfigOpen(true)} className="text-slate-500 hover:text-slate-200 ml-1"><Settings size={13} /></Button>
                            {statusBadge}
                        </div>

                        <div className="shrink-0 flex border-b border-slate-800 bg-slate-950/40">
                            {(['execution', 'report'] as const).map(tab => (
                                <button key={tab} onClick={() => tab === 'report' ? (coverageServerPort ? setActiveTab('report') : handleOpenInAppReport()) : setActiveTab('execution')}
                                    className={cn('flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-colors', activeTab === tab ? 'border-microtermix-neon text-microtermix-neon' : 'border-transparent text-slate-500 hover:text-slate-300')}>
                                    {tab === 'execution' ? <><TerminalSquare size={12} /> Ejecución</> : <><ExternalLink size={12} /> Reporte {coverageServerPort && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-microtermix-success inline-block" />}</>}
                                </button>
                            ))}
                        </div>

                        {activeTab === 'execution' && (
                            <div className="flex-1 flex min-h-0 overflow-hidden">
                                <div className="flex-1 min-w-0 p-2 flex flex-col overflow-hidden">
                                    <TaskTerminal taskId={taskId} />
                                </div>
                                <div className="w-60 shrink-0 border-l border-slate-800 flex flex-col overflow-y-auto p-4 gap-4 bg-slate-950/30">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Coverage</p>
                                    {coverageError && !coverage && <p className="text-[11px] text-slate-500 italic leading-relaxed">{coverageError}</p>}
                                    {coverage ? (
                                        <div className="space-y-4">
                                            <CoverageStatBar label="Lines" stat={coverage.lines} />
                                            {coverage.branches.total > 0 && <CoverageStatBar label="Branches" stat={coverage.branches} />}
                                            {coverage.functions.total > 0 && <CoverageStatBar label="Functions" stat={coverage.functions} />}
                                        </div>
                                    ) : !coverageError && <p className="text-[11px] text-slate-600 italic">Sin datos. Ejecuta los tests y haz click en "Refresh coverage".</p>}
                                    {coverage && (
                                        <><Separator className="bg-slate-800" />
                                        <Button variant="outline" size="sm" onClick={handleOpenInAppReport} disabled={reportLoading} className="w-full border-slate-700 bg-slate-800 text-slate-300 hover:text-slate-100 gap-1.5"><Monitor size={12} /> Abrir reporte completo</Button></>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'report' && (
                            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                {coverageServerPort ? (
                                    <><div className="shrink-0 px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 flex items-center gap-2">
                                        <span className="text-[10px] font-mono text-slate-500">http://127.0.0.1:{coverageServerPort}/</span>
                                        <Button variant="ghost" size="xs" onClick={stopCoverageServer} className="ml-auto text-slate-500 hover:text-microtermix-danger h-auto py-0.5">Cerrar servidor</Button>
                                    </div>
                                    <iframe ref={iframeRef} src={`http://127.0.0.1:${coverageServerPort}/`} className="flex-1 w-full border-0 bg-white" title="Coverage Report" /></>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm"><div className="text-center"><Monitor size={28} className="mx-auto mb-2 text-slate-700" /><p>Haz click en "Open report" para ver el reporte aquí</p></div></div>
                                )}
                            </div>
                        )}
                    </div>
                ) : <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">Selecciona un proyecto para comenzar</div>}
            </div>

            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
                <DialogContent className="max-w-lg bg-slate-900 border-slate-700 p-0" showCloseButton={false}>
                    <DialogHeader className="flex flex-row items-center gap-2 px-4 py-3 border-b border-slate-700">
                        <Settings size={14} className="text-microtermix-neon" /><DialogTitle className="text-slate-200 flex-1">Configuración de tests</DialogTitle>
                        <Button variant="ghost" size="icon-sm" onClick={() => setConfigOpen(false)} className="text-slate-500 hover:text-slate-200"><X size={15} /></Button>
                    </DialogHeader>
                    <div className="px-4 py-4 space-y-4">
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Preset de Lenguaje</label>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(PRESETS).map(([id, preset]) => {
                                    const isActive = config.language === id;
                                    return (
                                        <Button key={id} size="xs" variant={isActive ? 'default' : 'outline'} onClick={() => { setConfig(preset.config); if (selectedPath) saveConfig(selectedPath, preset.config); }}
                                            className={cn("justify-start gap-2 h-9 px-3", isActive ? 'bg-microtermix-neon/20 text-microtermix-neon border-microtermix-neon/40' : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200')}>
                                            <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-microtermix-neon shadow-[0_0_8px_rgba(56,189,248,0.6)]" : "bg-slate-700")} />{preset.label}
                                        </Button>
                                    );
                                })}
                            </div>
                        </div>
                        <Separator className="bg-slate-800" />
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 text-microtermix-neon/70">Comando Base</label>
                                <Input value={config.command} onChange={e => handleConfigChange({ command: e.target.value })} className="bg-slate-950 border-slate-800 focus-visible:border-microtermix-neon text-slate-200 font-mono text-xs" />
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">JUnit XML</label>
                                    <Input value={config.junitXmlPath} onChange={e => handleConfigChange({ junitXmlPath: e.target.value })} className="bg-slate-950 border-slate-800 text-slate-300 font-mono text-[10px] h-8" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Clover XML</label>
                                    <Input value={config.coverageXmlPath} onChange={e => handleConfigChange({ coverageXmlPath: e.target.value })} className="bg-slate-950 border-slate-800 text-slate-300 font-mono text-[10px] h-8" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">HTML Report Path</label>
                                <Input value={config.coverageHtmlPath} onChange={e => handleConfigChange({ coverageHtmlPath: e.target.value })} className="bg-slate-950 border-slate-800 text-slate-300 font-mono text-[10px] h-8" />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end px-4 py-3 border-t border-slate-700">
                        <Button onClick={() => setConfigOpen(false)} className="bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/80 font-bold">Listo</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
