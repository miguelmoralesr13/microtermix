import { useState, useEffect } from 'react';
import { useJiraStore } from '../../stores/jiraStore';
import {
    Settings, Plus, Layers, Pin, Timer, UserCircle,
    CheckCircle, X,
} from 'lucide-react';
import { TempoTab } from './TempoTab';
import { StoriesView } from './StoriesView';
import { SettingsPanel } from './SettingsPanel';
import { CreateIssueForm } from './CreateIssueForm';
import { BoardView } from './BoardView';
type Tab = 'board' | 'stories' | 'create' | 'time' | 'settings';

// ── Main JiraPanel ─────────────────────────────────────────────────────────────

const STORAGE_JIRA_TAB = 'microtermix-jira-active-tab';

export const JiraPanel: React.FC = () => {
    const [tab, setTab] = useState<Tab>(() => {
        const saved = localStorage.getItem(STORAGE_JIRA_TAB);
        return (saved === 'board' || saved === 'stories' || saved === 'create' || saved === 'settings' || saved === 'time') ? saved : 'board';
    });
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Account state comes from Zustand — reactive, no polling needed
    const accounts = useJiraStore(s => s.accounts);
    const activeAccountId = useJiraStore(s => s.activeAccountId);
    const storeSetActiveAccount = useJiraStore(s => s.setActiveAccount);

    useEffect(() => { localStorage.setItem(STORAGE_JIRA_TAB, tab); }, [tab]);

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

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'board', label: 'Board', icon: <Layers size={14} /> },
        { id: 'stories', label: 'Stories', icon: <Pin size={14} /> },
        { id: 'create', label: 'Crear Issue', icon: <Plus size={14} /> },
        { id: 'time' as Tab, label: 'Time', icon: <Timer size={14} /> },
        { id: 'settings', label: 'Configuración', icon: <Settings size={14} /> },
    ];

    const activeAccountName = accounts.find(a => a.id === activeAccountId)?.name;

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
            <div key={activeAccountId ?? 'none'} className="flex-1 min-h-0 overflow-hidden">
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
        </div>
    );
};
