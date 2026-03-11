import { useState, useEffect, useCallback } from 'react';
import { useJiraStore } from '../../stores/jiraStore';
import { RefreshCw, Search, X, AlertCircle } from 'lucide-react';
import {
    JiraIssue, loadConfig,
    getProjects, getIssueTypes, getUsers,
    getEpics, getBoardIssues, BoardFilter,
    getProjectStatuses,
} from '../jiraApi';
import { IssueCard } from './IssueCard';
import { IssueDetailModal } from './IssueDetailModal';
import { MultiSelect } from './MultiSelect';

export function BoardView() {
    const cfg = loadConfig();
    const [issues, setIssues] = useState<JiraIssue[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<JiraIssue | null>(null);

    // Board filter + project from Zustand store (persisted automatically)
    const filter = useJiraStore(s => s.boardFilter);
    const storeSetFilter = useJiraStore(s => s.setBoardFilter);
    const projectKey = useJiraStore(s => s.boardProjectKey) || cfg.defaultProject;
    const storeSetProjectKey = useJiraStore(s => s.setBoardProjectKey);

    const setFilter = (f: BoardFilter) => storeSetFilter(f);
    const setProjectKey = (key: string) => storeSetProjectKey(key);

    const [searchInput, setSearchInput] = useState(filter.text ?? '');
    const [projects, setProjects] = useState<{ key: string; name: string }[]>([]);
    const [projectIssueTypes, setProjectIssueTypes] = useState<{ id: string; name: string }[]>([]);
    const [projectStatuses, setProjectStatuses] = useState<string[]>([]);
    const [projectEpics, setProjectEpics] = useState<JiraIssue[]>([]);
    const [projectAssignees, setProjectAssignees] = useState<{ value: string; label: string }[]>([]);

    // Accumulate labels across loads so options don't disappear when filter changes
    const [allLabels, setAllLabels] = useState<string[]>([]);
    useEffect(() => {
        const newLabels = issues.flatMap(i => (i.fields as any).labels ?? []) as string[];
        if (newLabels.length === 0) return;
        setAllLabels(prev => [...new Set([...prev, ...newLabels])].sort());
    }, [issues]);
    const labelOptions = allLabels.map(l => ({ value: l, label: l }));

    const PRIORITIES = [
        { value: 'Highest', label: '🔴 Highest' },
        { value: 'High', label: '🟠 High' },
        { value: 'Medium', label: '🟡 Medium' },
        { value: 'Low', label: '🔵 Low' },
        { value: 'Lowest', label: '⚪ Lowest' },
    ];

    // Load projects once
    useEffect(() => { getProjects().then(setProjects).catch(() => { }); }, []);

    // Load project metadata when project changes
    useEffect(() => {
        if (!projectKey) return;
        setProjectAssignees([]);
        setAllLabels([]);
        Promise.all([
            getIssueTypes(projectKey).catch(() => [] as { id: string; name: string }[]),
            getProjectStatuses(projectKey).catch(() => [] as string[]),
            getEpics(projectKey).catch(() => [] as JiraIssue[]),
            getUsers(projectKey).catch(() => [] as { accountId: string; displayName: string }[]),
        ]).then(([types, statuses, epics, users]) => {
            setProjectIssueTypes(types);
            setProjectStatuses(statuses);
            setProjectEpics(epics);
            setProjectAssignees(users.map(u => ({ value: u.accountId, label: u.displayName })));
        });
    }, [projectKey]);

    const load = useCallback(async () => {
        if (!projectKey) { setError('Falta seleccionar un proyecto'); return; }
        setLoading(true);
        setError(null);
        try {
            setIssues(await getBoardIssues(projectKey, filter));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [filter, projectKey]);

    useEffect(() => { load(); }, [load]);

    const hasFilters = !!(
        filter.assignees?.length || filter.issueTypes?.length || filter.statuses?.length ||
        filter.priorities?.length || filter.labels?.length || filter.epicKeys?.length || filter.text
    );
    const resetFilters = () => { setSearchInput(''); setFilter({ assignees: ['me'] }); };

    if (!cfg.baseUrl) return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500 p-12">
            <AlertCircle size={40} />
            <p className="text-sm text-center">Jira no está configurado.<br />Ve a <strong className="text-slate-300">Settings</strong> para agregar tus credenciales.</p>
        </div>
    );

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/50 shrink-0">
                {/* Row 1: project, search, actions */}
                <div className="flex items-center gap-2">
                    <select
                        value={projectKey || ''}
                        onChange={e => { setProjectKey(e.target.value); setFilter({ ...filter, issueTypes: [], epicKeys: [] }); }}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[11px] font-bold text-nexus-neon focus:outline-none focus:border-nexus-neon"
                    >
                        <option value="">Seleccionar Proyecto...</option>
                        {projects.map(p => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)}
                    </select>

                    <div className="relative flex-1">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') setFilter({ ...filter, text: searchInput || undefined });
                                if (e.key === 'Escape') { setSearchInput(''); setFilter({ ...filter, text: undefined }); }
                            }}
                            placeholder="Buscar título o clave... ↵"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-7 pr-7 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                        />
                        {searchInput && (
                            <button onClick={() => { setSearchInput(''); setFilter({ ...filter, text: undefined }); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                                <X size={11} />
                            </button>
                        )}
                    </div>

                    {hasFilters && (
                        <button onClick={resetFilters}
                            className="text-[10px] text-nexus-neon flex items-center gap-1 border border-nexus-neon/30 bg-nexus-neon/10 px-2 py-1.5 rounded whitespace-nowrap">
                            <X size={10} /> Reset
                        </button>
                    )}
                    <button onClick={load} disabled={loading}
                        className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded border border-slate-700 bg-slate-950">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Row 2: multi-select filters */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <MultiSelect
                        label="Asignado"
                        options={[{ value: 'me', label: '👤 Yo' }, { value: 'unassigned', label: '— Sin asignar' }, ...projectAssignees]}
                        selected={filter.assignees ?? []}
                        onChange={v => setFilter({ ...filter, assignees: v })}
                    />
                    <MultiSelect
                        label="Tipo"
                        options={projectIssueTypes.map(t => ({ value: t.name, label: t.name }))}
                        selected={filter.issueTypes ?? []}
                        onChange={v => setFilter({ ...filter, issueTypes: v })}
                    />
                    <MultiSelect
                        label="Estado"
                        options={projectStatuses.map(s => ({ value: s, label: s }))}
                        selected={filter.statuses ?? []}
                        onChange={v => setFilter({ ...filter, statuses: v })}
                    />
                    <MultiSelect
                        label="Prioridad"
                        options={PRIORITIES}
                        selected={filter.priorities ?? []}
                        onChange={v => setFilter({ ...filter, priorities: v })}
                    />
                    <MultiSelect
                        label="Épica"
                        options={projectEpics.map(e => ({ value: e.key, label: `${e.key} — ${e.fields.summary}` }))}
                        selected={filter.epicKeys ?? []}
                        onChange={v => setFilter({ ...filter, epicKeys: v })}
                    />
                    {labelOptions.length > 0 && (
                        <MultiSelect
                            label="Label"
                            options={labelOptions}
                            selected={filter.labels ?? []}
                            onChange={v => setFilter({ ...filter, labels: v })}
                        />
                    )}
                    <span className="ml-auto text-[10px] text-slate-600 font-bold uppercase tracking-wider">
                        {issues.length} resultados
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-2 bg-slate-950">
                {error && (
                    <div className="p-3 bg-nexus-danger/10 border border-nexus-danger/30 rounded-lg text-nexus-danger text-xs flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                {loading && !issues.length ? (
                    <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
                        <RefreshCw size={16} className="animate-spin" /> Cargando tablero...
                    </div>
                ) : issues.length === 0 ? (
                    <div className="text-center text-slate-500 py-16 text-[13px] border border-dashed border-slate-800 rounded-xl m-4 bg-slate-900/40">
                        No se encontraron issues con los filtros actuales en {projectKey || 'el proyecto'}.
                        {hasFilters && <p className="mt-2"><button onClick={resetFilters} className="text-nexus-neon underline decoration-nexus-neon/30 hover:decoration-nexus-neon">Restablecer filtros</button></p>}
                    </div>
                ) : (
                    issues.map(issue => <IssueCard key={issue.id} issue={issue} onClick={() => setSelected(issue)} />)
                )}
            </div>

            {selected && <IssueDetailModal issue={selected} onClose={() => setSelected(null)} />}
        </div>
    );
}
