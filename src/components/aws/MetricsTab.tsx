import  { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, X, Activity, BarChart3, TrendingUp, Filter } from 'lucide-react';
import {
    CwMetricItem,
    CwDimension,
    cwListMetrics,
    cwGetMetricData
} from '../../services/cloudwatchApi';
import { usePersistedState } from './cwUtils';
import { useCwStore } from '../../stores/cwStore';
import { useAwsStore } from '../../stores/awsStore';

// UI Components
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

// ── Multi-Metric Chart ───────────────────────────────────────────────────────
import {  ChartTooltip } from '../ui/chart';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

interface MultiStatData {
    timestamp: number;
    timeLabel: string;
    Average?: number;
    Sum?: number;
    Maximum?: number;
    Minimum?: number;
}

const STAT_COLORS: Record<string, string> = {
    Average: '#22d3ee', // Cyan
    Sum: '#818cf8',     // Indigo
    Maximum: '#f472b6', // Pink
    Minimum: '#fbbf24', // Amber
};

function MetricChart({ data }: { data: MultiStatData[] }) {
    if (data.length === 0) return (
        <div className="flex items-center justify-center h-32 text-slate-600 text-xs italic">Sin datos</div>
    );

    return (
        <div className="h-80 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        {Object.entries(STAT_COLORS).map(([stat, color]) => (
                            <linearGradient key={stat} id={`grad-${stat}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={color} stopOpacity={0}/>
                            </linearGradient>
                        ))}
                    </defs>
                    <XAxis 
                        dataKey="timeLabel" 
                        stroke="#475569" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        minTickGap={40}
                    />
                    <YAxis 
                        stroke="#475569" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(val) => val.toLocaleString()}
                        width={45}
                    />
                    <CartesianGrid stroke="#1e293b" vertical={false} strokeDasharray="3 3" />
                    <RechartsTooltip content={<ChartTooltip active={false}  />} />
                    <Legend 
                        verticalAlign="top" 
                        align="right" 
                        iconType="circle"
                        wrapperStyle={{ fontSize: '10px', paddingBottom: '10px' }}
                    />
                    {Object.entries(STAT_COLORS).map(([stat, color]) => (
                        <Area 
                            key={stat}
                            type="monotone" 
                            dataKey={stat} 
                            stroke={color} 
                            strokeWidth={2}
                            fillOpacity={1} 
                            fill={`url(#grad-${stat})`}
                            isAnimationActive={false}
                            connectNulls
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

const NAMESPACE_SUGGESTIONS = [
    'AWS/Lambda', 'AWS/EC2', 'AWS/ECS', 'AWS/RDS', 'AWS/S3',
    'AWS/ApiGateway', 'AWS/DynamoDB', 'AWS/SQS', 'AWS/SNS',
    '/aws/lambda', 'AWS/ApplicationELB', 'AWS/CloudFront',
];

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
const STATS_TO_FETCH = ['Average', 'Sum', 'Maximum', 'Minimum'];

export function MetricsTab() {
    const cfg = useAwsStore(s => s.credentials);
    if (!cfg) return null;
    const queryClient = useQueryClient();
    const { preloadedMetric, clearPreloadedMetric } = useCwStore();
    
    const [namespace, setNamespace] = usePersistedState('microtermix-cw-metrics-ns', '');
    const [metricSearch, setMetricSearch] = usePersistedState('microtermix-cw-metrics-search', '');
    const [selectedMetric, setSelectedMetric] = usePersistedState<CwMetricItem | null>('microtermix-cw-metrics-selected', null);
    const [dimensions, setDimensions] = usePersistedState<CwDimension[]>('microtermix-cw-metrics-dims', []);
    const [period, setPeriod] = usePersistedState('microtermix-cw-metrics-period', 300);
    const [range, setRange] = usePersistedState('microtermix-cw-metrics-range', 3600_000);

    // Deep link integration
    useEffect(() => {
        if (preloadedMetric) {
            setNamespace(preloadedMetric.namespace);
            setSelectedMetric({
                namespace: preloadedMetric.namespace,
                metric_name: preloadedMetric.metricName,
                dimensions: preloadedMetric.dimensions
            });
            setDimensions(preloadedMetric.dimensions);
            setRange(3600_000 * 3);
            setPeriod(60);
            clearPreloadedMetric();
        }
    }, [preloadedMetric, setNamespace, setSelectedMetric, setDimensions, setRange, setPeriod, clearPreloadedMetric]);

    // Queries
    const {
        data: metrics = [],
        isLoading: loadingMetrics,
        refetch: searchMetrics
    } = useQuery({
        queryKey: ['cw-metrics-list', cfg.accessKeyId, cfg.region, namespace, metricSearch],
        queryFn: () => cwListMetrics(cfg, namespace || undefined, metricSearch || undefined).then(res => res.slice(0, 100)),
        enabled: false,
    });

    // Fetch all stats in parallel
    const statsQueries = useQuery({
        queryKey: ['cw-metrics-data-all', cfg.accessKeyId, cfg.region, selectedMetric?.metric_name, dimensions, period, range],
        queryFn: async () => {
            const endMs = Date.now();
            const startMs = endMs - range;
            
            const results = await Promise.all(
                STATS_TO_FETCH.map(stat => 
                    cwGetMetricData(
                        cfg, selectedMetric!.namespace, selectedMetric!.metric_name,
                        dimensions, stat, period, startMs, endMs,
                    ).then(pts => ({ stat, pts }))
                )
            );

            // Merge all points by timestamp
            const map = new Map<number, MultiStatData>();
            results.forEach(({ stat, pts }) => {
                pts.forEach(p => {
                    const entry = map.get(p.timestamp) || { 
                        timestamp: p.timestamp, 
                        timeLabel: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                    };
                    (entry as any)[stat] = p.value;
                    map.set(p.timestamp, entry);
                });
            });

            return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
        },
        enabled: !!selectedMetric && !!cfg.accessKeyId && !!cfg.region,
        refetchInterval: 60_000,
    });

    const combinedData = statsQueries.data || [];
    const loadingData = statsQueries.isLoading;
    const dataError = statsQueries.error ? String(statsQueries.error) : null;

    const handleSelectMetric = (m: CwMetricItem) => {
        setSelectedMetric(m);
        setDimensions(m.dimensions.map(d => ({ ...d })));
    };

    const loadData = () => {
        queryClient.invalidateQueries({ queryKey: ['cw-metrics-data-all'] });
    };

    return (
        <div className="flex flex-col h-full min-h-0 p-3 gap-3 bg-slate-950">
            {/* Unified Control Bar */}
            <div className="flex flex-wrap items-stretch gap-3 shrink-0">
                {/* Section 1: Search */}
                <div className="flex flex-wrap gap-3 items-end bg-slate-900/60 p-3 rounded-xl border border-slate-800/60 shadow-sm shrink-0">
                    <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 uppercase font-bold ml-1 tracking-tight">Namespace</Label>
                        <Input
                            list="ns-suggestions"
                            value={namespace}
                            onChange={e => setNamespace(e.target.value)}
                            placeholder="AWS/Lambda"
                            className="h-9 w-48 bg-slate-950 border-slate-800 text-xs font-mono focus-visible:ring-microtermix-neon/40"
                        />
                        <datalist id="ns-suggestions">
                            {NAMESPACE_SUGGESTIONS.map(n => <option key={n} value={n} />)}
                        </datalist>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500 uppercase font-bold ml-1 tracking-tight">Métrica</Label>
                        <Input
                            value={metricSearch}
                            onChange={e => setMetricSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && searchMetrics()}
                            placeholder="Errors..."
                            className="h-9 w-40 bg-slate-950 border-slate-800 text-xs font-mono focus-visible:ring-microtermix-neon/40"
                        />
                    </div>
                    <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={() => searchMetrics()} 
                        disabled={loadingMetrics}
                        className="h-9 px-5 bg-slate-800 hover:bg-slate-700 border-slate-700 text-xs font-bold transition-all active:scale-95"
                    >
                        {loadingMetrics ? <RefreshCw size={14} className="animate-spin mr-2" /> : <TrendingUp size={14} className="text-microtermix-neon mr-2" />}
                        BUSCAR
                    </Button>
                </div>

                {/* Section 2: Active Metric Config */}
                {selectedMetric && (
                    <div className="flex-1 flex flex-col justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800/60 shadow-sm min-w-[450px]">
                        <div className="flex items-center gap-4">
                            <Activity size={16} className="text-microtermix-neon shrink-0 animate-pulse" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="text-[11px] font-mono text-slate-500 uppercase tracking-tighter">{selectedMetric.namespace}</span>
                                    <span className="text-slate-700">/</span>
                                    <span className="text-sm font-mono text-white font-bold truncate tracking-tight">{selectedMetric.metric_name}</span>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 shrink-0">
                                <Select value={String(period)} onValueChange={val => setPeriod(Number(val))}>
                                    <SelectTrigger className="h-8 w-24 bg-slate-950 border-slate-800 text-[11px] font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                        {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)} className="text-[11px] font-mono">{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={String(range)} onValueChange={val => setRange(Number(val))}>
                                    <SelectTrigger className="h-8 w-32 bg-slate-950 border-slate-800 text-[11px] font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                        {RANGE_OPTIONS.map(o => <SelectItem key={o.value} value={String(o.value)} className="text-[11px] font-mono">{o.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-1 ml-1">
                                    <Button 
                                        size="icon"
                                        variant="ghost"
                                        onClick={loadData} 
                                        disabled={loadingData}
                                        className="h-7 w-7 text-microtermix-accent hover:bg-microtermix-accent/10"
                                    >
                                        <RefreshCw size={14} className={loadingData ? "animate-spin" : ""} />
                                    </Button>
                                    <div className="w-[1px] h-4 bg-slate-800 mx-1" />
                                    <Button variant="ghost" size="icon" onClick={() => setSelectedMetric(null)} className="h-7 w-7 text-slate-600 hover:text-red-400">
                                        <X size={14} />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Dimensions Row */}
                        {dimensions.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-800/40 flex flex-wrap gap-x-5 gap-y-2">
                                <span className="text-[10px] text-slate-600 uppercase font-black tracking-widest shrink-0 flex items-center gap-2">
                                    <Filter size={10} /> DIMENSIONES:
                                </span>
                                {dimensions.map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 group">
                                        <span className="text-[11px] text-slate-500 font-mono group-hover:text-slate-400">{d.name}</span>
                                        <input 
                                            value={d.value}
                                            onChange={e => setDimensions(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[11px] font-mono text-microtermix-neon w-40 focus:border-microtermix-neon/50 focus:bg-slate-900 outline-none transition-all shadow-inner"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 flex flex-col gap-3">
                {/* 1. Metric Selection List (Discovery Mode) */}
                {metrics.length > 0 && !selectedMetric && (
                    <div className="flex-1 bg-slate-900/40 border border-slate-800/60 rounded-xl overflow-hidden flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-slate-800/40 bg-slate-900/60 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-microtermix-neon/10 rounded-lg">
                                    <BarChart3 size={16} className="text-microtermix-neon" />
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-white tracking-wide uppercase">Catálogo de Métricas</h3>
                                    <p className="text-[10px] text-slate-500 font-mono">
                                        Encontradas: <span className="text-microtermix-neon font-bold">{metrics.length}</span>
                                    </p>
                                </div>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => searchMetrics()} 
                                className="h-8 text-[10px] border-slate-700 hover:bg-slate-800 text-slate-400"
                            >
                                <RefreshCw size={12} className="mr-2" /> ACTUALIZAR LISTADO
                            </Button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                {metrics.map((m, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => handleSelectMetric(m)}
                                        className="group relative flex items-center gap-4 text-left p-4 rounded-xl border border-slate-800/50 bg-slate-950/40 hover:bg-slate-900/40 hover:border-microtermix-neon/40 transition-all duration-200 overflow-hidden"
                                    >
                                        <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 group-hover:border-microtermix-neon/20 transition-colors">
                                            <TrendingUp size={18} className="text-slate-600 group-hover:text-microtermix-neon transition-colors" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-[11px] text-slate-500 font-mono mb-0.5 truncate uppercase tracking-tighter">
                                                {m.namespace}
                                            </div>
                                            <div className="text-base font-bold text-slate-200 group-hover:text-white transition-colors truncate">
                                                {m.metric_name}
                                            </div>
                                            
                                            {m.dimensions.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {m.dimensions.slice(0, 4).map((d, di) => (
                                                        <span key={di} className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800/50 font-mono">
                                                            <span className="text-slate-600">{d.name}=</span>{d.value}
                                                        </span>
                                                    ))}
                                                    {m.dimensions.length > 4 && (
                                                        <span className="text-[10px] text-slate-600 font-bold self-center">+{m.dimensions.length - 4}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                                            <div className="h-8 w-8 rounded-full bg-microtermix-neon/10 flex items-center justify-center border border-microtermix-neon/20">
                                                <X className="rotate-45 text-microtermix-neon" size={16} />
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Chart Area (Active Mode) */}
                {selectedMetric && (
                    <Card className="flex-1 min-h-0 bg-slate-900/30 border-slate-800 p-4 relative overflow-hidden flex flex-col shadow-inner">
                        {dataError && <p className="text-[10px] text-red-400 mb-2 font-mono bg-red-950/20 p-2 rounded border border-red-900/30">Error: {dataError}</p>}
                        
                        <div className="flex-1 min-h-0">
                            <MetricChart data={combinedData} />
                        </div>

                        <div className="mt-auto pt-3 flex justify-between items-center border-t border-slate-800/30">
                             <div className="flex gap-4">
                                {STATS_TO_FETCH.map(s => {
                                    const latest = combinedData[combinedData.length - 1] as any;
                                    const val = latest?.[s];
                                    return (
                                        <div key={s} className="flex flex-col">
                                            <span className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">{s}</span>
                                            <span className={`text-[11px] font-mono ${typeof val === 'number' ? 'text-slate-200' : 'text-slate-600'}`}>
                                                {typeof val === 'number' ? val.toLocaleString() : '—'}
                                            </span>
                                        </div>
                                    );
                                })}
                             </div>
                             <div className="flex items-center gap-2">
                                 <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                 <p className="text-[9px] text-slate-600 font-mono italic">
                                    {combinedData.length} pts · cada {period / 60} min
                                 </p>
                             </div>
                        </div>
                    </Card>
                )}

                {/* 3. Empty State */}
                {!selectedMetric && metrics.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-700 gap-3 bg-slate-900/20 border border-dashed border-slate-800 rounded-xl">
                        <TrendingUp size={40} className="opacity-10" />
                        <p className="text-xs italic font-mono uppercase tracking-widest text-slate-600">Busca un namespace para monitorizar métricas</p>
                    </div>
                )}
            </div>
        </div>
    );
}
