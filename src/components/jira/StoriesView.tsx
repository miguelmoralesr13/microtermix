import { useState, useEffect, useMemo } from 'react';
import { useJiraStore } from '../../stores/jiraStore';
import { RefreshCw, Search, AlertCircle, Plus, Timer } from 'lucide-react';
import * as api from './jiraApi';
import {
    JiraIssue, JiraTransition,
    statusColor,
    isReleased,
} from './jiraApi';
import { TempoLogModal } from './TempoLogModal';
import { TransitionFieldsModal, TransitionTarget } from './TransitionFieldsModal';
import { DiscardSubtasksModal, DiscardSubtasksTarget } from './DiscardSubtasksModal';
import { HierarchyCard } from './HierarchyCard';
import { TaskDetailModal } from './TaskDetailModal';
import { CreateSubTaskModal } from './CreateSubTaskModal';
import { LinkedIssuesModal } from './LinkedIssuesModal';
import { cn } from '../../lib/utils';
import { useJiraIssues, useJiraIssue, useJiraTransitions, jiraKeys } from '../../hooks/queries/useJiraQueries';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function StoriesView() {
    const queryClient = useQueryClient();
    const cfg = api.loadConfig();

    // Main project fallback for each level
    const p1 = cfg.level1Project || cfg.defaultProject;
    const p2 = cfg.level2Project || cfg.defaultProject;
    const p3 = cfg.level3Project || cfg.defaultProject;
    const p4 = cfg.level4Project || cfg.defaultProject;

    const [myAccountId, setMyAccountId] = useState<string>(() => cfg.defaultAssigneeId ?? '');

    useEffect(() => {
        if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) return;
        if (cfg.defaultAssigneeId) { setMyAccountId(cfg.defaultAssigneeId); return; }
        api.testConnection()
            .then(me => {
                if (me.accountId) {
                    const updated = { ...api.loadConfig(), defaultAssigneeId: me.accountId };
                    api.saveConfig(updated);
                    setMyAccountId(me.accountId);
                }
            })
            .catch(() => { });
    }, []);

    const storeSelection = useJiraStore(s => s.storiesSelection);
    const storeSetSelection = useJiraStore(s => s.setStoriesSelection);
    const storePinnedEpics = useJiraStore(s => s.pinnedEpics);
    const storePinnedBusinessStories = useJiraStore(s => s.pinnedBusinessStories);
    const storePinnedStories = useJiraStore(s => s.pinnedStories);
    const storePinnedTasks = useJiraStore(s => s.pinnedTasks);
    const storeSetPinnedEpics = useJiraStore(s => s.setPinnedEpics);
    const storeSetPinnedBusinessStories = useJiraStore(s => s.setPinnedBusinessStories);
    const storeSetPinnedStories = useJiraStore(s => s.setPinnedStories);
    const storeSetPinnedTasks = useJiraStore(s => s.setPinnedTasks);

    const [epicSearch, setEpicSearch] = useState('');
    const [epicSearchInput, setEpicSearchInput] = useState('');
    const [storySearch, setStorySearch] = useState('');
    const [storyFilterStatus] = useState('');
    const [showStoryFilters, setShowStoryFilters] = useState(false);
    const [hideReleased, setHideReleased] = useState(() => localStorage.getItem('jira_hide_released') !== 'false');

    useEffect(() => { localStorage.setItem('jira_hide_released', String(hideReleased)); }, [hideReleased]);

    // Level 1: Portfolio
    const portfolioJql = useMemo(() => {
        const base = `project = "${p1}" AND issuetype = "${cfg.level1Type || 'Epic'}"`;
        let filtered = base;
        if (epicSearch) filtered += ` AND (summary ~ "${epicSearch}" OR key = "${epicSearch}")`;
        if (storePinnedEpics.length > 0) {
            return `(${filtered}) OR key in (${storePinnedEpics.map(k => `"${k}"`).join(',')})`;
        }
        return filtered;
    }, [p1, cfg.level1Type, epicSearch, storePinnedEpics]);

    const { data: portfolios = [], isLoading: loadingPortfolios } = useJiraIssues(portfolioJql, !!p1);

    const selectedPortfolioKey = storeSelection.portfolioKey;

    // Level 2: Business
    const bStoryJql = useMemo(() => {
        const base = `project = "${p2}" AND issuetype = "${cfg.level2Type || 'Business Story'}"`;
        const parentFilter = selectedPortfolioKey ? ` AND (parent = "${selectedPortfolioKey}" OR "Epic Link" = "${selectedPortfolioKey}" OR issue in linkedIssues("${selectedPortfolioKey}"))` : '';

        let jql = base + parentFilter;
        if (storePinnedBusinessStories.length > 0) {
            const pinnedClause = `key in (${storePinnedBusinessStories.map(k => `"${k}"`).join(',')})`;
            jql = selectedPortfolioKey ? `(${jql}) OR ${pinnedClause}` : pinnedClause;
        } else if (!selectedPortfolioKey) {
            return '';
        }
        return jql;
    }, [selectedPortfolioKey, p2, cfg.level2Type, storePinnedBusinessStories]);

    const { data: businessStories = [], isLoading: loadingBusinessStories } = useJiraIssues(bStoryJql, !!selectedPortfolioKey || storePinnedBusinessStories.length > 0);

    const selectedBusinessStoryKey = storeSelection.businessStoryKey;

    // Level 3: Technical
    const techStoryJql = useMemo(() => {
        const base = `project = "${p3}" AND issuetype = "${cfg.level3Type || 'Story'}"`;
        const parentFilter = selectedBusinessStoryKey ? ` AND (parent = "${selectedBusinessStoryKey}" OR issue in linkedIssues("${selectedBusinessStoryKey}"))` : '';

        let jql = base + parentFilter;
        if (storePinnedStories.length > 0) {
            const pinnedClause = `key in (${storePinnedStories.map(k => `"${k}"`).join(',')})`;
            jql = selectedBusinessStoryKey ? `(${jql}) OR ${pinnedClause}` : pinnedClause;
        } else if (!selectedBusinessStoryKey) {
            return '';
        }
        return jql;
    }, [selectedBusinessStoryKey, p3, cfg.level3Type, storePinnedStories]);

    const { data: stories = [], isLoading: loadingTechStories } = useJiraIssues(techStoryJql, !!selectedBusinessStoryKey || storePinnedStories.length > 0);

    const selectedStoryKey = storeSelection.storyKey;

    // Level 4: Tasks
    const taskJql = useMemo(() => {
        const base = `project = "${p4}" AND issuetype = "${cfg.level4Type || 'Task'}"`;
        const parentFilter = selectedStoryKey ? ` AND parent = "${selectedStoryKey}"` : '';

        let jql = base + parentFilter;
        if (storePinnedTasks.length > 0) {
            const pinnedClause = `key in (${storePinnedTasks.map(k => `"${k}"`).join(',')})`;
            jql = selectedStoryKey ? `(${jql}) OR ${pinnedClause}` : pinnedClause;
        } else if (!selectedStoryKey) {
            return '';
        }
        return jql;
    }, [selectedStoryKey, p4, cfg.level4Type, storePinnedTasks]);

    const { data: tasks = [], isLoading: loadingTasks } = useJiraIssues(taskJql, !!selectedStoryKey || storePinnedTasks.length > 0);

    const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
    const { data: selectedTask } = useJiraIssue(selectedTaskKey);
    const { data: taskTransitions = [], isLoading: loadingTransitions } = useJiraTransitions(selectedTaskKey);

    const handleSelectPortfolio = (v: JiraIssue | null) => {
        if (v && selectedPortfolioKey === v.key) return;
        storeSetSelection({ portfolioKey: v?.key ?? null, businessStoryKey: null, storyKey: null });
        setSelectedTaskKey(null);
    };

    const handleSelectBusinessStory = (v: JiraIssue | null) => {
        if (v && selectedBusinessStoryKey === v.key) return;
        storeSetSelection({ businessStoryKey: v?.key ?? null, storyKey: null });
        setSelectedTaskKey(null);
    };

    const handleSelectStory = (v: JiraIssue | null) => {
        if (v && selectedStoryKey === v.key) return;
        storeSetSelection({ storyKey: v?.key ?? null });
        setSelectedTaskKey(null);
    };

    const [createForStory, setCreateForStory] = useState<JiraIssue | null>(null);
    const [linkedIssuesTarget, setLinkedIssuesTarget] = useState<string | null>(null);
    const [showTempoModal, setShowTempoModal] = useState(false);
    const [transitioningTask, setTransitioningTask] = useState<string | null>(null);
    const [transitionTarget, setTransitionTarget] = useState<TransitionTarget | null>(null);
    const [discardSubtasksTarget, setDiscardSubtasksTarget] = useState<DiscardSubtasksTarget | null>(null);
    const [taskDetailTarget, setTaskDetailTarget] = useState<JiraIssue | null>(null);


    const togglePin = (key: string, list: string[], setList: (keys: string[]) => void) => {
        const next = list.includes(key) ? list.filter(k => k !== key) : [key, ...list];
        setList(next);
    };

    const sortWithPins = (items: JiraIssue[], pinned: string[]) => [
        ...items.filter(i => pinned.includes(i.key)),
        ...items.filter(i => !pinned.includes(i.key)),
    ];

    const handleRefreshAll = () => {
        queryClient.invalidateQueries({ queryKey: jiraKeys.all });
    };

    const handleTransitionClick = async (task: JiraIssue, tr: JiraTransition, onCompleteLocally?: () => void) => {
        const isDeveloped = /developed/i.test(tr.toName);
        const isStory = !task.fields.issuetype?.subtask && task.fields.issuetype?.name?.toLowerCase() !== 'epic';

        if (isDeveloped && isStory) {
            setTransitioningTask(task.key);
            try {
                const subtasks = await queryClient.fetchQuery({
                    queryKey: jiraKeys.issues(`parent = "${task.key}"`),
                    queryFn: () => api.searchIssues(`parent = "${task.key}"`)
                });
                const openSubtasks = subtasks.filter(t => !['done', 'released', 'discarded', 'closed', 'resolved'].includes(t.fields.status.name.toLowerCase()));
                if (openSubtasks.length > 0) {
                    setTransitioningTask(null);
                    setDiscardSubtasksTarget({ story: task, transition: tr, openSubtasks, onCompleteLocally });
                    return;
                }
            } catch (e) { console.error(e); }
            setTransitioningTask(null);
        }

        const hasRequired = Object.values(tr.fields ?? {}).some(f => f.required);
        if (hasRequired || /discard/i.test(tr.toName)) {
            setTransitionTarget({ task, transition: tr, onCompleteLocally });
        } else {
            await handleTransition(task, tr.toName);
            if (onCompleteLocally) onCompleteLocally();
        }
    };

    const handleTransition = async (task: JiraIssue, status: string, comment?: string, fields?: Record<string, any>) => {
        setTransitioningTask(task.key);
        try {
            await api.transitionIssue(task.key, status, comment, fields);
            handleRefreshAll();
        } catch (e: any) {
            toast.error(e?.message ?? 'Error al cambiar estado');
        } finally {
            setTransitioningTask(null);
        }
    };

    const colCls = "flex flex-col h-full border-r border-slate-800 last:border-r-0";
    const colHeaderCls = "shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/70";
    const colBodyCls = "flex-1 overflow-y-auto scrollbar-hide p-2 space-y-1.5";

    if (!p1 && !p2) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 p-12">
                <AlertCircle size={36} />
                <p className="text-sm text-center">Configura tus proyectos en <strong className="text-slate-300">Settings → Stories View</strong> para comenzar.</p>
            </div>
        );
    }

    const sortedPortfolios = sortWithPins(portfolios.filter(e => {
        if (storePinnedEpics.includes(e.key)) return true;
        if (hideReleased && isReleased(e)) return false;
        return true;
    }), storePinnedEpics);
    const sortedBusinessStories = sortWithPins(businessStories.filter(s => {
        if (storePinnedBusinessStories.includes(s.key)) return true;
        if (hideReleased && isReleased(s)) return false;
        return true;
    }), storePinnedBusinessStories);
    const sortedStories = sortWithPins(stories.filter(s => {
        if (storePinnedStories.includes(s.key)) return true;
        if (hideReleased && isReleased(s)) return false;
        const matchText = !storySearch.trim() || (s.key.toLowerCase().includes(storySearch.toLowerCase()) || s.fields.summary.toLowerCase().includes(storySearch.toLowerCase()));
        const matchStatus = !storyFilterStatus || s.fields.status.name.toLowerCase() === storyFilterStatus.toLowerCase();
        return matchText && matchStatus;
    }), storePinnedStories);
    const sortedTasks = sortWithPins(tasks.filter(t => {
        if (storePinnedTasks.includes(t.key)) return true;
        if (hideReleased && isReleased(t)) return false;
        return true;
    }), storePinnedTasks);

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-1 min-h-0">
                <div className={`${colCls} w-1/5`}>
                    <div className={colHeaderCls}>
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{cfg.level1Label || 'Portfolio'} ({portfolios.length})</p>
                            <button onClick={() => setHideReleased(!hideReleased)} className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${hideReleased ? 'bg-microtermix-neon/10 border-microtermix-neon/30 text-microtermix-neon' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}>{hideReleased ? 'ACTIVOS' : 'TODO'}</button>
                        </div>
                        <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input value={epicSearchInput} onChange={e => setEpicSearchInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setEpicSearch(epicSearchInput); if (e.key === 'Escape') { setEpicSearchInput(''); setEpicSearch(''); } }} placeholder="Título o clave... ↵" className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-6 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-microtermix-neon" />
                        </div>
                    </div>
                    <div className={colBodyCls}>
                        {loadingPortfolios ? <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div> : sortedPortfolios.map(p => (
                            <HierarchyCard key={p.id} issue={p} selected={selectedPortfolioKey === p.key} pinned={storePinnedEpics.includes(p.key)} onSelect={() => handleSelectPortfolio(p)} onPin={() => togglePin(p.key, storePinnedEpics, storeSetPinnedEpics)} onDetail={() => setTaskDetailTarget(p)} onLinkedIssues={() => setLinkedIssuesTarget(p.key)} />
                        ))}
                    </div>
                </div>

                <div className={`${colCls} w-1/5`}>
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{cfg.level2Label || 'Business'} {selectedPortfolioKey ? `(${businessStories.length})` : ''}</p>
                        {selectedPortfolioKey && <p className="text-[10px] text-microtermix-neon/60 mt-0.5 truncate">{selectedPortfolioKey}</p>}
                    </div>
                    <div className={colBodyCls}>
                        {!selectedPortfolioKey && sortedBusinessStories.length === 0 ? <p className="text-xs text-slate-600 text-center py-8">← Selecciona un {cfg.level1Label || 'Portfolio'}</p> : loadingBusinessStories ? <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div> : sortedBusinessStories.map(bStory => (
                            <HierarchyCard key={bStory.id} issue={bStory} selected={selectedBusinessStoryKey === bStory.key} pinned={storePinnedBusinessStories.includes(bStory.key)} onPin={() => togglePin(bStory.key, storePinnedBusinessStories, storeSetPinnedBusinessStories)} onSelect={() => handleSelectBusinessStory(bStory)} onDetail={() => setTaskDetailTarget(bStory)} onLinkedIssues={() => setLinkedIssuesTarget(bStory.key)} />
                        ))}
                    </div>
                </div>

                <div className={`${colCls} w-1/5`}>
                    <div className={colHeaderCls}>
                        <div className="flex items-center gap-1 mb-1">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex-1">{cfg.level3Label || 'Technical'} {selectedBusinessStoryKey ? `(${stories.length})` : ''}</p>
                            {selectedBusinessStoryKey && <button onClick={() => setShowStoryFilters(!showStoryFilters)} className={cn("p-0.5 rounded transition-colors", showStoryFilters ? 'text-microtermix-neon' : 'text-slate-500')}><Search size={12} /></button>}
                        </div>
                        {selectedBusinessStoryKey && showStoryFilters && (
                            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 space-y-1.5 mt-1">
                                <input value={storySearch} onChange={e => setStorySearch(e.target.value)} placeholder="Buscar..." className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none" />
                            </div>
                        )}
                    </div>
                    <div className={colBodyCls}>
                        {!selectedBusinessStoryKey && sortedStories.length === 0 ? <p className="text-xs text-slate-600 text-center py-8">← Selecciona una {cfg.level2Label || 'Business Story'}</p> : loadingTechStories ? <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div> : sortedStories.map(story => (
                            <div key={story.id} className="relative group/story">
                                <HierarchyCard issue={story} selected={selectedStoryKey === story.key} pinned={storePinnedStories.includes(story.key)} onSelect={() => handleSelectStory(story)} onPin={() => togglePin(story.key, storePinnedStories, storeSetPinnedStories)} onDetail={() => setTaskDetailTarget(story)} onLinkedIssues={() => setLinkedIssuesTarget(story.key)} />
                                <button onClick={e => { e.stopPropagation(); setCreateForStory(story); }} className="absolute right-2 bottom-2 opacity-0 group-hover/story:opacity-100 transition-opacity bg-microtermix-neon text-microtermix-darker rounded-full w-5 h-5 flex items-center justify-center"><Plus size={10} /></button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={`${colCls} w-1/5`}>
                    <div className={colHeaderCls}><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{cfg.level4Label || 'Tasks'} {selectedStoryKey ? `(${tasks.length})` : ''}</p></div>
                    <div className={colBodyCls}>
                        {!selectedStoryKey && sortedTasks.length === 0 ? <p className="text-xs text-slate-600 text-center py-8">← Selecciona una {cfg.level3Label || 'Story'}</p> : loadingTasks ? <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div> : sortedTasks.map(task => (
                            <HierarchyCard key={task.id} issue={task} selected={selectedTaskKey === task.key} pinned={storePinnedTasks.includes(task.key)} onPin={() => togglePin(task.key, storePinnedTasks, storeSetPinnedTasks)} onSelect={() => setSelectedTaskKey(prev => prev === task.key ? null : task.key)} onDetail={() => { setSelectedTaskKey(task.key); setTaskDetailTarget(task); }} />
                        ))}
                    </div>
                </div>
                ...

                <div className="flex flex-col w-1/5 h-full border-slate-800">
                    <div className={colHeaderCls}><p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle / Acción</p></div>
                    <div className="flex-1 overflow-y-auto scrollbar-hide p-3">
                        {!selectedTask ? <p className="text-xs text-slate-600 text-center py-8">← Selecciona una Task</p> : (
                            <div className="space-y-3">
                                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                                    <p className="font-mono text-[10px] text-microtermix-neon/60 mb-1">{selectedTask.key}</p>
                                    <p className="text-xs text-slate-200 leading-snug">{selectedTask.fields.summary}</p>
                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                        <span className="px-2 py-0.5 text-[9px] rounded-full font-bold uppercase" style={{ background: statusColor(selectedTask.fields.status.statusCategory.colorName) + '22', color: statusColor(selectedTask.fields.status.statusCategory.colorName), border: `1px solid ${statusColor(selectedTask.fields.status.statusCategory.colorName)}44` }}>{selectedTask.fields.status.name}</span>
                                        {selectedTask.fields.status.name.toLowerCase() === 'working' && <button onClick={() => setShowTempoModal(true)} className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold bg-microtermix-accent/20 text-microtermix-accent border border-microtermix-accent/40 rounded-full"><Timer size={10} /> Log Time</button>}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1.5">Transiciones {loadingTransitions && <RefreshCw size={9} className="animate-spin text-slate-600" />}</p>
                                    {taskTransitions.map(tr => (
                                        <button key={tr.id} onClick={() => handleTransitionClick(selectedTask, tr)} disabled={transitioningTask === selectedTask.key} className="w-full px-3 py-2 rounded-lg text-xs font-medium border transition-all" style={{ background: statusColor(tr.toColor) + '18', borderColor: statusColor(tr.toColor) + '44', color: statusColor(tr.toColor) }}>{tr.toName}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>


            {createForStory && <CreateSubTaskModal parentKey={createForStory.key} onClose={() => setCreateForStory(null)} onCreated={() => handleRefreshAll()} />}
            {linkedIssuesTarget && <LinkedIssuesModal parentKey={linkedIssuesTarget} onClose={() => setLinkedIssuesTarget(null)} onDetail={setTaskDetailTarget} />}
            {showTempoModal && selectedTask && <TempoLogModal issue={selectedTask} authorAccountId={myAccountId} onClose={() => setShowTempoModal(false)} onSuccess={() => setShowTempoModal(false)} />}
            {transitionTarget && <TransitionFieldsModal target={transitionTarget} onClose={() => setTransitionTarget(null)} onConfirm={async (c, f) => { await handleTransition(transitionTarget.task, transitionTarget.transition.toName, c, f); setTransitionTarget(null); }} />}
            {discardSubtasksTarget && <DiscardSubtasksModal target={discardSubtasksTarget} onClose={() => setDiscardSubtasksTarget(null)} onConfirm={async () => { const { story, transition } = discardSubtasksTarget; setDiscardSubtasksTarget(null); await handleTransition(story, transition.toName); }} />}
            {taskDetailTarget && <TaskDetailModal task={taskDetailTarget} onClose={() => setTaskDetailTarget(null)} onTransition={(tr, loc) => handleTransitionClick(taskDetailTarget, tr, loc)} onAssign={async () => { await api.assignIssue(taskDetailTarget.key, myAccountId); handleRefreshAll(); }} />}
        </div>
    );
}
