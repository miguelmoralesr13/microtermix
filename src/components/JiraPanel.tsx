import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Settings, Plus, RefreshCw, Search, X, CheckCircle,
    AlertCircle, Layers, ExternalLink, Star, ChevronRight, Pin
} from 'lucide-react';
import {
    JiraConfig, JiraIssue, JiraApiLogEntry, jiraApiLog,
    loadConfig, saveConfig, testConnection,
    getMyIssues, getProjectIssues, statusColor,
    getProjects, getIssueTypes, getUsers, createIssue,
    getEpics, getStoriesByEpic, getTasksByStory, createSubTask, transitionIssue
} from './jiraApi';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'board' | 'stories' | 'create' | 'settings';
type BoardFilter = 'mine' | 'project' | 'search';

// ── Escape key hook ─────────────────────────────────────────────────────────

function useEscape(onEscape: () => void) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onEscape]);
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JiraIssue['fields']['status'] }) {
    const color = statusColor(status.statusCategory.colorName);
    return (
        <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
        >
            {status.name}
        </span>
    );
}

// ── Issue Card ────────────────────────────────────────────────────────────────

function IssueCard({ issue, onClick }: { issue: JiraIssue; onClick: () => void }) {
    const { fields } = issue;
    const cfg = loadConfig();
    return (
        <div
            onClick={onClick}
            className="flex items-start gap-3 px-4 py-3 bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-600 rounded-lg cursor-pointer transition-colors group"
        >
            {fields.issuetype?.iconUrl && (
                <img src={fields.issuetype.iconUrl} alt={fields.issuetype.name} className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <a
                        href={`${cfg.baseUrl}/browse/${issue.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="font-mono text-[11px] text-nexus-neon/70 hover:text-nexus-neon flex items-center gap-0.5"
                    >
                        {issue.key}<ExternalLink size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    <StatusBadge status={fields.status} />
                    {fields.priority?.iconUrl && (
                        <img src={fields.priority.iconUrl} alt={fields.priority.name} title={fields.priority.name} className="w-3.5 h-3.5" />
                    )}
                </div>
                <p className="text-sm text-slate-200 leading-snug truncate">{fields.summary}</p>
                {fields.labels.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                        {fields.labels.slice(0, 3).map(l => (
                            <span key={l} className="px-1.5 py-px text-[9px] rounded bg-slate-700 text-slate-400 font-mono">{l}</span>
                        ))}
                    </div>
                )}
            </div>
            {fields.assignee && (
                <img
                    src={fields.assignee.avatarUrls['24x24']}
                    alt={fields.assignee.displayName}
                    title={fields.assignee.displayName}
                    className="w-6 h-6 rounded-full shrink-0"
                />
            )}
        </div>
    );
}

// ── Issue Detail Modal ────────────────────────────────────────────────────────

function IssueDetailModal({ issue, onClose }: { issue: JiraIssue; onClose: () => void }) {
    const cfg = loadConfig();
    const { fields } = issue;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 p-5 border-b border-slate-800">
                    {fields.issuetype?.iconUrl && <img src={fields.issuetype.iconUrl} alt="" className="w-5 h-5 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                        <a href={`${cfg.baseUrl}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-nexus-neon hover:underline flex items-center gap-1">
                            {issue.key} <ExternalLink size={11} />
                        </a>
                        <h2 className="text-base font-bold text-white mt-0.5">{fields.summary}</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-700">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="flex flex-wrap gap-3 text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Status:</span>
                            <StatusBadge status={fields.status} />
                        </div>
                        {fields.priority && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Priority:</span>
                                <span className="text-slate-300 flex items-center gap-1">
                                    {fields.priority.iconUrl && <img src={fields.priority.iconUrl} alt="" className="w-3.5 h-3.5" />}
                                    {fields.priority.name}
                                </span>
                            </div>
                        )}
                        {fields.assignee && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Assignee:</span>
                                <span className="text-slate-300 flex items-center gap-1">
                                    <img src={fields.assignee.avatarUrls['16x16']} alt="" className="w-4 h-4 rounded-full" />
                                    {fields.assignee.displayName}
                                </span>
                            </div>
                        )}
                    </div>
                    {fields.labels.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                            {fields.labels.map(l => (
                                <span key={l} className="px-2 py-0.5 text-[10px] rounded bg-slate-700 text-slate-300 font-mono">{l}</span>
                            ))}
                        </div>
                    )}
                    {fields.description && (
                        <div className="text-sm text-slate-300 bg-slate-800/40 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
                            {typeof fields.description === 'string'
                                ? fields.description
                                : fields.description?.content?.[0]?.content?.[0]?.text ?? '(sin descripción)'
                            }
                        </div>
                    )}
                    <p className="text-[10px] text-slate-600">Creado: {new Date(fields.created).toLocaleString()} · Actualizado: {new Date(fields.updated).toLocaleString()}</p>
                </div>
            </div>
        </div>
    );
}

