import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Settings, RefreshCw, CheckCircle, AlertCircle, Play, Square,
    ChevronDown, ChevronRight, GitBranch, Layers, Terminal,
    Search, X, AlertTriangle, Loader2, ExternalLink, Copy, WrapText, Folder, Star,
} from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
    JenkinsConfig, JenkinsJobSummary, JenkinsBuildSummary, JenkinsFavorite,
    JenkinsApiLogEntry, jenkinsApiLog,
    PipelineRun, PipelineStage, StageStatus,
    loadJenkinsConfig, saveJenkinsConfig,
    loadFavorites, saveFavorites, jobToFavorite, normalizeUrl,
    jenkinsGetJobs, jenkinsGetChildren, jenkinsGetBuilds, jenkinsGetJobStatus,
    jenkinsTriggerBuild, jenkinsAbortBuild,
    jenkinsGetProgressiveLog, jenkinsGetPipelineStages, jenkinsTestConnection,
    isMultibranch, isFolder, isBuilding,
    colorFromJobColor, colorFromResult,
    formatDuration, formatAgo, jobApiPath, jobMatchesSearch,
    BuildResult,
} from '../services/jenkinsApi';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'jobs' | 'settings';

interface LogTarget {
    jobName: string;
    branchName?: string;
    buildNumber: number;
    jobPath: string;
    building: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ResultBadge({ result, building }: { result: BuildResult; building: boolean }) {
    const color = colorFromResult(result, building);
    const label = building ? 'RUNNING' : (result ?? 'NO BUILD');
    return (
        <span
            className="px-1.5 py-px rounded text-[10px] font-bold font-mono tracking-wide"
            style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
        >
            {building && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse align-middle" />
            )}
            {label}
        </span>
    );
}

