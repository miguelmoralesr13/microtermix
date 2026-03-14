import { useState, useEffect, useMemo } from 'react';
import { useJiraStore } from '../../stores/jiraStore';
import { RefreshCw, Search, X, AlertCircle, FilterX, Loader2 } from 'lucide-react';
import { JiraIssue, loadConfig } from '../jiraApi';
import { IssueCard } from './IssueCard';
import { IssueDetailModal } from './IssueDetailModal';
import { MultiSelect } from './MultiSelect';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import { useJiraProjects, useJiraMetadata, useJiraIssues } from '../../hooks/useJira';

export function BoardView() {
    const cfg = loadConfig();
    const [selected, setSelected] = useState<JiraIssue | null>(null);

    // Board filter + project from Zustand store (persisted automatically)
    const boardFilter = useJiraStore(s => s.boardFilter);
    const storeSetFilter = useJiraStore(s => s.setBoardFilter);
    const projectKey = useJiraStore(s => s.boardProjectKey) || cfg.defaultProject;
    const storeSetProjectKey = useJiraStore(s => s.setBoardProjectKey);

    // Stable filter object for TanStack Query keys
    const filter = useMemo(() => boardFilter, [
        boardFilter.assignees,
        boardFilter.issueTypes,
        boardFilter.statuses,
        boardFilter.priorities,
        boardFilter.labels,
        boardFilter.epicKeys,
        boardFilter.text
    ]);

    const setFilter = (f: any) => storeSetFilter(f);
    const setProjectKey = (key: string) => storeSetProjectKey(key);

    const [searchInput, setSearchInput] = useState(filter.text ?? '');

    // ── TanStack Queries ──────────────────────────────────────────────────────
    const { data: projects = [], isLoading: loadingProjects } = useJiraProjects();
    const { 
        issueTypes: { data: issueTypesRaw = [] }, 
        statuses: { data: projectStatuses = [] }, 
        epics: { data: projectEpics = [] }, 
        users: { data: usersRaw = [] },
        isLoading: loadingMetadata 
    } = useJiraMetadata(projectKey);

    const { 
        data: issues = [], 
        isLoading: loadingIssues, 
        isFetching: fetchingIssues,
        error: issuesError,
        refetch: refetchIssues 
    } = useJiraIssues(projectKey, filter);

    const projectAssignees = useMemo(() => 
        usersRaw.map(u => ({ value: u.accountId, label: u.displayName })), 
    [usersRaw]);

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

    const isLoading = loadingProjects || (!!projectKey && loadingIssues && !issues.length);

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-col gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/50 shrink-0">
                {/* Row 1: project, search, actions */}
                <div className="flex items-center gap-2">
                    <select
                        value={projectKey || ''}
                        onChange={e => { setProjectKey(e.target.value); setFilter({ ...filter, issueTypes: [], epicKeys: [] }); }}
                        className="h-8 bg-slate-950 border border-slate-800 rounded-md px-2.5 text-[11px] font-bold text-nexus-neon focus:outline-none focus:border-nexus-neon transition-colors"
                    >
                        <option value="">Seleccionar Proyecto...</option>
                        {projects.map(p => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)}
                    </select>

                    <div className="relative flex-1">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <Input
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') setFilter({ ...filter, text: searchInput || undefined });
                                if (e.key === 'Escape') { setSearchInput(''); setFilter({ ...filter, text: undefined }); }
                            }}
                            placeholder="Buscar título o clave... ↵"
                            className="w-full bg-slate-950 border-slate-800 h-8 pl-7 pr-8 text-xs text-slate-200 placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-nexus-neon"
                        />
                        {searchInput && (
                            <Button 
                                variant="ghost" 
                                size="icon-xs"
                                onClick={() => { setSearchInput(''); setFilter({ ...filter, text: undefined }); }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                <X size={12} />
                            </Button>
                        )}
                    </div>

                    {hasFilters && (
                        <Button 
                            variant="outline" 
                            size="xs"
                            onClick={resetFilters}
                            className="h-8 text-[10px] text-nexus-neon gap-1.5 border-nexus-neon/30 bg-nexus-neon/10 hover:bg-nexus-neon/20 px-3"
                        >
                            <FilterX size={12} /> Reset
                        </Button>
                    )}

                    <Tooltip>
                        <TooltipTrigger render={
                            <Button 
                                variant="outline" 
                                size="icon-xs"
                                onClick={() => refetchIssues()} 
                                disabled={fetchingIssues}
                                className="h-8 w-8 text-slate-500 border-slate-800 bg-slate-950 hover:bg-slate-800 hover:text-slate-200"
                            >
                                <RefreshCw size={13} className={fetchingIssues ? 'animate-spin' : ''} />
                            </Button>
                        } />
                        <TooltipContent>Actualizar tablero</TooltipContent>
                    </Tooltip>
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
                        options={issueTypesRaw.map(t => ({ value: t.name, label: t.name }))}
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
                    
                    <div className="ml-auto flex items-center gap-3">
                        {fetchingIssues && !loadingIssues && (
                            <span className="flex items-center gap-1.5 text-[10px] text-slate-500 animate-pulse">
                                <Loader2 size={10} className="animate-spin" /> Sincronizando...
                            </span>
                        )}
                        <Badge variant="outline" className="bg-slate-900 border-slate-800 text-slate-500 text-[10px] font-bold h-6 px-2 uppercase tracking-tight">
                            {issues.length} resultados
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-2 bg-slate-950">
                {(issuesError) && (
                    <div className="p-3 bg-nexus-danger/10 border border-nexus-danger/30 rounded-lg text-nexus-danger text-xs flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" /> {(issuesError as Error).message}
                    </div>
                )}
                {loadingIssues && !issues.length ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
                        <Loader2 size={32} className="animate-spin text-nexus-neon/40" />
                        <span className="text-sm font-medium animate-pulse">Cargando tablero...</span>
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
