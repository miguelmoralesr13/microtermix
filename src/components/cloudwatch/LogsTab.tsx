import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Star, X, Copy, Check } from 'lucide-react';
import {
    CwCredentials,
    CwLogEvent,
    cwGetLogGroups,
    cwGetLogStreams,
    cwGetLogEvents,
    cwFilterLogEvents
} from '../../services/cloudwatchApi';
import { usePersistedState, LogMessage } from './cwUtils';

interface LogsTabProps {
    cfg: CwCredentials;
}

const Sidebar = React.memo(({
    sidebarWidth, groupSearch, setGroupSearch, fetchGroups, loadingGroups, groupError, sortedGroups, selectedGroup, setSelectedGroup, favorites, toggleFavorite,
    selectedGroupSelected, loadingStreams, streamSearch, setStreamSearch, fetchStreams, streamError, filteredStreams, setSelectedStream, selectedStream, streamFavorites, toggleStreamFavorite
}: any) => {
    return (
        <div
            className="shrink-0 border-r border-slate-800 flex flex-col min-h-0 bg-slate-950/20"
            style={{ width: sidebarWidth }}
        >
            {/* Group search */}
            <div className="p-2 border-b border-slate-800">
                <div className="flex gap-1">
                    <div className="relative flex-1">
                        <input
                            value={groupSearch}
                            onChange={e => setGroupSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && fetchGroups()}
                            placeholder="Buscar grupo…"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                        />
                        {loadingGroups && <RefreshCw size={10} className="animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />}
                    </div>
                    <button
                        onClick={() => fetchGroups()}
                        disabled={loadingGroups}
                        title="Buscar grupos en AWS CloudWatch"
                        className="px-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700 transition-colors"
                    >
                        <RefreshCw size={12} className={loadingGroups ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>
            {groupError && <p className="px-2 py-1 text-[10px] text-red-400 bg-red-500/10 border-b border-red-500/20">{groupError}</p>}

            <div className="flex-1 overflow-y-auto py-1">
                {sortedGroups.map((g: any) => {
                    const isFav = favorites.includes(g.name);
                    return (
                        <div key={g.name} className="group flex items-center pr-1">
                            <button onClick={() => setSelectedGroup(g.name)}
                                className={`flex-1 text-left px-3 py-2 text-xs font-mono truncate transition-colors ${selectedGroup === g.name
                                    ? 'bg-nexus-neon/10 text-nexus-neon'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                    }`} title={g.name}>
                                {g.name}
                            </button>
                            <button
                                onClick={(e) => toggleFavorite(g.name, e)}
                                className={`p-1.5 rounded-md hover:bg-slate-800 transition-colors ${isFav ? 'text-amber-400' : 'text-slate-700 opacity-0 group-hover:opacity-100'}`}
                            >
                                <Star size={12} fill={isFav ? "currentColor" : "none"} />
                            </button>
                        </div>
                    );
                })}
                {sortedGroups.length === 0 && !loadingGroups && (
                    <p className="px-4 py-3 text-[10px] text-slate-600 italic">No hay resultados.</p>
                )}
            </div>

            {/* Streams */}
            {selectedGroupSelected && (
                <>
                    <div className="border-t border-slate-800 p-2 bg-slate-900/40">
                        <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5 px-1 flex justify-between items-center">
                            <span>Log Streams</span>
                            {loadingStreams && <RefreshCw size={10} className="animate-spin text-slate-500" />}
                        </div>
                        <div className="flex gap-1">
                            <div className="relative flex-1">
                                <input
                                    value={streamSearch}
                                    onChange={e => setStreamSearch(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && fetchStreams()}
                                    placeholder="Buscar streams (Enter)…"
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                                />
                                {streamSearch && (
                                    <button
                                        onClick={() => { setStreamSearch(''); setTimeout(() => fetchStreams(), 0); }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                                    >
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => fetchStreams()}
                                disabled={loadingStreams}
                                title="Buscar streams en AWS"
                                className="px-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700 transition-colors"
                            >
                                <RefreshCw size={12} className={loadingStreams ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>
                    {streamError && <p className="px-2 py-1 text-[10px] text-amber-400 bg-amber-500/5 border-b border-amber-500/10 leading-tight">{streamError}</p>}

                    <div className="overflow-y-auto max-h-56 py-1 border-t border-slate-800">
                        {filteredStreams.map((s: any) => {
                            const isFav = streamFavorites.includes(s.name);
                            return (
                                <div key={s.name} className="group flex items-center pr-1">
                                    <button onClick={() => setSelectedStream(s.name)}
                                        className={`flex-1 text-left px-3 py-1.5 text-[11px] font-mono transition-colors flex justify-between items-center gap-2 ${selectedStream === s.name
                                            ? 'bg-nexus-accent/10 text-nexus-accent'
                                            : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                            }`} title={s.name}>
                                        <span className="truncate flex-1">{s.name}</span>
                                        {s.last_event_ms && (
                                            <span className="text-[9px] opacity-60 shrink-0">
                                                {new Date(s.last_event_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        onClick={(e) => toggleStreamFavorite(s.name, e)}
                                        className={`p-1.5 rounded-md hover:bg-slate-800 transition-colors ${isFav ? 'text-amber-400' : 'text-slate-700 opacity-0 group-hover:opacity-100'}`}
                                    >
                                        <Star size={12} fill={isFav ? "currentColor" : "none"} />
                                    </button>
                                </div>
                            );
                        })}
                        {filteredStreams.length === 0 && !loadingStreams && !streamError && (
                            <p className="px-4 py-2 text-[10px] text-slate-600 italic">Nada por aquí.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
});

const LogViewer = React.memo(({ events, backToken, loadingHistory, loadHistory, loading }: any) => {
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyLine = (msg: string, id: string) => {
        navigator.clipboard.writeText(msg);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    useEffect(() => {
        if (!backToken || loadingHistory || loading) return;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                loadHistory();
            }
        }, {
            rootMargin: '400px',
            threshold: 0
        });

        const currentSentinel = sentinelRef.current;
        if (currentSentinel) observer.observe(currentSentinel);
        return () => {
            if (currentSentinel) observer.unobserve(currentSentinel);
        };
    }, [backToken, loadingHistory, loadHistory, loading]);

    return (
        <div className="flex-1 overflow-y-auto bg-slate-950 p-3 font-mono text-[11px] text-slate-300 space-y-1 scroll-smooth">
            {loading && events.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                    <RefreshCw size={24} className="animate-spin text-nexus-neon" />
                    <p className="text-xs animate-pulse">Sincronizando con CloudWatch...</p>
                </div>
            )}

            {events.length === 0 && !loading && !loadingHistory && (
                <div className="flex flex-col items-center justify-center py-10 text-slate-600 italic gap-2 text-center">
                    <p>No se encontraron eventos en el periodo seleccionado.</p>
                </div>
            )}

            {events.map((e: any, i: number) => {
                const lineId = `${e.timestamp}-${i}`;
                return (
                    <div key={lineId} className="flex gap-3 leading-relaxed hover:bg-slate-800/40 p-1.5 rounded-md transition-colors w-full group overflow-hidden relative">
                        <span className="text-slate-600 shrink-0 select-none whitespace-nowrap mt-0.5" title={new Date(e.timestamp).toLocaleString()}>
                            {new Date(e.timestamp).toLocaleTimeString()}
                        </span>
                        <div className="flex-1 min-w-0">
                            <LogMessage message={e.message} />
                        </div>
                        <button
                            onClick={() => copyLine(e.message, lineId)}
                            className={`absolute right-2 top-2 p-1.5 rounded bg-slate-900/80 border border-slate-700 opacity-0 group-hover:opacity-100 transition-all hover:bg-slate-800 ${copiedId === lineId ? 'text-emerald-400 opacity-100' : 'text-slate-400'}`}
                            title="Copiar línea"
                        >
                            {copiedId === lineId ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                    </div>
                );
            })}

            <div ref={sentinelRef} className="h-20 flex flex-col items-center justify-center gap-2 text-[10px] text-slate-600 mt-4 border-t border-slate-900/50">
                {loadingHistory ? (
                    <>
                        <RefreshCw size={14} className="animate-spin text-nexus-neon" />
                        <span>Cargando más logs...</span>
                    </>
                ) : backToken ? (
                    <span className="opacity-50 italic text-[9px]">Desplaza para cargar historia</span>
                ) : events.length > 0 ? (
                    <span className="opacity-20 text-[9px]">Inicio del periodo alcanzado</span>
                ) : null}
            </div>
        </div>
    );
});

export function LogsTab({ cfg }: LogsTabProps) {
    const [groupSearch, setGroupSearch] = usePersistedState('nexus-cw-logs-group-search', '');
    const [selectedGroup, setSelectedGroup] = usePersistedState<string | null>('nexus-cw-logs-selected-group', null);
    const [favorites, setFavorites] = usePersistedState<string[]>('nexus-cw-favorites', []);
    const [streamFavorites, setStreamFavorites] = usePersistedState<string[]>('nexus-cw-stream-favorites', []);
    const [streamSearch, setStreamSearch] = usePersistedState('nexus-cw-logs-stream-search', '');
    const [selectedStream, setSelectedStream] = usePersistedState<string | null>('nexus-cw-logs-selected-stream', null);
    const [mergedView, setMergedView] = usePersistedState('nexus-cw-logs-merged-view', false);
    const [timeRange, setTimeRange] = usePersistedState('nexus-cw-logs-time-range', 10); // in minutes

    // Events State
    const [events, setEvents] = useState<CwLogEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [nextToken, setNextToken] = useState<string | null>(null);
    const [backToken, setBackToken] = useState<string | null>(null);
    const [tailing, setTailing] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [logFilters, setLogFilters] = useState<string[]>([]);
    const [filterInput, setFilterInput] = useState('');
    const tailRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const nextTokenRef = useRef<string | null>(null);

    // Queries
    const {
        data: groups = [],
        isLoading: loadingGroups,
        error: groupQueryError,
        refetch: fetchGroups
    } = useQuery({
        queryKey: ['cw-log-groups', cfg.accessKeyId, cfg.region],
        queryFn: () => cwGetLogGroups(cfg, groupSearch),
        staleTime: 1000 * 60 * 10, // 10 minutes
        enabled: !!cfg.accessKeyId && !!cfg.region,
    });

    const {
        data: streams = [],
        isLoading: loadingStreams,
        error: streamQueryError,
        refetch: fetchStreams
    } = useQuery({
        queryKey: ['cw-log-streams', cfg.accessKeyId, cfg.region, selectedGroup],
        queryFn: () => cwGetLogStreams(cfg, selectedGroup!, streamSearch),
        staleTime: 1000 * 60 * 5, // 5 minutes
        enabled: !!selectedGroup && !!cfg.accessKeyId && !!cfg.region,
    });

    const groupError = groupQueryError ? String(groupQueryError) : null;
    const streamError = streamQueryError ? String(streamQueryError) : null;


    // Keep ref in sync with state for use inside interval
    useEffect(() => { nextTokenRef.current = nextToken; }, [nextToken]);

    // Initial load events when stream/merged/timeRange selected
    useEffect(() => {
        if (!selectedGroup) return;
        if (!mergedView && !selectedStream) return;

        // Cancel any pending tail
        setTailing(false);
        setEvents([]);
        setNextToken(null);
        setBackToken(null);
        setLoadingEvents(true);

        const rangeMinutes = Number(timeRange) || 10;
        const startMs = Date.now() - (rangeMinutes * 60 * 1000);

        const fetchFn = mergedView
            ? () => cwFilterLogEvents(cfg, selectedGroup, null, null, startMs)
            : () => cwGetLogEvents(cfg, selectedGroup, selectedStream!, null, startMs);

        fetchFn()
            .then(res => {
                // Sort newest first
                const sorted = [...res.events].sort((a, b) => b.timestamp - a.timestamp);
                setEvents(sorted);
                setNextToken(res.next_forward_token);
                setBackToken(res.next_backward_token);
                // Reactivate tailing after initial success
                setTailing(true);
            })
            .catch(err => {
                console.error("Initial load error:", err);
            })
            .finally(() => setLoadingEvents(false));
    }, [selectedStream, mergedView, timeRange, cfg, selectedGroup]);

    const loadHistory = useCallback(async () => {
        if (!selectedGroup || (!mergedView && !selectedStream) || !backToken || loadingHistory) return;
        setLoadingHistory(true);
        try {
            const fetchFn = mergedView
                ? () => cwFilterLogEvents(cfg, selectedGroup, null, backToken)
                : () => cwGetLogEvents(cfg, selectedGroup, selectedStream!, backToken);

            const res = await fetchFn();
            if (res.events.length > 0) {
                // Sort history descending and append to end (older)
                const sortedHistory = [...res.events].sort((a, b) => b.timestamp - a.timestamp);
                setEvents(prev => {
                    const combined = [...prev, ...sortedHistory];
                    // Memory safety: Cap the total number of events in memory
                    return combined.slice(0, 5000);
                });
            }
            // Even if no events, update backToken (CloudWatch might return empty pages)
            setBackToken(res.next_backward_token);
        } catch (err) {
            console.error("Error loading history:", err);
        } finally {
            setLoadingHistory(false);
        }
    }, [selectedGroup, mergedView, selectedStream, backToken, loadingHistory, cfg]);


    // Live tail interval
    useEffect(() => {
        if (!tailing || !selectedGroup || (!mergedView && !selectedStream) || loadingEvents) {
            if (tailRef.current) clearInterval(tailRef.current);
            tailRef.current = null;
            return;
        }

        tailRef.current = setInterval(async () => {
            try {
                let fallbackStartMs: number | null = null;
                const currentNextToken = nextTokenRef.current;

                if (!currentNextToken) {
                    if (events.length > 0) {
                        fallbackStartMs = events[0].timestamp + 1;
                    } else {
                        fallbackStartMs = Date.now() - (Number(timeRange) * 60 * 1000);
                    }
                }

                const fetchFn = mergedView
                    ? () => cwFilterLogEvents(cfg, selectedGroup, null, currentNextToken, fallbackStartMs)
                    : () => cwGetLogEvents(cfg, selectedGroup, selectedStream!, currentNextToken, fallbackStartMs);

                const res = await fetchFn();
                if (res.events.length > 0) {
                    const sortedNew = [...res.events].sort((a, b) => b.timestamp - a.timestamp);

                    setEvents(prev => {
                        // Efficient deduplication using a temporary set (only need to check against the top of the list)
                        const existingIds = new Set(prev.slice(0, 50).map(e => `${e.timestamp}-${e.message}`));
                        const uniqueNew = sortedNew.filter(e => !existingIds.has(`${e.timestamp}-${e.message}`));

                        if (uniqueNew.length === 0) return prev;
                        return [...uniqueNew, ...prev].slice(0, 5000);
                    });
                }

                if (res.next_forward_token !== undefined && res.next_forward_token !== currentNextToken) {
                    setNextToken(res.next_forward_token);
                }
            } catch (err) {
                console.error("Tail error:", err);
            }
        }, 5000);

        return () => { if (tailRef.current) clearInterval(tailRef.current); };
    }, [tailing, selectedGroup, selectedStream, mergedView, cfg, timeRange, loadingEvents]);

    // Local filtered lists for UI
    const sortedGroups = useMemo(() => {
        const allGroups = [...groups];
        favorites.forEach(fav => {
            if (!allGroups.some(g => g.name === fav)) {
                allGroups.push({ name: fav, stored_bytes: 0 }); // stub for missing favorite
            }
        });

        return allGroups
            .filter(g => favorites.includes(g.name) || g.name.toLowerCase().includes(groupSearch.toLowerCase()))
            .sort((a, b) => {
                const aFav = favorites.includes(a.name);
                const bFav = favorites.includes(b.name);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return 0;
            });
    }, [groups, favorites, groupSearch]);

    const filteredStreams = useMemo(() => {
        const allStreams = [...streams];
        streamFavorites.forEach(fav => {
            if (!allStreams.some(s => s.name === fav)) {
                allStreams.push({ name: fav, last_event_ms: null });
            }
        });

        return allStreams
            .sort((a, b) => {
                const aFav = streamFavorites.includes(a.name);
                const bFav = streamFavorites.includes(b.name);
                if (aFav && !bFav) return -1;
                if (!aFav && bFav) return 1;
                return 0;
            });
    }, [streams, streamFavorites]);

    const filteredEvents = useMemo(() => events.filter(e => {
        if (logFilters.length === 0) return true;
        const msg = e.message.toLowerCase();
        return logFilters.every(filter => msg.includes(filter.toLowerCase()));
    }), [events, logFilters]);

    const removeLogFilter = (f: string) => {
        setLogFilters(prev => prev.filter(x => x !== f));
    };

    const addLogFilter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && filterInput.trim()) {
            const f = filterInput.trim();
            if (!logFilters.includes(f)) {
                setLogFilters(prev => [...prev, f]);
            }
            setFilterInput('');
        }
    };

    const memoizedToggleFavorite = useCallback((name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setFavorites(prev =>
            prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
        );
    }, [setFavorites]);

    const memoizedToggleStreamFavorite = useCallback((name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setStreamFavorites(prev =>
            prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
        );
    }, [setStreamFavorites]);

    const [sidebarWidth, setSidebarWidth] = usePersistedState('nexus-cw-logs-sidebar-width', 256);
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    useEffect(() => {
        if (!isResizing) return;
        const doResize = (e: MouseEvent) => {
            const newWidth = Math.max(150, Math.min(600, e.clientX - 50));
            setSidebarWidth(newWidth);
        };
        const stopResizing = () => setIsResizing(false);
        window.addEventListener('mousemove', doResize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', doResize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, setSidebarWidth]);

    return (
        <div className="flex h-full min-h-0 relative">
            <Sidebar
                sidebarWidth={sidebarWidth}
                groupSearch={groupSearch}
                setGroupSearch={setGroupSearch}
                fetchGroups={fetchGroups}
                loadingGroups={loadingGroups}
                groupError={groupError}
                sortedGroups={sortedGroups}
                selectedGroup={selectedGroup}
                setSelectedGroup={setSelectedGroup}
                favorites={favorites}
                toggleFavorite={memoizedToggleFavorite}
                selectedGroupSelected={!!selectedGroup}
                loadingStreams={loadingStreams}
                streamSearch={streamSearch}
                setStreamSearch={setStreamSearch}
                fetchStreams={fetchStreams}
                streamError={streamError}
                filteredStreams={filteredStreams}
                setSelectedStream={setSelectedStream}
                selectedStream={selectedStream}
                streamFavorites={streamFavorites}
                toggleStreamFavorite={memoizedToggleStreamFavorite}
            />

            {/* Resize handle */}
            <div
                onMouseDown={startResizing}
                className={`w-1 cursor-col-resize hover:bg-nexus-neon/50 transition-colors shrink-0 z-10 ${isResizing ? 'bg-nexus-neon' : 'bg-transparent'}`}
            />

            {/* Right: event viewer */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {!selectedStream && !mergedView ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 text-sm gap-4">
                        <p>Selecciona un grupo y un stream</p>
                        {selectedGroup && (
                            <button
                                onClick={() => setMergedView(true)}
                                className="px-4 py-2 bg-nexus-neon/10 text-nexus-neon border border-nexus-neon/30 rounded-lg text-xs font-bold hover:bg-nexus-neon/20 transition-colors"
                            >
                                Cambiar a Vista Combinada (Todas los streams)
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="flex flex-col border-b border-slate-800 shrink-0 bg-slate-900/40 min-w-0">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/50 min-w-0">
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-[10px] text-slate-500 font-mono truncate" title={selectedGroup!}>
                                        {selectedGroup}
                                    </span>
                                    <span className="text-[9px] text-nexus-neon/70 font-mono truncate">
                                        {mergedView ? '› Vista Combinada (Multistream)' : `› ${selectedStream}`}
                                    </span>
                                </div>
                                {loadingEvents && <RefreshCw size={11} className="animate-spin text-slate-500 shrink-0" />}

                                <div className="flex items-center gap-1.5 ml-2 shrink-0 flex-wrap sm:flex-nowrap justify-end">
                                    <select
                                        value={timeRange}
                                        onChange={(e) => setTimeRange(Number(e.target.value))}
                                        className="bg-slate-800 border border-slate-700 text-[10px] text-slate-300 rounded px-1.5 py-1 focus:outline-none focus:border-nexus-neon"
                                        title="Rango de tiempo inicial"
                                    >
                                        <option value={5}>Últimos 5 min</option>
                                        <option value={10}>Últimos 10 min</option>
                                        <option value={30}>Últimos 30 min</option>
                                        <option value={60}>Última 1 hora</option>
                                        <option value={180}>Últimas 3 horas</option>
                                        <option value={720}>Últimas 12 horas</option>
                                        <option value={1440}>Últimas 24 horas</option>
                                    </select>
                                    {selectedGroup && (
                                        <button
                                            onClick={() => {
                                                setMergedView(!mergedView);
                                                if (!mergedView) setSelectedStream(null);
                                            }}
                                            title={mergedView ? "Cambiar a vista de stream individual" : "Cambiar a vista combinada (todos los streams)"}
                                            className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${mergedView
                                                ? 'bg-nexus-neon/20 text-nexus-neon border-nexus-neon/40'
                                                : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
                                                }`}
                                        >
                                            {mergedView ? 'Multistream ON' : 'Multistream OFF'}
                                        </button>
                                    )}
                                    <input
                                        value={filterInput}
                                        onChange={e => setFilterInput(e.target.value)}
                                        onKeyDown={addLogFilter}
                                        placeholder="Filtrar logs (Enter)"
                                        className="w-32 bg-slate-950 border border-slate-700/50 rounded px-2 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-nexus-accent transition-colors"
                                    />
                                    <button
                                        onClick={() => setTailing(v => !v)}
                                        className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded border transition-colors ${tailing
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                                            }`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${tailing ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                                        {tailing ? 'Live' : 'Pausado'}
                                    </button>
                                    <div className="h-4 w-px bg-slate-800 mx-1 shrink-0" />
                                    <button
                                        onClick={() => {
                                            const all = filteredEvents.map(e => `${new Date(e.timestamp).toISOString()} ${e.message}`).join('\n');
                                            navigator.clipboard.writeText(all);
                                        }}
                                        className="text-[10px] text-slate-500 hover:text-nexus-neon flex items-center gap-1 transition-colors"
                                    >
                                        <Copy size={10} /> Copiar todo
                                    </button>
                                    <button onClick={() => setEvents([])} className="text-[10px] text-slate-600 hover:text-slate-400 ml-1">Limpiar</button>
                                </div>
                            </div>

                            {/* Filter Chips */}
                            {logFilters.length > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
                                    <span className="text-[9px] text-slate-600 uppercase">Filtros:</span>
                                    {logFilters.map(f => (
                                        <span key={f} className="flex items-center gap-1 bg-nexus-neon/10 text-nexus-neon border border-nexus-neon/20 px-1.5 py-0.5 rounded text-[10px]">
                                            {f}
                                            <button onClick={() => removeLogFilter(f)} className="hover:text-white rounded-full p-0.5 transition-colors"><X size={9} /></button>
                                        </span>
                                    ))}
                                    <button onClick={() => setLogFilters([])} className="text-[9px] text-slate-500 hover:text-slate-300 ml-1">Limpiar filtros</button>
                                </div>
                            )}
                        </div>

                        <LogViewer
                            events={filteredEvents}
                            backToken={backToken}
                            loadingHistory={loadingHistory}
                            loadHistory={loadHistory}
                            loading={loadingEvents}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
