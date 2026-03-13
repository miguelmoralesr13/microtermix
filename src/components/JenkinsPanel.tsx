import React, { useState, useEffect } from 'react';
import { Settings, ChevronRight, Server } from 'lucide-react';
import { jenkinsApiLog, JenkinsApiLogEntry } from '../services/jenkinsApi';
import { useJenkinsStore } from '../stores/jenkinsStore';
import { JenkinsJobsTab } from './jenkins/JenkinsJobsTab';
import { JenkinsSettings } from './jenkins/JenkinsSettings';
import { JenkinsLogViewer, LogTarget } from './jenkins/JenkinsLogViewer';
import { cn } from '../lib/utils';

export const JenkinsPanel: React.FC = () => {
    const accounts = useJenkinsStore(s => s.accounts);
    const activeAccountId = useJenkinsStore(s => s.activeAccountId);
    const setActiveAccount = useJenkinsStore(s => s.setActiveAccount);

    const [showSettings, setShowSettings] = useState(accounts.length === 0);
    const [logTarget, setLogTarget] = useState<LogTarget | null>(null);

    // API Console State
    const [apiLog, setApiLog] = useState<JenkinsApiLogEntry[]>([]);
    const [consoleOpen, setConsoleOpen] = useState(false);
    const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

    useEffect(() => {
        if (accounts.length === 0) {
            setShowSettings(true);
        }
    }, [accounts.length]);

    useEffect(() => {
        const handler = (e: JenkinsApiLogEntry) => setApiLog(prev => [e, ...prev].slice(0, 100));
        jenkinsApiLog.on(handler);
        return () => jenkinsApiLog.off(handler);
    }, []);

    const activeAccount = accounts.find(a => a.id === activeAccountId);

    const tabClass = (active: boolean) =>
        cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer",
            active
                ? "border-nexus-neon text-nexus-neon"
                : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
        );

    return (
        <div className="flex flex-col w-full h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-nexus-accent fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.026 11.32C2.433 5.617 6.94.752 12.683.05c5.744-.703 10.939 3.517 11.532 9.22.593 5.704-3.914 10.569-9.657 11.27a11.013 11.013 0 0 1-3.053-.012v.746c.468.113.975.207 1.516.278 5.352.655 10.204-2.998 10.836-8.163.633-5.164-3.202-9.886-8.554-10.541C9.951 2.193 5.1 5.845 4.468 11.01a9.51 9.51 0 0 0 .036 2.674l-.966-.084a10.37 10.37 0 0 1-.512-2.28zm2.27.278C4.74 6.92 8.448 3.08 13.094 2.516c4.647-.563 8.851 2.365 9.405 6.543.554 4.178-2.764 8.022-7.41 8.585a8.62 8.62 0 0 1-3.195-.238v.67c.63.147 1.29.232 1.97.247 4.983.106 9.16-3.472 9.306-7.99.147-4.518-3.807-8.308-8.79-8.414C9.397 1.813 5.22 5.39 5.073 9.909a8.23 8.23 0 0 0 .223 2.248v-.559zm7.45 10.19a9.16 9.16 0 0 1-1.87-.336v2.548h1.87v-2.212zM11.47 5.9v1.566c.4-.069.805-.118 1.218-.143V5.72a9.11 9.11 0 0 0-1.218.18zm0 2.836v1.488c.39-.064.8-.096 1.218-.096V8.638c-.418 0-.827.035-1.218.098zm0 2.752v4.36c.4.052.808.08 1.218.08V11.37a7.22 7.22 0 0 1-1.218.117z"/>
                    </svg>
                    <span className="text-sm font-semibold text-slate-200">Jenkins</span>
                    {activeAccount && !showSettings && (
                        <span className="text-[10px] text-slate-500 font-mono truncate max-w-40">{activeAccount.baseUrl}</span>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-800 shrink-0 px-2 bg-slate-900/50">
                {accounts.map(acc => (
                    <button 
                        key={acc.id}
                        className={tabClass(!showSettings && activeAccountId === acc.id)} 
                        onClick={() => {
                            setActiveAccount(acc.id!);
                            setShowSettings(false);
                            setLogTarget(null); // Reset log view when switching accounts
                        }}
                    >
                        <Server size={12} className={!showSettings && activeAccountId === acc.id ? 'text-nexus-neon' : 'opacity-50'} />
                        {acc.name}
                    </button>
                ))}
                
                <button 
                    className={tabClass(showSettings)} 
                    onClick={() => {
                        setShowSettings(true);
                        setLogTarget(null);
                    }}
                >
                    <Settings size={12} className={showSettings ? 'text-nexus-neon' : 'opacity-50'} />
                    Settings
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden relative">
                {!showSettings && accounts.length > 0 && activeAccountId && (
                    <div className={cn(
                        "flex flex-col overflow-hidden transition-all h-full",
                        logTarget ? "w-1/2 border-r border-slate-800 shrink-0" : "flex-1"
                    )}>
                        <JenkinsJobsTab onOpenLog={setLogTarget} />
                    </div>
                )}

                {logTarget && !showSettings && accounts.length > 0 && activeAccountId && (
                    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                        <JenkinsLogViewer target={logTarget} onClose={() => setLogTarget(null)} />
                    </div>
                )}

                {showSettings && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <JenkinsSettings onSaved={() => setShowSettings(false)} />
                    </div>
                )}
            </div>

            {/* API Console Log (footer) */}
            <div className="shrink-0 border-t border-slate-800 bg-slate-950 z-10">
                <div
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-900/40 select-none"
                    onClick={() => setConsoleOpen(v => !v)}
                >
                    <ChevronRight size={10} className={`text-slate-600 transition-transform ${consoleOpen ? 'rotate-90' : ''}`} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">API Log</span>
                    <span className="text-[9px] text-slate-700 font-mono">{apiLog.length} req</span>
                    {apiLog.some(e => !e.ok) && (
                        <span className="text-[9px] text-red-500 font-mono">{apiLog.filter(e => !e.ok).length} err</span>
                    )}
                    {apiLog.length > 0 && (
                        <button
                            onClick={ev => { ev.stopPropagation(); setApiLog([]); setExpandedEntry(null); }}
                            className="ml-auto text-[10px] text-slate-600 hover:text-slate-400"
                        >Clear</button>
                    )}
                </div>

                {consoleOpen && (
                    <div className="h-40 overflow-y-auto">
                        {apiLog.length === 0 ? (
                            <p className="text-[10px] text-slate-700 py-3 px-3 font-mono">Waiting for requests…</p>
                        ) : apiLog.map(entry => (
                            <div key={entry.id} className="border-b border-slate-900">
                                <div
                                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-900/60 group"
                                    onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                                >
                                    <span className={`shrink-0 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        entry.method === 'GET'  ? 'bg-sky-500/20 text-sky-400' :
                                        entry.method === 'POST' ? 'bg-violet-500/20 text-violet-400' :
                                                                  'bg-amber-500/20 text-amber-400'
                                    }`}>{entry.method}</span>
                                    {entry.status !== undefined && (
                                        <span className={`shrink-0 font-mono text-[9px] font-bold ${entry.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {entry.status}
                                        </span>
                                    )}
                                    <span className="flex-1 font-mono text-[10px] text-slate-400 truncate">{entry.path}</span>
                                    {entry.durationMs !== undefined && (
                                        <span className="shrink-0 text-[9px] text-slate-600 font-mono">{entry.durationMs}ms</span>
                                    )}
                                    <span className="shrink-0 text-[9px] text-slate-700 font-mono">{entry.time}</span>
                                </div>
                                {expandedEntry === entry.id && (
                                    <div className="bg-slate-950 px-3 pb-2">
                                        {entry.error && (
                                            <p className="text-[10px] text-red-400 font-mono bg-red-500/5 p-1.5 rounded mt-1">{entry.error}</p>
                                        )}
                                        <p className="text-[9px] text-slate-600 font-mono mt-1 break-all">{entry.url}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
