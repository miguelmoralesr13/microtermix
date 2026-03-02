import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Cloud, Settings, RefreshCw, CheckCircle, AlertCircle, X, Star } from 'lucide-react';
import {
    CwCredentials,
    CwLogGroup,
    CwLogStream,
    CwLogEvent,
    CwMetricItem,
    CwDimension,
    CwDatapoint,
    loadCwConfig, saveCwConfig,
    cwGetLogGroups,
    cwGetLogStreams,
    cwGetLogEvents,
    cwListMetrics,
    cwGetMetricData,
} from '../services/cloudwatchApi';

type CwTab = 'settings' | 'logs' | 'metrics';

function usePersistedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
        try {
            const saved = localStorage.getItem(key);
            if (saved !== null) return JSON.parse(saved);
        } catch { }
        return initialValue;
    });

    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(state));
    }, [key, state]);

    return [state, setState];
}

// ── LogMessage Formatter ──────────────────────────────────────────────────────

function LogMessage({ message }: { message: string }) {
    try {
        const parsed = JSON.parse(message);
        return (
            <pre className="text-[10px] text-slate-300 bg-slate-900/50 p-2 rounded-md border border-slate-800/50 whitespace-pre-wrap break-words">
                {JSON.stringify(parsed, null, 2)}
            </pre>
        );
    } catch {
        // Not JSON, return as normal text
        return <span className="break-all">{message}</span>;
    }
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ onSaved }: { onSaved: () => void }) {
    const [draft, setDraft] = useState<CwCredentials>(() => loadCwConfig());
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<'ok' | 'error' | null>(null);
    const [errMsg, setErrMsg] = useState('');

    const handleSave = () => {
        saveCwConfig(draft);
        onSaved();
    };

    const handleTest = async () => {
        setTesting(true);
        setResult(null);
        try {
            await cwGetLogGroups(draft, '');
            setResult('ok');
        } catch (e: any) {
            setResult('error');
            setErrMsg(e?.message ?? String(e));
        } finally {
            setTesting(false);
        }
    };

    const field = (label: string, key: keyof CwCredentials, placeholder: string, secret = false) => (
        <div key={key}>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
            <input
                type={secret ? 'password' : 'text'}
                value={(draft[key] as string) ?? ''}
                onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-nexus-accent placeholder:text-slate-700"
            />
        </div>
    );

    return (
        <div className="max-w-md mx-auto p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Settings size={15} /> Credenciales AWS CloudWatch
            </h2>
            {field('Región', 'region', 'us-east-1')}
            {field('Access Key ID', 'accessKeyId', 'AKIAIOSFODNN7EXAMPLE')}
            {field('Secret Access Key', 'secretAccessKey', '••••••••••••••••••••', true)}
            {field('Session Token (opcional)', 'sessionToken', 'dejar vacío si no usas STS')}

            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40 hover:bg-nexus-accent/30 rounded-lg text-xs font-bold transition-colors"
                >
                    Guardar
                </button>
                <button
                    onClick={handleTest}
                    disabled={testing || !draft.accessKeyId || !draft.secretAccessKey}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 border border-slate-700 rounded-lg text-xs font-bold transition-colors"
                >
                    {testing ? <RefreshCw size={12} className="animate-spin" /> : null}
                    {testing ? 'Probando…' : 'Probar conexión'}
                </button>
                {result === 'ok' && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={13} /> Conectado</span>}
                {result === 'error' && (
                    <span className="flex items-center gap-1 text-xs text-red-400" title={errMsg}>
                        <AlertCircle size={13} /> Error
                    </span>
                )}
            </div>
            {result === 'error' && errMsg && (
                <p className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded p-2 leading-snug break-all">{errMsg}</p>
            )}
        </div>
    );
}

// ── NeedConfig guard ──────────────────────────────────────────────────────────

function NeedConfig({ onGo }: { onGo: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 p-12">
            <AlertCircle size={36} />
            <p className="text-sm text-center">Primero configura tus credenciales AWS.</p>
            <button onClick={onGo} className="text-xs text-nexus-accent hover:underline">Ir a Configuración →</button>
        </div>
    );
}

// ── Stubs for Logs and Metrics (replaced in Tasks 6 and 7) ───────────────────

