import React, { useState, useMemo, useCallback } from 'react';
import { Search, X, RefreshCw, Star, Loader2, Settings, FolderCode, Link2Off, ChevronRight } from 'lucide-react';
import { useJenkinsJobs } from '../../hooks/useJenkins';
import { useJenkinsStore } from '../../stores/jenkinsStore';
import { useJenkinsWatcher, WatcherJobStatus } from '../../hooks/useJenkinsWatcher';
import { normalizeUrl, BuildResult } from '../../services/jenkinsApi';
import { JenkinsJobRow } from './JenkinsJobRow';
import { LogTarget } from './JenkinsLogViewer';
import { jobMatchesSearch, isBuilding, jenkinsGlobalSearch, JenkinsJobSummary } from '../../services/jenkinsApi';
import { useQueryClient } from '@tanstack/react-query';
import { useJenkinsProjectLinks } from '../../hooks/useJenkinsProjectLinks';
import { JenkinsJobCard } from './JenkinsJobCard';
import { LinkedProjectsDirectory } from './LinkedProjectsDirectory';
import { cn } from '../../lib/utils';


// ── LinkedProjectCard — thin wrapper over JenkinsJobCard ───────────────────────

function LinkedProjectCard({
    link,
    config,
    onOpenLog,
    onUnlink,
}: {
    link: import('../../hooks/useJenkinsProjectLinks').JobLink;
    config: import('../../services/jenkinsApi').JenkinsConfig;
    onOpenLog: (target: LogTarget) => void;
    onUnlink: () => void;
}) {
    const projectName = link.projectPath.split('/').filter(Boolean).pop() ?? link.projectName;

    return (
        <JenkinsJobCard
            jobUrl={link.jobUrl}
            displayName={link.jobDisplayName || link.jobName}
            subtitle={projectName}
            subtitleColor="text-orange-400/60"
            jobName={link.jobName}
            baseUrl={config.baseUrl}
            onOpenLog={onOpenLog}
            badgeLeft={<FolderCode size={8} className="text-orange-400/70 shrink-0" />}
            extraActions={
                <button
                    onClick={onUnlink}
                    className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                    title="Desvincular"
                >
                    <Link2Off size={12} />
                </button>
            }
        />
    );
}


