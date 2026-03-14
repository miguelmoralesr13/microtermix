import { useState, useEffect, useCallback } from 'react';
import { useJiraStore } from '../../stores/jiraStore';
import { RefreshCw, Search, X, AlertCircle, Plus } from 'lucide-react';
import {
    JiraIssue, JiraApiLogEntry, JiraTransition, jiraApiLog,
    loadConfig, saveConfig, testConnection,
    statusColor,
    getEpics, getBusinessStoriesByEpic, getTechnicalStoriesByBusinessStory, getTasksByStory, transitionIssue,
    getTransitions, assignIssue,
    getStoriesByEpic,
    isReleased,
} from '../jiraApi';
import { TempoLogModal } from '../TempoLogModal';
import { TransitionFieldsModal, TransitionTarget } from './TransitionFieldsModal';
import { DiscardSubtasksModal, DiscardSubtasksTarget } from './DiscardSubtasksModal';
import { HierarchyCard } from './HierarchyCard';
import { TaskDetailModal } from './TaskDetailModal';
import { CreateSubTaskModal } from './CreateSubTaskModal';
import { EpicDetailModal } from './EpicDetailModal';
import { LinkedIssuesModal } from './LinkedIssuesModal';
import { ChevronRight, Timer } from 'lucide-react';

// ── Stories View (3-Column Hierarchy) ────────────────────────────────────────
export function StoriesView() {
    const cfg = loadConfig();
    const project = cfg.storiesProject || cfg.defaultProject;

    // Current user's accountId — auto-fetched from /myself
    const [myAccountId, setMyAccountId] = useState<string>(() => cfg.defaultAssigneeId ?? '');

    // Auto-fetch and persist accountId from /myself if not yet configured
    useEffect(() => {
        if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) return;
        if (cfg.defaultAssigneeId) { setMyAccountId(cfg.defaultAssigneeId); return; }
        testConnection()
            .then(me => {
                if (me.accountId) {
                    const updated = { ...loadConfig(), defaultAssigneeId: me.accountId };
                    saveConfig(updated);
                    setMyAccountId(me.accountId);
                }
            })
            .catch(() => { }); // silent — don't block the UI
    }, []);

    // ── Stories state via Zustand store ──────────────────────────────────────
    const storeSelection = useJiraStore(s => s.storiesSelection);
    const storeSetSelection = useJiraStore(s => s.setStoriesSelection);
    const storePinnedEpics = useJiraStore(s => s.pinnedEpics);
    const storePinnedStories = useJiraStore(s => s.pinnedStories);
    const storeSetPinnedEpics = useJiraStore(s => s.setPinnedEpics);
    const storeSetPinnedStories = useJiraStore(s => s.setPinnedStories);

    // Ephemeral issue lists — not persisted (re-fetched on mount, fast enough)
    const [epics, setEpics] = useState<JiraIssue[]>([]);
    const [businessStories, setBusinessStories] = useState<JiraIssue[]>([]);
    const [stories, setStories] = useState<JiraIssue[]>([]);
    const [tasks, setTasks] = useState<JiraIssue[]>([]);

    // Restore persisted selection objects from store (may be null after reload — re-fetched by effects)
    const [selectedEpic, setSelectedEpicLocal] = useState<JiraIssue | null>(storeSelection.epic);
    const [selectedBusinessStory, setSelectedBusinessStoryLocal] = useState<JiraIssue | null>(storeSelection.businessStory ?? null);
    const [selectedStory, setSelectedStoryLocal] = useState<JiraIssue | null>(storeSelection.story);

    // Cascade setters — update both local state and store
    const setSelectedEpic = (v: JiraIssue | null) => {
        if (v && selectedEpic?.key === v.key) return; // Guard: do nothing if already selected
        setSelectedEpicLocal(v);
        storeSetSelection({ epicKey: v?.key ?? null, businessStoryKey: null, storyKey: null, epic: v, businessStory: null, story: null });
        setSelectedBusinessStoryLocal(null);
        setSelectedStoryLocal(null);
        setSelectedTask(null);
        setBusinessStories([]);
        setStories([]);
        setTasks([]);
    };
    const setSelectedBusinessStory = (v: JiraIssue | null) => {
        if (v && selectedBusinessStory?.key === v.key) return; // Guard
        setSelectedBusinessStoryLocal(v);
        storeSetSelection({ businessStoryKey: v?.key ?? null, storyKey: null, businessStory: v, story: null });
        setSelectedStoryLocal(null);
        setSelectedTask(null);
        setStories([]);
        setTasks([]);
    };
    const setSelectedStory = (v: JiraIssue | null) => {
        if (v && selectedStory?.key === v.key) return; // Guard
        setSelectedStoryLocal(v);
        storeSetSelection({ storyKey: v?.key ?? null, story: v });
        setSelectedTask(null);
        setTasks([]);
    };

    const [createForStory, setCreateForStory] = useState<JiraIssue | null>(null);
    const [detailEpic, setDetailEpic] = useState<JiraIssue | null>(null);
    const [linkedIssuesTarget, setLinkedIssuesTarget] = useState<string | null>(null);

    const [epicSearchInput, setEpicSearchInput] = useState('');
    const [epicSearch, setEpicSearch] = useState('');
    const [storySearch, setStorySearch] = useState('');
    const [storyFilterAssignee, setStoryFilterAssignee] = useState('');
    const [storyFilterStatus, setStoryFilterStatus] = useState('');
    const [showStoryFilters, setShowStoryFilters] = useState(false);
    const availableStatuses = ['Open', 'In Progress', 'Done', 'Released', 'Discarded', 'Blocked', 'To Do', 'Review'];
    const pinnedEpics = storePinnedEpics;
    const pinnedStories = storePinnedStories;

    const [loadingEpics, setLoadingEpics] = useState(false);
    const [loadingBusinessStories, setLoadingBusinessStories] = useState(false);
    const [loadingTechStories, setLoadingTechStories] = useState(false);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [epicError, setEpicError] = useState<string | null>(null);
    const [businessStoryError, setBusinessStoryError] = useState<string | null>(null);
    const [storyError, setStoryError] = useState<string | null>(null);
    const [taskError, setTaskError] = useState<string | null>(null);

    const [selectedTask, setSelectedTask] = useState<JiraIssue | null>(null);
    const [showTempoModal, setShowTempoModal] = useState(false);
    const [taskTransitions, setTaskTransitions] = useState<JiraTransition[]>([]);
    const [loadingTransitions, setLoadingTransitions] = useState(false);
    const [transitioningTask, setTransitioningTask] = useState<string | null>(null);
    const [apiLog, setApiLog] = useState<JiraApiLogEntry[]>([]);
    const [expandedLog, setExpandedLog] = useState<number | null>(null);
    const [hideReleased, setHideReleased] = useState(() => {
        const saved = localStorage.getItem('jira_hide_released');
        return saved === null ? true : saved === 'true';
    });
    useEffect(() => {
        localStorage.setItem('jira_hide_released', String(hideReleased));
    }, [hideReleased]);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [logVisible, setLogVisible] = useState(true);

    // Subscribe to jiraApiLog events
    useEffect(() => {
        const handler = (entry: JiraApiLogEntry) => setApiLog(prev => [entry, ...prev].slice(0, 80));
        jiraApiLog.on(handler);
        return () => jiraApiLog.off(handler);
    }, []);

    const copyCurl = (entry: JiraApiLogEntry) => {
        navigator.clipboard.writeText(entry.curl).then(() => {
            setCopiedId(entry.id);
            setTimeout(() => setCopiedId(null), 1500);
        });
    };

    // Load epics
    const loadEpics = useCallback(async (search?: string) => {
        if (!project) return;
        setLoadingEpics(true);
        setEpicError(null);
        try {
            const data = await getEpics(project, search);
            setEpics(data);
        } catch (e: any) {
            setEpicError(e?.message ?? 'Error cargando Epics');
        } finally {
            setLoadingEpics(false);
        }
    }, [project]);

    useEffect(() => { loadEpics(); }, [loadEpics]);

    // Only reload when epicSearch (committed on Enter) changes
    useEffect(() => { loadEpics(epicSearch || undefined); }, [epicSearch, loadEpics]);

    // Load business stories when epic selected
    useEffect(() => {
        if (!selectedEpic) { setBusinessStories([]); return; }
        setLoadingBusinessStories(true);
        setBusinessStoryError(null);
        getBusinessStoriesByEpic(selectedEpic.key)
            .then(data => { setBusinessStories(data); })
            .catch((e: any) => setBusinessStoryError(e?.message ?? 'Error cargando Business Stories'))
            .finally(() => setLoadingBusinessStories(false));
    }, [selectedEpic?.key]);

    // Load technical stories when business story selected
    useEffect(() => {
        if (!selectedBusinessStory) { setStories([]); return; }
        setLoadingTechStories(true);
        setStoryError(null);
        getTechnicalStoriesByBusinessStory(selectedBusinessStory.key)
            .then(data => { setStories(data); })
            .catch((e: any) => setStoryError(e?.message ?? 'Error cargando Stories Técnicas'))
            .finally(() => setLoadingTechStories(false));
    }, [selectedBusinessStory?.key]);

    // Load tasks when story selected
    useEffect(() => {
        if (!selectedStory) { setTasks([]); return; }
        setLoadingTasks(true);
        setTaskError(null);
        getTasksByStory(selectedStory.key)
            .then(data => { setTasks(data); })
            .catch((e: any) => setTaskError(e?.message ?? 'Error cargando Tasks'))
            .finally(() => setLoadingTasks(false));
    }, [selectedStory?.key]);

    const togglePin = (key: string, list: string[], setList: (keys: string[]) => void) => {
        const next = list.includes(key) ? list.filter(k => k !== key) : [key, ...list];
        setList(next);
    };

    const sortWithPins = (items: JiraIssue[], pinned: string[]) => [
        ...items.filter(i => pinned.includes(i.key)),
        ...items.filter(i => !pinned.includes(i.key)),
    ];

    // Load available transitions when a task is selected
    useEffect(() => {
        if (!selectedTask) { setTaskTransitions([]); return; }
        setLoadingTransitions(true);
        getTransitions(selectedTask.key)
            .then(setTaskTransitions)
            .catch(() => setTaskTransitions([]))
            .finally(() => setLoadingTransitions(false));
    }, [selectedTask?.key]);

    const [transitionError, setTransitionError] = useState<string | null>(null);
    const [transitionTarget, setTransitionTarget] = useState<TransitionTarget | null>(null);
    const [discardSubtasksTarget, setDiscardSubtasksTarget] = useState<DiscardSubtasksTarget | null>(null);
    const [taskDetailTarget, setTaskDetailTarget] = useState<JiraIssue | null>(null);

    // Intercept transition clicks — show modals for Discard/Required Fields or Subtasks check
    const handleTransitionClick = async (task: JiraIssue, tr: JiraTransition, onCompleteLocally?: () => void) => {
        const isDeveloped = /developed/i.test(tr.toName);
        const isStory = !task.fields.issuetype?.subtask && task.fields.issuetype?.name?.toLowerCase() !== 'epic';

        if (isDeveloped && isStory) {
            setTransitioningTask(task.key);
            try {
                // Determine source of subtasks depending on what is selected
                let subtasks: JiraIssue[] = [];
                if (selectedStory && selectedStory.key === task.key) {
                    subtasks = tasks; // We already have them loaded
                } else {
                    subtasks = await getTasksByStory(task.key).catch(() => []);
                }

                // Any task not completely done/discarded is considered open
                const openSubtasks = subtasks.filter(t => {
                    const status = t.fields.status.name.toLowerCase();
                    return !['done', 'released', 'discarded', 'closed', 'resolved'].includes(status);
                });

                if (openSubtasks.length > 0) {
                    setTransitioningTask(null);
                    setDiscardSubtasksTarget({ story: task, transition: tr, openSubtasks, onCompleteLocally });
                    return; // Stop here, show modal
                }
            } catch (e) {
                console.error("Error fetching subtasks for blocker check", e);
            }
            // If it succeeds but has no subtasks, just continue to below
            setTransitioningTask(null);
        }

        const hasRequired = Object.values(tr.fields ?? {}).some(f => f.required);
        const isDiscard = /discard/i.test(tr.toName) || /discard/i.test(tr.name);
        if (hasRequired || isDiscard) {
            setTransitionTarget({ task, transition: tr, onCompleteLocally });
        } else {
            await handleTransition(task, tr.toName);
            if (onCompleteLocally) onCompleteLocally();
        }
    };

    const handleTransition = async (task: JiraIssue, status: string, comment?: string, fields?: Record<string, any>) => {
        setTransitioningTask(task.key);
        setTransitionError(null);
        try {
            await transitionIssue(task.key, status, comment, fields);

            // Check where this task belongs to refresh the proper list
            if (selectedStory && filteredTasks.some(t => t.key === task.key)) {
                const updated = await getTasksByStory(selectedStory.key);
                setTasks(updated);
                const refreshed = updated.find(t => t.key === task.key);
                if (refreshed) {
                    setSelectedTask(refreshed);
                    setTaskDetailTarget(prev => prev?.key === refreshed.key ? refreshed : prev);
                }
            } else if (selectedBusinessStory && stories.some(s => s.key === task.key)) {
                const updated = await getTechnicalStoriesByBusinessStory(selectedBusinessStory.key);
                setStories(updated);
                const refreshed = updated.find(s => s.key === task.key);
                if (refreshed) {
                    setSelectedStoryLocal(refreshed);
                    setTaskDetailTarget(prev => prev?.key === refreshed.key ? refreshed : prev);
                }
            } else if (selectedEpic && businessStories.some(b => b.key === task.key)) {
                const updated = await getBusinessStoriesByEpic(selectedEpic.key);
                setBusinessStories(updated);
                const refreshed = updated.find(b => b.key === task.key);
                if (refreshed) {
                    setSelectedBusinessStoryLocal(refreshed);
                    setTaskDetailTarget(prev => prev?.key === refreshed.key ? refreshed : prev);
                }
            } else if (epics.some(e => e.key === task.key)) {
                const updated = await getEpics(project, epicSearch || undefined);
                setEpics(updated);
                const refreshed = updated.find(e => e.key === task.key);
                if (refreshed) {
                    setSelectedEpicLocal(refreshed);
                    setTaskDetailTarget(prev => prev?.key === refreshed.key ? refreshed : prev);
                }
            }
        } catch (e: any) {
            setTransitionError(e?.message ?? 'Error al cambiar estado');
        } finally {
            setTransitioningTask(null);
        }
    };

    const colCls = "flex flex-col h-full border-r border-slate-800 last:border-r-0";
    const colHeaderCls = "shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/70";
    const colBodyCls = "flex-1 overflow-y-auto scrollbar-hide p-2 space-y-1.5";

    if (!project) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 p-12">
                <AlertCircle size={36} />
                <p className="text-sm text-center">Configura un proyecto en <strong className="text-slate-300">Settings → Stories Project</strong> para usar esta vista.</p>
            </div>
        );
    }


    const sortedEpics = sortWithPins(
        hideReleased ? epics.filter(e => !isReleased(e)) : epics,
        pinnedEpics
    );
    const sortedBusinessStories = sortWithPins(
        hideReleased ? businessStories.filter(s => !isReleased(s)) : businessStories,
        []
    );
    const sortedStories = sortWithPins(
        stories.filter(s => {
            if (hideReleased && isReleased(s)) return false;
            const matchText = !storySearch.trim() || (
                s.key.toLowerCase().includes(storySearch.toLowerCase()) ||
                s.fields.summary.toLowerCase().includes(storySearch.toLowerCase())
            );
            const matchAssignee = !storyFilterAssignee || (
                storyFilterAssignee === 'me'
                    ? s.fields.assignee?.accountId === myAccountId
                    : !s.fields.assignee
            );
            const matchStatus = !storyFilterStatus ||
                s.fields.status.name.toLowerCase() === storyFilterStatus.toLowerCase();
            return matchText && matchAssignee && matchStatus;
        }),
        pinnedStories
    );
    const filteredTasks = hideReleased ? tasks.filter(t => !isReleased(t)) : tasks;
    const hasStoryFilters = !!(storySearch || storyFilterAssignee || storyFilterStatus);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* 4 columns */}
            <div className="flex flex-1 min-h-0">
                <div className={`${colCls} w-1/5`}>
                    <div className={colHeaderCls}>
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Business ({epics.length})</p>
                            <button
                                onClick={() => setHideReleased(!hideReleased)}
                                className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${hideReleased ? 'bg-microtermix-neon/10 border-microtermix-neon/30 text-microtermix-neon' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                                title={hideReleased ? "Mostrando solo activos" : "Mostrando todo (incl. Released)"}
                            >
                                {hideReleased ? 'ACTIVOS' : 'TODO'}
                            </button>
                        </div>
                        <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                value={epicSearchInput}
                                onChange={e => setEpicSearchInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') setEpicSearch(epicSearchInput);
                                    if (e.key === 'Escape') { setEpicSearchInput(''); setEpicSearch(''); }
                                }}
                                placeholder="Título o clave... ↵"
                                className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-6 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon"
                            />
                            {epicSearchInput && <button onClick={() => { setEpicSearchInput(''); setEpicSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"><X size={10} /></button>}
                        </div>
                    </div>
                    <div className={colBodyCls}>
                        {epicError && <p className="text-xs text-red-400 p-2">{epicError}</p>}
                        {loadingEpics ? (
                            <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div>
                        ) : sortedEpics.length === 0 ? (
                            <p className="text-xs text-slate-600 text-center py-8">Sin resultados</p>
                        ) : sortedEpics.map(epic => (
                            <HierarchyCard
                                key={epic.id}
                                issue={epic}
                                selected={selectedEpic?.key === epic.key}
                                pinned={pinnedEpics.includes(epic.key)}
                                onSelect={() => setSelectedEpic(epic)}
                                onPin={() => togglePin(epic.key, pinnedEpics, storeSetPinnedEpics)}
                                onDetail={() => setTaskDetailTarget(epic)}
                                onLinkedIssues={() => setLinkedIssuesTarget(epic.key)}
                                onAssign={epic.fields.assignee?.accountId === myAccountId ? undefined : async () => {
                                    const accountId = myAccountId || loadConfig().defaultAssigneeId;
                                    if (!accountId) { setTransitionError('Falta Account ID en Settings'); return; }
                                    try {
                                        await assignIssue(epic.key, accountId);
                                        const updated = await getEpics(project);
                                        setEpics(updated);
                                    } catch (e: any) {
                                        setTransitionError(e?.message ?? 'Error al asignar');
                                    }
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Column 2: Business Stories */}
                <div className={`${colCls} w-1/5`}>
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Business {selectedEpic ? `(${sortedBusinessStories.length})` : ''}
                        </p>
                        {selectedEpic && <p className="text-[10px] text-microtermix-neon/60 mt-0.5 truncate">{selectedEpic.key}</p>}
                    </div>
                    <div className={colBodyCls}>
                        {!selectedEpic && <p className="text-xs text-slate-600 text-center py-8">← Selecciona un Epic</p>}
                        {businessStoryError && <p className="text-xs text-red-400 p-2">{businessStoryError}</p>}
                        {selectedEpic && loadingBusinessStories ? (
                            <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div>
                        ) : sortedBusinessStories.map(bStory => (
                            <HierarchyCard
                                key={bStory.id}
                                issue={bStory}
                                selected={selectedBusinessStory?.key === bStory.key}
                                pinned={false}
                                onSelect={() => setSelectedBusinessStory(bStory)}
                                onPin={() => { }}
                                showPin={false}
                                onDetail={() => setTaskDetailTarget(bStory)}
                                onLinkedIssues={() => setLinkedIssuesTarget(bStory.key)}
                                onAssign={bStory.fields.assignee?.accountId === myAccountId ? undefined : async () => {
                                    const accountId = myAccountId || loadConfig().defaultAssigneeId;
                                    if (!accountId) { setTransitionError('Falta Account ID en Settings'); return; }
                                    try {
                                        await assignIssue(bStory.key, accountId);
                                        if (selectedEpic) {
                                            const updated = await getBusinessStoriesByEpic(selectedEpic.key);
                                            setBusinessStories(updated);
                                        }
                                    } catch (e: any) {
                                        setTransitionError(e?.message ?? 'Error al asignar');
                                    }
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Column 3: Technical Stories */}
                <div className={`${colCls} w-1/5`}>
                    <div className={colHeaderCls}>
                        {/* title + filter toggle */}
                        <div className="flex items-center gap-1 mb-1">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex-1">
                                Technical {selectedBusinessStory ? `(${sortedStories.length})` : ''}
                            </p>
                            {selectedBusinessStory && (
                                <>
                                    {hasStoryFilters && (
                                        <button onClick={() => { setStorySearch(''); setStoryFilterAssignee(''); setStoryFilterStatus(''); }}
                                            className="text-[9px] text-microtermix-neon/70 hover:text-microtermix-neon flex items-center gap-0.5" title="Limpiar filtros">
                                            <X size={9} /> {[storySearch, storyFilterAssignee, storyFilterStatus].filter(Boolean).length}
                                        </button>
                                    )}
                                    <button onClick={() => setShowStoryFilters(v => !v)}
                                        className={`p-0.5 rounded transition-colors ${showStoryFilters ? 'text-microtermix-neon' : 'text-slate-500 hover:text-slate-300'}`}
                                        title="Filtros">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
                                        </svg>
                                    </button>
                                </>
                            )}
                        </div>
                        {selectedBusinessStory && <p className="text-[10px] text-microtermix-neon/60 mb-1 truncate">{selectedBusinessStory.key}</p>}
                        {/* Collapsible filter panel */}
                        {selectedBusinessStory && showStoryFilters && (
                            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2 space-y-1.5 mt-1">
                                {/* Text search */}
                                <div className="relative">
                                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input value={storySearch} onChange={e => setStorySearch(e.target.value)}
                                        placeholder="Título o clave..."
                                        className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-6 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon" />
                                    {storySearch && <button onClick={() => setStorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"><X size={10} /></button>}
                                </div>
                                {/* Assignee */}
                                <div>
                                    <label className="text-[9px] text-slate-600 uppercase tracking-wider font-bold block mb-0.5">Asignado</label>
                                    <select value={storyFilterAssignee} onChange={e => setStoryFilterAssignee(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-microtermix-neon">
                                        <option value="">Todos</option>
                                        <option value="me">👤 Yo</option>
                                        <option value="unassigned">Sin asignar</option>
                                    </select>
                                </div>
                                {/* Status */}
                                <div>
                                    <label className="text-[9px] text-slate-600 uppercase tracking-wider font-bold block mb-0.5">Estado</label>
                                    <select value={storyFilterStatus} onChange={e => setStoryFilterStatus(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-microtermix-neon">
                                        <option value="">Todos</option>
                                        {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className={colBodyCls}>
                        {!selectedBusinessStory && <p className="text-xs text-slate-600 text-center py-8">← Selecciona una Business Story</p>}
                        {storyError && <p className="text-xs text-red-400 p-2">{storyError}</p>}
                        {selectedBusinessStory && loadingTechStories ? (
                            <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div>
                        ) : sortedStories.map(story => (
                            <div key={story.id} className="relative group/story">
                                <HierarchyCard
                                    issue={story}
                                    selected={selectedStory?.key === story.key}
                                    pinned={pinnedStories.includes(story.key)}
                                    onSelect={() => setSelectedStory(story)}
                                    onPin={() => togglePin(story.key, pinnedStories, storeSetPinnedStories)}
                                    onDetail={() => {
                                        setSelectedTask(null);
                                        setTaskDetailTarget(story);
                                    }}
                                    onLinkedIssues={() => setLinkedIssuesTarget(story.key)}
                                    onAssign={story.fields.assignee?.accountId === myAccountId ? undefined : async () => {
                                        const accountId = myAccountId || loadConfig().defaultAssigneeId;
                                        if (!accountId) { setTransitionError('Falta Account ID en Settings'); return; }
                                        try {
                                            await assignIssue(story.key, accountId);
                                            if (selectedBusinessStory) {
                                                const updated = await getTechnicalStoriesByBusinessStory(selectedBusinessStory.key);
                                                setStories(updated);
                                            }
                                        } catch (e: any) {
                                            setTransitionError(e?.message ?? 'Error al asignar');
                                        }
                                    }}
                                />
                                <button
                                    onClick={e => { e.stopPropagation(); setCreateForStory(story); }}
                                    title="Crear sub-tarea"
                                    className="absolute right-2 bottom-2 opacity-0 group-hover/story:opacity-100 transition-opacity bg-microtermix-neon text-microtermix-darker rounded-full w-5 h-5 flex items-center justify-center shadow-lg hover:scale-110"
                                >
                                    <Plus size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 4: Tasks */}
                <div className={`${colCls} w-1/5`}>
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Tasks {selectedStory ? `(${filteredTasks.length})` : ''}
                        </p>
                        {selectedStory && <p className="text-[10px] text-microtermix-neon/60 mt-0.5 truncate">{selectedStory.key}</p>}
                    </div>
                    <div className={colBodyCls}>
                        {!selectedStory && <p className="text-xs text-slate-600 text-center py-8">← Selecciona una Story</p>}
                        {taskError && <p className="text-xs text-red-400 p-2">{taskError}</p>}
                        {selectedStory && loadingTasks ? (
                            <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div>
                        ) : filteredTasks.length === 0 && selectedStory && !loadingTasks ? (
                            <p className="text-xs text-slate-600 text-center py-8">Sin tasks todavía</p>
                        ) : filteredTasks.map(task => (
                            <HierarchyCard
                                key={task.id}
                                issue={task}
                                selected={selectedTask?.key === task.key}
                                pinned={false}
                                onSelect={() => setSelectedTask(prev => prev?.key === task.key ? null : task)}
                                onPin={() => { }}
                                showPin={false}
                                onAssign={task.fields.assignee?.accountId === myAccountId ? undefined : async () => {
                                    try {
                                        const accountId = myAccountId || loadConfig().defaultAssigneeId;
                                        if (!accountId) { setTransitionError('Falta Account ID en Settings'); return; }
                                        await assignIssue(task.key, accountId);
                                        if (selectedStory) {
                                            const updated = await getTasksByStory(selectedStory.key);
                                            setTasks(updated);
                                            const refreshed = updated.find(t => t.key === task.key);
                                            if (refreshed) setSelectedTask(refreshed);
                                        }
                                    } catch (e: any) {
                                        setTransitionError(e?.message ?? 'Error al asignar');
                                    }
                                }}
                                onDetail={() => {
                                    // Select task so transitions load, then open detail modal
                                    setSelectedTask(task);
                                    setTaskDetailTarget(task);
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Column 5: Task Detail + Transitions */}
                <div className="flex flex-col w-1/5 h-full border-slate-800">
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle / Acción</p>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-hide p-3">
                        {!selectedTask ? (
                            <p className="text-xs text-slate-600 text-center py-8">← Selecciona una Task</p>
                        ) : (
                            <div className="space-y-3">
                                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                                    <p className="font-mono text-[10px] text-microtermix-neon/60 mb-1">{selectedTask.key}</p>
                                    <p className="text-xs text-slate-200 leading-snug">{selectedTask.fields.summary}</p>
                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                        <span
                                            className="px-2 py-0.5 text-[9px] rounded-full font-bold uppercase"
                                            style={{
                                                background: statusColor(selectedTask.fields.status.statusCategory.colorName) + '22',
                                                color: statusColor(selectedTask.fields.status.statusCategory.colorName),
                                                border: `1px solid ${statusColor(selectedTask.fields.status.statusCategory.colorName)}44`,
                                            }}
                                        >{selectedTask.fields.status.name}</span>
                                        {selectedTask.fields.status.name.toLowerCase() === 'working' && (
                                            <button
                                                onClick={() => setShowTempoModal(true)}
                                                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold bg-microtermix-accent/20 text-microtermix-accent border border-microtermix-accent/40 hover:bg-microtermix-accent/30 rounded-full transition-colors"
                                            >
                                                <Timer size={10} />
                                                Log Time
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
                                        Transiciones
                                        {loadingTransitions && <RefreshCw size={9} className="animate-spin text-slate-600" />}
                                    </p>
                                    {transitionError && (
                                        <div className="flex items-start gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                                            <AlertCircle size={11} className="text-red-400 shrink-0 mt-0.5" />
                                            <span className="text-[10px] text-red-400 leading-snug flex-1">{transitionError}</span>
                                            <button onClick={() => setTransitionError(null)} className="text-red-500/60 hover:text-red-400 shrink-0"><X size={10} /></button>
                                        </div>
                                    )}
                                    {taskTransitions.length === 0 && !loadingTransitions && (
                                        <p className="text-[10px] text-slate-600 italic">Sin transiciones disponibles</p>
                                    )}
                                    {taskTransitions.map(tr => {
                                        const isCurrent = selectedTask.fields.status.name.toLowerCase() === tr.toName.toLowerCase();
                                        const isDiscard = /discard/i.test(tr.toName) || /discard/i.test(tr.name);
                                        const color = isDiscard ? '#ef4444' : statusColor(tr.toColor);
                                        return (
                                            <button
                                                key={tr.id}
                                                onClick={() => handleTransitionClick(selectedTask, tr)}
                                                disabled={transitioningTask === selectedTask.key || isCurrent}
                                                className="w-full px-3 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                                                style={{
                                                    background: color + '18',
                                                    borderColor: color + '44',
                                                    color,
                                                }}
                                                title={`${tr.name} → ${tr.toName}`}
                                            >
                                                {transitioningTask === selectedTask.key
                                                    ? <RefreshCw size={11} className="animate-spin" />
                                                    : null
                                                }
                                                {tr.toName}
                                                {isCurrent && <span className="text-[9px] opacity-60 ml-1">(actual)</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* API Request Log */}
            <div className="shrink-0 border-t border-slate-800 bg-slate-950">
                <div
                    className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60 cursor-pointer hover:bg-slate-900/40 select-none"
                    onClick={() => setLogVisible(v => !v)}
                >
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">API Log</span>
                    <span className="text-[9px] text-slate-700">{apiLog.length} req</span>
                    <ChevronRight size={10} className={`text-slate-600 transition-transform ml-0.5 ${logVisible ? 'rotate-90' : ''}`} />
                    {apiLog.length > 0 && (
                        <button
                            onClick={e => { e.stopPropagation(); setApiLog([]); }}
                            className="ml-auto text-[10px] text-slate-600 hover:text-slate-400"
                        >Clear</button>
                    )}
                </div>
                {logVisible && (
                    <div className="h-36 overflow-y-auto scrollbar-hide">
                        {apiLog.length === 0 ? (
                            <p className="text-[10px] text-slate-700 py-3 px-3 font-mono">Waiting for requests...</p>
                        ) : apiLog.map((entry, idx) => (
                            <div key={`${entry.id}-${idx}`} className="border-b border-slate-900">
                                {/* Row summary */}
                                <div
                                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-900/60 group"
                                    onClick={() => setExpandedLog(expandedLog === entry.id ? null : entry.id)}
                                >
                                    {/* Method pill */}
                                    <span className={`shrink-0 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${entry.method === 'GET' ? 'bg-sky-500/20 text-sky-400'
                                        : entry.method === 'POST' ? 'bg-violet-500/20 text-violet-400'
                                            : 'bg-amber-500/20 text-amber-400'
                                        }`}>{entry.method}</span>
                                    {/* Status badge */}
                                    {entry.status !== undefined && (
                                        <span className={`shrink-0 font-mono text-[9px] font-bold ${entry.ok ? 'text-emerald-400' : 'text-red-400'
                                            }`}>{entry.status}</span>
                                    )}
                                    {/* Path */}
                                    <span className="flex-1 font-mono text-[10px] text-slate-400 truncate">{entry.path}</span>
                                    {/* Duration */}
                                    {entry.durationMs !== undefined && (
                                        <span className="shrink-0 text-[9px] text-slate-600 font-mono">{entry.durationMs}ms</span>
                                    )}
                                    {/* Time */}
                                    <span className="shrink-0 text-[9px] text-slate-700 font-mono">{entry.time}</span>
                                    {/* Copy curl button */}
                                    <button
                                        onClick={e => { e.stopPropagation(); copyCurl(entry); }}
                                        title="Copy as curl"
                                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 font-mono"
                                    >
                                        {copiedId === entry.id ? '✓' : 'curl'}
                                    </button>
                                </div>
                                {/* Expanded: body + curl */}
                                {expandedLog === entry.id && (
                                    <div className="bg-slate-950 px-3 pb-2 space-y-1.5">
                                        {entry.error && (
                                            <p className="text-[10px] text-red-400 font-mono bg-red-500/5 p-1.5 rounded">{entry.error}</p>
                                        )}
                                        {entry.body && (
                                            <div>
                                                <p className="text-[9px] text-slate-600 uppercase font-bold mb-0.5">Body</p>
                                                <pre className="text-[10px] text-slate-400 font-mono bg-slate-900 rounded p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(JSON.parse(entry.body), null, 2)}</pre>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-[9px] text-slate-600 uppercase font-bold mb-0.5">cURL</p>
                                            <pre className="text-[10px] text-microtermix-neon/80 font-mono bg-slate-900 rounded p-2 overflow-x-auto whitespace-pre-wrap select-all">{entry.curl}</pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {createForStory && (
                <CreateSubTaskModal
                    parentKey={createForStory.key}
                    onClose={() => setCreateForStory(null)}
                    onCreated={newKey => {
                        console.log(`Sub-tarea ${newKey} creada en ${createForStory.key}`);
                        setCreateForStory(null);
                        if (selectedStory?.key === createForStory.key) {
                            getTasksByStory(createForStory.key)
                                .then(data => { setTasks(data); });
                        }
                    }}
                />
            )}
            {detailEpic && <EpicDetailModal epic={detailEpic} onClose={() => setDetailEpic(null)} />}
            {linkedIssuesTarget && (
                <LinkedIssuesModal
                    parentKey={linkedIssuesTarget}
                    onClose={() => setLinkedIssuesTarget(null)}
                    onDetail={setTaskDetailTarget}
                />
            )}
            {showTempoModal && selectedTask && (
                <TempoLogModal
                    issue={selectedTask}
                    authorAccountId={myAccountId}
                    onClose={() => setShowTempoModal(false)}
                    onSuccess={() => setShowTempoModal(false)}
                />
            )}

            {/* Generic transition fields modal (required fields / Discard) */}
            {transitionTarget && (
                <TransitionFieldsModal
                    target={transitionTarget}
                    onClose={() => {
                        setTransitionTarget(null);
                        if (transitionTarget.onCompleteLocally) transitionTarget.onCompleteLocally();
                    }}
                    onConfirm={async (comment, fields) => {
                        const { task, transition, onCompleteLocally } = transitionTarget;
                        setTransitionTarget(null);
                        await handleTransition(task, transition.toName, comment, fields);
                        if (onCompleteLocally) onCompleteLocally();
                    }}
                />
            )}

            {/* Subtasks blocker modal (when moving to Developed) */}
            {discardSubtasksTarget && (
                <DiscardSubtasksModal
                    target={discardSubtasksTarget}
                    onClose={() => {
                        setDiscardSubtasksTarget(null);
                        if (discardSubtasksTarget.onCompleteLocally) discardSubtasksTarget.onCompleteLocally();
                    }}
                    onConfirm={async () => {
                        const { story, transition, onCompleteLocally } = discardSubtasksTarget;
                        setDiscardSubtasksTarget(null);

                        // Proceed to show transition fields modal if required, otherwise just transition
                        const hasRequired = Object.values(transition.fields ?? {}).some(f => f.required);
                        if (hasRequired) {
                            setTransitionTarget({ task: story, transition, onCompleteLocally });
                        } else {
                            await handleTransition(story, transition.toName);
                            if (onCompleteLocally) onCompleteLocally();
                        }
                    }}
                />
            )}

            {/* Task / Story / Epic detail modal */}
            {taskDetailTarget && (
                <TaskDetailModal
                    task={taskDetailTarget}
                    onClose={() => setTaskDetailTarget(null)}
                    onTransition={(tr, onCompleteLocally) => handleTransitionClick(taskDetailTarget, tr, onCompleteLocally)}
                    onAssign={taskDetailTarget.fields.assignee?.accountId === myAccountId ? undefined : async () => {
                        const accountId = myAccountId || loadConfig().defaultAssigneeId;
                        if (!accountId) { setTransitionError('Falta Account ID en Settings'); return; }
                        try {
                            await assignIssue(taskDetailTarget.key, accountId);
                            // Refresh the right column depending on issue type
                            const type = taskDetailTarget.fields.issuetype?.name?.toLowerCase() ?? '';
                            if (type === (cfg.taskType || 'task').toLowerCase() && selectedStory) {
                                const updated = await getTasksByStory(selectedStory.key);
                                setTasks(updated);
                                const r = updated.find(t => t.key === taskDetailTarget.key);
                                if (r) { setTaskDetailTarget(r); setSelectedTask(r); }
                            } else if (selectedEpic) {
                                const updated = await getStoriesByEpic(selectedEpic.key);
                                setStories(updated);
                                const r = updated.find(s => s.key === taskDetailTarget.key);
                                if (r) setTaskDetailTarget(r);
                            }
                        } catch (e: any) {
                            setTransitionError(e?.message ?? 'Error al asignar');
                        }
                    }}
                />
            )}
        </div>
    );
}
