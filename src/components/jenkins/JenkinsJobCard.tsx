import React, { useState } from 'react';
import {
    Play, Square, Terminal, ExternalLink, Activity,
    History, Clock, Loader2, Layers,
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
import { ResultBadge, JobColorDot } from './JenkinsCommon';
import { LogTarget } from './JenkinsLogViewer';
import { cn } from '../../lib/utils';

// ── Branch row (shared) ────────────────────────────────────────────────────────

export function JenkinsBranchRow({
    branch,
    baseUrl,
    onOpenLog,
}: {
    branch: any;
    baseUrl: string;
    onOpenLog: (target: LogTarget) => void;
}) {
    const [showHistory, setShowHistory] = useState(false);
    const branchPath = jobApiPath(branch.url, baseUrl);
    const { data: builds, isLoading } = useJenkinsBuilds(branchPath, showHistory);
    const blb = branch.lastBuild;

    const openLastLog = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (blb) {
            onOpenLog({ jobName: branch.name, buildNumber: blb.number, jobPath: branchPath, building: blb.building });
        }
    };

    return (
        <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-transparent hover:border-white/5 transition-colors">
            {/* Branch header — click opens log of last build */}
            <div className="flex items-center p-2.5 group/branch">
                {/* Main clickable area → open last build log */}
                <button
                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer text-left disabled:cursor-default"
                    onClick={openLastLog}
                    disabled={!blb}
                    title={blb ? `Abrir log #${blb.number}` : 'Sin builds'}
                >
                    <JobColorDot color={branch.color} />
                    <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium text-slate-200 truncate group-hover/branch:text-sky-300 transition-colors">
                            {branch.displayName || branch.name}
                        </span>
                        {blb && (
                            <span className="text-[9px] text-slate-500 font-mono">
                                #{blb.number} • {formatAgo(blb.timestamp)}
                            </span>
                        )}
                    </div>
                    {blb && <Terminal size={10} className="text-slate-600 group-hover/branch:text-sky-400 transition-colors shrink-0 mr-1" />}
                </button>

                {/* Separate expand toggle for history */}
                <button
                    onClick={(e) => { e.stopPropagation(); setShowHistory(!showHistory); }}
                    className="p-1 text-slate-600 hover:text-slate-400 rounded transition-colors shrink-0"
                    title="Ver historial"
                >
                    <History size={11} className={cn('transition-transform', showHistory ? 'rotate-180 text-microtermix-neon' : '')} />
                </button>
            </div>

            {showHistory && (
                <div className="px-2 pb-2 space-y-1 bg-black/20 animate-in slide-in-from-top-1 duration-200">
                    {isLoading && <div className="py-3 text-center"><Loader2 size={12} className="animate-spin text-slate-700 mx-auto" /></div>}
                    {!isLoading && (builds || []).slice(0, 5).map((b: any) => (
                        <div
                            key={b.number}
                            className="flex items-center justify-between p-1.5 hover:bg-slate-800/60 hover:border-sky-900/30 border border-transparent rounded transition-all cursor-pointer group/run"
                            onClick={(e) => { e.stopPropagation(); onOpenLog({ jobName: branch.name, buildNumber: b.number, jobPath: branchPath, building: b.building }); }}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <ResultBadge result={b.result} building={b.building} />
                                <span className="text-[9px] font-mono text-slate-400">#{b.number}</span>
                                <span className="text-[9px] text-slate-600 hidden sm:block truncate opacity-60">{formatAgo(b.timestamp)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Terminal size={10} className="text-slate-600 group-hover/run:text-sky-400 transition-colors" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); openUrl(b.url); }}
                                    className="p-0.5 text-slate-600 hover:text-slate-300 rounded"
                                    title="Abrir en Jenkins"
                                >
                                    <ExternalLink size={10} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {!isLoading && (!builds || builds.length === 0) && (
                        <div className="py-2 text-center text-[9px] text-slate-700 italic">No hay historial disponible</div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Generic Jenkins Job Card ───────────────────────────────────────────────────

export interface JenkinsJobCardProps {
    /** URL del job en Jenkins */
    jobUrl: string;
    /** Nombre para mostrar en la cabecera */
    displayName: string;
    /** Subtítulo (fullName del job, branch, nombre de proyecto local, etc.) */
    subtitle?: string;
    /** Color CSS del subtítulo. Default: text-slate-500 */
    subtitleColor?: string;
    /** Nombre técnico del job (para LogTarget.jobName) */
    jobName: string;
    /** baseUrl de la cuenta Jenkins activa */
    baseUrl: string;
    /** Slot badge izquierdo — aparece entre el Live button y el dot color.
     *  Úsalo para: ⭐ favorito, 📁 proyecto local, etc. */
    badgeLeft?: React.ReactNode;
    /** Botones extra en la zona de acciones hover (ej. Desvincular, Favorito).
     *  Se añaden ANTES de Open in Jenkins / logs. */
    extraActions?: React.ReactNode;
    onOpenLog: (target: LogTarget) => void;
    /** Estado de live inicial (controlado externamente si se quiere) */
    defaultLive?: boolean;
}

export function JenkinsJobCard({
    jobUrl,
    displayName,
    subtitle,
    subtitleColor = 'text-slate-500',
    jobName,
    baseUrl,
    badgeLeft,
    extraActions,
    onOpenLog,
    defaultLive = false,
}: JenkinsJobCardProps) {
    const [expanded, setExpanded] = useState(defaultLive);
    const live = expanded; // expand === live: expanding activates live polling, collapsing kills it

    const toggleExpanded = () => setExpanded(v => !v);

    const jobPath = jobApiPath(jobUrl, baseUrl);
    const { data: liveJob } = useJenkinsJobStatus(jobPath, live || expanded);
    const triggerMutation = useJenkinsTriggerBuild();
    const abortMutation = useJenkinsAbortBuild();

    const currentJob = liveJob ?? null;
    const color = currentJob?.color ?? 'grey';
    const isContainer = currentJob ? (isMultibranch(currentJob as any) || isFolder(currentJob as any)) : false;
    const lb = currentJob?.lastBuild ?? null;
    const isJobBuilding = lb?.building ?? (currentJob ? isBuilding(currentJob as any) : false);

    const { data: children, isLoading: loadingChildren } = useJenkinsChildren(jobPath, expanded);
    const { data: builds, isLoading: loadingBuilds } = useJenkinsBuilds(jobPath, expanded && !isContainer);

    const dotBg = colorFromJobColor(color);

    return (
        <div className={cn(
            'bg-slate-900/40 border rounded-xl overflow-hidden transition-all duration-300',
            live
                ? 'border-microtermix-neon/40 ring-1 ring-microtermix-neon/20 shadow-[0_0_12px_rgba(34,211,238,0.08)]'
                : 'border-slate-800 hover:border-slate-700',
        )}>
            {/* ── Compact single-row header ─────────────────────────── */}
            <div className="flex items-center gap-2 px-3 py-2.5 group/card">

                {/* Expand/Live toggle — LEFT side (replaces Activity button) */}
                <button
                    onClick={toggleExpanded}
                    className={cn(
                        'p-1.5 rounded transition-all shrink-0',
                        expanded
                            ? 'text-microtermix-neon bg-microtermix-neon/10 animate-pulse'
                            : 'text-slate-600 hover:text-slate-400',
                    )}
                    title={expanded ? 'Colapsar (desactiva Live)' : 'Expandir (activa Live)'}
                >
                    <Activity size={12} />
                </button>

                {/* Color dot */}
                <div className="relative shrink-0">
                    <span
                        className="w-2 h-2 rounded-full block ring-1 ring-white/10"
                        style={{ background: dotBg }}
                    />
                    {isJobBuilding && (
                        <span
                            className="absolute inset-0 rounded-full animate-ping opacity-60"
                            style={{ background: dotBg }}
                        />
                    )}
                </div>

                {/* Job info — grows */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-slate-100 truncate">
                            {displayName}
                        </span>
                        {lb && <ResultBadge result={lb.result} building={lb.building} />}
                    </div>
                    {subtitle && (
                        <div className="flex items-center gap-1 mt-0.5">
                            {badgeLeft}
                            <span className={cn('text-[9px] font-mono truncate', subtitleColor)}>
                                {subtitle}
                            </span>
                            {lb && (
                                <span className="text-[9px] text-slate-600 ml-1">
                                    #{lb.number} • {formatAgo(lb.timestamp)}
                                </span>
                            )}
                        </div>
                    )}
                    {!subtitle && lb && (
                        <div className="mt-0.5">
                            <span className="text-[9px] text-slate-600">
                                #{lb.number} • {formatAgo(lb.timestamp)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Hover actions */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    {!isContainer && (
                        !isJobBuilding
                            ? (
                                <button
                                    onClick={() => triggerMutation.mutate(jobPath)}
                                    disabled={triggerMutation.isPending}
                                    className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors"
                                    title="Ejecutar build"
                                >
                                    {triggerMutation.isPending
                                        ? <Loader2 size={12} className="animate-spin" />
                                        : <Play size={12} />
                                    }
                                </button>
                            ) : (
                                <button
                                    onClick={() => lb && abortMutation.mutate({ jobPath, buildNumber: lb.number })}
                                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                    title="Abortar build"
                                >
                                    <Square size={12} />
                                </button>
                            )
                    )}
                    {lb && (
                        <button
                            onClick={() => onOpenLog({ jobName, buildNumber: lb.number, jobPath, building: lb.building })}
                            className="p-1.5 text-slate-500 hover:text-sky-400 hover:bg-sky-400/10 rounded transition-colors"
                            title="Ver logs"
                        >
                            <Terminal size={12} />
                        </button>
                    )}
                    <button
                        onClick={() => openUrl(jobUrl)}
                        className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
                        title="Abrir en Jenkins"
                    >
                        <ExternalLink size={12} />
                    </button>
                    {extraActions}
                </div>

                {/* Remove separate expand toggle — Activity button IS the toggle now */}

            </div>

            {/* ── Expanded section ──────────────────────────────────── */}
            {expanded && (
                <div className="border-t border-slate-800 bg-slate-950/30 p-4 space-y-3 animate-in slide-in-from-top-2 duration-300">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        {isContainer ? <Layers size={10} /> : <History size={10} />}
                        {isContainer ? 'Ambientes (Ramas)' : 'Histórico'}
                    </span>

                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                        {(loadingBuilds || loadingChildren) && (
                            <div className="py-6 flex items-center justify-center gap-2">
                                <Loader2 size={14} className="animate-spin text-slate-700" />
                                <span className="text-[10px] text-slate-700 font-mono">Cargando...</span>
                            </div>
                        )}

                        {isContainer && !loadingChildren && (children || []).map((branch: any) => (
                            <JenkinsBranchRow
                                key={branch.url}
                                branch={branch}
                                baseUrl={baseUrl}
                                onOpenLog={onOpenLog}
                            />
                        ))}

                        {!isContainer && !loadingBuilds && (builds || []).slice(0, 15).map((b: any) => (
                            <div
                                key={b.number}
                                className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg group/row hover:bg-slate-800/50 border border-transparent hover:border-white/5 transition-colors"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <ResultBadge result={b.result} building={b.building} />
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono text-slate-300">#{b.number}</span>
                                            <span className="text-[10px] text-slate-500 truncate">{b.displayName || 'Execution'}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[9px] text-slate-600">
                                            <Clock size={8} /> {formatDuration(b.duration)} • {formatAgo(b.timestamp)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => onOpenLog({ jobName, buildNumber: b.number, jobPath, building: b.building })}
                                        className="p-1.5 text-slate-500 hover:text-sky-400"
                                    >
                                        <Terminal size={11} />
                                    </button>
                                    <button onClick={() => openUrl(b.url)} className="p-1.5 text-slate-500 hover:text-slate-300">
                                        <ExternalLink size={11} />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {!loadingBuilds && !loadingChildren && (
                            isContainer ? (children || []).length === 0 : (builds || []).length === 0
                        ) && (
                                <div className="py-3 text-center text-[10px] text-slate-600 italic">
                                    No hay ambientes o ejecuciones disponibles
                                </div>
                            )}
                    </div>
                </div>
            )}
        </div>
    );
}
