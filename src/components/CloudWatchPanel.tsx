import React, { useState, useEffect, useRef } from 'react';
import { Cloud, Settings, RefreshCw, CheckCircle, AlertCircle, X } from 'lucide-react';
import {
    CwCredentials,
    CwLogGroup,
    CwLogStream,
    CwLogEvent,
    loadCwConfig, saveCwConfig,
    cwGetLogGroups,
    cwGetLogStreams,
    cwGetLogEvents,
} from '../services/cloudwatchApi';

type CwTab = 'settings' | 'logs' | 'metrics';

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
    const [groups, setGroups] = useState<CwLogGroup[]>([]);
    const [groupSearch, setGroupSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [groupError, setGroupError] = useState<string | null>(null);

    // ── Log streams ──
    const [streams, setStreams] = useState<CwLogStream[]>([]);
    const [streamSearch, setStreamSearch] = useState('');
    const [selectedStream, setSelectedStream] = useState<string | null>(null);
    const [loadingStreams, setLoadingStreams] = useState(false);

    // ── Events ──
    const [events, setEvents] = useState<CwLogEvent[]>([]);
    const [nextToken, setNextToken] = useState<string | null>(null);
    const [tailing, setTailing] = useState(false);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const tailRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Load groups on mount
    useEffect(() => {
        setLoadingGroups(true);
        setGroupError(null);
        cwGetLogGroups(cfg)
            .then(setGroups)
            .catch(e => setGroupError(e?.message ?? String(e)))
            .finally(() => setLoadingGroups(false));
    }, []);

    // Load streams when group changes
    useEffect(() => {
        if (!selectedGroup) { setStreams([]); setSelectedStream(null); return; }
        setLoadingStreams(true);
        cwGetLogStreams(cfg, selectedGroup)
            .then(setStreams)
            .catch(() => setStreams([]))
            .finally(() => setLoadingStreams(false));
        setSelectedStream(null);
        setEvents([]);
        setNextToken(null);
        setTailing(false);
    }, [selectedGroup]);

    // Initial load when stream selected
    useEffect(() => {
        if (!selectedGroup || !selectedStream) return;
        setEvents([]);
        setNextToken(null);
        setLoadingEvents(true);
        const startMs = Date.now() - 10 * 60 * 1000;
        cwGetLogEvents(cfg, selectedGroup, selectedStream, null, startMs)
            .then(res => {
                setEvents(res.events);
                setNextToken(res.next_forward_token);
                setTailing(true);
            })
            .catch(() => {})
            .finally(() => setLoadingEvents(false));
    }, [selectedStream]);

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
            if (!nextToken) return;
            try {
                const res = await cwGetLogEvents(cfg, selectedGroup, selectedStream, nextToken);
                if (res.events.length > 0) {
                    setEvents(prev => [...prev.slice(-1000), ...res.events]);
                }
                if (res.next_forward_token && res.next_forward_token !== nextToken) {
                    setNextToken(res.next_forward_token);
                }
            } catch { /* ignore tail errors silently */ }
        }, 5000);
        return () => { if (tailRef.current) clearInterval(tailRef.current); };
    }, [tailing, selectedGroup, selectedStream, nextToken]);

    const filteredGroups = groupSearch
        ? groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
        : groups;

    const filteredStreams = streamSearch
        ? streams.filter(s => s.name.toLowerCase().includes(streamSearch.toLowerCase()))
        : streams;

    return (
        <div className="flex h-full min-h-0">
            {/* Left: groups + streams */}
            <div className="w-64 shrink-0 border-r border-slate-800 flex flex-col min-h-0">
                {/* Group search */}
                <div className="p-2 border-b border-slate-800">
                    <div className="relative">
                        <input
                            value={groupSearch}
                            onChange={e => setGroupSearch(e.target.value)}
                            placeholder="Buscar grupo…"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                        />
                        {loadingGroups && <RefreshCw size={10} className="animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />}
                    </div>
                </div>
                {groupError && <p className="px-2 py-1 text-[10px] text-red-400">{groupError}</p>}

                <div className="flex-1 overflow-y-auto py-1">
                    {filteredGroups.map(g => (
                        <button key={g.name} onClick={() => setSelectedGroup(g.name)}
                            className={`w-full text-left px-3 py-2 text-xs font-mono truncate transition-colors ${selectedGroup === g.name
                                ? 'bg-nexus-neon/10 text-nexus-neon'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`} title={g.name}>
                            {g.name}
                        </button>
                    ))}
                </div>

                {/* Streams */}
                {selectedGroup && (
                    <>
                        <div className="border-t border-slate-800 p-2">
                            <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5 px-1">Streams</div>
                            <input
                                value={streamSearch}
                                onChange={e => setStreamSearch(e.target.value)}
                                placeholder="Buscar stream…"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                            />
                            {loadingStreams && <RefreshCw size={10} className="animate-spin mt-1 text-slate-500" />}
                        </div>
                        <div className="overflow-y-auto max-h-48 py-1 border-t border-slate-800">
                            {filteredStreams.map(s => (
                                <button key={s.name} onClick={() => setSelectedStream(s.name)}
                                    className={`w-full text-left px-3 py-1.5 text-[11px] font-mono truncate transition-colors ${selectedStream === s.name
                                        ? 'bg-nexus-accent/10 text-nexus-accent'
                                        : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                    }`} title={s.name}>
                                    {s.name}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Right: event viewer */}
            <div className="flex-1 flex flex-col min-h-0">
                {!selectedStream ? (
                    <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                        Selecciona un grupo y un stream
                    </div>
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 shrink-0 bg-slate-900/40">
                            <span className="text-[10px] text-slate-500 font-mono truncate flex-1">{selectedGroup} › {selectedStream}</span>
                            {loadingEvents && <RefreshCw size={11} className="animate-spin text-slate-500" />}
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
                            <button onClick={() => setEvents([])} className="text-[10px] text-slate-600 hover:text-slate-400">Limpiar</button>
                        </div>

                        {/* Log lines */}
                        <div className="flex-1 overflow-y-auto bg-slate-950 p-3 font-mono text-[11px] text-slate-300 space-y-px">
                            {events.length === 0 && !loadingEvents && (
                                <p className="text-slate-600 italic">Sin eventos recientes.</p>
                            )}
                            {events.map((e, i) => (
                                <div key={i} className="flex gap-3 leading-relaxed hover:bg-slate-900 px-1 rounded">
                                    <span className="text-slate-600 shrink-0 select-none">
                                        {new Date(e.timestamp).toLocaleTimeString()}
                                    </span>
                                    <span className="break-all">{e.message}</span>
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

function MetricsTab({ cfg: _cfg }: { cfg: CwCredentials }) {
    return <div className="p-6 text-slate-500 text-sm">Métricas — implementación pendiente (Task 7)</div>;
}

// ── Main panel ────────────────────────────────────────────────────────────────

export const CloudWatchPanel: React.FC = () => {
    const [tab, setTab] = useState<CwTab>('settings');
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
