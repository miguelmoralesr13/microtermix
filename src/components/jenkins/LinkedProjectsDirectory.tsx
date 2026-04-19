import React, { useState } from 'react';
import {
    Play, Square, Terminal, ExternalLink, Link2Off,
    History, Clock, Loader2, Layers, FolderCode,
    GitBranch, Activity,
} from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
    jobApiPath, isBuilding, formatAgo, formatDuration,
    isMultibranch, isFolder, colorFromJobColor,
} from '../../services/jenkinsApi';
import {
    useJenkinsJobStatus, useJenkinsBuilds,
    useJenkinsTriggerBuild, useJenkinsAbortBuild,
    useJenkinsChildren,
} from '../../hooks/useJenkins';
import { ResultBadge } from './JenkinsCommon';
import { JenkinsBranchRow } from './JenkinsJobCard';
import { LogTarget } from './JenkinsLogViewer';
import { cn } from '../../lib/utils';
import type { JobLink } from '../../hooks/useJenkinsProjectLinks';
import type { JenkinsConfig } from '../../services/jenkinsApi';

// ── Right panel — detail of the selected linked project ───────────────────────

function LinkedProjectDetail({
    link,
    config,
    onOpenLog,
    onUnlink,
}: {
    link: JobLink;
    config: JenkinsConfig;
    onOpenLog: (target: LogTarget) => void;
    onUnlink: () => void;
}) {
    const jobPath = jobApiPath(link.jobUrl, config.baseUrl);

    // Live is always ON in detail view
    const { data: liveJob } = useJenkinsJobStatus(jobPath, true);
    const triggerMutation = useJenkinsTriggerBuild();
    const abortMutation = useJenkinsAbortBuild();

    const currentJob = liveJob ?? null;
    const color = currentJob?.color ?? link.color ?? 'grey';
    const isContainer = currentJob ? (isMultibranch(currentJob as any) || isFolder(currentJob as any)) : false;
    const lb = currentJob?.lastBuild ?? null;
    const isJobBuilding = lb?.building ?? (currentJob ? isBuilding(currentJob as any) : false);
    const dotBg = colorFromJobColor(color);

    const { data: children, isLoading: loadingChildren } = useJenkinsChildren(jobPath, true);
    const { data: builds, isLoading: loadingBuilds } = useJenkinsBuilds(jobPath, !isContainer);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Detail header */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full block ring-1 ring-white/10" style={{ background: dotBg }} />
                        {isJobBuilding && (
                            <span className="absolute inset-0 rounded-full animate-ping opacity-75" style={{ background: dotBg }} />
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{link.jobDisplayName || link.jobName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <FolderCode size={9} className="text-orange-400/70" />
                            <span className="text-[9px] text-orange-400/60 font-mono truncate">
                                {link.projectPath.split('/').filter(Boolean).pop() ?? link.projectName}
                            </span>
                            <span className="flex items-center gap-1 ml-2 text-[9px] text-microtermix-neon font-bold uppercase tracking-wider">
                                <Activity size={8} className="animate-pulse" /> Live
                            </span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                    {lb && (
                        <div className="flex items-center gap-2 mr-2 bg-slate-900/60 px-2 py-1 rounded-md border border-slate-800">
                            <ResultBadge result={lb.result} building={lb.building} />
                            <span className="text-[9px] font-mono text-slate-400">#{lb.number}</span>
                            <span className="text-[9px] text-slate-600">{formatAgo(lb.timestamp)}</span>
                        </div>
                    )}
                    {!isContainer && (
                        !isJobBuilding
                            ? <button onClick={() => triggerMutation.mutate(jobPath)} disabled={triggerMutation.isPending} className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors" title="Ejecutar build">
                                {triggerMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                            </button>
                            : <button onClick={() => lb && abortMutation.mutate({ jobPath, buildNumber: lb.number })} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors" title="Abortar">
                                <Square size={13} />
                            </button>
                    )}
                    {lb && (
                        <button onClick={() => onOpenLog({ jobName: link.jobName, buildNumber: lb.number, jobPath, building: lb.building })} className="p-1.5 text-slate-500 hover:text-sky-400 hover:bg-sky-400/10 rounded transition-colors" title="Ver logs">
                            <Terminal size={13} />
                        </button>
                    )}
                    <button onClick={() => openUrl(link.jobUrl)} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors" title="Abrir en Jenkins">
                        <ExternalLink size={13} />
                    </button>
                    <button onClick={onUnlink} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors" title="Desvincular">
                        <Link2Off size={13} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Section label */}
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    {isContainer ? <Layers size={10} /> : <History size={10} />}
                    {isContainer ? 'Ambientes (Ramas) — Live' : 'Histórico de Ejecuciones — Live'}
                </span>

                <div className="space-y-1.5">
                    {(loadingBuilds || loadingChildren) && (
                        <div className="py-10 flex flex-col items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin text-slate-700" />
                            <span className="text-[10px] text-slate-600 font-mono">Cargando datos en vivo...</span>
                        </div>
                    )}

                    {isContainer && !loadingChildren && (children || []).map((branch: any) => (
                        <JenkinsBranchRow key={branch.url} branch={branch} baseUrl={config.baseUrl} onOpenLog={onOpenLog} />
                    ))}

                    {!isContainer && !loadingBuilds && (builds || []).slice(0, 20).map((b: any) => (
                        <div
                            key={b.number}
                            className="flex items-center justify-between p-2.5 bg-slate-900/50 rounded-lg group/row hover:bg-slate-800/60 border border-transparent hover:border-sky-900/40 transition-all cursor-pointer"
                            onClick={() => onOpenLog({ jobName: link.jobName, buildNumber: b.number, jobPath, building: b.building })}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <ResultBadge result={b.result} building={b.building} />
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-mono text-slate-300">#{b.number}</span>
                                        <span className="text-[10px] text-slate-500 truncate">{b.displayName || 'Execution'}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[9px] text-slate-600">
                                        <Clock size={8} /> {formatDuration(b.duration)} • {formatAgo(b.timestamp)}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Terminal size={11} className="text-slate-600 group-hover/row:text-sky-400 transition-colors" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); openUrl(b.url); }}
                                    className="p-1 text-slate-600 hover:text-slate-300 rounded transition-colors"
                                    title="Abrir en Jenkins"
                                >
                                    <ExternalLink size={11} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {!loadingBuilds && !loadingChildren && (
                        isContainer ? (children || []).length === 0 : (builds || []).length === 0
                    ) && (
                            <div className="py-8 text-center text-[10px] text-slate-600 italic">
                                No hay ambientes o ejecuciones disponibles
                            </div>
                        )}
                </div>
            </div>
        </div>
    );
}

// ── Row in the left directory list ─────────────────────────────────────────────

function LinkedProjectRow({
    link,
    baseUrl,
    isSelected,
    onSelect,
}: {
    link: JobLink;
    baseUrl: string;
    isSelected: boolean;
    onSelect: () => void;
}) {
    const jobPath = jobApiPath(link.jobUrl, baseUrl);
    // Lightweight polling — only color/lastBuild
    const { data: liveJob } = useJenkinsJobStatus(jobPath, isSelected);

    const color = liveJob?.color ?? link.color ?? 'grey';
    const lb = liveJob?.lastBuild ?? null;
    const isJobBuilding = lb?.building ?? false;
    const dotBg = colorFromJobColor(color);
    const projectName = link.projectPath.split('/').filter(Boolean).pop() ?? link.projectName;

    return (
        <button
            onClick={onSelect}
            className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left group/row',
                isSelected
                    ? 'bg-microtermix-neon/10 border border-microtermix-neon/30 text-slate-100'
                    : 'border border-transparent hover:bg-slate-800/60 hover:border-slate-700/50',
            )}
        >
            {/* Status dot */}
            <div className="relative shrink-0">
                <span className="w-2 h-2 rounded-full block" style={{ background: dotBg }} />
                {isJobBuilding && (
                    <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: dotBg }} />
                )}
            </div>

            {/* Names */}
            <div className="min-w-0 flex-1">
                <p className={cn('text-[11px] font-semibold truncate leading-tight', isSelected ? 'text-slate-100' : 'text-slate-300 group-hover/row:text-slate-100')}>
                    {link.jobDisplayName || link.jobName}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                    <FolderCode size={7} className="text-orange-400/60 shrink-0" />
                    <span className="text-[8px] text-orange-400/50 font-mono truncate">{projectName}</span>
                </div>
            </div>

            {/* Result badge — only when data is loaded */}
            {lb && <ResultBadge result={lb.result} building={lb.building} />}

            {/* Live pulse when selected */}
            {isSelected && (
                <Activity size={10} className="text-microtermix-neon animate-pulse shrink-0" />
            )}
        </button>
    );
}

