import React, { useState, useEffect } from 'react';
import { Play, Square, Terminal, ExternalLink, Star, Activity, History, Clock, Loader2, Layers, ChevronDown } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { JenkinsFavorite, jobApiPath, isBuilding, formatAgo, formatDuration, isMultibranch, isFolder } from '../../services/jenkinsApi';
import { useJenkinsStore } from '../../stores/jenkinsStore';
import { useJenkinsJobStatus, useJenkinsBuilds, useJenkinsTriggerBuild, useJenkinsAbortBuild, useJenkinsChildren } from '../../hooks/useJenkins';
import { ResultBadge, JobColorDot } from './JenkinsCommon';
import { LogTarget } from './JenkinsLogViewer';
import { cn } from '../../lib/utils';

/** Sub-component for a single branch (Environment) with its own history */
function JenkinsBranchRow({ 
    branch, 
    baseUrl, 
    onOpenLog 
}: { 
    branch: any, 
    baseUrl: string,
    onOpenLog: (target: LogTarget) => void 
}) {
    const [showHistory, setShowHistory] = useState(false);
    const branchPath = jobApiPath(branch.url, baseUrl);
    const { data: builds, isLoading } = useJenkinsBuilds(branchPath, showHistory);
    const blb = branch.lastBuild;

    return (
        <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-transparent hover:border-white/5 transition-colors">
            <div 
                className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-slate-800/50 group/branch"
                onClick={() => setShowHistory(!showHistory)}
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <JobColorDot color={branch.color} />
                    <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-medium text-slate-200 truncate">{branch.displayName || branch.name}</span>
                        {blb && (
                            <span className="text-[9px] text-slate-500 font-mono">
                                Última: #{blb.number} • {formatAgo(blb.timestamp)}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <History size={11} className={cn("text-slate-600 transition-colors", showHistory ? "text-microtermix-neon" : "group-hover/branch:text-slate-400")} />
                    <ChevronDown size={12} className={cn("text-slate-700 transition-transform", showHistory ? "rotate-180" : "")} />
                </div>
            </div>

            {showHistory && (
                <div className="px-2 pb-2 space-y-1 bg-black/20 animate-in slide-in-from-top-1 duration-200">
                    {isLoading && <div className="py-3 text-center"><Loader2 size={12} className="animate-spin text-slate-700 mx-auto" /></div>}
                    {!isLoading && (builds || []).slice(0, 5).map((b: any) => (
                        <div key={b.number} className="flex items-center justify-between p-1.5 hover:bg-slate-800/40 rounded transition-colors group/run">
                            <div className="flex items-center gap-2 min-w-0">
                                <ResultBadge result={b.result} building={b.building} />
                                <span className="text-[9px] font-mono text-slate-400">#{b.number}</span>
                                <span className="text-[9px] text-slate-600 hidden sm:block truncate opacity-60">{formatAgo(b.timestamp)}</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover/run:opacity-100 transition-opacity">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onOpenLog({ jobName: branch.name, buildNumber: b.number, jobPath: branchPath, building: b.building }); }}
                                    className="p-1 text-slate-500 hover:text-sky-400"
                                >
                                    <Terminal size={10} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); openUrl(b.url); }} className="p-1 text-slate-500 hover:text-slate-300">
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

export function JenkinsFavoriteCard({
    fav,
    onOpenLog
}: {
    fav: JenkinsFavorite;
    onOpenLog: (target: LogTarget) => void;
}) {
    const activeAccountId = useJenkinsStore(s => s.activeAccountId);
    const cfg = useJenkinsStore(s => s.accounts.find(a => a.id === activeAccountId));
    const toggleFavorite = useJenkinsStore(s => s.toggleFavorite);
    
    const [live, setLive] = useState(false);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (live) setExpanded(true);
    }, [live]);

    if (!cfg) return null;

    const jobPath = jobApiPath(fav.url, cfg.baseUrl);
    const { data: liveJob } = useJenkinsJobStatus(jobPath, live, live);
    const currentJob = liveJob || (fav as any);
    const isContainer = isMultibranch(currentJob) || isFolder(currentJob);
    const lb = currentJob.lastBuild;

    const { data: children, isLoading: loadingChildren } = useJenkinsChildren(jobPath, expanded);
    const { data: builds, isLoading: loadingBuilds } = useJenkinsBuilds(jobPath, expanded && !isContainer);

    const triggerMutation = useJenkinsTriggerBuild();
    const abortMutation = useJenkinsAbortBuild();

    const handleBuild = (e: React.MouseEvent) => {
        e.stopPropagation();
        triggerMutation.mutate(jobPath);
    };

    const handleAbort = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (lb) abortMutation.mutate({ jobPath, buildNumber: lb.number });
    };

    const handleOpenLog = (buildNumber: number, building: boolean, customPath?: string) => {
        onOpenLog({
            jobName: fav.fullDisplayName || fav.displayName || fav.name,
            buildNumber,
            jobPath: customPath || jobPath,
            building,
        });
    };

    const isJobBuilding = lb?.building || isBuilding(currentJob as any);

    return (
        <div className={cn(
            "bg-slate-900/40 border rounded-xl overflow-hidden transition-all duration-300 group",
            live ? "border-microtermix-neon/40 ring-1 ring-microtermix-neon/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]" : "border-slate-800 hover:border-slate-700"
        )}>
            {/* Card Header */}
            <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <JobColorDot color={currentJob.color} />
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-slate-100 truncate pr-2" title={fav.fullDisplayName || fav.name}>
                                {fav.displayName || fav.name}
                            </h3>
                            <p className="text-[10px] text-slate-500 font-mono truncate opacity-60">
                                {fav.fullName || fav.name}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                        <button 
                            onClick={() => setLive(!live)}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                live 
                                    ? "bg-microtermix-neon text-slate-900 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.5)]" 
                                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                            )}
                        >
                            <Activity size={10} />
                            {live ? 'Live' : 'Go Live'}
                        </button>
                        <button 
                            onClick={() => toggleFavorite(fav)}
                            className="p-1.5 text-amber-400 hover:bg-amber-400/10 rounded-md transition-colors"
                        >
                            <Star size={14} className="fill-current" />
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-slate-950/50 p-2 rounded-lg border border-white/5">
                    {lb ? (
                        <div className="flex items-center gap-3">
                            <ResultBadge result={lb.result} building={lb.building} />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-mono text-slate-300 line-clamp-1">#{lb.number}</span>
                                <span className="text-[9px] text-slate-500">{formatAgo(lb.timestamp)}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                             <JobColorDot color={currentJob.color} />
                             <span className="text-[10px] text-slate-600 italic">No builds found</span>
                        </div>
                    )}

                    <div className="flex items-center gap-1">
                        {!isContainer && (
                             <>
                                {!isJobBuilding ? (
                                    <button onClick={handleBuild} disabled={triggerMutation.isPending} className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-md transition-all">
                                        {triggerMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                    </button>
                                ) : (
                                    <button onClick={handleAbort} className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all">
                                        <Square size={14} />
                                    </button>
                                )}
                             </>
                        )}
                        {lb && (
                            <button onClick={() => handleOpenLog(lb.number, lb.building)} className="p-2 text-slate-400 hover:text-sky-400 hover:bg-sky-400/10 rounded-md transition-all">
                                <Terminal size={14} />
                            </button>
                        )}
                        <button onClick={() => openUrl(fav.url)} className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-all">
                            <ExternalLink size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-4 pb-2">
                 <button onClick={() => setExpanded(!expanded)} className="w-full py-1.5 flex items-center justify-center gap-1 group/btn border-t border-slate-800/50">
                    <span className="text-[9px] font-bold text-slate-600 group-hover/btn:text-slate-400 uppercase tracking-widest transition-colors">
                        {expanded ? 'Ocultar Detalle' : 'Ver Ambientes / Historial'}
                    </span>
                    <History size={10} className={cn("text-slate-700 transition-transform", expanded ? "rotate-180" : "")} />
                 </button>
            </div>

            {expanded && (
                <div className="border-t border-slate-800 bg-slate-950/30 p-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                            {isContainer ? <Layers size={10} /> : <History size={10} />} 
                            {isContainer ? 'Ambientes (Ramas)' : 'Histórico de Ejecuciones'}
                        </span>
                    </div>

                    <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                        {(loadingBuilds || loadingChildren) && (
                            <div className="py-8 flex flex-col items-center justify-center gap-2">
                                <Loader2 size={16} className="animate-spin text-slate-700" />
                                <span className="text-[10px] text-slate-700 font-mono">Cargando datos...</span>
                            </div>
                        )}
                        
                        {isContainer && !loadingChildren && (children || []).map((branch: any) => (
                            <JenkinsBranchRow 
                                key={branch.url} 
                                branch={branch} 
                                baseUrl={cfg.baseUrl} 
                                onOpenLog={onOpenLog} 
                            />
                        ))}

                        {!isContainer && !loadingBuilds && (builds || []).slice(0, 15).map((b: any) => (
                            <div key={b.number} className="flex items-center justify-between p-2 bg-slate-900/50 rounded-lg group/row hover:bg-slate-800/50 transition-colors border border-transparent hover:border-white/5">
                                <div className="flex items-center gap-3 min-w-0">
                                    <ResultBadge result={b.result} building={b.building} />
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono text-slate-300">#{b.number}</span>
                                            <span className="text-[10px] text-slate-500 truncate">{b.displayName || 'Execution'}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[9px] text-slate-600">
                                            <Clock size={8} /> {formatDuration(b.duration)} • {formatAgo(b.timestamp)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-10 sm:opacity-0 group-hover/row:opacity-100 transition-opacity">
                                    <button onClick={() => handleOpenLog(b.number, b.building)} className="p-1.5 text-slate-500 hover:text-sky-400"><Terminal size={11} /></button>
                                    <button onClick={() => openUrl(b.url)} className="p-1.5 text-slate-500 hover:text-slate-300"><ExternalLink size={11} /></button>
                                </div>
                            </div>
                        ))}

                        {(!loadingBuilds && !loadingChildren) && (isContainer ? (children || []).length === 0 : (builds || []).length === 0) && (
                            <div className="py-4 text-center text-[10px] text-slate-600 italic">No hay ambientes o ejecuciones disponibles</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