export function JenkinsJobsTab({
    onOpenLog,
    links,
    unlinkProject,
}: {
    onOpenLog: (target: LogTarget) => void;
    links: import('../../hooks/useJenkinsProjectLinks').JobLink[];
    unlinkProject: (projectPath: string) => void;
}) {
    const queryClient = useQueryClient();
    const accounts = useJenkinsStore(s => s.accounts);
    const activeAccountId = useJenkinsStore(s => s.activeAccountId);
    const config = accounts.find(a => a.id === activeAccountId);
    const cfg = config; // alias used in favorites JSX
    const favorites = useJenkinsStore(s => s.favorites);
    const toggleFavorite = useJenkinsStore(s => s.toggleFavorite);
    const updateFavoriteStatus = useJenkinsStore(s => s.updateFavoriteStatus);

    // ── Generic watcher — backend push ────────────────────────────────────────
    // The caller decides what URLs to watch. The watcher is just infrastructure.
    // Merge favorites + linked local projects into one deduplicated list.

    const watchedUrls = useMemo(() => {
        const seen = new Set<string>();
        const add = (url: string) => { const n = normalizeUrl(url); seen.add(n); };

        Object.values(favorites)
            .filter(f => config?.baseUrl && f.url.startsWith(config.baseUrl))
            .forEach(f => add(f.url));

        links
            .filter(l => config?.baseUrl && l.jobUrl.startsWith(config.baseUrl))
            .forEach(l => add(l.jobUrl));

        return Array.from(seen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [favorites, links, config?.baseUrl]);

    const isAnyBuilding = useMemo(
        () => Object.values(favorites).some(f =>
            f.color?.endsWith('_anime') || f.lastBuild?.building === true
        ),
        [favorites]
    );

    const handleWatcherUpdate = useCallback((changed: WatcherJobStatus[]) => {
        changed.forEach(job => {
            updateFavoriteStatus(normalizeUrl(job.url), {
                color: job.color,
                lastBuild: job.lastBuildNumber != null ? {
                    number: job.lastBuildNumber,
                    result: job.lastBuildResult as BuildResult,
                    building: job.building,
                    timestamp: job.timestamp ?? 0,
                    duration: 0,
                    estimatedDuration: job.estimatedDuration ?? 0,
                    url: '',
                    displayName: String(job.lastBuildNumber),
                } : null,
            });
        });
    }, [updateFavoriteStatus]);

    useJenkinsWatcher({
        watcherId: `jenkins::${activeAccountId ?? 'none'}`,
        jobUrls: watchedUrls,
        config,
        intervalMs: isAnyBuilding ? 8_000 : 30_000,
        enabled: !!activeAccountId && watchedUrls.length > 0,
        onUpdate: handleWatcherUpdate,
    });

    // links y unlinkProject ahora vienen del padre, no del hook local

    console.log('[JenkinsJobsTab] Diagnostics:', {
        accountsCount: accounts.length,
        activeAccountId,
        hasConfig: !!config,
        baseUrl: config?.baseUrl,
        favoritesCount: Object.keys(favorites).length
    });

    const [inputValue, setInputValue] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'favorites' | 'local'>('all');

    const { data: treeJobs, isLoading: isTreeLoading, isFetching: isTreeFetching } = useJenkinsJobs();
    const [searchResults, setSearchResults] = useState<JenkinsJobSummary[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    // Manual trigger for search (e.g. on Enter key)
    const handleSearch = async () => {
        const query = inputValue.trim();
        console.log('[JenkinsSearch] Manually triggered for:', query);
        
        if (!query) {
            console.log('[JenkinsSearch] Query empty, resetting search.');
            setSearch('');
            setSearchResults(null);
            return;
        }

        if (!config || !config.baseUrl) {
            console.error('[JenkinsSearch] Configuration missing. Cannot search.', { config });
            return;
        }
        
        setSearch(query);
        setIsSearching(true);
        try {
            console.log('[JenkinsSearch] Invoking jenkinsGlobalSearch on server...');
            const results = await jenkinsGlobalSearch(config, query);
            console.log(`[JenkinsSearch] Search returned ${results.length} results.`);
            setSearchResults(results);
        } catch (e) {
            console.error('[JenkinsSearch] API call failed:', e);
        } finally {
            setIsSearching(false);
        }
    };

    const handleClear = () => {
        setInputValue('');
        setSearchResults(null);
        setSearch('');
    };

    const isLoading = isTreeLoading || isSearching;
    const isFetching = isTreeFetching || isSearching;

    const filteredJobs = useMemo(() => {
        const query = (search || '').trim().toLowerCase();
        
        // 1. If we have EXPLICIT server search results (from Enter), show them
        if (searchResults !== null) return searchResults;
        
        // 2. Otherwise, if there is a search term committed via Enter, filter the tree localy
        if (!query) return treeJobs || [];
        
        // Local exhaustive search only on the COMMITTED query
        const allQueries = queryClient.getQueryCache().getAll();
        const jenkinsQueries = allQueries.filter(q => 
            Array.isArray(q.queryKey) && 
            q.queryKey[0] === 'jenkins' && 
            (q.queryKey[1] === 'jobs' || q.queryKey[1] === 'children')
        );

        const pool: JenkinsJobSummary[] = [];
        jenkinsQueries.forEach(q => {
            const data = q.state.data;
            if (Array.isArray(data)) pool.push(...data);
            else if (data && typeof data === 'object') pool.push(data as JenkinsJobSummary);
        });

        const uniqueMatches = new Map<string, JenkinsJobSummary>();
        const deepFlat = (items: JenkinsJobSummary[]) => {
            items.forEach(j => {
                if (!j) return;
                if (jobMatchesSearch(j, query)) {
                    uniqueMapSet(uniqueMatches, j);
                }
                if (Array.isArray(j.jobs)) deepFlat(j.jobs);
            });
        };

        deepFlat(pool);
        
        return Array.from(uniqueMatches.values()).filter(j => {
             const isFolder = j._class?.toLowerCase().includes('folder');
             return !isFolder;
        });
    }, [searchResults, search, treeJobs, queryClient]);

    // Helper for map set during exhaustive search
    function uniqueMapSet(map: Map<string, JenkinsJobSummary>, job: JenkinsJobSummary) {
        map.set(job.url, job);
    }

    const favoriteList = Object.values(favorites).filter(f => {
        // Only show favorites from the ACTIVE account
        if (config?.baseUrl && !f.url.startsWith(config.baseUrl)) return false;
        
        const query = (search || '').trim().toLowerCase();
        if (!query) return true;
        return jobMatchesSearch(f as any, query);
    });

    const totalJobsInTree = (list: any): number => {
        if (!Array.isArray(list)) return 0;
        let count = list.length;
        list.forEach(j => {
            if (j && Array.isArray(j.jobs)) {
                count += totalJobsInTree(j.jobs);
            }
        });
        return count;
    };
    const totalCount = treeJobs ? totalJobsInTree(treeJobs) : 0;

    // Calcule running count from both visible jobs AND favorites
    const runningInList = treeJobs?.filter(isBuilding).length || 0;
    const runningInFavs = favoriteList.filter(f => !treeJobs?.some(j => j.url === f.url) && isBuilding(f as any)).length;
    const runningCount = runningInList + runningInFavs;

    const handleFullRefresh = () => {
        queryClient.invalidateQueries({ queryKey: ['jenkins'] });
    };

    if (!config || !config.baseUrl) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <Settings size={40} className="text-slate-700 mb-4" />
                <h3 className="text-slate-300 font-medium mb-2">Jenkins No Configurado</h3>
                <p className="text-slate-500 text-xs max-w-xs mb-6 leading-relaxed">
                    Por favor, configura una cuenta en la pestaña de sesión para ver jobs.
                </p>
                <div className="mt-8 p-3 bg-slate-900/50 border border-slate-800 rounded-lg text-left w-64">
                    <p className="text-[10px] font-mono text-slate-400 uppercase mb-2 border-b border-slate-800 pb-1">Debug Info</p>
                    <p className="text-[10px] font-mono text-slate-500">Accounts: {accounts.length}</p>
                    <p className="text-[10px] font-mono text-slate-500">ActiveID: {activeAccountId || 'null'}</p>
                    <p className="text-[10px] font-mono text-slate-500">Config: {config ? 'Present' : 'Missing'}</p>
                    <p className="text-[10px] font-mono text-slate-500 truncate">URL: {config?.baseUrl || 'none'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 shrink-0 flex-wrap gap-y-1.5">
                {/* Account/Session Selector */}
                <div className="flex items-center rounded-md border border-slate-700 overflow-hidden shrink-0">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-3 py-1 text-xs transition-colors ${filter === 'all' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setFilter('favorites')}
                        className={`flex items-center gap-1 px-3 py-1 text-xs border-l border-slate-700 transition-colors ${filter === 'favorites' ? 'bg-slate-700 text-amber-400' : 'text-slate-500 hover:text-amber-400'}`}
                    >
                        <Star size={10} className={filter === 'favorites' ? 'fill-current' : ''} />
                        {Object.keys(favorites).length > 0 && <span>{Object.keys(favorites).length}</span>}
                    </button>
                    <button
                        onClick={() => setFilter('local')}
                        className={`flex items-center gap-1 px-3 py-1 text-xs border-l border-slate-700 transition-colors ${filter === 'local' ? 'bg-slate-700 text-orange-400' : 'text-slate-500 hover:text-orange-400'}`}
                    >
                        <FolderCode size={10} />
                        Locales
                        {links.length > 0 && <span className="text-[9px]">{links.length}</span>}
                    </button>
                </div>

                <div className="relative flex-1 min-w-32">
                    <Search size={12} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${isFetching ? 'text-microtermix-neon animate-pulse' : 'text-slate-500'}`} />
                    <input
                        className="w-full bg-slate-800 border border-slate-700 rounded-md pl-7 pr-16 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-microtermix-neon/50"
                        placeholder="Buscar por ID, nombre o rama..."
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {inputValue && <button onClick={handleClear} className="text-slate-500 hover:text-slate-300"><X size={11} /></button>}
                        <button onClick={handleSearch} disabled={isFetching} className="p-1 rounded bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors" title="Buscar en servidor">
                            {isFetching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                        </button>
                        <button onClick={handleFullRefresh} className="text-slate-500 hover:text-microtermix-neon transition-colors" title="Forzar recarga completa">
                            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-4 py-1.5 flex items-center justify-between bg-slate-900/40 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500">
                        {isFetching ? 'Consultando al servidor...' : `Total: ${totalCount} jobs cargados`}
                    </span>
                    {runningCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-microtermix-neon font-mono shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-microtermix-neon animate-pulse" />
                            {runningCount} ejecutándose
                        </span>
                    )}
                </div>
                {search && (
                    <span className="text-[10px] text-microtermix-neon font-medium animate-in fade-in slide-in-from-right-1">
                        Resultados para "{search}"
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {(isLoading || (isFetching && filteredJobs.length === 0)) ? (
                    <div className="flex flex-col items-center justify-center gap-3 text-sm text-slate-500 py-20">
                        <Loader2 size={24} className="animate-spin text-microtermix-neon" />
                        <span className="animate-pulse">Consultando al Remote Server de Jenkins...</span>
                    </div>
                ) : filteredJobs.length === 0 && search ? (
                    <div className="text-center py-20 space-y-4">
                        <Search size={32} className="mx-auto text-slate-800" />
                        <div className="text-sm text-slate-500">No se encontraron resultados para "{search}"</div>
                        <p className="text-[10px] text-slate-600 max-w-[200px] mx-auto">Prueba a buscar por el ID técnico o el nombre visual completo.</p>
                    </div>
                ) : (
                    <>
                        {filter === 'favorites' ? (
                            favoriteList.length === 0 ? (
                                <div className="text-center text-xs text-slate-500 py-24 flex flex-col items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800">
                                        <Star size={20} className="text-slate-700" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-slate-300">No hay favoritos guardados</p>
                                        <p className="max-w-[250px] mx-auto opacity-60">Para mayor fluidez, marca solo los pipelines que usas frecuentemente.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {favoriteList.map(fav => (
                                        <JenkinsJobCard
                                            key={fav.url}
                                            jobUrl={fav.url}
                                            displayName={fav.displayName || fav.name}
                                            subtitle={fav.fullName || fav.name}
                                            subtitleColor="text-slate-500"
                                            jobName={fav.fullDisplayName || fav.displayName || fav.name}
                                            baseUrl={cfg?.baseUrl ?? ''}

                                            onOpenLog={onOpenLog}
                                            extraActions={
                                                <button
                                                    onClick={() => toggleFavorite(fav)}
                                                    className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 rounded transition-colors"
                                                    title="Quitar de favoritos"
                                                >
                                                    <Star size={12} className="fill-current" />
                                                </button>
                                            }
                                        />
                                    ))}
                                </div>
                            )
                        ) : filter === 'local' ? (
                            // ── Locales Tab ──────────────────────────────────────
                            links.length === 0 ? (
                                <div className="text-center text-xs text-slate-500 py-24 flex flex-col items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800">
                                        <FolderCode size={20} className="text-slate-700" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-slate-300">Sin proyectos vinculados</p>
                                        <p className="max-w-[260px] mx-auto opacity-60">
                                            Usá el botón "Proyectos" del header para vincular proyectos locales con Jobs de Jenkins.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-[calc(100vh-220px)] min-h-[400px]">
                                    <LinkedProjectsDirectory
                                        links={links.filter(l => !config?.baseUrl || l.jobUrl.startsWith(config.baseUrl))}
                                        config={config!}
                                        onOpenLog={onOpenLog}
                                        onUnlink={unlinkProject}
                                    />
                                </div>
                            )
                        ) : (
                            <div className="space-y-1">
                                {filteredJobs.map((job: JenkinsJobSummary) => (
                                    <JenkinsJobRow key={job.url} job={job} onOpenLog={onOpenLog} search={search} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
