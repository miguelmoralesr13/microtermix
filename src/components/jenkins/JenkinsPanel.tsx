import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Settings, ChevronRight, Server, TerminalSquare, FolderGit2 } from 'lucide-react';
import { jenkinsApiLog, JenkinsApiLogEntry } from '../../services/jenkinsApi';
import { useJenkinsStore } from '../../stores/jenkinsStore';
import { JenkinsJobsTab } from './JenkinsJobsTab';
import { JenkinsSettings } from './JenkinsSettings';
import { JenkinsLogViewer, LogTarget } from './JenkinsLogViewer';
import { cn } from '../../lib/utils';
import { Terminal } from '@/components/ui/terminal';
import type { TerminalRef } from '@/components/ui/terminal/types';
import { LogDetailModal } from '../jira/LogDetailModal';
import { toast } from 'sonner';
import { LinkProjectsModal } from './LinkProjectsModal';
import { useJenkinsProjectLinks } from '@/hooks/useJenkinsProjectLinks';

const STORAGE_JENKINS_TERMINAL_HEIGHT = 'microtermix-jenkins-terminal-height';

export const JenkinsPanel: React.FC = () => {
    const accounts = useJenkinsStore(s => s.accounts);
    const activeAccountId = useJenkinsStore(s => s.activeAccountId);
    const setActiveAccount = useJenkinsStore(s => s.setActiveAccount);

    const [showSettings, setShowSettings] = useState(accounts.length === 0);
    const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
    const [showLinkModal, setShowLinkModal] = useState(false);

    // ┌── Estado compartido de links — Única instancia, se pasa como props hacia abajo ─────┐
    const { links, linksMap, linkProject, unlinkProject } = useJenkinsProjectLinks();
    // └───────────────────────────────────────────────────────────────────────┘

    // API Console State
    const [apiLog, setApiLog] = useState<JenkinsApiLogEntry[]>([]);
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
    const terminalRef = useRef<TerminalRef>(null);
    const [terminalHeight, setTerminalHeight] = useState(() => parseInt(localStorage.getItem(STORAGE_JENKINS_TERMINAL_HEIGHT) || '180'));

    useEffect(() => { localStorage.setItem(STORAGE_JENKINS_TERMINAL_HEIGHT, terminalHeight.toString()); }, [terminalHeight]);

    useEffect(() => {
        if (accounts.length > 0 && !activeAccountId) {
            setActiveAccount(accounts[0].id!);
        }

        // If we were showing settings because there were no accounts, 
        // and now accounts have loaded (e.g., from hydration), switch to jobs view.
        if (accounts.length > 0 && showSettings) {
            setShowSettings(false);
        }

        if (accounts.length === 0) {
            setShowSettings(true);
        }
    }, [accounts.length, activeAccountId, setActiveAccount]);

    useEffect(() => {
        const handler = (e: JenkinsApiLogEntry) => {
            setApiLog(prev => [e, ...prev].slice(0, 100)); // Store metadata in RAM for LogDetailModal
            
            // Inject directly to terminal
            if (terminalRef.current) {
                const { time, method, path, status, ok, durationMs, id } = e;
                const statusColor = ok ? '\x1b[32m' : '\x1b[31m';
                const methodColor = '\x1b[1m\x1b[33m'; // Yellow-ish for Jenkins HTTP
                const labelColor = `\x1b[1m\x1b[38;5;208m`; // Orange text
                
                let displayPath = path;
                if (displayPath.length > 80) {
                    displayPath = displayPath.slice(0, 80) + '...';
                }
                
                let line = `\x1b[90m[${time}]\x1b[0m`;
                if (id) {
                    line += ` \x1b[38;5;236mid:${id}\x1b[0m`;
                }
                line += ` ${labelColor}[Jenkins]\x1b[0m ${methodColor}${method}\x1b[0m \x1b[37m${displayPath}\x1b[0m`;
                if (status) line += ` ${statusColor}${status}\x1b[0m`;
                if (durationMs !== undefined) line += ` \x1b[90m(${durationMs}ms)\x1b[0m`;
                
                terminalRef.current.writeln(line);
            }
        };
        jenkinsApiLog.on(handler);
        return () => jenkinsApiLog.off(handler);
    }, []);

    const handleLineClick = (line: string) => {
        const cleanLine = line.replace(/\x1b\[[0-9;]*[mK]/g, '').trim();
        const idMatch = cleanLine.match(/id:([0-9]+)/);
        
        if (!idMatch) {
            toast.error("No se encontró el id. Intenta clic más arriba (antes del text wrap).");
            return;
        }
        
        const id = parseInt(idMatch[1], 10);
        const found = apiLog.find(l => l.id === id);

        if (found) {
            // Transform the Jenkins log object into the format expected by LogDetailModal (from Jira)
            // Need to map any discrepancies if any, but they generally use same signature (method, path, url, status, duration)
            setSelectedLog({
                ...found,
                source: 'Jenkins', 
            });
            toast.success(`Inspeccionando petici\u00f3n a Jenkins`);
        } else {
            toast.error("Detalle del log expirado o no encontrado");
        }
    };

    const activeAccount = accounts.find(a => a.id === activeAccountId);

    const tabClass = (active: boolean) =>
        cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors cursor-pointer",
            active
                ? "border-microtermix-neon text-microtermix-neon"
                : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
        );

    return (
        <div className="flex-1 flex flex-col w-full h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-microtermix-accent fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.026 11.32C2.433 5.617 6.94.752 12.683.05c5.744-.703 10.939 3.517 11.532 9.22.593 5.704-3.914 10.569-9.657 11.27a11.013 11.013 0 0 1-3.053-.012v.746c.468.113.975.207 1.516.278 5.352.655 10.204-2.998 10.836-8.163.633-5.164-3.202-9.886-8.554-10.541C9.951 2.193 5.1 5.845 4.468 11.01a9.51 9.51 0 0 0 .036 2.674l-.966-.084a10.37 10.37 0 0 1-.512-2.28zm2.27.278C4.74 6.92 8.448 3.08 13.094 2.516c4.647-.563 8.851 2.365 9.405 6.543.554 4.178-2.764 8.022-7.41 8.585a8.62 8.62 0 0 1-3.195-.238v.67c.63.147 1.29.232 1.97.247 4.983.106 9.16-3.472 9.306-7.99.147-4.518-3.807-8.308-8.79-8.414C9.397 1.813 5.22 5.39 5.073 9.909a8.23 8.23 0 0 0 .223 2.248v-.559zm7.45 10.19a9.16 9.16 0 0 1-1.87-.336v2.548h1.87v-2.212zM11.47 5.9v1.566c.4-.069.805-.118 1.218-.143V5.72a9.11 9.11 0 0 0-1.218.18zm0 2.836v1.488c.39-.064.8-.096 1.218-.096V8.638c-.418 0-.827.035-1.218.098zm0 2.752v4.36c.4.052.808.08 1.218.08V11.37a7.22 7.22 0 0 1-1.218.117z" />
                    </svg>
                    <span className="text-sm font-semibold text-slate-200">Jenkins</span>
                    {activeAccount && !showSettings && (
                        <span className="text-[10px] text-slate-500 font-mono truncate max-w-40">{activeAccount.baseUrl}</span>
                    )}
                </div>
                {/* Botón de vinculación de proyectos locales */}
                {!showSettings && accounts.length > 0 && (
                    <button
                        onClick={() => setShowLinkModal(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-orange-400/80 hover:text-orange-400 hover:bg-orange-400/10 rounded-md border border-orange-400/20 hover:border-orange-400/40 transition-all"
                    >
                        <FolderGit2 size={12} />
                        Proyectos
                    </button>
                )}
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
                        <Server size={12} className={!showSettings && activeAccountId === acc.id ? 'text-microtermix-neon' : 'opacity-50'} />
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
                    <Settings size={12} className={showSettings ? 'text-microtermix-neon' : 'opacity-50'} />
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
                        <JenkinsJobsTab
                            key={activeAccountId}
                            onOpenLog={setLogTarget}
                            links={links}
                            unlinkProject={unlinkProject}
                        />
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

            {/* API Console Log Unificada */}
            <Terminal
                ref={terminalRef}
                mode="log-stream"
                variant="panel"
                title="API Logs"
                icon={<TerminalSquare size={13} />}
                height={terminalHeight}
                onHeightChange={setTerminalHeight}
                resizable={true}
                defaultIsOpen={false}
                onLineClick={handleLineClick}
                className="z-10 shadow-t-2xl shadow-black/40"
                showSearch={true}
                showClear={true}
            />

            {/* Inspección de log reutilizando modal de Jira */}
            <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />

            {/* Modal de vinculación de proyectos locales */}
            <LinkProjectsModal
                open={showLinkModal}
                onClose={() => setShowLinkModal(false)}
                links={links}
                linksMap={linksMap}
                linkProject={linkProject}
                unlinkProject={unlinkProject}
            />
        </div>
    );
};
