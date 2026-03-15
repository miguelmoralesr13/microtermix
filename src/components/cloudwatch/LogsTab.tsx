import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Star, X, Copy, Check, ChevronRight, ChevronDown, Filter, AlertTriangle, BarChart3 } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import {
    CwCredentials,
    CwLogEvent,
    cwGetLogGroups,
    cwGetLogStreams,
    cwGetLogEvents,
    cwFilterLogEvents,
    cwStartTail,
    cwStopTail,
    cwGetMetricData
} from '../../services/cloudwatchApi';
import { usePersistedState } from './cwUtils';

interface LogsTabProps {
    cfg: CwCredentials;
}

// ── Components ────────────────────────────────────────────────────────────────

const MiniChart = ({ points, color = "#22d3ee", label }: { points: any[], color?: string, label: string }) => {
    if (points.length === 0) return <div className="h-12 flex items-center justify-center text-[9px] text-slate-700 italic border border-slate-800/50 rounded bg-slate-900/30">Sin datos</div>;
    
    const maxVal = Math.max(...points.map(p => p.value)) || 1;
    const minVal = Math.min(...points.map(p => p.value));
    const range = maxVal - minVal || 1;
    
    return (
        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
            <div className="flex justify-between items-baseline px-1">
                <span className="text-[9px] text-slate-500 uppercase font-bold">{label}</span>
                <span className="text-[10px] text-slate-300 font-mono">
                    {points[points.length-1].value.toFixed(label.includes('Duration') ? 0 : 1)}
                    {label.includes('Duration') ? 'ms' : ''}
                </span>
            </div>
            <div className="h-10 bg-slate-900/50 rounded border border-slate-800/50 p-1 flex items-end gap-px">
                {points.slice(-20).map((p, i) => {
                    const h = ((p.value - minVal) / range) * 100;
                    return (
                        <div 
                            key={i} 
                            className="flex-1 rounded-t-sm transition-all hover:opacity-80" 
                            style={{ height: `${Math.max(5, h)}%`, backgroundColor: color }}
                            title={`${new Date(p.timestamp).toLocaleTimeString()}: ${p.value}`}
                        />
                    );
                })}
            </div>
        </div>
    );
};

const QuickMetrics = ({ cfg, logGroup }: { cfg: CwCredentials, logGroup: string }) => {
    const isLambda = logGroup.startsWith('/aws/lambda/');
    const lambdaName = isLambda ? logGroup.replace('/aws/lambda/', '') : null;
    const [visible, setVisible] = useState(false);

    const { data: metricsData } = useQuery({
        queryKey: ['cw-quick-metrics', cfg.accessKeyId, cfg.region, logGroup],
        queryFn: async () => {
            if (!lambdaName) return null;
            const endMs = Date.now();
            const startMs = endMs - (60 * 60 * 1000); // Last hour
            const dims = [{ name: 'FunctionName', value: lambdaName }];
            
            const [invocations, errors, duration] = await Promise.all([
                cwGetMetricData(cfg, 'AWS/Lambda', 'Invocations', dims, 'Sum', 300, startMs, endMs),
                cwGetMetricData(cfg, 'AWS/Lambda', 'Errors', dims, 'Sum', 300, startMs, endMs),
                cwGetMetricData(cfg, 'AWS/Lambda', 'Duration', dims, 'Average', 300, startMs, endMs),
            ]);
            
            return { invocations, errors, duration };
        },
        enabled: !!lambdaName && visible,
        refetchInterval: 60_000,
    });

    if (!isLambda) return null;

    return (
        <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/40">
            <button 
                onClick={() => setVisible(!visible)}
                className="flex items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-microtermix-neon transition-colors"
            >
                <BarChart3 size={12} className={visible ? 'text-microtermix-neon' : ''} />
                {visible ? 'OCULTAR MÉTRICAS' : 'MÉTRICAS RÁPIDAS (INVOCACIONES, ERRORES, DURACIÓN)'}
            </button>
            {visible && metricsData && (
                <div className="flex gap-4 mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <MiniChart label="Invocations" points={metricsData.invocations} />
                    <MiniChart label="Errors" points={metricsData.errors} color="#ef4444" />
                    <MiniChart label="Duration (avg)" points={metricsData.duration} color="#a855f7" />
                </div>
            )}
        </div>
    );
};

