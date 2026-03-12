import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import { 
    CwCredentials, 
    CwMetricItem, 
    CwDimension, 
    CwDatapoint, 
    cwListMetrics, 
    cwGetMetricData 
} from '../../services/cloudwatchApi';
import { usePersistedState } from './cwUtils';

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

interface MetricsTabProps {
    cfg: CwCredentials;
}

export function MetricsTab({ cfg }: MetricsTabProps) {
    const queryClient = useQueryClient();
    const [namespace, setNamespace] = usePersistedState('nexus-cw-metrics-ns', '');
    const [metricSearch, setMetricSearch] = usePersistedState('nexus-cw-metrics-search', '');
    const [selectedMetric, setSelectedMetric] = usePersistedState<CwMetricItem | null>('nexus-cw-metrics-selected', null);
    const [dimensions, setDimensions] = usePersistedState<CwDimension[]>('nexus-cw-metrics-dims', []);
    const [stat, setStat] = usePersistedState('nexus-cw-metrics-stat', 'Average');
    const [period, setPeriod] = usePersistedState('nexus-cw-metrics-period', 300);
    const [range, setRange] = usePersistedState('nexus-cw-metrics-range', 3600_000);

    // Queries
    const {
        data: metrics = [],
        isLoading: loadingMetrics,
        refetch: searchMetrics
    } = useQuery({
        queryKey: ['cw-metrics-list', cfg.accessKeyId, cfg.region, namespace, metricSearch],
        queryFn: () => cwListMetrics(cfg, namespace || undefined, metricSearch || undefined).then(res => res.slice(0, 100)),
        enabled: false, // Only on manual search
    });

    const {
        data: datapoints = [],
        isLoading: loadingData,
        error: dataQueryError
    } = useQuery({
        queryKey: ['cw-metrics-data', cfg.accessKeyId, cfg.region, selectedMetric?.metric_name, dimensions, stat, period, range],
        queryFn: () => {
            const endMs = Date.now();
            const startMs = endMs - range;
            return cwGetMetricData(
                cfg, selectedMetric!.namespace, selectedMetric!.metric_name,
                dimensions, stat, period, startMs, endMs,
            );
        },
        enabled: !!selectedMetric && !!cfg.accessKeyId && !!cfg.region,
        refetchInterval: 60_000, // Refresh every minute
    });

    const dataError = dataQueryError ? String(dataQueryError) : null;

    const handleSelectMetric = (m: CwMetricItem) => {
        setSelectedMetric(m);
        setDimensions(m.dimensions.map(d => ({ ...d })));
    };

    const loadData = () => {
        queryClient.invalidateQueries({ queryKey: ['cw-metrics-data'] });
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
                <button onClick={() => searchMetrics()} disabled={loadingMetrics}
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
                        <button onClick={() => setSelectedMetric(null)}
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
            {selectedMetric && datapoints.length > 0 && (
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
