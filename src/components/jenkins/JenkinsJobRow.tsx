import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, GitBranch, Layers, Play, Square, Terminal, ExternalLink, Star, Folder, Loader2 } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { JenkinsJobSummary, JenkinsBuildSummary, jobApiPath, isFolder, isMultibranch, isBuilding, normalizeUrl, jobToFavorite, formatAgo, formatDuration } from '../../services/jenkinsApi';
import { useJenkinsStore } from '../../stores/jenkinsStore';
import { useJenkinsChildren, useJenkinsJobStatus, useJenkinsBuilds, useJenkinsTriggerBuild, useJenkinsAbortBuild } from '../../hooks/useJenkins';
import { ResultBadge, JobColorDot } from './JenkinsCommon';
import { LogTarget } from './JenkinsLogViewer';
import { cn } from '../../lib/utils';

function useTick(active: boolean) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [active]);
    return now;
}

function BuildRow({
    build,
    onOpenLog,
    onAbort,
}: {
    build: JenkinsBuildSummary;
    onOpenLog: () => void;
    onAbort: () => void;
}) {
    const now = useTick(build.building);
    const durDisplay = build.building ? Math.max(0, now - build.timestamp) : build.duration;

    return (
        <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/40 rounded transition-colors text-xs">
            <ResultBadge result={build.result} building={build.building} />
            <span className="font-mono text-slate-400 w-10 shrink-0">#{build.number}</span>
            <span className="text-slate-400 w-20 shrink-0">{formatAgo(build.timestamp)}</span>
            <span className="text-slate-500 w-16 shrink-0">{formatDuration(durDisplay)}</span>
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
                    onClick={() => openUrl(build.url + 'console').catch(() => { })}
                    className="p-0.5 text-slate-600 hover:text-slate-400 transition-colors"
                    title="Open in browser"
                >
                    <ExternalLink size={10} />
                </button>
            </div>
        </div>
    );
}

