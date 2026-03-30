import React, { useEffect, useRef } from 'react';
import { useSystemStore } from '../../stores/systemStore';
import { useAppLogStore } from '../../stores/appLogStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Cpu, Database, Hash, Clock, Terminal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SystemMonitorPanel: React.FC = () => {
    const { diagnostics, isPolling, startPolling, stopPolling, error } = useSystemStore();
    const { logs, clearLogs } = useAppLogStore();
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        startPolling(2000);
        return () => stopPolling();
    }, [startPolling, stopPolling]);

    // Auto-scroll to bottom on new logs
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatUptime = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h}h ${m}m ${s}s`;
    };

    if (error) {
        return (
            <div className="p-8 text-red-400 flex flex-col items-center justify-center h-full">
                <Activity className="w-12 h-12 mb-4 animate-pulse" />
                <h2 className="text-xl font-bold">Monitor Error</h2>
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="p-6 w-full h-full flex-1 overflow-y-auto space-y-6 bg-slate-950 text-slate-200">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Activity className="text-blue-400" />
                        System Diagnostics
                    </h1>
                    <p className="text-slate-400 text-sm">Real-time application performance monitoring (Dev Mode Only)</p>
                </div>
                <Badge variant={isPolling ? "outline" : "secondary"} className={cn(isPolling && "text-green-400 border-green-900/50 bg-green-950/20")}>
                    {isPolling ? "LIVE POLLING" : "PAUSED"}
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                            <Cpu className="w-4 h-4" /> CPU Usage
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{(diagnostics?.cpu_usage_pct || 0).toFixed(1)}%</div>
                        <p className="text-xs text-slate-500 mt-1">Main process impact</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                            <Database className="w-4 h-4" /> Physical RAM
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatBytes(diagnostics?.memory_rss_bytes || 0)}</div>
                        <p className="text-xs text-slate-500 mt-1">Resident Set Size</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                            <Hash className="w-4 h-4" /> Threads
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{diagnostics?.thread_count || 0}</div>
                        <p className="text-xs text-slate-500 mt-1">Active worker threads</p>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                            <Clock className="w-4 h-4" /> Uptime
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-400">{formatUptime(diagnostics?.uptime_secs || 0)}</div>
                        <p className="text-xs text-slate-500 mt-1">Since application start</p>
                    </CardContent>
                </Card>
            </div>

            {/* Internal App Event Console */}
            <Card className="bg-slate-900/50 border-slate-800 flex flex-col max-h-[400px]">
                <CardHeader className="flex flex-row items-center justify-between py-3">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-green-400" />
                            Internal App Console
                        </CardTitle>
                        <CardDescription className="text-slate-500">
                            Real-time internal bridge events and background listeners
                        </CardDescription>
                    </div>
                    <button 
                        onClick={clearLogs}
                        className="p-2 hover:bg-slate-800 rounded-md text-slate-500 hover:text-red-400 transition-colors"
                        title="Clear console"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-0 border-t border-slate-800">
                    <div 
                        ref={scrollRef}
                        className="h-[300px] overflow-y-auto p-4 font-mono text-[11px] space-y-1 bg-black/40"
                    >
                        {logs.length === 0 ? (
                            <div className="text-slate-700 italic">Waiting for events...</div>
                        ) : (
                            logs.map((log, i) => (
                                <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-left-1 duration-200">
                                    <span className="text-slate-600 shrink-0">
                                        [{new Date(log.timestamp as number).toLocaleTimeString()}]
                                    </span>
                                    <Badge 
                                        variant="outline" 
                                        className={cn(
                                            "px-1 py-0 text-[9px] uppercase font-bold h-4 leading-none",
                                            log.level === 'Info' && "text-blue-400 border-blue-900/30",
                                            log.level === 'Warn' && "text-yellow-400 border-yellow-900/30",
                                            log.level === 'Error' && "text-red-400 border-red-900/30",
                                            log.level === 'Debug' && "text-slate-500 border-slate-800",
                                        )}
                                    >
                                        {log.level}
                                    </Badge>
                                    <span className="text-purple-400 shrink-0 font-bold">[{log.source}]</span>
                                    <span className={cn(
                                        "break-all",
                                        log.level === 'Error' ? "text-red-300" : "text-slate-300"
                                    )}>
                                        {log.message}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Managed Processes Table */}
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-purple-400" />
                        Managed Service Processes
                    </CardTitle>
                    <CardDescription className="text-slate-500">
                        Processes spawned by Microtermix (npm, scripts, etc.)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-slate-950/50 text-slate-500">
                                <tr>
                                    <th className="px-4 py-2 border-b border-slate-800">Service ID</th>
                                    <th className="px-4 py-2 border-b border-slate-800">PID</th>
                                    <th className="px-4 py-2 border-b border-slate-800">CPU</th>
                                    <th className="px-4 py-2 border-b border-slate-800">RAM</th>
                                </tr>
                            </thead>
                            <tbody>
                                {diagnostics?.managed_processes.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-slate-600 italic">
                                            No active managed processes
                                        </td>
                                    </tr>
                                ) : (
                                    diagnostics?.managed_processes.map((proc, idx) => (
                                        <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="px-4 py-3 font-mono text-xs text-blue-300 truncate max-w-xs" title={proc.service_id}>
                                                {proc.service_id}
                                            </td>
                                            <td className="px-4 py-3 text-slate-400">{proc.pid}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-green-500" 
                                                            style={{ width: `${Math.min(proc.cpu_usage, 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs w-8 text-right">{proc.cpu_usage.toFixed(1)}%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-slate-300">
                                                {formatBytes(proc.memory_bytes)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Raw JSON for Debugging */}
            <details className="mt-8 opacity-40 hover:opacity-100 transition-opacity">
                <summary className="text-xs cursor-pointer select-none py-2 text-slate-500">Raw Diagnostics Payload</summary>
                <pre className="text-[10px] bg-black p-4 rounded border border-slate-800 overflow-x-auto text-green-500 max-h-64">
                    {JSON.stringify(diagnostics, null, 2)}
                </pre>
            </details>
        </div>
    );
};