// ── Stories View (3-Column Hierarchy) ────────────────────────────────────────

const PINNED_EPICS_KEY = 'nexus-jira-pinned-epics';
const PINNED_STORIES_KEY = 'nexus-jira-pinned-stories';
const PERSIST_EPICS_KEY = 'nexus-jira-epics';
const PERSIST_STORIES_KEY = 'nexus-jira-stories';
const PERSIST_TASKS_KEY = 'nexus-jira-tasks';
const PERSIST_SEL_EPIC_KEY = 'nexus-jira-sel-epic';
const PERSIST_SEL_STORY_KEY = 'nexus-jira-sel-story';

function loadPinned(key: string): string[] {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}
function savePinned(key: string, keys: string[]) {
    localStorage.setItem(key, JSON.stringify(keys));
}
function loadLS<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch { return fallback; }
}
function saveLS(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}

function isReleased(issue: JiraIssue): boolean {
    const cfg = loadConfig();
    const statuses = (cfg.releasedStatuses ?? ['Released', 'Discarded']).map(s => s.toLowerCase().trim());
    return statuses.includes(issue.fields.status.name.toLowerCase());
}

function HierarchyCard({
    issue, selected, pinned, onSelect, onPin, onDetail, showPin = true
}: {
    issue: JiraIssue; selected: boolean; pinned: boolean;
    onSelect: () => void; onPin: () => void;
    onDetail?: () => void;
    showPin?: boolean;
}) {
    const released = isReleased(issue);
    return (
        <div
            onClick={onSelect}
            className={`group flex items-start gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${selected
                ? 'bg-nexus-neon/10 border-nexus-neon/50 shadow-[0_0_8px_rgba(0,255,170,0.1)]'
                : released
                    ? 'bg-slate-900/40 border-slate-800/50 opacity-60 hover:opacity-80'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 hover:border-slate-600'
                }`}
        >
            {showPin && (
                <button
                    onClick={e => { e.stopPropagation(); onPin(); }}
                    className={`shrink-0 mt-0.5 transition-colors ${pinned ? 'text-yellow-400' : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-yellow-400'}`}
                >
                    <Star size={12} fill={pinned ? 'currentColor' : 'none'} />
                </button>
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="font-mono text-[10px] text-nexus-neon/60">{issue.key}</span>
                    {released && (
                        <span className="px-1.5 py-px text-[9px] rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                            {issue.fields.status.name}
                        </span>
                    )}
                    {!released && (
                        <span
                            className="px-1.5 py-px text-[9px] rounded-full font-bold uppercase"
                            style={{
                                background: statusColor(issue.fields.status.statusCategory.colorName) + '22',
                                color: statusColor(issue.fields.status.statusCategory.colorName),
                                border: `1px solid ${statusColor(issue.fields.status.statusCategory.colorName)}44`,
                            }}
                        >{issue.fields.status.name}</span>
                    )}
                    {onDetail && (
                        <button
                            onClick={e => { e.stopPropagation(); onDetail(); }}
                            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[9px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 font-mono shrink-0"
                        >
                            info
                        </button>
                    )}
                </div>
                <p className="text-xs text-slate-200 leading-snug line-clamp-2">{issue.fields.summary}</p>
                {issue.fields.assignee && (
                    <div className="flex items-center gap-1 mt-1.5">
                        <img
                            src={issue.fields.assignee.avatarUrls['16x16']}
                            alt={issue.fields.assignee.displayName}
                            title={issue.fields.assignee.displayName}
                            className="w-3.5 h-3.5 rounded-full opacity-80"
                        />
                        <span className="text-[10px] text-slate-500 truncate">{issue.fields.assignee.displayName}</span>
                    </div>
                )}
            </div>
            {selected && <ChevronRight size={12} className="text-nexus-neon shrink-0 mt-1" />}
        </div>
    );
}

// ── Epic Detail Modal ─────────────────────────────────────────────────────────

function EpicDetailModal({ epic, onClose }: { epic: JiraIssue; onClose: () => void }) {
    const cfg = loadConfig();
    const { fields } = epic;
    useEscape(onClose);
    const descText = !fields.description ? null
        : typeof fields.description === 'string' ? fields.description
            : fields.description?.content?.[0]?.content?.[0]?.text ?? null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl max-h-[75vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 p-4 border-b border-slate-800">
                    {fields.issuetype?.iconUrl && <img src={fields.issuetype.iconUrl} alt="" className="w-5 h-5 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                        <a href={`${cfg.baseUrl}/browse/${epic.key}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-nexus-neon hover:underline flex items-center gap-1">
                            {epic.key} <ExternalLink size={10} />
                        </a>
                        <h2 className="text-sm font-bold text-white mt-0.5 leading-snug">{fields.summary}</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-700 shrink-0">
                        <X size={16} />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-3 text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Status:</span>
                            <span className="px-1.5 py-px rounded-full font-bold uppercase text-[10px]"
                                style={{
                                    background: statusColor(fields.status.statusCategory.colorName) + '22',
                                    color: statusColor(fields.status.statusCategory.colorName),
                                    border: `1px solid ${statusColor(fields.status.statusCategory.colorName)}44`,
                                }}
                            >{fields.status.name}</span>
                        </div>
                        {fields.assignee && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Assignee:</span>
                                <img src={fields.assignee.avatarUrls['16x16']} alt="" className="w-4 h-4 rounded-full" />
                                <span className="text-slate-300">{fields.assignee.displayName}</span>
                            </div>
                        )}
                        {fields.priority && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Priority:</span>
                                {fields.priority.iconUrl && <img src={fields.priority.iconUrl} alt="" className="w-3.5 h-3.5" />}
                                <span className="text-slate-300">{fields.priority.name}</span>
                            </div>
                        )}
                    </div>
                    {descText ? (
                        <div className="text-sm text-slate-300 bg-slate-800/40 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">{descText}</div>
                    ) : (
                        <p className="text-xs text-slate-600 italic">Sin descripción.</p>
                    )}
                    {fields.labels?.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                            {fields.labels.map((l: string) => (
                                <span key={l} className="px-2 py-0.5 text-[10px] rounded bg-slate-700 text-slate-300 font-mono">{l}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CreateSubTaskModal({ parentKey, onCreated, onClose }: {
    parentKey: string; onCreated: (key: string) => void; onClose: () => void;
}) {
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    useEscape(onClose);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await createSubTask(parentKey, summary.trim(), description);
            // Auto-transition to Working after creation
            try { await transitionIssue(res.key, 'Working'); } catch { }
            onCreated(res.key);
        } catch (err: any) {
            setError(err?.message ?? 'Error al crear la tarea');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <Plus size={14} className="text-nexus-neon" /> Nueva Sub-tarea en <span className="font-mono text-nexus-neon text-xs">{parentKey}</span>
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">{error}</p>}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Resumen *</label>
                        <input
                            ref={inputRef}
                            value={summary}
                            onChange={e => setSummary(e.target.value)}
                            required
                            placeholder="¿Qué hay que hacer?"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Descripción (opcional)</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Detalles adicionales..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon resize-none"
                        />
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !summary.trim()}
                            className="flex-1 py-2 text-xs rounded-lg bg-nexus-accent hover:bg-opacity-80 text-white font-bold disabled:opacity-50"
                        >
                            {submitting ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : null}
                            {submitting ? 'Creando...' : 'Crear + Working'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function StoriesView() {
    const cfg = loadConfig();
    const project = cfg.storiesProject || cfg.defaultProject;

    // ── Persistent issues cache ──
    const [epics, setEpics] = useState<JiraIssue[]>(() => loadLS<JiraIssue[]>(PERSIST_EPICS_KEY, []));
    const [stories, setStories] = useState<JiraIssue[]>(() => loadLS<JiraIssue[]>(PERSIST_STORIES_KEY, []));
    const [tasks, setTasks] = useState<JiraIssue[]>(() => loadLS<JiraIssue[]>(PERSIST_TASKS_KEY, []));

    // ── Persistent selection ──
    const [selectedEpic, setSelectedEpicRaw] = useState<JiraIssue | null>(() => loadLS<JiraIssue | null>(PERSIST_SEL_EPIC_KEY, null));
    const [selectedStory, setSelectedStoryRaw] = useState<JiraIssue | null>(() => loadLS<JiraIssue | null>(PERSIST_SEL_STORY_KEY, null));

    // Cascade setters: changing Epic clears Story+Tasks; changing Story clears Tasks
    const setSelectedEpic = (v: JiraIssue | null) => {
        setSelectedEpicRaw(v);
        saveLS(PERSIST_SEL_EPIC_KEY, v);
        // cascade clear downstream
        setSelectedStoryRaw(null); saveLS(PERSIST_SEL_STORY_KEY, null);
        setSelectedTask(null);
        setStories([]); saveLS(PERSIST_STORIES_KEY, []);
        setTasks([]); saveLS(PERSIST_TASKS_KEY, []);
    };
    const setSelectedStory = (v: JiraIssue | null) => {
        setSelectedStoryRaw(v);
        saveLS(PERSIST_SEL_STORY_KEY, v);
        // cascade clear downstream
        setSelectedTask(null);
        setTasks([]); saveLS(PERSIST_TASKS_KEY, []);
    };

    const [createForStory, setCreateForStory] = useState<JiraIssue | null>(null);
    const [detailEpic, setDetailEpic] = useState<JiraIssue | null>(null);

    const [epicSearch, setEpicSearch] = useState('');
    const [pinnedEpics, setPinnedEpics] = useState<string[]>(() => loadPinned(PINNED_EPICS_KEY));
    const [pinnedStories, setPinnedStories] = useState<string[]>(() => loadPinned(PINNED_STORIES_KEY));

    const [loadingEpics, setLoadingEpics] = useState(false);
    const [loadingStories, setLoadingStories] = useState(false);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [epicError, setEpicError] = useState<string | null>(null);
    const [storyError, setStoryError] = useState<string | null>(null);
    const [taskError, setTaskError] = useState<string | null>(null);

    const [selectedTask, setSelectedTask] = useState<JiraIssue | null>(null);
    const [transitioningTask, setTransitioningTask] = useState<string | null>(null);
    const [apiLog, setApiLog] = useState<JiraApiLogEntry[]>([]);
    const [expandedLog, setExpandedLog] = useState<number | null>(null);
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
            saveLS(PERSIST_EPICS_KEY, data);
        } catch (e: any) {
            setEpicError(e?.message ?? 'Error cargando Epics');
        } finally {
            setLoadingEpics(false);
        }
    }, [project]);

    useEffect(() => { loadEpics(); }, [loadEpics]);

    // Search debounce
    useEffect(() => {
        const t = setTimeout(() => loadEpics(epicSearch || undefined), 400);
        return () => clearTimeout(t);
    }, [epicSearch, loadEpics]);

    // Load stories when epic selected
    useEffect(() => {
        if (!selectedEpic) { setStories([]); setSelectedStory(null); setTasks([]); return; }
        setLoadingStories(true);
        setStoryError(null);
        setTasks([]);
        getStoriesByEpic(selectedEpic.key)
            .then(data => { setStories(data); saveLS(PERSIST_STORIES_KEY, data); })
            .catch((e: any) => setStoryError(e?.message ?? 'Error cargando Stories'))
            .finally(() => setLoadingStories(false));
    }, [selectedEpic?.key]);

    // Load tasks when story selected
    useEffect(() => {
        if (!selectedStory) { setTasks([]); return; }
        setLoadingTasks(true);
        setTaskError(null);
        getTasksByStory(selectedStory.key)
            .then(data => { setTasks(data); saveLS(PERSIST_TASKS_KEY, data); })
            .catch((e: any) => setTaskError(e?.message ?? 'Error cargando Tasks'))
            .finally(() => setLoadingTasks(false));
    }, [selectedStory?.key]);

    const togglePin = (key: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, storageKey: string) => {
        const next = list.includes(key) ? list.filter(k => k !== key) : [key, ...list];
        setList(next);
        savePinned(storageKey, next);
    };

    const sortWithPins = (items: JiraIssue[], pinned: string[]) => [
        ...items.filter(i => pinned.includes(i.key)),
        ...items.filter(i => !pinned.includes(i.key)),
    ];

    const [transitionError, setTransitionError] = useState<string | null>(null);

    const handleTransition = async (task: JiraIssue, status: string) => {
        setTransitioningTask(task.key);
        setTransitionError(null);
        try {
            await transitionIssue(task.key, status);
            if (selectedStory) {
                const updated = await getTasksByStory(selectedStory.key);
                setTasks(updated);
                saveLS(PERSIST_TASKS_KEY, updated);
                const refreshed = updated.find(t => t.key === task.key);
                if (refreshed) setSelectedTask(refreshed);
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

    const releasedStatuses = cfg.releasedStatuses ?? ['Released', 'Discarded'];

    const sortedEpics = sortWithPins(epics, pinnedEpics);
    const sortedStories = sortWithPins(stories, pinnedStories);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* 3 columns */}
            <div className="flex flex-1 min-h-0">
                {/* Column 1: Epics */}
                <div className={`${colCls} w-1/4`}>
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Business ({epics.length})</p>
                        <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                value={epicSearch}
                                onChange={e => setEpicSearch(e.target.value)}
                                placeholder="Título o clave..."
                                className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                            />
                            {epicSearch && <button onClick={() => setEpicSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"><X size={10} /></button>}
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
                                onPin={() => togglePin(epic.key, pinnedEpics, setPinnedEpics, PINNED_EPICS_KEY)}
                                onDetail={() => setDetailEpic(epic)}
                            />
                        ))}
                    </div>
                </div>

                {/* Column 2: Stories */}
                <div className={`${colCls} w-1/4`}>
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Technical {selectedEpic ? `(${stories.length})` : ''}
                        </p>
                        {selectedEpic && <p className="text-[10px] text-nexus-neon/60 mt-0.5 truncate">{selectedEpic.key}</p>}
                    </div>
                    <div className={colBodyCls}>
                        {!selectedEpic && <p className="text-xs text-slate-600 text-center py-8">← Selecciona un Epic</p>}
                        {storyError && <p className="text-xs text-red-400 p-2">{storyError}</p>}
                        {selectedEpic && loadingStories ? (
                            <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div>
                        ) : sortedStories.map(story => (
                            <div key={story.id} className="relative group/story">
                                <HierarchyCard
                                    issue={story}
                                    selected={selectedStory?.key === story.key}
                                    pinned={pinnedStories.includes(story.key)}
                                    onSelect={() => setSelectedStory(story)}
                                    onPin={() => togglePin(story.key, pinnedStories, setPinnedStories, PINNED_STORIES_KEY)}
                                />
                                <button
                                    onClick={e => { e.stopPropagation(); setCreateForStory(story); }}
                                    title="Crear sub-tarea"
                                    className="absolute right-2 bottom-2 opacity-0 group-hover/story:opacity-100 transition-opacity bg-nexus-neon text-nexus-darker rounded-full w-5 h-5 flex items-center justify-center shadow-lg hover:scale-110"
                                >
                                    <Plus size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 3: Tasks */}
                <div className={`${colCls} w-1/4`}>
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Tasks {selectedStory ? `(${tasks.length})` : ''}
                        </p>
                        {selectedStory && <p className="text-[10px] text-nexus-neon/60 mt-0.5 truncate">{selectedStory.key}</p>}
                    </div>
                    <div className={colBodyCls}>
                        {!selectedStory && <p className="text-xs text-slate-600 text-center py-8">← Selecciona una Story</p>}
                        {taskError && <p className="text-xs text-red-400 p-2">{taskError}</p>}
                        {selectedStory && loadingTasks ? (
                            <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div>
                        ) : tasks.length === 0 && selectedStory && !loadingTasks ? (
                            <p className="text-xs text-slate-600 text-center py-8">Sin tasks todavía</p>
                        ) : tasks.map(task => (
                            <HierarchyCard
                                key={task.id}
                                issue={task}
                                selected={selectedTask?.key === task.key}
                                pinned={false}
                                onSelect={() => setSelectedTask(prev => prev?.key === task.key ? null : task)}
                                onPin={() => { }}
                                showPin={false}
                            />
                        ))}
                    </div>
                </div>

                {/* Column 4: Task Detail + Transitions */}
                <div className="flex flex-col w-1/4 h-full border-slate-800">
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle / Acción</p>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-hide p-3">
                        {!selectedTask ? (
                            <p className="text-xs text-slate-600 text-center py-8">← Selecciona una Task</p>
                        ) : (
                            <div className="space-y-3">
                                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                                    <p className="font-mono text-[10px] text-nexus-neon/60 mb-1">{selectedTask.key}</p>
                                    <p className="text-xs text-slate-200 leading-snug">{selectedTask.fields.summary}</p>
                                    <div className="mt-2">
                                        <span
                                            className="px-2 py-0.5 text-[9px] rounded-full font-bold uppercase"
                                            style={{
                                                background: statusColor(selectedTask.fields.status.statusCategory.colorName) + '22',
                                                color: statusColor(selectedTask.fields.status.statusCategory.colorName),
                                                border: `1px solid ${statusColor(selectedTask.fields.status.statusCategory.colorName)}44`,
                                            }}
                                        >{selectedTask.fields.status.name}</span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Transiciones</p>
                                    {transitionError && (
                                        <div className="flex items-start gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                                            <AlertCircle size={11} className="text-red-400 shrink-0 mt-0.5" />
                                            <span className="text-[10px] text-red-400 leading-snug flex-1">{transitionError}</span>
                                            <button onClick={() => setTransitionError(null)} className="text-red-500/60 hover:text-red-400 shrink-0"><X size={10} /></button>
                                        </div>
                                    )}
                                    {releasedStatuses.map(status => (
                                        <button
                                            key={status}
                                            onClick={() => handleTransition(selectedTask, status)}
                                            disabled={transitioningTask === selectedTask.key || selectedTask.fields.status.name === status}
                                            className="w-full px-3 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 flex items-center justify-center gap-1.5
                                                bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50"
                                        >
                                            {transitioningTask === selectedTask.key
                                                ? <RefreshCw size={11} className="animate-spin" />
                                                : null
                                            }
                                            {status}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => handleTransition(selectedTask, 'Working')}
                                        disabled={transitioningTask === selectedTask.key || selectedTask.fields.status.name === 'Working'}
                                        className="w-full px-3 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 flex items-center justify-center gap-1.5
                                            bg-nexus-neon/10 border-nexus-neon/30 text-nexus-neon hover:bg-nexus-neon/20"
                                    >
                                        {transitioningTask === selectedTask.key ? <RefreshCw size={11} className="animate-spin" /> : null}
                                        Working
                                    </button>
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
                        ) : apiLog.map((entry) => (
                            <div key={entry.id} className="border-b border-slate-900">
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
                                            <pre className="text-[10px] text-nexus-neon/80 font-mono bg-slate-900 rounded p-2 overflow-x-auto whitespace-pre-wrap select-all">{entry.curl}</pre>
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
                            setLoadingTasks(true);
                            getTasksByStory(createForStory.key)
                                .then(data => { setTasks(data); saveLS(PERSIST_TASKS_KEY, data); })
                                .finally(() => setLoadingTasks(false));
                        }
                    }}
                />
            )}
            {detailEpic && <EpicDetailModal epic={detailEpic} onClose={() => setDetailEpic(null)} />}
        </div>
    );
}

// ── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel({ onSaved }: { onSaved: () => void }) {
    const [cfg, setCfg] = useState<JiraConfig>(loadConfig());
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [saving, setSaving] = useState(false);
    // For custom fields editor
    const [newFieldKey, setNewFieldKey] = useState('');
    const [newFieldVal, setNewFieldVal] = useState('');

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const me = await testConnection();
            setTestResult({ ok: true, msg: `✅ Conectado como ${me.displayName}` });
            if (!cfg.defaultAssigneeId) {
                setCfg(c => ({ ...c, defaultAssigneeId: me.accountId }));
            }
        } catch (e: any) {
            setTestResult({ ok: false, msg: `❌ ${e.message}` });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = () => {
        setSaving(true);
        saveConfig(cfg);
        setTimeout(() => { setSaving(false); onSaved(); }, 400);
    };

    const addCustomField = () => {
        if (!newFieldKey.trim()) return;
        setCfg(c => ({ ...c, customFields: { ...c.customFields, [newFieldKey.trim()]: newFieldVal } }));
        setNewFieldKey(''); setNewFieldVal('');
    };

    const removeCustomField = (key: string) => {
        setCfg(c => {
            const cf = { ...c.customFields };
            delete cf[key];
            return { ...c, customFields: cf };
        });
    };

    const field = (label: string, key: keyof JiraConfig, type: 'text' | 'password' = 'text') => (
        <div>
            <label className="block text-xs text-slate-400 mb-1">{label}</label>
            <input
                type={type}
                value={(cfg[key] as string) ?? ''}
                onChange={e => setCfg(c => ({ ...c, [key]: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon transition-colors"
            />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Settings size={16} /> Configuración de Jira</h2>

            {/* Connection */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conexión</h3>
                {field('Jira Base URL (ej. https://empresa.atlassian.net)', 'baseUrl')}
                {field('Email de Atlassian', 'email')}
                {field('API Token', 'apiToken', 'password')}
                <button onClick={handleTest} disabled={testing}
                    className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50">
                    {testing ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : null}
                    {testing ? 'Probando...' : 'Probar conexión'}
                </button>
                {testResult && (
                    <p className={`text-xs ${testResult.ok ? 'text-nexus-success' : 'text-nexus-danger'}`}>{testResult.msg}</p>
                )}
            </section>

            {/* Default fields */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valores por defecto (para crear issues)</h3>
                {field('Clave de proyecto por defecto (ej. NCPPPMC)', 'defaultProject')}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Tipo de issue por defecto</label>
                    <select value={cfg.defaultIssueType}
                        onChange={e => setCfg(c => ({ ...c, defaultIssueType: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon">
                        {['Story', 'Bug', 'Task', 'Sub-task', 'Epic'].map(t => <option key={t}>{t}</option>)}
                    </select>
                </div>
                {field('Account ID del asignado por defecto', 'defaultAssigneeId')}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Prioridad por defecto</label>
                    <select value={cfg.defaultPriority}
                        onChange={e => setCfg(c => ({ ...c, defaultPriority: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon">
                        {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Labels por defecto (separados por coma)</label>
                    <input
                        type="text"
                        value={cfg.defaultLabels.join(', ')}
                        onChange={e => setCfg(c => ({ ...c, defaultLabels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                        placeholder="frontend, microfrontend"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon"
                    />
                </div>
            </section>

            {/* Hierarchy config */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stories View — Jerarquía</h3>
                {field('Proyecto para vista Stories (ej. NCPPPMC)', 'storiesProject')}
                {field('Tipo Epic (Business)', 'epicType')}
                {field('Tipo Story (Technical)', 'storyType')}
                {field('Tipo Task (Sub-tarea)', 'taskType')}
                {field('ID del campo Activity (ej. customfield_10115) — dejar vacío para omitir', 'activityFieldId')}
                {field('ID de la opción Activity (ej. 10301)', 'activityId')}
                {field('Valor del campo Activity (ej. Development)', 'activityValue')}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Statuses con color especial (separados por coma)</label>
                    <input
                        type="text"
                        value={(cfg.releasedStatuses ?? []).join(', ')}
                        onChange={e => setCfg(c => ({ ...c, releasedStatuses: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                        placeholder="Released, Discarded"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon"
                    />
                </div>
            </section>

            {/* Custom fields */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Campos personalizados (custom fields Jira)</h3>
                <p className="text-[11px] text-slate-500">Agrega campos como <code className="bg-slate-800 px-1 rounded">customfield_10020</code> con su valor por defecto. Se enviarán automáticamente al crear un issue.</p>
                {Object.entries(cfg.customFields).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-nexus-neon/80 bg-slate-800 px-2 py-1 rounded flex-1">{k}</span>
                        <span className="text-slate-300 flex-1 truncate">{JSON.stringify(v)}</span>
                        <button onClick={() => removeCustomField(k)} className="text-nexus-danger hover:bg-slate-700 p-1 rounded"><X size={12} /></button>
                    </div>
                ))}
                <div className="flex gap-2">
                    <input value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)}
                        placeholder="customfield_XXXXX"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-nexus-neon font-mono" />
                    <input value={newFieldVal} onChange={e => setNewFieldVal(e.target.value)}
                        placeholder="valor"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-nexus-neon" />
                    <button onClick={addCustomField} className="px-3 py-1 text-xs bg-nexus-neon text-nexus-darker rounded font-bold hover:bg-opacity-80 transition-colors">+</button>
                </div>
            </section>

            <button onClick={handleSave} disabled={saving}
                className="w-full py-2.5 rounded-lg bg-nexus-accent hover:bg-opacity-80 text-white font-bold text-sm transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
        </div>
    );
}

// ── Create Issue Form ─────────────────────────────────────────────────────────

function CreateIssueForm({ onCreated }: { onCreated: (key: string) => void }) {
    const cfg = loadConfig();
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [projectKey, setProjectKey] = useState(cfg.defaultProject);
    const [issueType, setIssueType] = useState(cfg.defaultIssueType);
    const [priority, setPriority] = useState(cfg.defaultPriority);
    const [assigneeId, setAssigneeId] = useState(cfg.defaultAssigneeId);
    const [labels, setLabels] = useState(cfg.defaultLabels.join(', '));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<{ key: string; name: string }[]>([]);
    const [issueTypes, setIssueTypes] = useState<{ id: string; name: string }[]>([]);
    const [users, setUsers] = useState<{ accountId: string; displayName: string }[]>([]);

    useEffect(() => {
        getProjects().then(setProjects).catch(() => { });
    }, []);

    useEffect(() => {
        if (projectKey) {
            getIssueTypes(projectKey).then(setIssueTypes).catch(() => { });
            getUsers(projectKey).then(setUsers).catch(() => { });
        }
    }, [projectKey]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const fields: Record<string, any> = {
                project: { key: projectKey },
                issuetype: { name: issueType },
                summary: summary.trim(),
                priority: { name: priority },
                labels: labels.split(',').map(l => l.trim()).filter(Boolean),
                ...cfg.customFields,
            };
            if (description.trim()) {
                fields.description = {
                    type: 'doc', version: 1,
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: description.trim() }] }]
                };
            }
            if (assigneeId) fields.assignee = { id: assigneeId };
            const res = await createIssue(fields);
            setSummary(''); setDescription(''); setError(null);
            onCreated(res.key);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon transition-colors";
    const labelCls = "block text-xs text-slate-400 mb-1";

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto py-6 px-4 space-y-4">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Plus size={16} /> Crear Issue</h2>

            {error && (
                <div className="p-3 bg-nexus-danger/10 border border-nexus-danger/30 rounded-lg text-nexus-danger text-xs">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>Proyecto</label>
                    <select value={projectKey} onChange={e => setProjectKey(e.target.value)} className={inputCls}>
                        {projects.length > 0
                            ? projects.map(p => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)
                            : <option value={projectKey}>{projectKey}</option>
                        }
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Tipo</label>
                    <select value={issueType} onChange={e => setIssueType(e.target.value)} className={inputCls}>
                        {issueTypes.length > 0
                            ? issueTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)
                            : ['Story', 'Bug', 'Task'].map(t => <option key={t}>{t}</option>)
                        }
                    </select>
                </div>
            </div>

            <div>
                <label className={labelCls}>Resumen *</label>
                <input value={summary} onChange={e => setSummary(e.target.value)} required placeholder="Resumen del issue..." className={inputCls} />
            </div>

            <div>
                <label className={labelCls}>Descripción</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
                    placeholder="Descripción detallada..." className={`${inputCls} resize-none`} />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>Asignado a</label>
                    <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls}>
                        <option value="">— Sin asignar —</option>
                        {users.map(u => <option key={u.accountId} value={u.accountId}>{u.displayName}</option>)}
                        {users.length === 0 && assigneeId && <option value={assigneeId}>{assigneeId}</option>}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Prioridad</label>
                    <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                        {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            <div>
                <label className={labelCls}>Labels (separados por coma)</label>
                <input value={labels} onChange={e => setLabels(e.target.value)} placeholder="frontend, bug" className={inputCls} />
            </div>

            {Object.keys(cfg.customFields).length > 0 && (
                <div className="p-3 bg-slate-800/40 rounded-lg text-xs text-slate-400">
                    <span className="font-bold">Campos personalizados que se enviarán: </span>
                    {Object.keys(cfg.customFields).join(', ')}
                </div>
            )}

            <button type="submit" disabled={submitting || !summary.trim()}
                className="w-full py-2.5 rounded-lg bg-nexus-accent hover:bg-opacity-80 text-white font-bold text-sm transition-colors disabled:opacity-50">
                {submitting ? <RefreshCw size={14} className="inline animate-spin mr-2" /> : null}
                {submitting ? 'Creando...' : 'Crear Issue'}
            </button>
        </form>
    );
}

// ── Board View ─────────────────────────────────────────────────────────────────

function BoardView() {
    const cfg = loadConfig();
    const [issues, setIssues] = useState<JiraIssue[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<BoardFilter>('mine');
    const [selected, setSelected] = useState<JiraIssue | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let data: JiraIssue[];
            if (filter === 'mine') data = await getMyIssues();
            else data = await getProjectIssues(cfg.defaultProject || 'defaultProject');
            setIssues(data);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [filter, cfg.defaultProject]);

    useEffect(() => { load(); }, [load]);

    const filtered = issues.filter(i =>
        !search || i.key.toLowerCase().includes(search.toLowerCase()) ||
        i.fields.summary.toLowerCase().includes(search.toLowerCase())
    );

    const filterBtns: { id: BoardFilter; label: string }[] = [
        { id: 'mine', label: 'Mis Issues' },
        { id: 'project', label: `Proyecto (${cfg.defaultProject || '—'})` },
    ];

    if (!cfg.baseUrl) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500 p-12">
                <AlertCircle size={40} />
                <p className="text-sm text-center">Jira no está configurado.<br />Ve a <strong className="text-slate-300">Settings</strong> para agregar tus credenciales.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900/50 shrink-0 flex-wrap">
                <div className="relative flex-1 min-w-40">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar issues..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-7 pr-7 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                    />
                    {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X size={11} /></button>}
                </div>
                {filterBtns.map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${filter === f.id ? 'bg-nexus-neon text-nexus-darker border-transparent' : 'text-slate-400 border-slate-700 hover:border-slate-500'}`}>
                        {f.label}
                    </button>
                ))}
                <button onClick={load} disabled={loading} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors">
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                </button>
                <span className="text-[10px] text-slate-600">{filtered.length} issues</span>
            </div>

            {/* Issues */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-2">
                {error && (
                    <div className="p-3 bg-nexus-danger/10 border border-nexus-danger/30 rounded-lg text-nexus-danger text-xs flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                {loading && !issues.length ? (
                    <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
                        <RefreshCw size={16} className="animate-spin" /> Cargando issues...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center text-slate-600 py-16 text-sm">No se encontraron issues.</div>
                ) : (
                    filtered.map(issue => (
                        <IssueCard key={issue.id} issue={issue} onClick={() => setSelected(issue)} />
                    ))
                )}
            </div>

            {selected && <IssueDetailModal issue={selected} onClose={() => setSelected(null)} />}
        </div>
    );
}

// ── Main JiraPanel ─────────────────────────────────────────────────────────────

export const JiraPanel: React.FC = () => {
    const [tab, setTab] = useState<Tab>('board');
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'board', label: 'Board', icon: <Layers size={14} /> },
        { id: 'stories', label: 'Stories', icon: <Pin size={14} /> },
        { id: 'create', label: 'Crear Issue', icon: <Plus size={14} /> },
        { id: 'settings', label: 'Configuración', icon: <Settings size={14} /> },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${tab === t.id
                            ? 'border-nexus-neon text-white'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}>
                        {t.icon}{t.label}
                    </button>
                ))}
                {successMsg && (
                    <div className="ml-auto flex items-center gap-1.5 text-xs text-nexus-success">
                        <CheckCircle size={13} /> {successMsg}
                        <button onClick={() => setSuccessMsg(null)} className="ml-1 text-slate-500 hover:text-slate-300"><X size={11} /></button>
                    </div>
                )}
            </div>

            {/* Content */}
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
                {tab === 'settings' && (
                    <div className="h-full overflow-y-auto scrollbar-hide">
                        <SettingsPanel onSaved={() => {
                            setSuccessMsg('Configuración guardada');
                            setTab('board');
                        }} />
                    </div>
                )}
            </div>
        </div>
    );
};