export function JenkinsJobRow({
    job,
    onOpenLog,
    depth = 0,
    parentName,
    search,
    isChildOfMulti,
}: {
    job: JenkinsJobSummary;
    onOpenLog: (target: LogTarget) => void;
    depth?: number;
    parentName?: string;
    search: string;
    isChildOfMulti?: boolean;
}) {
    const activeAccountId = useJenkinsStore(s => s.activeAccountId);
    const cfg = useJenkinsStore(s => s.accounts.find(a => a.id === activeAccountId));
    const favorites = useJenkinsStore(s => s.favorites);
    const toggleFavorite = useJenkinsStore(s => s.toggleFavorite);

    const [expanded, setExpanded] = useState(false);

    if (!cfg) return null; // Defensive check

    const folder = isFolder(job);
    const multi = isMultibranch(job);
    const isBranch = !folder && !multi && depth > 0;
    const jobPath = jobApiPath(job.url, cfg.baseUrl);

    // TanStack queries for auto-polling and data fetching
    const { data: liveJob } = useJenkinsJobStatus(jobPath, expanded || !!favorites[normalizeUrl(job.url)]);
    const currentJob = liveJob || job;
    const lb = currentJob.lastBuild;

    const { data: children, isLoading: loadingChildren } = useJenkinsChildren(jobPath, expanded && (folder || multi));
    const { data: builds, isLoading: loadingBuilds } = useJenkinsBuilds(jobPath, expanded && !folder && !multi);

    const triggerMutation = useJenkinsTriggerBuild();
    const abortMutation = useJenkinsAbortBuild();

    const now = useTick(isBuilding(currentJob));

    const handleToggle = () => setExpanded(!expanded);

    const handleBuild = (e: React.MouseEvent) => {
        e.stopPropagation();
        triggerMutation.mutate(jobPath);
    };

    const handleAbort = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (lb) abortMutation.mutate({ jobPath, buildNumber: lb.number });
    };

    const handleOpenLastLog = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (lb) onOpenLog({
            jobName: parentName ? `${parentName} / ${job.name}` : job.name,
            buildNumber: lb.number,
            jobPath,
            building: lb.building,
        });
    };

    const isTopLevel = depth === 0;
    const indentStyle = depth > 0 ? { paddingLeft: `${depth * 16}px` } : undefined;
    const isFav = !!favorites[normalizeUrl(job.url)];

    const headerClass = isTopLevel
        ? 'flex items-center gap-2.5 px-3 py-2.5 bg-slate-900/60 hover:bg-slate-800/60 cursor-pointer transition-colors'
        : 'flex items-center gap-2 px-3 py-2 hover:bg-slate-800/30 cursor-pointer transition-colors rounded';

    const nameClass = isTopLevel
        ? 'text-sm text-slate-200 flex-1 truncate'
        : 'text-xs text-slate-300 flex-1 font-mono truncate';

    const icon = folder
        ? <Folder size={12} className="text-amber-400/70 shrink-0" />
        : multi
            ? <Layers size={12} className="text-microtermix-accent shrink-0" />
            : isBranch
                ? <GitBranch size={11} className="text-slate-500 shrink-0" />
                : null;

    const rowContent = (
        <div className={headerClass} style={indentStyle} onClick={handleToggle}>
            {expanded ? <ChevronDown size={isTopLevel ? 13 : 12} className="text-slate-500 shrink-0" /> : <ChevronRight size={isTopLevel ? 13 : 12} className="text-slate-500 shrink-0" />}
            {!folder && <JobColorDot color={currentJob.color} />}
            {icon}
            <span className={nameClass}>{currentJob.name}</span>

            {lb && !folder && (
                <div className="flex items-center gap-2 shrink-0">
                    <ResultBadge result={lb.result} building={lb.building} />
                    <span className="text-[10px] text-slate-500 hidden sm:block">{formatAgo(lb.timestamp)}</span>
                    {isTopLevel && (
                        <span className="text-[10px] text-slate-500 hidden md:block">{formatDuration(lb.building ? Math.max(0, now - lb.timestamp) : lb.duration)}</span>
                    )}
                </div>
            )}

            <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                {!folder && !multi && (
                    <button onClick={handleBuild} disabled={triggerMutation.isPending} className="p-1 rounded hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-colors">
                        {triggerMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                    </button>
                )}
                {!folder && !multi && lb?.building && (
                    <button onClick={handleAbort} className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"><Square size={11} /></button>
                )}
                {!folder && !multi && lb && (
                    <button onClick={handleOpenLastLog} className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"><Terminal size={11} /></button>
                )}
                <button onClick={() => openUrl(currentJob.url)} className="p-1 rounded text-slate-600 hover:text-slate-400 transition-colors"><ExternalLink size={10} /></button>

                <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(jobToFavorite(currentJob)); }}
                    className={cn(
                        "p-1.5 rounded transition-colors",
                        isFav ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400 hover:bg-amber-400/5'
                    )}
                >
                    <Star size={13} className={isFav ? 'fill-current' : ''} />
                </button>
            </div>
        </div>
    );

    const expandedContent = expanded && (
        <div className={isTopLevel ? 'bg-slate-900/30 border-t border-slate-800' : 'border-l border-slate-800 ml-5 pl-1'}>
            {(folder || multi) && (
                <div className={isTopLevel ? 'p-2' : 'py-1'}>
                    {loadingChildren && <div className="p-2 text-xs text-slate-500">Loading...</div>}
                    {children?.map(child => (
                        <JenkinsJobRow
                            key={child.url}
                            job={child}
                            onOpenLog={onOpenLog}
                            depth={depth + 1}
                            parentName={parentName ? `${parentName} / ${job.name}` : job.name}
                            search={search}
                            isChildOfMulti={multi || isChildOfMulti}
                        />
                    ))}
                </div>
            )}
            {!folder && !multi && (
                <div className={isTopLevel ? 'p-2' : 'py-1'}>
                    {loadingBuilds && <div className="p-2 text-xs text-slate-500">Loading...</div>}
                    {builds?.map(b => (
                        <BuildRow key={b.number} build={b} onOpenLog={() => onOpenLog({ jobName: parentName ? `${parentName} / ${job.name}` : job.name, buildNumber: b.number, jobPath, building: b.building })} onAbort={() => abortMutation.mutate({ jobPath, buildNumber: b.number })} />
                    ))}
                </div>
            )}
        </div>
    );

    return isTopLevel ? (
        <div className="border border-slate-800 rounded-lg overflow-hidden mb-2">
            {rowContent}
            {expandedContent}
        </div>
    ) : (
        <div>
            {rowContent}
            {expandedContent}
        </div>
    );
}