const JsonExpandable = ({ data }: { data: any }) => {
    const [expanded, setExpanded] = useState(false);
    
    return (
        <div className="mt-1">
            <button 
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[10px] text-microtermix-neon/80 hover:text-microtermix-neon transition-colors font-bold uppercase tracking-tighter"
            >
                {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                {expanded ? 'Ocultar JSON' : 'Ver JSON'}
            </button>
            {expanded && (
                <pre className="mt-1.5 p-2 bg-slate-900 border border-slate-800 rounded text-[10px] overflow-x-auto whitespace-pre font-mono text-slate-300">
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    );
};

const LogLine = React.memo(({ event, index, onRequestIdClick, copiedId, onCopy }: { 
    event: CwLogEvent, 
    index: number, 
    onRequestIdClick: (id: string) => void,
    copiedId: string | null,
    onCopy: (msg: string, id: string) => void
}) => {
    const lineId = `${event.timestamp}-${index}`;
    
    // Detect JSON
    const jsonParsed = useMemo(() => {
        const msg = event.message.trim();
        if (msg.startsWith('{') && msg.endsWith('}')) {
            try { return JSON.parse(msg); } catch { return null; }
        }
        return null;
    }, [event.message]);

    // Detect Request ID
    const requestId = useMemo(() => {
        const match = event.message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        return match ? match[0] : null;
    }, [event.message]);

    return (
        <div className="flex gap-3 leading-relaxed hover:bg-slate-800/40 p-1.5 rounded-md transition-colors w-full group overflow-hidden relative border-b border-transparent hover:border-slate-800/50">
            <span className="text-slate-600 shrink-0 select-none whitespace-nowrap mt-0.5 w-16 text-right" title={new Date(event.timestamp).toLocaleString()}>
                {new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}
            </span>
            <div className="flex-1 min-w-0">
                <div className="break-all whitespace-pre-wrap">
                    {requestId ? (
                        <>
                            {event.message.split(requestId).map((part, i, arr) => (
                                <React.Fragment key={i}>
                                    {part}
                                    {i < arr.length - 1 && (
                                        <button 
                                            onClick={() => onRequestIdClick(requestId)}
                                            className="text-microtermix-accent hover:underline decoration-microtermix-accent/50 underline-offset-2"
                                        >
                                            {requestId}
                                        </button>
                                    )}
                                </React.Fragment>
                            ))}
                        </>
                    ) : (
                        event.message
                    )}
                </div>
                {jsonParsed && <JsonExpandable data={jsonParsed} />}
            </div>
            <button
                onClick={() => onCopy(event.message, lineId)}
                className={`absolute right-2 top-2 p-1.5 rounded bg-slate-900/80 border border-slate-700 opacity-0 group-hover:opacity-100 transition-all hover:bg-slate-800 ${copiedId === lineId ? 'text-emerald-400 opacity-100' : 'text-slate-400'}`}
                title="Copiar línea"
            >
                {copiedId === lineId ? <Check size={12} /> : <Copy size={12} />}
            </button>
        </div>
    );
});

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
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon"
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
                                    ? 'bg-microtermix-neon/10 text-microtermix-neon'
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
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon"
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
                                            ? 'bg-microtermix-accent/10 text-microtermix-accent'
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

export function LogsTab({ cfg }: LogsTabProps) {
    const [groupSearch, setGroupSearch] = usePersistedState('microtermix-cw-logs-group-search', '');
    const [selectedGroup, setSelectedGroup] = usePersistedState<string | null>('microtermix-cw-logs-selected-group', null);
    const [favorites, setFavorites] = usePersistedState<string[]>('microtermix-cw-favorites', []);
    const [streamFavorites, setStreamFavorites] = usePersistedState<string[]>('microtermix-cw-stream-favorites', []);
    const [streamSearch, setStreamSearch] = usePersistedState('microtermix-cw-logs-stream-search', '');
    const [selectedStream, setSelectedStream] = usePersistedState<string | null>('microtermix-cw-logs-selected-stream', null);
    const [mergedView, setMergedView] = usePersistedState('microtermix-cw-logs-merged-view', false);
    const [timeRange, setTimeRange] = usePersistedState('microtermix-cw-logs-time-range', 10); // in minutes

    // Events State
    const [events, setEvents] = useState<CwLogEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [backToken, setBackToken] = useState<string | null>(null);
    const [tailing, setTailing] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [logFilters, setLogFilters] = useState<string[]>([]);
    const [filterInput, setFilterInput] = useState('');
    const [workerError, setWorkerError] = useState<string | null>(null);
    
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

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

    // ── Smart Tailing Logic ───────────────────────────────────────────────────

    const workerId = useMemo(() => `cw-worker-${selectedGroup}-${selectedStream}-${mergedView}`, [selectedGroup, selectedStream, mergedView]);

    useEffect(() => {
        if (!selectedGroup) return;
        if (!mergedView && !selectedStream) return;
        if (!tailing) return;

        setWorkerError(null);
        setLoadingEvents(true);

        const startMs = Date.now() - (timeRange * 60 * 1000);
        
        // Use FilterLogEvents for tailing regardless of mergedView, but if not merged, filter by stream name
        // Wait, the Rust worker uses FilterLogEvents which is cross-stream. 
        // If selectedStream is set, we'd need to filter by it in the pattern or just use merged view logic.
        // For now, let's treat selectedStream as part of the filter if not merged.
        const filterPattern = mergedView ? null : (selectedStream ? `{$.logStream = "${selectedStream}"}` : null);
        // Actually CloudWatch filter pattern syntax for stream name is tricky. 
        // Simplest for now: if not merged, just use cwGetLogEvents once then tail? No, worker is better.
        // I'll adjust the pattern if needed.

        cwStartTail(cfg, selectedGroup, filterPattern, workerId)
            .catch(err => setWorkerError(String(err)))
            .finally(() => setLoadingEvents(false));

        const unlistenLogs = listen<CwLogEvent[]>(`cw-logs-${workerId}`, (event) => {
            setEvents(prev => {
                const newEvents = event.payload;
                // Prepend new events (since we want newest first in the list, or oldest first?)
                // Standard terminal is oldest first (bottom). Let's do that for Live feel.
                const combined = [...prev, ...newEvents];
                return combined.slice(-5000); // Keep last 5000
            });
        });

        const unlistenError = listen<string>(`cw-logs-error-${workerId}`, (event) => {
            setWorkerError(event.payload);
        });

        return () => {
            cwStopTail(workerId);
            unlistenLogs.then(u => u());
            unlistenError.then(u => u());
        };
    }, [selectedGroup, selectedStream, mergedView, tailing, timeRange, cfg, workerId]);

    // Initial historical load (if needed)
    useEffect(() => {
        if (!selectedGroup) return;
        if (!mergedView && !selectedStream) return;
        
        setEvents([]);
        setBackToken(null);
        setLoadingEvents(true);

        const startMs = Date.now() - (timeRange * 60 * 1000);
        const fetchFn = mergedView
            ? () => cwFilterLogEvents(cfg, selectedGroup, null, null, startMs)
            : () => cwGetLogEvents(cfg, selectedGroup, selectedStream!, null, startMs);

        fetchFn()
            .then(res => {
                // For Live feel, we want oldest first (index 0 is oldest, last index is newest)
                const sorted = [...res.events].sort((a, b) => a.timestamp - b.timestamp);
                setEvents(sorted);
                setBackToken(res.next_backward_token);
            })
            .catch(err => console.error("History load error:", err))
            .finally(() => setLoadingEvents(false));
    }, [selectedGroup, selectedStream, mergedView, timeRange, cfg]);

    const loadHistory = useCallback(async () => {
        if (!selectedGroup || (!mergedView && !selectedStream) || !backToken || loadingHistory) return;
        setLoadingHistory(true);
        try {
            const fetchFn = mergedView
                ? () => cwFilterLogEvents(cfg, selectedGroup, null, backToken)
                : () => cwGetLogEvents(cfg, selectedGroup, selectedStream!, backToken);

            const res = await fetchFn();
            if (res.events.length > 0) {
                const sortedHistory = [...res.events].sort((a, b) => a.timestamp - b.timestamp);
                setEvents(prev => {
                    const combined = [...sortedHistory, ...prev];
                    return combined.slice(-10000);
                });
            }
            setBackToken(res.next_backward_token);
        } catch (err) {
            console.error("Error loading history:", err);
        } finally {
            setLoadingHistory(false);
        }
    }, [selectedGroup, mergedView, selectedStream, backToken, loadingHistory, cfg]);

    // UI Helpers
    const filteredEvents = useMemo(() => events.filter(e => {
        if (logFilters.length === 0) return true;
        const msg = e.message.toLowerCase();
        return logFilters.every(filter => msg.includes(filter.toLowerCase()));
    }), [events, logFilters]);

    const copyLine = (msg: string, id: string) => {
        navigator.clipboard.writeText(msg);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const onRequestIdClick = (id: string) => {
        if (!logFilters.includes(id)) {
            setLogFilters(prev => [...prev, id]);
        }
    };

    // Layout
    const [sidebarWidth, setSidebarWidth] = usePersistedState('microtermix-cw-logs-sidebar-width', 256);
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

    const sortedGroups = useMemo(() => {
        const allGroups = [...groups];
        favorites.forEach(fav => {
            if (!allGroups.some(g => g.name === fav)) {
                allGroups.push({ name: fav, stored_bytes: 0 });
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
        return allStreams.sort((a, b) => {
            const aFav = streamFavorites.includes(a.name);
            const bFav = streamFavorites.includes(b.name);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0;
        });
    }, [streams, streamFavorites]);

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
                toggleFavorite={(name: string, e: any) => {
                    e.stopPropagation();
                    setFavorites(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);
                }}
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
                toggleStreamFavorite={(name: string, e: any) => {
                    e.stopPropagation();
                    setStreamFavorites(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);
                }}
            />

            <div
                onMouseDown={startResizing}
                className={`w-1 cursor-col-resize hover:bg-microtermix-neon/50 transition-colors shrink-0 z-10 ${isResizing ? 'bg-microtermix-neon' : 'bg-transparent'}`}
            />

            <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-slate-950">
                {!selectedStream && !mergedView ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 text-sm gap-4">
                        <p>Selecciona un grupo y un stream</p>
                        {selectedGroup && (
                            <button
                                onClick={() => setMergedView(true)}
                                className="px-4 py-2 bg-microtermix-neon/10 text-microtermix-neon border border-microtermix-neon/30 rounded-lg text-xs font-bold hover:bg-microtermix-neon/20 transition-colors"
                            >
                                Vista Combinada (Cross-stream)
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col border-b border-slate-800 shrink-0 bg-slate-900/40 min-w-0">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/50 min-w-0">
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-[10px] text-slate-500 font-mono truncate" title={selectedGroup!}>
                                        {selectedGroup}
                                    </span>
                                    <span className="text-[9px] text-microtermix-neon/70 font-mono truncate">
                                        {mergedView ? '› Multistream' : `› ${selectedStream}`}
                                    </span>
                                </div>
                                
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <select
                                        value={timeRange}
                                        onChange={(e) => setTimeRange(Number(e.target.value))}
                                        className="bg-slate-800 border border-slate-700 text-[10px] text-slate-300 rounded px-1.5 py-1 focus:outline-none"
                                    >
                                        <option value={5}>5m</option>
                                        <option value={15}>15m</option>
                                        <option value={60}>1h</option>
                                        <option value={360}>6h</option>
                                        <option value={1440}>24h</option>
                                    </select>
                                    
                                    <button
                                        onClick={() => setTailing(!tailing)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold rounded border transition-all ${tailing
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                            : 'bg-slate-800 text-slate-500 border-slate-700'
                                        }`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full ${tailing ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                                        LIVE
                                    </button>

                                    <div className="relative">
                                        <Filter size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600" />
                                        <input
                                            value={filterInput}
                                            onChange={e => setFilterInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && filterInput.trim()) {
                                                    if (!logFilters.includes(filterInput.trim())) setLogFilters([...logFilters, filterInput.trim()]);
                                                    setFilterInput('');
                                                }
                                            }}
                                            placeholder="Filtrar..."
                                            className="w-32 bg-slate-950 border border-slate-700/50 rounded pl-7 pr-2 py-1 text-[10px] text-slate-300 focus:border-microtermix-accent outline-none"
                                        />
                                    </div>

                                    <button 
                                        onClick={() => {
                                            if (!logFilters.includes("ERROR")) setLogFilters([...logFilters, "ERROR"]);
                                        }}
                                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded border border-transparent hover:border-red-500/20 transition-all"
                                        title="Solo Errores"
                                    >
                                        <AlertTriangle size={14} />
                                    </button>

                                    <button onClick={() => setEvents([])} className="text-[10px] text-slate-500 hover:text-slate-300 px-2">Limpiar</button>
                                </div>
                            </div>

                            {/* Lambda Quick Metrics */}
                            {selectedGroup && <QuickMetrics cfg={cfg} logGroup={selectedGroup} />}

                            {logFilters.length > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950/50">
                                    {logFilters.map(f => (
                                        <span key={f} className="flex items-center gap-1 bg-microtermix-accent/10 text-microtermix-accent border border-microtermix-accent/20 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                            {f}
                                            <button onClick={() => setLogFilters(logFilters.filter(x => x !== f))}><X size={10} /></button>
                                        </span>
                                    ))}
                                    <button onClick={() => setLogFilters([])} className="text-[9px] text-slate-600 hover:text-slate-400 ml-1 underline">Limpiar filtros</button>
                                </div>
                            )}
                        </div>

                        {workerError && (
                            <div className="p-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-[10px] font-mono flex items-center gap-2">
                                <AlertTriangle size={12} /> {workerError}
                            </div>
                        )}

                        <div className="flex-1 min-h-0 font-mono text-[11px] text-slate-300">
                            <Virtuoso
                                ref={virtuosoRef}
                                data={filteredEvents}
                                followOutput="auto"
                                initialTopMostItemIndex={filteredEvents.length - 1}
                                itemContent={(index, event) => (
                                    <LogLine 
                                        key={`${event.timestamp}-${index}`}
                                        event={event} 
                                        index={index} 
                                        onRequestIdClick={onRequestIdClick}
                                        copiedId={copiedId}
                                        onCopy={copyLine}
                                    />
                                )}
                                components={{
                                    Header: () => (
                                        <div className="py-4 border-b border-slate-900 mb-2">
                                            {backToken ? (
                                                <button 
                                                    onClick={loadHistory}
                                                    disabled={loadingHistory}
                                                    className="w-full py-2 text-[10px] text-slate-500 hover:text-microtermix-neon transition-colors"
                                                >
                                                    {loadingHistory ? 'Cargando historia...' : 'Cargar logs anteriores ↑'}
                                                </button>
                                            ) : (
                                                <div className="text-center text-[9px] text-slate-700 italic">Inicio del periodo alcanzado</div>
                                            )}
                                        </div>
                                    )
                                }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