function LogsTab({ cfg }: { cfg: CwCredentials }) {
    // ── Log groups ──
    const [groups, setGroups] = usePersistedState<CwLogGroup[]>('nexus-cw-logs-groups', []);
    const [groupSearch, setGroupSearch] = usePersistedState('nexus-cw-logs-group-search', '');
    const [selectedGroup, setSelectedGroup] = usePersistedState<string | null>('nexus-cw-logs-selected-group', null);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [groupError, setGroupError] = useState<string | null>(null);
    const [favorites, setFavorites] = usePersistedState<string[]>('nexus-cw-favorites', []);

    const toggleFavorite = (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setFavorites(prev =>
            prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
        );
    };

    const [streamFavorites, setStreamFavorites] = usePersistedState<string[]>('nexus-cw-stream-favorites', []);

    const toggleStreamFavorite = (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setStreamFavorites(prev =>
            prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
        );
    };

    // ── Log streams ──
    const [streams, setStreams] = usePersistedState<CwLogStream[]>('nexus-cw-logs-streams', []);
    const [streamSearch, setStreamSearch] = usePersistedState('nexus-cw-logs-stream-search', '');
    const [selectedStream, setSelectedStream] = usePersistedState<string | null>('nexus-cw-logs-selected-stream', null);
    const [loadingStreams, setLoadingStreams] = useState(false);
    const [streamError, setStreamError] = useState<string | null>(null);

    // ── Events ──
    const [events, setEvents] = useState<CwLogEvent[]>([]);
    const [nextToken, setNextToken] = useState<string | null>(null);
    const [tailing, setTailing] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [logFilters, setLogFilters] = useState<string[]>([]);
    const [filterInput, setFilterInput] = useState('');
    const tailRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const nextTokenRef = useRef<string | null>(null);

    // Keep ref in sync with state for use inside interval
    useEffect(() => { nextTokenRef.current = nextToken; }, [nextToken]);

    // Fetching functions
    const fetchGroups = useCallback((prefix?: string) => {
        setLoadingGroups(true);
        setGroupError(null);
        cwGetLogGroups(cfg, prefix)
            .then(setGroups)
            .catch(e => setGroupError(e?.message ?? String(e)))
            .finally(() => setLoadingGroups(false));
    }, [cfg]);

    const fetchStreams = useCallback((group: string, prefix?: string) => {
        setLoadingStreams(true);
        setStreamError(null);
        cwGetLogStreams(cfg, group, prefix)
            .then(res => {
                setStreams(res);
                if (res.length === 0 && prefix) {
                    setStreamError(`No se encontraron streams que empiecen con "${prefix}"`);
                }
            })
            .catch(e => setStreamError(e?.message ?? String(e)))
            .finally(() => setLoadingStreams(false));
    }, [cfg]);

    // Initial load groups
    useEffect(() => {
        fetchGroups();
    }, [fetchGroups]);

    // Load streams when group changes
    useEffect(() => {
        if (!selectedGroup) {
            setStreams([]);
            setSelectedStream(null);
            setEvents([]);
            return;
        }
        fetchStreams(selectedGroup);
        setSelectedStream(null);
        setEvents([]);
        setNextToken(null);
        setTailing(false);
    }, [selectedGroup, fetchStreams]);

    // Initial load events when stream selected
    useEffect(() => {
        if (!selectedGroup || !selectedStream) return;
        setEvents([]);
        setNextToken(null);
        setLoadingEvents(true);
        // Remove startMs restriction to see logs of any stream regardless of age
        cwGetLogEvents(cfg, selectedGroup, selectedStream, null, null)
            .then(res => {
                setEvents(res.events);
                setNextToken(res.next_forward_token);
                setTailing(true);
            })
            .catch(() => { })
            .finally(() => setLoadingEvents(false));
    }, [selectedStream, cfg, selectedGroup]);

    // Auto-scroll to bottom on new events
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events]);

    // Live tail interval
    useEffect(() => {
        if (!tailing || !selectedGroup || !selectedStream) {
            if (tailRef.current) clearInterval(tailRef.current);
            tailRef.current = null;
            return;
        }
        tailRef.current = setInterval(async () => {
            if (!nextTokenRef.current) return;
            try {
                const res = await cwGetLogEvents(cfg, selectedGroup, selectedStream, nextTokenRef.current);
                if (res.events.length > 0) {
                    setEvents(prev => [...prev.slice(-1000), ...res.events]);
                }
                if (res.next_forward_token && res.next_forward_token !== nextTokenRef.current) {
                    setNextToken(res.next_forward_token);
                }
            } catch { /* ignore tail errors silently */ }
        }, 5000);
        return () => { if (tailRef.current) clearInterval(tailRef.current); };
    }, [tailing, selectedGroup, selectedStream, cfg]);

    // Local filtered lists for UI
    // Favorites are always included, others only if they match the search

    // For groups: Include all favorites even if not in the current 'groups' list (as stubs),
    // then filter by search (favorites bypass search), then sort.
    const allGroups = [...groups];
    favorites.forEach(fav => {
        if (!allGroups.some(g => g.name === fav)) {
            allGroups.push({ name: fav, stored_bytes: 0 }); // stub for missing favorite
        }
    });

    const sortedGroups = allGroups
        .filter(g => favorites.includes(g.name) || g.name.toLowerCase().includes(groupSearch.toLowerCase()))
        .sort((a, b) => {
            const aFav = favorites.includes(a.name);
            const bFav = favorites.includes(b.name);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0;
        });

    // For streams: Include all streamFavorites as stubs if missing
    const allStreams = [...streams];
    streamFavorites.forEach(fav => {
        if (!allStreams.some(s => s.name === fav)) {
            allStreams.push({ name: fav, last_event_ms: null });
        }
    });

    const filteredStreams = allStreams
        .filter(s => streamFavorites.includes(s.name) || streamSearch.trim() === '' || s.name.toLowerCase().includes(streamSearch.toLowerCase()))
        .sort((a, b) => {
            const aFav = streamFavorites.includes(a.name);
            const bFav = streamFavorites.includes(b.name);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0;
        });

    // Local filtered events
    const filteredEvents = events.filter(e => {
        if (logFilters.length === 0) return true;
        const msg = e.message.toLowerCase();
        return logFilters.every(filter => msg.includes(filter.toLowerCase()));
    });

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

    return (
        <div className="flex h-full min-h-0">
            {/* Left: groups + streams */}
            <div className="w-64 shrink-0 border-r border-slate-800 flex flex-col min-h-0">
                {/* Group search */}
                <div className="p-2 border-b border-slate-800">
                    <div className="flex gap-1">
                        <div className="relative flex-1">
                            <input
                                value={groupSearch}
                                onChange={e => setGroupSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && fetchGroups(groupSearch.trim())}
                                placeholder="Buscar grupo…"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                            />
                            {loadingGroups && <RefreshCw size={10} className="animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />}
                        </div>
                        <button
                            onClick={() => fetchGroups(groupSearch.trim())}
                            disabled={loadingGroups}
                            title="Buscar en AWS CloudWatch"
                            className="px-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700 transition-colors"
                        >
                            <RefreshCw size={12} className={loadingGroups ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
                {groupError && <p className="px-2 py-1 text-[10px] text-red-400 bg-red-500/10 border-b border-red-500/20">{groupError}</p>}

                <div className="flex-1 overflow-y-auto py-1">
                    {sortedGroups.map(g => {
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
                {selectedGroup && (
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
                                        onKeyDown={e => e.key === 'Enter' && fetchStreams(selectedGroup, streamSearch.trim())}
                                        placeholder="Filtrar o buscar (Enter)…"
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                                    />
                                    {streamSearch && (
                                        <button
                                            onClick={() => { setStreamSearch(''); fetchStreams(selectedGroup); }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                                        >
                                            <X size={10} />
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => fetchStreams(selectedGroup, streamSearch.trim())}
                                    disabled={loadingStreams}
                                    title="Profundizar búsqueda en AWS"
                                    className="px-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700 transition-colors"
                                >
                                    <RefreshCw size={12} className={loadingStreams ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>
                        {streamError && <p className="px-2 py-1 text-[10px] text-amber-400 bg-amber-500/5 border-b border-amber-500/10 leading-tight">{streamError}</p>}

                        <div className="overflow-y-auto max-h-56 py-1 border-t border-slate-800">
                            {filteredStreams.map(s => {
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

            {/* Right: event viewer */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {!selectedStream ? (
                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                        Selecciona un grupo y un stream
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="flex flex-col border-b border-slate-800 shrink-0 bg-slate-900/40 min-w-0">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/50 min-w-0">
                                <span className="text-[10px] text-slate-500 font-mono truncate flex-1 min-w-0" title={`${selectedGroup} › ${selectedStream}`}>
                                    {selectedGroup} › {selectedStream}
                                </span>
                                {loadingEvents && <RefreshCw size={11} className="animate-spin text-slate-500 shrink-0" />}

                                <div className="flex items-center gap-1.5 ml-2 shrink-0 flex-wrap sm:flex-nowrap justify-end">
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

                        {/* Log lines */}
                        <div className="flex-1 overflow-y-auto bg-slate-950 p-3 font-mono text-[11px] text-slate-300 space-y-1">
                            {filteredEvents.length === 0 && !loadingEvents && (
                                <p className="text-slate-600 italic">Sin eventos que coincidan.</p>
                            )}
                            {[...filteredEvents].reverse().map((e, i) => (
                                <div key={i} className="flex gap-3 leading-relaxed hover:bg-slate-800/40 p-1.5 rounded-md transition-colors w-full group overflow-hidden">
                                    <span className="text-slate-600 shrink-0 select-none whitespace-nowrap mt-0.5">
                                        {new Date(e.timestamp).toLocaleTimeString()}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <LogMessage message={e.message} />
                                    </div>
                                </div>
                            ))}
                            <div ref={bottomRef} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────

function LineChart({ points }: { points: CwDatapoint[] }) {
    if (points.length === 0) return (
        <div className="flex items-center justify-center h-32 text-slate-600 text-xs italic">Sin datos</div>
    );

    const W = 560, H = 160, PX = 48, PY = 16;
    const xs = points.map(p => p.timestamp);
    const ys = points.map(p => p.value);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeY = maxY - minY || 1;

    const px = (x: number) => PX + ((x - minX) / (maxX - minX || 1)) * (W - PX - 8);
    const py = (y: number) => H - PY - ((y - minY) / rangeY) * (H - PY - PY);

    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.timestamp).toFixed(1)} ${py(p.value).toFixed(1)}`).join(' ');

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
        y: py(minY + t * rangeY),
        label: (minY + t * rangeY).toFixed(1),
    }));

    const xLabels = [
        { x: px(minX), label: new Date(minX).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
        { x: px(maxX), label: new Date(maxX).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    ];

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
            {yTicks.map((t, i) => (
                <g key={i}>
                    <line x1={PX} y1={t.y} x2={W - 8} y2={t.y} stroke="#1e293b" strokeDasharray="4 2" />
                    <text x={PX - 4} y={t.y + 3} textAnchor="end" fill="#475569" fontSize="9">{t.label}</text>
                </g>
            ))}
            <line x1={PX} y1={PY} x2={PX} y2={H - PY} stroke="#334155" />
            <line x1={PX} y1={H - PY} x2={W - 8} y2={H - PY} stroke="#334155" />
            {xLabels.map((l, i) => (
                <text key={i} x={l.x} y={H - 2} textAnchor="middle" fill="#475569" fontSize="9">{l.label}</text>
            ))}
            <path d={`${d} L ${px(maxX).toFixed(1)} ${H - PY} L ${px(minX).toFixed(1)} ${H - PY} Z`}
                fill="url(#cwGrad)" opacity="0.3" />
            <defs>
                <linearGradient id="cwGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={d} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" />
            {points.length <= 30 && points.map((p, i) => (
                <circle key={i} cx={px(p.timestamp)} cy={py(p.value)} r="2.5" fill="#22d3ee" />
            ))}
        </svg>
    );
}

const NAMESPACE_SUGGESTIONS = [
    'AWS/Lambda', 'AWS/EC2', 'AWS/ECS', 'AWS/RDS', 'AWS/S3',
    'AWS/ApiGateway', 'AWS/DynamoDB', 'AWS/SQS', 'AWS/SNS',
    '/aws/lambda', 'AWS/ApplicationELB', 'AWS/CloudFront',
];

const STAT_OPTIONS = ['Average', 'Sum', 'Maximum', 'Minimum', 'SampleCount'];
const PERIOD_OPTIONS = [
    { label: '1 min', value: 60 },
    { label: '5 min', value: 300 },
    { label: '15 min', value: 900 },
    { label: '1 hora', value: 3600 },
];
const RANGE_OPTIONS = [
    { label: 'Última 1h', value: 3600_000 },
    { label: 'Últimas 6h', value: 21600_000 },
    { label: 'Últimas 24h', value: 86400_000 },
    { label: 'Últimos 7d', value: 604800_000 },
];

function MetricsTab({ cfg }: { cfg: CwCredentials }) {
    const [namespace, setNamespace] = usePersistedState('nexus-cw-metrics-ns', '');
    const [metricSearch, setMetricSearch] = usePersistedState('nexus-cw-metrics-search', '');
    const [metrics, setMetrics] = usePersistedState<CwMetricItem[]>('nexus-cw-metrics-list', []);
    const [loadingMetrics, setLoadingMetrics] = useState(false);
    const [selectedMetric, setSelectedMetric] = usePersistedState<CwMetricItem | null>('nexus-cw-metrics-selected', null);
    const [dimensions, setDimensions] = usePersistedState<CwDimension[]>('nexus-cw-metrics-dims', []);
    const [stat, setStat] = usePersistedState('nexus-cw-metrics-stat', 'Average');
    const [period, setPeriod] = usePersistedState('nexus-cw-metrics-period', 300);
    const [range, setRange] = usePersistedState('nexus-cw-metrics-range', 3600_000);
    const [datapoints, setDatapoints] = usePersistedState<CwDatapoint[]>('nexus-cw-metrics-data', []);
    const [loadingData, setLoadingData] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);

    const searchMetrics = useCallback(async () => {
        setLoadingMetrics(true);
        setMetrics([]);
        try {
            const result = await cwListMetrics(cfg, namespace || undefined, metricSearch || undefined);
            setMetrics(result.slice(0, 100));
        } catch { setMetrics([]); }
        finally { setLoadingMetrics(false); }
    }, [cfg, namespace, metricSearch]);

    const handleSelectMetric = (m: CwMetricItem) => {
        setSelectedMetric(m);
        setDimensions(m.dimensions.map(d => ({ ...d })));
    };

    const loadData = async () => {
        if (!selectedMetric) return;
        setLoadingData(true);
        setDataError(null);
        try {
            const endMs = Date.now();
            const startMs = endMs - range;
            const pts = await cwGetMetricData(
                cfg, selectedMetric.namespace, selectedMetric.metric_name,
                dimensions, stat, period, startMs, endMs,
            );
            setDatapoints(pts);
        } catch (e: any) {
            setDataError(e?.message ?? String(e));
        } finally {
            setLoadingData(false);
        }
    };

    const selectLabel = selectedMetric
        ? `${selectedMetric.namespace} / ${selectedMetric.metric_name}`
        : null;

    return (
        <div className="flex flex-col h-full min-h-0 p-4 gap-4">
            {/* Search row */}
            <div className="flex flex-wrap gap-2 items-end shrink-0">
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase tracking-wider">Namespace</label>
                    <input
                        list="ns-suggestions"
                        value={namespace}
                        onChange={e => setNamespace(e.target.value)}
                        placeholder="AWS/Lambda"
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 w-44 focus:outline-none focus:border-nexus-neon placeholder:text-slate-600"
                    />
                    <datalist id="ns-suggestions">
                        {NAMESPACE_SUGGESTIONS.map(n => <option key={n} value={n} />)}
                    </datalist>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-slate-500 uppercase tracking-wider">Métrica</label>
                    <input
                        value={metricSearch}
                        onChange={e => setMetricSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchMetrics()}
                        placeholder="Errors ↵"
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-200 w-36 focus:outline-none focus:border-nexus-neon placeholder:text-slate-600"
                    />
                </div>
                <button onClick={searchMetrics} disabled={loadingMetrics}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700 rounded-lg transition-colors">
                    {loadingMetrics ? <RefreshCw size={11} className="animate-spin" /> : null}
                    Buscar
                </button>
            </div>

            {/* Metric list */}
            {metrics.length > 0 && !selectedMetric && (
                <div className="border border-slate-800 rounded-lg overflow-hidden max-h-48 overflow-y-auto shrink-0">
                    {metrics.map((m, i) => (
                        <button key={i} onClick={() => handleSelectMetric(m)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 border-b border-slate-800 last:border-0 transition-colors">
                            <span className="text-nexus-neon font-mono">{m.namespace}</span>
                            <span className="text-slate-400 mx-1">/</span>
                            <span className="text-slate-200">{m.metric_name}</span>
                            {m.dimensions.length > 0 && (
                                <span className="text-slate-600 ml-2 text-[10px]">
                                    {m.dimensions.map(d => `${d.name}=${d.value}`).join(', ')}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Selected metric config */}
            {selectedMetric && (
                <div className="shrink-0 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200 font-mono">{selectLabel}</span>
                        <button onClick={() => { setSelectedMetric(null); setDatapoints([]); }}
                            className="text-slate-600 hover:text-slate-300"><X size={13} /></button>
                    </div>

                    {dimensions.length > 0 && (
                        <div className="space-y-1.5">
                            <span className="text-[9px] text-slate-500 uppercase tracking-wider">Dimensiones</span>
                            {dimensions.map((d, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <span className="text-[11px] text-slate-400 font-mono w-28 shrink-0">{d.name}</span>
                                    <input value={d.value}
                                        onChange={e => setDimensions(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-nexus-neon"
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 uppercase tracking-wider">Estadística</label>
                            <select value={stat} onChange={e => setStat(e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon">
                                {STAT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 uppercase tracking-wider">Período</label>
                            <select value={period} onChange={e => setPeriod(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon">
                                {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] text-slate-500 uppercase tracking-wider">Rango</label>
                            <select value={range} onChange={e => setRange(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-nexus-neon">
                                {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col justify-end">
                            <button onClick={loadData} disabled={loadingData}
                                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40 hover:bg-nexus-accent/30 disabled:opacity-40 rounded-lg transition-colors">
                                {loadingData ? <RefreshCw size={11} className="animate-spin" /> : null}
                                {loadingData ? 'Cargando…' : 'Cargar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chart */}
            {dataError && <p className="text-xs text-red-400 shrink-0">{dataError}</p>}
            {datapoints.length > 0 && (
                <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-auto">
                    <LineChart points={datapoints} />
                    <p className="text-[10px] text-slate-600 mt-2 text-right">
                        {datapoints.length} datapoints · {stat} · cada {period / 60} min
                    </p>
                </div>
            )}
            {!selectedMetric && metrics.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-sm italic">
                    Busca un namespace / métrica para comenzar
                </div>
            )}
        </div>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export const CloudWatchPanel: React.FC = () => {
    const [tab, setTab] = usePersistedState<CwTab>('nexus-cw-active-tab', 'settings');
    const [savedMsg, setSavedMsg] = useState(false);
    const [cfg, setCfg] = useState<CwCredentials>(() => loadCwConfig());
    const isConfigured = !!(cfg.accessKeyId && cfg.secretAccessKey && cfg.region);

    const handleSaved = () => {
        const updated = loadCwConfig();
        setCfg(updated);
        setSavedMsg(true);
        if (updated.accessKeyId && updated.secretAccessKey) setTab('logs');
    };

    const tabs: { id: CwTab; label: string }[] = [
        { id: 'settings', label: 'Configuración' },
        { id: 'logs', label: 'Logs' },
        { id: 'metrics', label: 'Métricas' },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                <Cloud size={15} className="text-nexus-neon mr-2 shrink-0" />
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${tab === t.id
                            ? 'border-nexus-neon text-white'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}>
                        {t.label}
                    </button>
                ))}
                {savedMsg && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle size={12} /> Guardado
                        <button onClick={() => setSavedMsg(false)} className="ml-1 text-slate-600 hover:text-slate-400"><X size={10} /></button>
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-auto">
                {tab === 'settings' && <SettingsTab onSaved={handleSaved} />}
                {tab === 'logs' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'logs' && isConfigured && <LogsTab cfg={cfg} />}
                {tab === 'metrics' && !isConfigured && <NeedConfig onGo={() => setTab('settings')} />}
                {tab === 'metrics' && isConfigured && <MetricsTab cfg={cfg} />}
            </div>
        </div>
    );
};