function JobColorDot({ color }: { color: string }) {
    const c = colorFromJobColor(color);
    const animate = color?.endsWith('_anime');
    return (
        <span
            className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${animate ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: c }}
        />
    );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ onSaved }: { onSaved: () => void }) {
    const [draft, setDraft] = useState<JenkinsConfig>(() => loadJenkinsConfig());
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<'ok' | 'error' | null>(null);
    const [errMsg, setErrMsg] = useState('');
    const [version, setVersion] = useState('');

    const handleTest = async () => {
        setTesting(true); setResult(null); setErrMsg(''); setVersion('');
        try {
            const v = await jenkinsTestConnection(draft);
            setVersion(v);
            setResult('ok');
        } catch (e: any) {
            setResult('error');
            setErrMsg(e?.message ?? 'Connection failed');
        } finally {
            setTesting(false);
        }
    };

    const handleSave = () => {
        saveJenkinsConfig(draft);
        onSaved();
    };

    return (
        <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-lg space-y-5">
                <h2 className="text-sm font-semibold text-slate-200">Jenkins Connection</h2>

                <div className="space-y-3">
                    <label className="block">
                        <span className="text-xs text-slate-400 mb-1 block">Jenkins URL</span>
                        <input
                            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-nexus-neon/50"
                            placeholder="http://jenkins.example.com:8080"
                            value={draft.baseUrl}
                            onChange={e => setDraft(d => ({ ...d, baseUrl: e.target.value }))}
                        />
                    </label>

                    <label className="block">
                        <span className="text-xs text-slate-400 mb-1 block">Username</span>
                        <input
                            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-nexus-neon/50"
                            placeholder="admin"
                            value={draft.user}
                            onChange={e => setDraft(d => ({ ...d, user: e.target.value }))}
                        />
                    </label>

                    <label className="block">
                        <span className="text-xs text-slate-400 mb-1 block">API Token</span>
                        <input
                            type="password"
                            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-nexus-neon/50"
                            placeholder="11a2b3c4d5e6f7g8h9..."
                            value={draft.token}
                            onChange={e => setDraft(d => ({ ...d, token: e.target.value }))}
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                            Generate in Jenkins → User → Configure → API Token
                        </p>
                    </label>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleTest}
                        disabled={testing || !draft.baseUrl}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded-md transition-colors"
                    >
                        {testing
                            ? <Loader2 size={13} className="animate-spin" />
                            : <CheckCircle size={13} />}
                        Test Connection
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-nexus-neon/10 hover:bg-nexus-neon/20 text-nexus-neon border border-nexus-neon/30 rounded-md transition-colors"
                    >
                        Save
                    </button>
                </div>

                {result === 'ok' && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-md px-3 py-2">
                        <CheckCircle size={13} />
                        Connected — Jenkins {version}
                    </div>
                )}
                {result === 'error' && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                        <AlertCircle size={13} />
                        {errMsg}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Pipeline Stages Bar ───────────────────────────────────────────────────────

const STAGE_COLORS: Record<StageStatus, string> = {
    SUCCESS:      '#22c55e',
    FAILED:       '#ef4444',
    IN_PROGRESS:  '#38bdf8',
    PAUSED:       '#f59e0b',
    NOT_EXECUTED: '#475569',
    UNSTABLE:     '#f59e0b',
    ABORTED:      '#6b7280',
};

function stageIcon(status: StageStatus, size = 12) {
    const color = STAGE_COLORS[status] ?? '#475569';
    switch (status) {
        case 'SUCCESS':
            return <CheckCircle size={size} style={{ color }} />;
        case 'FAILED':
            return <AlertCircle size={size} style={{ color }} />;
        case 'IN_PROGRESS':
            return <Loader2 size={size} style={{ color }} className="animate-spin" />;
        case 'PAUSED':
            return <AlertTriangle size={size} style={{ color }} />;
        case 'ABORTED':
            return <Square size={size} style={{ color }} />;
        default:
            return <div style={{ width: size, height: size, borderRadius: '50%', border: `1.5px solid ${color}`, flexShrink: 0 }} />;
    }
}

function computeProgress(stages: PipelineStage[], runStatus: StageStatus): number {
    if (!stages.length) return 0;
    if (runStatus === 'SUCCESS') return 100;
    if (runStatus === 'FAILED' || runStatus === 'ABORTED') {
        // fill up to and including the failed stage
        const failIdx = stages.findIndex(s => s.status === 'FAILED' || s.status === 'ABORTED');
        return failIdx >= 0 ? Math.round(((failIdx + 1) / stages.length) * 100) : 100;
    }
    const done = stages.filter(s => s.status === 'SUCCESS' || s.status === 'UNSTABLE').length;
    const inProgress = stages.findIndex(s => s.status === 'IN_PROGRESS');
    // partial credit for running stage: use elapsed vs estimated if available
    const partial = inProgress >= 0 ? 0.4 : 0;
    return Math.min(99, Math.round(((done + partial) / stages.length) * 100));
}

function PipelineStagesBar({
    cfg,
    jobPath,
    buildNumber,
    live,
}: {
    cfg: JenkinsConfig;
    jobPath: string;
    buildNumber: number;
    live: boolean;
}) {
    const [run, setRun] = useState<PipelineRun | null>(null);
    const [supported, setSupported] = useState(true);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchStages = useCallback(async () => {
        const data = await jenkinsGetPipelineStages(cfg, jobPath, buildNumber);
        if (!data) { setSupported(false); return; }
        setRun(data);
    }, [cfg, jobPath, buildNumber]);

    useEffect(() => {
        setRun(null);
        setSupported(true);
        fetchStages();
    }, [jobPath, buildNumber]);

    useEffect(() => {
        if (!live || !supported) return;
        intervalRef.current = setInterval(fetchStages, 3000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [live, supported, fetchStages]);

    if (!supported || !run) return null;

    const stages = run.stages ?? [];
    const progress = computeProgress(stages, run.status);
    const progressColor = run.status === 'FAILED' ? '#ef4444'
        : run.status === 'SUCCESS' ? '#22c55e'
        : '#38bdf8';

    return (
        <div className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-3 py-2.5 space-y-2">
            {/* Progress bar */}
            <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                            width: `${progress}%`,
                            backgroundColor: progressColor,
                            boxShadow: live ? `0 0 6px ${progressColor}88` : 'none',
                        }}
                    />
                </div>
                <span className="text-[10px] font-mono shrink-0" style={{ color: progressColor }}>
                    {progress}%
                </span>
                <span className="text-[10px] text-slate-500 shrink-0">
                    {formatDuration(run.durationMillis)}
                </span>
            </div>

            {/* Stage pills — horizontal scrollable */}
            <div className="flex items-center gap-0 overflow-x-auto pb-0.5 scrollbar-none">
                {stages.map((stage, idx) => {
                    const color = STAGE_COLORS[stage.status] ?? '#475569';
                    const isLast = idx === stages.length - 1;
                    return (
                        <React.Fragment key={stage.id}>
                            {/* Stage pill */}
                            <div
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md shrink-0 border"
                                style={{
                                    borderColor: color + '44',
                                    backgroundColor: color + '11',
                                }}
                            >
                                {stageIcon(stage.status)}
                                <span className="text-[10px] font-medium whitespace-nowrap" style={{ color }}>
                                    {stage.name}
                                </span>
                                {stage.durationMillis > 0 && (
                                    <span className="text-[9px] text-slate-500 font-mono">
                                        {formatDuration(stage.durationMillis)}
                                    </span>
                                )}
                                {/* nested parallel stages badge */}
                                {stage.stages && stage.stages.length > 0 && (
                                    <span
                                        className="text-[9px] font-mono px-1 rounded"
                                        style={{ backgroundColor: color + '22', color }}
                                    >
                                        {stage.stages.length} parallel
                                    </span>
                                )}
                            </div>
                            {/* connector line */}
                            {!isLast && (
                                <div className="w-5 h-px bg-slate-700 shrink-0" />
                            )}
                        </React.Fragment>
                    );
                })}
                {stages.length === 0 && (
                    <span className="text-[10px] text-slate-600">No stages detected</span>
                )}
            </div>
        </div>
    );
}

// ── Console Log View ──────────────────────────────────────────────────────────

function ConsoleLogView({
    cfg,
    target,
    onClose,
}: {
    cfg: JenkinsConfig;
    target: LogTarget;
    onClose: () => void;
}) {
    const [lines, setLines] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [live, setLive] = useState(target.building);
    const [wrap, setWrap] = useState(false);
    const [copied, setCopied] = useState(false);
    const offsetRef = useRef(0);
    const bottomRef = useRef<HTMLDivElement>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchChunk = useCallback(async () => {
        try {
            const chunk = await jenkinsGetProgressiveLog(
                cfg,
                target.jobPath,
                target.buildNumber,
                offsetRef.current,
            );
            if (chunk.text) {
                const newLines = chunk.text.split('\n');
                setLines(prev => {
                    const merged = [...prev, ...newLines];
                    return merged.slice(-5000); // cap at 5000 lines
                });
                offsetRef.current = chunk.textSize;
            }
            if (!chunk.moreData) {
                setLive(false);
                if (intervalRef.current) clearInterval(intervalRef.current);
            }
            setLoading(false);
        } catch {
            setLoading(false);
        }
    }, [cfg, target]);

    useEffect(() => {
        offsetRef.current = 0;
        setLines([]);
        setLoading(true);
        setLive(target.building);
        fetchChunk();
    }, [target.jobPath, target.buildNumber]);

    useEffect(() => {
        if (!live) return;
        intervalRef.current = setInterval(fetchChunk, 2000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [live, fetchChunk]);

    useEffect(() => {
        if (live && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [lines, live]);

    const handleCopy = () => {
        navigator.clipboard.writeText(lines.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="flex flex-col h-full bg-slate-950">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 shrink-0">
                <Terminal size={13} className="text-nexus-neon shrink-0" />
                <span className="text-xs text-slate-300 font-mono truncate flex-1">
                    {target.jobName}{target.branchName ? ` / ${target.branchName}` : ''} #{target.buildNumber}
                </span>
                {live && (
                    <span className="flex items-center gap-1 text-[10px] text-nexus-neon font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-nexus-neon animate-pulse" />
                        LIVE
                    </span>
                )}
                <button
                    onClick={() => setWrap(w => !w)}
                    title="Toggle wrap"
                    className={`p-1 rounded transition-colors ${wrap ? 'text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <WrapText size={13} />
                </button>
                <button
                    onClick={handleCopy}
                    title="Copy log"
                    className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                >
                    {copied ? <CheckCircle size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
                <button
                    onClick={onClose}
                    className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
                >
                    <X size={13} />
                </button>
            </div>

            {/* Pipeline stages + progress bar */}
            <PipelineStagesBar
                cfg={cfg}
                jobPath={target.jobPath}
                buildNumber={target.buildNumber}
                live={live}
            />

            {/* Log content */}
            <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed p-3 text-slate-300 bg-slate-950">
                {loading && (
                    <div className="flex items-center gap-2 text-slate-500">
                        <Loader2 size={12} className="animate-spin" /> Loading console log…
                    </div>
                )}
                {lines.map((line, i) => (
                    <div
                        key={i}
                        className={`${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${
                            line.includes('ERROR') || line.includes('FAILED') || line.includes('error:')
                                ? 'text-red-400'
                                : line.includes('WARNING') || line.includes('WARN')
                                ? 'text-amber-400'
                                : line.startsWith('Finished:')
                                ? line.includes('SUCCESS') ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'
                                : 'text-slate-300'
                        }`}
                    >
                        {line}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}

// ── Build History Row ─────────────────────────────────────────────────────────

function BuildRow({
    build,
    onOpenLog,
    onAbort,
}: {
    build: JenkinsBuildSummary;
    onOpenLog: () => void;
    onAbort: () => void;
}) {
    return (
        <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/40 rounded transition-colors text-xs">
            <ResultBadge result={build.result} building={build.building} />
            <span className="font-mono text-slate-400 w-10 shrink-0">#{build.number}</span>
            <span className="text-slate-400 w-20 shrink-0">{formatAgo(build.timestamp)}</span>
            <span className="text-slate-500 w-16 shrink-0">{formatDuration(build.duration)}</span>
            <div className="flex items-center gap-1.5 ml-auto">
                <button
                    onClick={onOpenLog}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-slate-700/60 hover:bg-slate-700 text-slate-300 rounded transition-colors"
                >
                    <Terminal size={10} /> Log
                </button>
                {build.building && (
                    <button
                        onClick={onAbort}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded transition-colors"
                    >
                        <Square size={10} /> Abort
                    </button>
                )}
                <button
                    onClick={() => openUrl(build.url + 'console').catch(() => {})}
                    className="p-0.5 text-slate-600 hover:text-slate-400 transition-colors"
                    title="Open in browser"
                >
                    <ExternalLink size={10} />
                </button>
            </div>
        </div>
    );
}

// ── JobRow — recursivo, soporta Folder / Multibranch / Branch / Simple ────────
//
// depth=0 → borde + fondo card (top-level)
// depth>0 → indent + línea vertical (nested dentro de folder/multibranch)

function JobRow({
    job,
    cfg,
    onOpenLog,
    depth = 0,
    parentName,
    favorites,
    onToggleFavorite,
    search,
    alwaysPoll = false,
}: {
    job: JenkinsJobSummary;
    cfg: JenkinsConfig;
    onOpenLog: (target: LogTarget) => void;
    depth?: number;
    parentName?: string;
    favorites: Map<string, JenkinsFavorite>;
    onToggleFavorite: (job: JenkinsJobSummary) => void;
    search: string;
    alwaysPoll?: boolean;
}) {
    // Auto-expand when a search query matches a child but not the top name directly
    const childMatchesSearch =
        search.length > 0 &&
        !job.name.toLowerCase().includes(search.toLowerCase()) &&
        job.jobs?.some(c => jobMatchesSearch(c, search));

    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (childMatchesSearch) setExpanded(true);
    }, [childMatchesSearch]);

    const [children, setChildren] = useState<JenkinsJobSummary[]>([]);
    const [builds, setBuilds] = useState<JenkinsBuildSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [triggering, setTriggering] = useState(false);

    // Live copy of this job's data — updated by per-job polling when expanded
    const [liveJob, setLiveJob] = useState<JenkinsJobSummary>(job);
    // Keep in sync when parent passes new data (e.g. after full list refresh)
    useEffect(() => { setLiveJob(job); }, [job]);

    const folder = isFolder(liveJob);
    const multi = isMultibranch(liveJob);
    const isBranch = !folder && !multi && depth > 0;
    const lb = liveJob.lastBuild;
    const jobPath = jobApiPath(liveJob.url, cfg.baseUrl);

    // Per-job polling: runs when expanded OR alwaysPoll (favorites).
    // Rate: 8s if building, 20s if idle. Stops when collapsed (unless alwaysPoll).
    const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if ((!expanded && !alwaysPoll) || folder) return;
        const rate = isBuilding(liveJob) ? 8_000 : 20_000;
        pollIntervalRef.current = setInterval(async () => {
            const fresh = await jenkinsGetJobStatus(cfg, jobPath);
            if (fresh) setLiveJob(fresh);
        }, rate);
        return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
    }, [expanded, alwaysPoll, folder, isBuilding(liveJob), jobPath, cfg]);

    const loadContent = async () => {
        setLoading(true);
        try {
            if (folder || multi) {
                // Load child jobs (works for folders AND multibranch pipelines)
                const kids = await jenkinsGetChildren(cfg, jobPath);
                setChildren(kids);
            } else {
                // Simple pipeline / freestyle → show build history
                const bs = await jenkinsGetBuilds(cfg, jobPath, 20);
                setBuilds(bs);
            }
        } catch { /* ignore */ }
        setLoading(false);
    };

    const handleToggle = () => {
        const next = !expanded;
        setExpanded(next);
        if (next && children.length === 0 && builds.length === 0) loadContent();
    };

    const handleBuild = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setTriggering(true);
        try { await jenkinsTriggerBuild(cfg, jobPath); } catch { /* ignore */ }
        setTimeout(() => setTriggering(false), 2000);
    };

    const handleAbort = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!lb) return;
        try { await jenkinsAbortBuild(cfg, jobPath, lb.number); } catch { /* ignore */ }
    };

    const handleOpenLastLog = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!lb) return;
        onOpenLog({
            jobName: parentName ? `${parentName} / ${job.name}` : job.name,
            buildNumber: lb.number,
            jobPath,
            building: lb.building,
        });
    };

    // Visual variants by depth
    const isTopLevel = depth === 0;
    const indentStyle = depth > 0 ? { paddingLeft: `${depth * 16}px` } : undefined;

    const headerClass = isTopLevel
        ? 'flex items-center gap-2.5 px-3 py-2.5 bg-slate-900/60 hover:bg-slate-800/60 cursor-pointer transition-colors'
        : 'flex items-center gap-2 px-3 py-2 hover:bg-slate-800/30 cursor-pointer transition-colors rounded';

    const nameClass = isTopLevel
        ? 'text-sm text-slate-200 flex-1 truncate'
        : 'text-xs text-slate-300 flex-1 font-mono truncate';

    const icon = folder
        ? <Folder size={12} className="text-amber-400/70 shrink-0" />
        : multi
        ? <Layers size={12} className="text-nexus-accent shrink-0" />
        : isBranch
        ? <GitBranch size={11} className="text-slate-500 shrink-0" />
        : null;

    const rowContent = (
        <div className={headerClass} style={indentStyle} onClick={handleToggle}>
            {expanded
                ? <ChevronDown size={isTopLevel ? 13 : 12} className="text-slate-500 shrink-0" />
                : <ChevronRight size={isTopLevel ? 13 : 12} className="text-slate-500 shrink-0" />}

            {!folder && <JobColorDot color={liveJob.color} />}
            {icon}

            <span className={nameClass}>{liveJob.name}</span>

            {lb && !folder && (
                <div className="flex items-center gap-2 shrink-0">
                    <ResultBadge result={lb.result} building={lb.building} />
                    <span className="text-[10px] text-slate-500 hidden sm:block">{formatAgo(lb.timestamp)}</span>
                    {isTopLevel && (
                        <span className="text-[10px] text-slate-500 hidden md:block">{formatDuration(lb.duration)}</span>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                {!folder && !multi && (
                    <button
                        onClick={handleBuild}
                        disabled={triggering}
                        className="p-1 rounded hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-colors disabled:opacity-40"
                        title="Build Now"
                    >
                        {triggering ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                    </button>
                )}
                {!folder && !multi && lb?.building && (
                    <button
                        onClick={handleAbort}
                        className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                        title="Abort"
                    >
                        <Square size={11} />
                    </button>
                )}
                {!folder && !multi && lb && (
                    <button
                        onClick={handleOpenLastLog}
                        className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
                        title="Open last log"
                    >
                        <Terminal size={11} />
                    </button>
                )}
                <button
                    onClick={e => { e.stopPropagation(); openUrl(liveJob.url).catch(() => {}); }}
                    className="p-1 rounded text-slate-600 hover:text-slate-400 transition-colors"
                    title="Open in browser"
                >
                    <ExternalLink size={10} />
                </button>
                <button
                    onClick={e => { e.stopPropagation(); onToggleFavorite(liveJob); }}
                    className={`p-1 rounded transition-colors ${
                        favorites.has(normalizeUrl(liveJob.url))
                            ? 'text-amber-400 hover:text-amber-300'
                            : 'text-slate-600 hover:text-amber-400'
                    }`}
                    title={favorites.has(normalizeUrl(liveJob.url)) ? 'Remove from favorites' : 'Add to favorites'}
                >
                    <Star size={11} className={favorites.has(normalizeUrl(liveJob.url)) ? 'fill-current' : ''} />
                </button>
            </div>
        </div>
    );

    const expandedContent = expanded && (
        <div className={isTopLevel ? 'bg-slate-900/30 border-t border-slate-800' : 'border-l border-slate-800 ml-5 pl-1'}>
            {loading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 px-4 py-2">
                    <Loader2 size={11} className="animate-spin" />
                    {folder ? 'Loading folder…' : multi ? 'Loading branches…' : 'Loading builds…'}
                </div>
            )}

            {/* Folder / Multibranch → recurse into child JobRows */}
            {(folder || multi) && !loading && (
                <div className={isTopLevel ? 'p-2' : 'py-1'}>
                    {children.length === 0 && (
                        <p className="text-[11px] text-slate-600 px-3 py-1">
                            {folder ? 'Empty folder.' : 'No branches found.'}
                        </p>
                    )}
                    {children.map(child => (
                        <JobRow
                            key={child.url}
                            job={child}
                            cfg={cfg}
                            onOpenLog={onOpenLog}
                            depth={depth + 1}
                            parentName={parentName ? `${parentName} / ${job.name}` : job.name}
                            favorites={favorites}
                            onToggleFavorite={onToggleFavorite}
                            search={search}
                        />
                    ))}
                </div>
            )}

            {/* Simple job / branch → build history */}
            {!folder && !multi && !loading && (
                <div className={isTopLevel ? 'p-2' : 'py-1'}>
                    {builds.length === 0 && (
                        <p className="text-[11px] text-slate-600 px-3 py-1">No builds yet.</p>
                    )}
                    {builds.map(b => (
                        <BuildRow
                            key={b.number}
                            build={b}
                            onOpenLog={() => onOpenLog({
                                jobName: parentName ? `${parentName} / ${job.name}` : job.name,
                                buildNumber: b.number,
                                jobPath,
                                building: b.building,
                            })}
                            onAbort={async () => {
                                try { await jenkinsAbortBuild(cfg, jobPath, b.number); } catch { /* ignore */ }
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );

    // Top-level: card with border; nested: plain row with indent
    if (isTopLevel) {
        return (
            <div className="border border-slate-800 rounded-lg overflow-hidden mb-2">
                {rowContent}
                {expandedContent}
            </div>
        );
    }

    return (
        <div>
            {rowContent}
            {expandedContent}
        </div>
    );
}

// ── Jobs Tab ──────────────────────────────────────────────────────────────────

type JobFilter = 'all' | 'favorites';

function favToJobSummary(f: JenkinsFavorite): JenkinsJobSummary {
    return { name: f.name, url: f.url, color: f.color, _class: f._class, jobs: undefined, lastBuild: f.lastBuild, lastSuccessfulBuild: f.lastSuccessfulBuild, lastFailedBuild: f.lastFailedBuild };
}

/** Builds a flat url→job map from a fetched job tree (up to 2 levels from initial API). */
function buildLiveJobMap(list: JenkinsJobSummary[]): Map<string, JenkinsJobSummary> {
    const map = new Map<string, JenkinsJobSummary>();
    for (const j of list) {
        map.set(normalizeUrl(j.url), j);
        if (j.jobs?.length) {
            for (const child of j.jobs) map.set(normalizeUrl(child.url), child);
        }
    }
    return map;
}

function JobsTab({
    cfg,
    onOpenLog,
}: {
    cfg: JenkinsConfig;
    onOpenLog: (target: LogTarget) => void;
}) {
    const [jobs, setJobs] = useState<JenkinsJobSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // inputValue = what user types; search = committed on Enter (triggers filter)
    const [inputValue, setInputValue] = useState('');
    const [search, setSearch] = useState('');
    const [lastRefresh, setLastRefresh] = useState(0);
    const [jobFilter, setJobFilter] = useState<JobFilter>('all');
    // Favorites stored as Map<normalizedUrl, JenkinsFavorite> → fully serializable
    const [favorites, setFavorites] = useState<Map<string, JenkinsFavorite>>(() => loadFavorites());
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleToggleFavorite = (job: JenkinsJobSummary) => {
        const key = normalizeUrl(job.url);
        setFavorites(prev => {
            const next = new Map(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.set(key, jobToFavorite(job));
            }
            saveFavorites(next);
            return next;
        });
    };

    const fetchJobs = useCallback(async (quiet = false) => {
        if (!cfg.baseUrl) { setError('Configure Jenkins connection first.'); return; }
        if (!quiet) setLoading(true);
        setError('');
        try {
            const data = await jenkinsGetJobs(cfg);
            setJobs(data);
            setLastRefresh(Date.now());
            // Sync favorites with fresh live data so status/lastBuild stays current
            const liveMap = buildLiveJobMap(data);
            setFavorites(prev => {
                let changed = false;
                const next = new Map(prev);
                for (const [url] of next) {
                    const live = liveMap.get(url);
                    if (live) {
                        next.set(url, jobToFavorite(live));
                        changed = true;
                    }
                }
                if (changed) saveFavorites(next);
                return changed ? next : prev;
            });
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load jobs');
        } finally {
            if (!quiet) setLoading(false);
        }
    }, [cfg]);

    useEffect(() => { fetchJobs(); }, [fetchJobs]);

    // Slow background refresh of the full list (120s) — keeps the list eventually fresh
    // but does NOT hammer Jenkins. Per-job polling happens inside each expanded JobRow.
    useEffect(() => {
        intervalRef.current = setInterval(() => fetchJobs(true), 120_000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [fetchJobs]);

    const handleSearchCommit = async () => {
        setSearch(inputValue);
        await fetchJobs();
    };

    const handleSearchClear = async () => {
        setInputValue('');
        setSearch('');
        await fetchJobs();
    };

    // Live URL→job map built from the latest fetch (2-level flat)
    const liveJobMap = React.useMemo(() => buildLiveJobMap(jobs), [jobs]);

    // Resolve each favorite: use live data if available, otherwise stored snapshot
    const favList = React.useMemo(
        () => Array.from(favorites.values()).map(fav => {
            const live = liveJobMap.get(fav.url);
            return live ? live : favToJobSummary(fav);
        }),
        [favorites, liveJobMap],
    );

    // Filtered jobs list for "All" tab — deep search in 2-level tree
    const filteredJobs = jobs.filter(j => jobMatchesSearch(j, search));

    // Favorites tab — filter by name search over live-resolved favorites
    const filteredFavs = search
        ? favList.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
        : favList;

    const hasBuilding = jobs.some(j => isBuilding(j));
    const runningCount = jobs.filter(j => isBuilding(j)).length;

    const jobRowProps = { cfg, onOpenLog, favorites, onToggleFavorite: handleToggleFavorite, search };

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 shrink-0 flex-wrap gap-y-1.5">
                {/* Filter tabs */}
                <div className="flex items-center rounded-md border border-slate-700 overflow-hidden shrink-0">
                    <button
                        onClick={() => setJobFilter('all')}
                        className={`px-3 py-1 text-xs transition-colors ${jobFilter === 'all' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setJobFilter('favorites')}
                        className={`flex items-center gap-1 px-3 py-1 text-xs border-l border-slate-700 transition-colors ${jobFilter === 'favorites' ? 'bg-slate-700 text-amber-400' : 'text-slate-500 hover:text-amber-400'}`}
                    >
                        <Star size={10} className={jobFilter === 'favorites' ? 'fill-current' : ''} />
                        {favList.length > 0 && <span>{favList.length}</span>}
                    </button>
                </div>

                {/* Search — commits on Enter */}
                <div className="relative flex-1 min-w-32">
                    <Search size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${loading ? 'text-nexus-neon animate-pulse' : 'text-slate-500'}`} />
                    <input
                        className="w-full bg-slate-800 border border-slate-700 rounded-md pl-7 pr-16 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-nexus-neon/50"
                        placeholder="Search… (Enter to fetch)"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSearchCommit(); }}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {inputValue && (
                            <button onClick={handleSearchClear} className="text-slate-500 hover:text-slate-300">
                                <X size={11} />
                            </button>
                        )}
                        <button
                            onClick={handleSearchCommit}
                            className="text-slate-500 hover:text-nexus-neon transition-colors"
                            title="Search (Enter)"
                        >
                            <RefreshCw size={11} className={loading ? 'animate-spin text-nexus-neon' : ''} />
                        </button>
                    </div>
                </div>

                {hasBuilding && (
                    <span className="flex items-center gap-1 text-[10px] text-nexus-neon font-mono shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-nexus-neon animate-pulse" />
                        {runningCount} running
                    </span>
                )}

                <span className="text-[10px] text-slate-600 hidden sm:block shrink-0">
                    {lastRefresh > 0 && `Updated ${formatAgo(lastRefresh)}`}
                </span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {error && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2 mb-4">
                        <AlertTriangle size={13} /> {error}
                    </div>
                )}

                {/* ── FAVORITES TAB ── */}
                {jobFilter === 'favorites' && (
                    <>
                        {filteredFavs.length === 0 && (
                            <div className="text-center text-xs text-slate-500 py-16">
                                {favList.length === 0
                                    ? 'No favorites yet. Click the ★ on any job to add it.'
                                    : `No favorites match "${search}"`}
                            </div>
                        )}
                        {filteredFavs.map(job => (
                            <JobRow key={job.url} job={job} {...jobRowProps} alwaysPoll />
                        ))}
                    </>
                )}

                {/* ── ALL JOBS TAB ── */}
                {jobFilter === 'all' && (
                    <>
                        {loading && jobs.length === 0 && (
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-16">
                                <Loader2 size={16} className="animate-spin" /> Loading jobs…
                            </div>
                        )}

                        {!loading && !error && jobs.length === 0 && (
                            <div className="text-center text-sm text-slate-500 py-16">
                                No jobs found. Check your Jenkins URL and credentials.
                            </div>
                        )}

                        {/* Favorites pinned section (no search active) */}
                        {!search && favList.length > 0 && (
                            <>
                                <div className="flex items-center gap-2 mb-2 mt-1">
                                    <Star size={11} className="text-amber-400 fill-current" />
                                    <span className="text-[10px] font-semibold text-amber-400/80 uppercase tracking-wider">Favorites</span>
                                    <div className="flex-1 h-px bg-slate-800" />
                                </div>
                                {favList.map(job => (
                                    <JobRow key={job.url} job={job} {...jobRowProps} alwaysPoll />
                                ))}
                                <div className="flex items-center gap-2 mb-2 mt-3">
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">All Jobs</span>
                                    <div className="flex-1 h-px bg-slate-800" />
                                </div>
                            </>
                        )}

                        {filteredJobs.map(job => (
                            <JobRow key={job.url} job={job} {...jobRowProps} />
                        ))}

                        {search && filteredJobs.length === 0 && jobs.length > 0 && (
                            <div className="text-center text-xs text-slate-500 py-8">
                                No jobs match "{search}"
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ── JenkinsPanel (root) ───────────────────────────────────────────────────────

export const JenkinsPanel: React.FC = () => {
    const [tab, setTab] = useState<Tab>('jobs');
    const [cfg, setCfg] = useState<JenkinsConfig>(() => loadJenkinsConfig());
    const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

    // ── API Console ───────────────────────────────────────────────────────────
    const [apiLog, setApiLog] = useState<JenkinsApiLogEntry[]>([]);
    const [consoleOpen, setConsoleOpen] = useState(false);
    const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

    useEffect(() => {
        const handler = (e: JenkinsApiLogEntry) => setApiLog(prev => [e, ...prev].slice(0, 100));
        jenkinsApiLog.on(handler);
        return () => jenkinsApiLog.off(handler);
    }, []);

    const handleConfigSaved = () => {
        setCfg(loadJenkinsConfig());
        setTab('jobs');
    };

    const tabClass = (t: Tab) =>
        `px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
            tab === t
                ? 'border-nexus-neon text-nexus-neon'
                : 'border-transparent text-slate-500 hover:text-slate-300'
        }`;

    return (
        <div className="flex flex-col w-full h-full overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 pt-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                    {/* Jenkins icon SVG inline */}
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-nexus-accent fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.026 11.32C2.433 5.617 6.94.752 12.683.05c5.744-.703 10.939 3.517 11.532 9.22.593 5.704-3.914 10.569-9.657 11.27a11.013 11.013 0 0 1-3.053-.012v.746c.468.113.975.207 1.516.278 5.352.655 10.204-2.998 10.836-8.163.633-5.164-3.202-9.886-8.554-10.541C9.951 2.193 5.1 5.845 4.468 11.01a9.51 9.51 0 0 0 .036 2.674l-.966-.084a10.37 10.37 0 0 1-.512-2.28zm2.27.278C4.74 6.92 8.448 3.08 13.094 2.516c4.647-.563 8.851 2.365 9.405 6.543.554 4.178-2.764 8.022-7.41 8.585a8.62 8.62 0 0 1-3.195-.238v.67c.63.147 1.29.232 1.97.247 4.983.106 9.16-3.472 9.306-7.99.147-4.518-3.807-8.308-8.79-8.414C9.397 1.813 5.22 5.39 5.073 9.909a8.23 8.23 0 0 0 .223 2.248v-.559zm7.45 10.19a9.16 9.16 0 0 1-1.87-.336v2.548h1.87v-2.212zM11.47 5.9v1.566c.4-.069.805-.118 1.218-.143V5.72a9.11 9.11 0 0 0-1.218.18zm0 2.836v1.488c.39-.064.8-.096 1.218-.096V8.638c-.418 0-.827.035-1.218.098zm0 2.752v4.36c.4.052.808.08 1.218.08V11.37a7.22 7.22 0 0 1-1.218.117z"/>
                    </svg>
                    <span className="text-sm font-semibold text-slate-200">Jenkins</span>
                    {cfg.baseUrl && (
                        <span className="text-[10px] text-slate-500 font-mono truncate max-w-40">{cfg.baseUrl}</span>
                    )}
                </div>
                <button
                    onClick={() => setTab(t => t === 'settings' ? 'jobs' : 'settings')}
                    className={`p-1.5 rounded transition-colors ${tab === 'settings' ? 'text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                    title="Settings"
                >
                    <Settings size={14} />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800 shrink-0 px-2">
                <button className={tabClass('jobs')} onClick={() => setTab('jobs')}>
                    Jobs & Pipelines
                </button>
                <button className={tabClass('settings')} onClick={() => setTab('settings')}>
                    Settings
                </button>
            </div>

            {/* Split view: job list left, console log right */}
            <div className="flex-1 flex overflow-hidden">
                {/* Jobs tab content */}
                <div className={`flex flex-col overflow-hidden transition-all ${logTarget ? 'w-1/2 border-r border-slate-800' : 'flex-1'} ${tab !== 'jobs' ? 'hidden' : ''}`}>
                    <JobsTab cfg={cfg} onOpenLog={setLogTarget} />
                </div>

                {/* Console log pane */}
                {logTarget && tab === 'jobs' && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <ConsoleLogView
                            cfg={cfg}
                            target={logTarget}
                            onClose={() => setLogTarget(null)}
                        />
                    </div>
                )}

                {/* Settings tab */}
                {tab === 'settings' && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <SettingsTab onSaved={handleConfigSaved} />
                    </div>
                )}
            </div>

            {/* ── API Console ──────────────────────────────────────────────── */}
            <div className="shrink-0 border-t border-slate-800 bg-slate-950">
                <div
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-900/40 select-none"
                    onClick={() => setConsoleOpen(v => !v)}
                >
                    <ChevronRight size={10} className={`text-slate-600 transition-transform ${consoleOpen ? 'rotate-90' : ''}`} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">API Log</span>
                    <span className="text-[9px] text-slate-700 font-mono">{apiLog.length} req</span>
                    {apiLog.some(e => !e.ok) && (
                        <span className="text-[9px] text-red-500 font-mono">{apiLog.filter(e => !e.ok).length} err</span>
                    )}
                    {apiLog.length > 0 && (
                        <button
                            onClick={ev => { ev.stopPropagation(); setApiLog([]); setExpandedEntry(null); }}
                            className="ml-auto text-[10px] text-slate-600 hover:text-slate-400"
                        >Clear</button>
                    )}
                </div>

                {consoleOpen && (
                    <div className="h-40 overflow-y-auto">
                        {apiLog.length === 0 ? (
                            <p className="text-[10px] text-slate-700 py-3 px-3 font-mono">Waiting for requests…</p>
                        ) : apiLog.map(entry => (
                            <div key={entry.id} className="border-b border-slate-900">
                                <div
                                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-900/60 group"
                                    onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                                >
                                    <span className={`shrink-0 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        entry.method === 'GET'  ? 'bg-sky-500/20 text-sky-400' :
                                        entry.method === 'POST' ? 'bg-violet-500/20 text-violet-400' :
                                                                  'bg-amber-500/20 text-amber-400'
                                    }`}>{entry.method}</span>
                                    {entry.status !== undefined && (
                                        <span className={`shrink-0 font-mono text-[9px] font-bold ${entry.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {entry.status}
                                        </span>
                                    )}
                                    <span className="flex-1 font-mono text-[10px] text-slate-400 truncate">{entry.path}</span>
                                    {entry.durationMs !== undefined && (
                                        <span className="shrink-0 text-[9px] text-slate-600 font-mono">{entry.durationMs}ms</span>
                                    )}
                                    <span className="shrink-0 text-[9px] text-slate-700 font-mono">{entry.time}</span>
                                </div>
                                {expandedEntry === entry.id && (
                                    <div className="bg-slate-950 px-3 pb-2">
                                        {entry.error && (
                                            <p className="text-[10px] text-red-400 font-mono bg-red-500/5 p-1.5 rounded mt-1">{entry.error}</p>
                                        )}
                                        <p className="text-[9px] text-slate-600 font-mono mt-1 break-all">{entry.url}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
