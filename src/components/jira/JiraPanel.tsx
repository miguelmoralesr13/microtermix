import { useState, useEffect, useMemo } from 'react';
import { useJiraStore } from '../../stores/jiraStore';
import { jiraApiLog } from './jiraApi';
import { toast } from 'sonner';
import type { JiraApiLogEntry as ApiLogEntry } from './jiraApi';
import {
    Settings, Plus, Layers, Pin, Timer, UserCircle,
    CheckCircle, X, TerminalSquare
} from 'lucide-react';
import { TempoTab } from './TempoTab';
import { StoriesView } from './StoriesView';
import { SettingsPanel } from './SettingsPanel';
import { CreateIssueForm } from './CreateIssueForm';
import { BoardView } from './BoardView';
import { Terminal } from '@/components/ui/terminal';
import { LogDetailModal } from './LogDetailModal';
import { listen } from '@tauri-apps/api/event';

type Tab = 'board' | 'stories' | 'create' | 'time' | 'settings';

// ── Main JiraPanel ─────────────────────────────────────────────────────────────

const STORAGE_JIRA_TAB = 'microtermix-jira-active-tab';
const STORAGE_JIRA_TERMINAL_HEIGHT = 'microtermix-jira-terminal-height';

export const JiraPanel: React.FC = () => {
    const [tab, setTab] = useState<Tab>(() => {
        const saved = localStorage.getItem(STORAGE_JIRA_TAB);
        return (saved === 'board' || saved === 'stories' || saved === 'create' || saved === 'settings' || saved === 'time') ? saved : 'board';
    });
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [terminalHeight, setTerminalHeight] = useState(() => parseInt(localStorage.getItem(STORAGE_JIRA_TERMINAL_HEIGHT) || '180'));
    
    // Log history buffer (for inspection) - Initialized from global sink
    const [logHistory, setLogHistory] = useState<ApiLogEntry[]>(() => (jiraApiLog as any).getHistory());
    const [selectedLog, setSelectedLog] = useState<ApiLogEntry | null>(null);

    // Account state comes from Zustand — reactive, no polling needed
    const accounts = useJiraStore(s => s.accounts);
    const activeAccountId = useJiraStore(s => s.activeAccountId);
    const storeSetActiveAccount = useJiraStore(s => s.setActiveAccount);

    useEffect(() => { localStorage.setItem(STORAGE_JIRA_TAB, tab); }, [tab]);
    useEffect(() => { localStorage.setItem(STORAGE_JIRA_TERMINAL_HEIGHT, terminalHeight.toString()); }, [terminalHeight]);

    // Auto-select first account if none is active (e.g., after loading from hydration)
    useEffect(() => {
        if (accounts.length > 0 && !activeAccountId) {
            storeSetActiveAccount(accounts[0].id);
        }
    }, [accounts.length, activeAccountId, storeSetActiveAccount]);

    const handleSwitchAccount = (id: string) => {
        storeSetActiveAccount(id);
    };

    const handleSettingsSaved = () => {
        setSuccessMsg('Configuración guardada');
        setTab('board');
    };

    // Listen for logs to populate history
    useEffect(() => {
        const events = ['jira-api-log', 'tempo-api-log'];
        const unlisteners: (() => void)[] = [];

        events.forEach(eventName => {
            listen<any>(eventName, (event) => {
                const source = eventName.includes('jira') ? 'Jira' : 'Tempo';
                const entry: ApiLogEntry = { ...event.payload, source };
                
                setLogHistory(prev => {
                    const next = [entry, ...prev];
                    return next.slice(0, 100); // Limit to last 100 entries
                });
            }).then(unsub => unlisteners.push(unsub));
        });

        return () => unlisteners.forEach(u => u());
    }, []);

    const handleLineClick = (line: string) => {
        // Clean up everything including ANSI
        const cleanLine = line.replace(/\x1b\[[0-9;]*[mK]/g, '').trim();
        
        // Extract UUID from the line
        // Pattern matches the 36-char UUID at the end or inside the line
        const uuidMatch = cleanLine.match(/id:([a-f0-9-]{36})/);
        
        if (!uuidMatch) {
            console.warn('[JiraPanel] No uuid found in line:', cleanLine);
            toast.error("Format de log antiguo o no reconocido");
            return;
        }
        
        const uuid = uuidMatch[1];
        
        // Match by UUID - exact and unambiguous
        const found = logHistory.find(l => l.uuid === uuid);

        if (found) {
            setSelectedLog(found);
            toast.success(`Inspeccionando ${found.method} ${found.path}`);
        } else {
            console.warn('[JiraPanel] No match found for UUID:', { uuid, historySize: logHistory.length });
            toast.error("Detalle del log expirado o no encontrado");
        }
    };

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'board', label: 'Board', icon: <Layers size={14} /> },
        { id: 'stories', label: 'Stories', icon: <Pin size={14} /> },
        { id: 'create', label: 'Crear Issue', icon: <Plus size={14} /> },
        { id: 'time' as Tab, label: 'Time', icon: <Timer size={14} /> },
        { id: 'settings', label: 'Configuración', icon: <Settings size={14} /> },
    ];

    const activeAccountName = accounts.find(a => a.id === activeAccountId)?.name;

    // Configuración de la terminal unificada
    const terminalEvents = useMemo(() => {
        const formatLog = (payload: any, label: string, color: string) => {
            const { time, method, path, status, ok, durationMs, uuid } = payload;
            const statusColor = ok ? '\x1b[32m' : '\x1b[31m';
            const methodColor = '\x1b[1m\x1b[38;5;39m'; // Bold Blue-ish
            const labelColor = `\x1b[1m${color}`;
            
            let line = `\x1b[90m[${time}]\x1b[0m ${labelColor}[${label}]\x1b[0m ${methodColor}${method}\x1b[0m \x1b[37m${path}\x1b[0m`;
            if (status) line += ` ${statusColor}${status}\x1b[0m`;
            if (durationMs !== undefined) line += ` \x1b[90m(${durationMs}ms)\x1b[0m`;
            
            // Inyectamos el UUID de forma "fantasma" (Color gris oscuro casi invisible)
            if (uuid) {
                line += ` \x1b[38;5;236mid:${uuid}\x1b[0m`;
            }
            
            return line;
        };

        return [
            {
                event: 'jira-api-log',
                format: (p: any) => formatLog(p, 'Jira', '\x1b[34m'), // Blue for Jira
            },
            {
                event: 'tempo-api-log',
                format: (p: any) => formatLog(p, 'Tempo', '\x1b[35m'), // Magenta for Tempo
            }
        ];
    }, []);

    return (
        <div className="flex-1 flex flex-col h-full w-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${tab === t.id
                            ? 'border-microtermix-neon text-white'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}>
                        {t.icon}{t.label}
                    </button>
                ))}

                <div className="ml-auto flex items-center gap-2 pb-1">
                    {accounts.length > 0 && (
                        <div className="flex items-center gap-1.5">
                            <UserCircle size={13} className="text-slate-500" />
                            {accounts.length === 1 ? (
                                <span className="text-xs text-slate-400">{activeAccountName}</span>
                            ) : (
                                <select
                                    value={activeAccountId ?? ''}
                                    onChange={e => handleSwitchAccount(e.target.value)}
                                    className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300 focus:outline-none focus:border-microtermix-neon cursor-pointer"
                                >
                                    {accounts.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

                    {successMsg && (
                        <div className="flex items-center gap-1.5 text-xs text-microtermix-success">
                            <CheckCircle size={13} /> {successMsg}
                            <button onClick={() => setSuccessMsg(null)} className="ml-1 text-slate-500 hover:text-slate-300"><X size={11} /></button>
                        </div>
                    )}
                </div>
            </div>

            {/* key={activeAccountId} forces full remount of all views when account changes */}
            <div key={activeAccountId ?? 'none'} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Content Area */}
                <div className="flex-1 min-h-0 overflow-hidden">
                    {tab === 'board' && <BoardView />}
                    {tab === 'stories' && <StoriesView />}
                    {tab === 'create' && (
                        <div className="h-full overflow-y-auto scrollbar-hide">
                            <CreateIssueForm onCreated={key => {
                                setSuccessMsg(`Issue ${key} creado`);
                                setTab('board');
                            }} />
                        </div>
                    )}
                    {tab === 'time' && (() => {
                        const activeAcc = accounts.find(a => a.id === activeAccountId);
                        if (!activeAcc) return null;
                        return <TempoTab config={activeAcc.config} accountId={activeAcc.config.defaultAssigneeId} />;
                    })()}
                    {tab === 'settings' && (
                        <SettingsPanel onSaved={handleSettingsSaved} />
                    )}
                </div>

                {/* Standardized Unified Terminal for Logs */}
                <Terminal
                    mode="log-stream"
                    variant="panel"
                    title="API Logs"
                    icon={<TerminalSquare size={13} />}
                    height={terminalHeight}
                    onHeightChange={setTerminalHeight}
                    resizable={true}
                    defaultIsOpen={false}
                    events={terminalEvents}
                    onLineClick={handleLineClick}
                    className="z-10 shadow-t-2xl shadow-black/40"
                    showSearch={true}
                    showClear={true}
                />

                <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
            </div>
        </div>
    );
};