// ── Main directory component ────────────────────────────────────────────────────

export function LinkedProjectsDirectory({
    links,
    config,
    onOpenLog,
    onUnlink,
}: {
    links: JobLink[];
    config: JenkinsConfig;
    onOpenLog: (target: LogTarget) => void;
    onUnlink: (projectPath: string) => void;
}) {
    const [selectedPath, setSelectedPath] = useState<string | null>(
        links.length > 0 ? links[0].projectPath : null,
    );

    const selectedLink = links.find(l => l.projectPath === selectedPath) ?? null;

    // If the selected link gets removed, auto-select first
    React.useEffect(() => {
        if (!selectedLink && links.length > 0) {
            setSelectedPath(links[0].projectPath);
        }
    }, [links, selectedLink]);

    return (
        <div className="flex h-full overflow-hidden border border-slate-800 rounded-xl bg-slate-950/20">
            {/* ── Left: Directory ──────────────────────────── */}
            <div className="w-56 shrink-0 flex flex-col border-r border-slate-800 overflow-hidden">
                {/* Directory header */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800/50">
                    <GitBranch size={11} className="text-slate-500" />
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                        Proyectos ({links.length})
                    </span>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {links.map(link => (
                        <LinkedProjectRow
                            key={link.projectPath}
                            link={link}
                            baseUrl={config.baseUrl}
                            isSelected={selectedPath === link.projectPath}
                            onSelect={() => setSelectedPath(link.projectPath)}
                        />
                    ))}
                </div>
            </div>

            {/* ── Right: Detail panel ──────────────────────── */}
            <div className="flex-1 min-w-0 overflow-hidden">
                {selectedLink ? (
                    <LinkedProjectDetail
                        key={selectedLink.projectPath}
                        link={selectedLink}
                        config={config}
                        onOpenLog={onOpenLog}
                        onUnlink={() => {
                            onUnlink(selectedLink.projectPath);
                            setSelectedPath(links.find(l => l.projectPath !== selectedLink.projectPath)?.projectPath ?? null);
                        }}
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                        <GitBranch size={32} className="opacity-30" />
                        <p className="text-xs font-medium">Seleccioná un proyecto</p>
                    </div>
                )}
            </div>
        </div>
    );
}
