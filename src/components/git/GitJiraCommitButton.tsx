import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Zap, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
    JiraIssue, createSubTask, transitionIssue, getIssue, loadConfig,
    getProjects, getEpics, getStoriesByEpic, getActivityOptions, getLastWorkingIssue
} from '../jira/jiraApi';
import { TempoLogModal } from '../jira/TempoLogModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components//ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components//ui/select';
import { Button } from '@/components//ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GitJiraConfig {
    projectKey: string;
    epicKey: string;
    storyKey: string;
    activityId: string;
    activityValue: string;
    createTask: boolean;
}

type FlowStep =
    | 'idle'
    | 'creating'
    | 'transitioning'
    | 'committing'
    | 'tempo'
    | 'pushing'
    | 'closing'
    | 'done'
    | 'error';

interface GitJiraCommitButtonProps {
    projectPath: string;
    commitMessage: string;
    isAnythingStaged: boolean;
    currentBranch: string;
    onSuccess: () => void;
}

// ── Config storage ────────────────────────────────────────────────────────────

function configKey(projectPath: string): string {
    return `microtermix-jira-git-${projectPath.replace(/[/\\:]/g, '_')}`;
}

function loadGitJiraConfig(projectPath: string): GitJiraConfig {
    try {
        const raw = localStorage.getItem(configKey(projectPath));
        if (!raw) return { projectKey: '', epicKey: '', storyKey: '', activityId: '', activityValue: '', createTask: true };
        return { projectKey: '', epicKey: '', storyKey: '', activityId: '', activityValue: '', createTask: true, ...JSON.parse(raw) };
    } catch {
        return { projectKey: '', epicKey: '', storyKey: '', activityId: '', activityValue: '', createTask: true };
    }
}

function saveGitJiraConfig(projectPath: string, cfg: GitJiraConfig): void {
    localStorage.setItem(configKey(projectPath), JSON.stringify(cfg));
}

function isConfigComplete(cfg: GitJiraConfig): boolean {
    if (!cfg.createTask) return !!cfg.projectKey.trim(); // Solo proyecto para contexto si no crea
    return !!cfg.projectKey.trim() && !!cfg.epicKey.trim() && !!cfg.storyKey.trim() && !!cfg.activityValue.trim();
}

function isJiraConnected(): boolean {
    const cfg = loadConfig();
    return !!cfg.baseUrl.trim() && !!cfg.email.trim() && !!cfg.apiToken.trim();
}

// ── Step label ────────────────────────────────────────────────────────────────

function stepLabel(step: FlowStep): string {
    switch (step) {
        case 'creating': return 'Creando tarea…';
        case 'transitioning': return 'Activando tarea…';
        case 'committing': return 'Haciendo commit…';
        case 'pushing': return 'Haciendo push…';
        case 'closing': return 'Cerrando tarea…';
        default: return '⚡ Commit & Push';
    }
}

// ── Select helper ─────────────────────────────────────────────────────────────

function SelectField({
    label, value, options, loading, disabled, placeholder, onChange, showFilter
}: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    loading?: boolean;
    disabled?: boolean;
    placeholder: string;
    onChange: (v: string) => void;
    showFilter?: boolean;
}) {
    const [filter, setFilter] = useState('');
    const filteredOptions = options.filter(o => o.label.toLowerCase().includes(filter.toLowerCase()));
    return (
        <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
            <Select
                value={value || null}
                onValueChange={(val: string | null) => onChange(val || '')}
                disabled={disabled || loading}
            >
                <SelectTrigger className="w-full h-8 bg-slate-950 border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:ring-microtermix-accent [&>span]:truncate text-left">
                    <SelectValue placeholder={loading ? 'Cargando…' : placeholder} />
                </SelectTrigger>
                <SelectContent className="max-h-72 min-w-[340px] w-[--anchor-width]">
                    {showFilter && options.length > 5 && (
                        <div className="p-1 pb-2 sticky top-0 bg-popover z-10 border-b border-slate-800">
                            <input
                                className="w-full bg-slate-950 border border-slate-700 text-xs text-slate-200 px-2 py-1.5 rounded focus:outline-none focus:border-microtermix-accent font-sans"
                                placeholder="Filtrar..."
                                value={filter}
                                onChange={e => setFilter(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => e.stopPropagation()}
                            />
                        </div>
                    )}
                    {filteredOptions.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500 text-center">No hay resultados</div>
                    ) : (
                        filteredOptions.map(o => (
                            <SelectItem key={o.value} value={o.value}>
                                <span className="text-xs whitespace-normal block leading-tight py-0.5">{o.label}</span>
                            </SelectItem>
                        ))
                    )}
                </SelectContent>
            </Select>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export const GitJiraCommitButton: React.FC<GitJiraCommitButtonProps> = ({
    projectPath,
    commitMessage,
    isAnythingStaged,
    currentBranch,
    onSuccess,
}) => {
    const [config, setConfig] = useState<GitJiraConfig>(() => loadGitJiraConfig(projectPath));
    const [draft, setDraft] = useState<GitJiraConfig>(() => loadGitJiraConfig(projectPath));
    const [showPopover, setShowPopover] = useState(false);
    const [flowStep, setFlowStep] = useState<FlowStep>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [createdTask, setCreatedTask] = useState<JiraIssue | null>(null);

    // Cascading select data
    const [projects, setProjects] = useState<{ value: string; label: string }[]>([]);
    const [epics, setEpics] = useState<{ value: string; label: string }[]>([]);
    const [stories, setStories] = useState<{ value: string; label: string }[]>([]);
    const [activityOpts, setActivityOpts] = useState<{ id: string; value: string }[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(false);
    const [loadingEpics, setLoadingEpics] = useState(false);
    const [loadingStories, setLoadingStories] = useState(false);
    const [loadingActivities, setLoadingActivities] = useState(false);

    // Reset flow state when project changes
    useEffect(() => {
        const cfg = loadGitJiraConfig(projectPath);
        setConfig(cfg);
        setDraft(cfg);
        setFlowStep('idle');
        setErrorMsg(null);
        setCreatedTask(null);
    }, [projectPath]);

    // Load projects when popover opens
    useEffect(() => {
        if (!showPopover) return;
        setLoadingProjects(true);
        getProjects()
            .then((list: any[]) => setProjects(list.map(p => ({ value: p.key, label: `[${p.key}] ${p.name}` }))))
            .catch(() => setProjects([]))
            .finally(() => setLoadingProjects(false));
    }, [showPopover]);

    // Load epics when draft.projectKey changes
    useEffect(() => {
        if (!draft.projectKey) { setEpics([]); return; }
        setLoadingEpics(true);
        setEpics([]);
        getEpics(draft.projectKey)
            .then((list: any[]) => setEpics(list.map(e => ({ value: e.key, label: `[${e.key}] ${e.fields.summary}` }))))
            .catch(() => setEpics([]))
            .finally(() => setLoadingEpics(false));
    }, [draft.projectKey]);

    // Load stories when draft.epicKey changes
    useEffect(() => {
        if (!draft.epicKey) { setStories([]); return; }
        setLoadingStories(true);
        setStories([]);
        getStoriesByEpic(draft.epicKey)
            .then((list: any[]) => setStories(list.map(s => ({ value: s.key, label: `[${s.key}] ${s.fields.summary}` }))))
            .catch(() => setStories([]))
            .finally(() => setLoadingStories(false));
    }, [draft.epicKey]);

    // Load activity options based on the selected story's project
    useEffect(() => {
        const proj = draft.storyKey?.includes('-') ? draft.storyKey.split('-')[0] : draft.projectKey;
        if (!proj || !loadConfig().activityFieldId) { setActivityOpts([]); return; }
        setLoadingActivities(true);
        setActivityOpts([]);
        getActivityOptions(proj)
            .then((list: any[]) => setActivityOpts(list))
            .catch(() => setActivityOpts([]))
            .finally(() => setLoadingActivities(false));
    }, [draft.storyKey, draft.projectKey]);

    const isRunning = flowStep !== 'idle' && flowStep !== 'done' && flowStep !== 'error' && flowStep !== 'tempo';
    const jiraCfg = loadConfig();
    const canCommit = isAnythingStaged && !!commitMessage.trim() && isConfigComplete(config) && !isRunning;

    const handleSaveConfig = () => {
        saveGitJiraConfig(projectPath, draft);
        setConfig(draft);
        setShowPopover(false);
    };

    const handleCommitAndPush = async () => {
        if (!canCommit) return;
        setErrorMsg(null);

        try {
            let taskKey = '';

            if (config.createTask) {
                setFlowStep('creating');
                const created = await createSubTask(config.storyKey, commitMessage, undefined,
                    config.activityId ? { id: config.activityId, value: config.activityValue } : undefined,
                );
                taskKey = created.key;
            } else {
                setFlowStep('transitioning'); // Buscando/Usando existente
                const lastWorking = await getLastWorkingIssue(config.storyKey);
                if (!lastWorking) {
                    throw new Error(`No se encontró ninguna tarea propia en "Working" dentro de la historia ${config.storyKey}.`);
                }
                taskKey = lastWorking.key;
            }

            if (config.createTask) {
                setFlowStep('transitioning');
                try {
                    // Force the status to uppercase WORKING to match the GitLab hooks
                    await transitionIssue(taskKey, 'WORKING');
                    toast.success(`Tarea ${taskKey} activada en WORKING`);
                    // Small delay to ensure Jira reflects the change for the remote hooks
                    await new Promise(r => setTimeout(r, 2000));
                } catch (e: any) {
                    console.warn('[GitJira] Transition to WORKING failed:', e);
                    toast.warning(`No se pudo activar la tarea: ${e?.message}`);
                }
            }

            setFlowStep('committing');
            const prefixedMessage = `${taskKey} ${commitMessage}`;
            const commitResult: any = await invoke('git_execute', {
                projectPath,
                args: ['commit', '-m', prefixedMessage],
            });
            if (!commitResult.success) {
                throw new Error(commitResult.stderr || 'Git commit failed');
            }

            // Safety delay after commit
            await new Promise(r => setTimeout(r, 1000));

            const fullIssue = await getIssue(taskKey);
            setCreatedTask(fullIssue);
            setFlowStep('tempo');
        } catch (e: any) {
            setErrorMsg(e?.message ?? 'Error en el flujo de commit');
            setFlowStep('error');
        }
    };

    const handleTempoSuccess = async () => {
        if (!createdTask) return;
        try {
            setFlowStep('pushing');
            const branch = currentBranch || 'main';
            console.log(`[GitJira] Pushing branch ${branch} (origin HEAD) to remote...`);
            toast.info(`Subiendo código a origin HEAD...`);

            const pushResult: any = await invoke('git_execute', {
                projectPath,
                args: ['push', 'origin', 'HEAD'],
            });

            const combinedOutput = (pushResult.stdout + '\n' + pushResult.stderr).toLowerCase();
            const hasError = !pushResult.success ||
                combinedOutput.includes('rejected') ||
                combinedOutput.includes('error:') ||
                combinedOutput.includes('failed');

            if (hasError) {
                console.error('[GitJira] Push failed with output:', pushResult.stderr || pushResult.stdout);
                toast.error(`Error en Push: ${pushResult.stderr || 'El servidor rechazó el push'}`);
                setFlowStep('error');
                setErrorMsg(pushResult.stderr?.slice(0, 200) || 'Push rechazado por el servidor (GL-HOOK-ERR?)');
                return; // INTERRUMPIR: No cerrar tarea si el push no es 100% exitoso
            }

            toast.success('Push completado con éxito');
            setFlowStep('closing');
            
            // Give the user half a second to see the success toast before closing the Jira task
            await new Promise(r => setTimeout(r, 800));

            try {
                await transitionIssue(createdTask.key, 'Released');
                toast.success(`Tarea ${createdTask.key} cerrada (Released)`);
                // Final visual indicator of completion
                await new Promise(r => setTimeout(r, 1000));
            } catch (e: any) {
                console.warn('[GitJira] Could not close task:', e);
                toast.warning(`La tarea quedó abierta (WORKING) pero el código se subió.`);
            }

            setFlowStep('done');
            setCreatedTask(null);
            onSuccess();
        } catch (e: any) {
            console.error('[GitJira] Critical error during push flow:', e);
            toast.error(`Error crítico: ${e?.message}`);
            setErrorMsg(e?.message ?? 'Ocurrió un error inesperado');
            setFlowStep('error');
        }
    };

    const handleTempoClose = () => {
        // Si cierran Tempo sin guardar, simplemente volvemos al estado anterior o error
        // pero NO llamamos a onSuccess porque el flujo no terminó (falta push y cierre)
        setCreatedTask(null);
        setFlowStep('idle');
    };

    if (!isJiraConnected()) return null;

    return (
        <div className="relative">
            <div className="flex items-center gap-1.5 mt-2">
                <Popover open={showPopover} onOpenChange={setShowPopover}>
                    <PopoverTrigger
                        title="Configurar Jira Git"
                        className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${isConfigComplete(config) ? 'text-microtermix-accent hover:bg-microtermix-accent/10' : 'text-slate-600 hover:text-slate-400'}`}
                    >
                        <Settings size={14} />
                    </PopoverTrigger>
                    {showPopover && (
                        <PopoverContent side="top" align="end" className="w-96 bg-slate-900 border-slate-700 p-4 space-y-3 z-[9999]" sideOffset={8}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jira Git Config</span>
                            </div>

                            <SelectField
                                label="Proyecto"
                                value={draft.projectKey}
                                options={projects}
                                loading={loadingProjects}
                                showFilter
                                placeholder="Selecciona un proyecto"
                                onChange={v => setDraft(d => ({ ...d, projectKey: v, epicKey: '', storyKey: '', activityId: '', activityValue: '' }))}
                            />

                            <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <span className="text-[10px] font-bold text-slate-300 uppercase">Crear nueva sub-tarea</span>
                                <button
                                    onClick={() => setDraft(d => ({ ...d, createTask: !d.createTask }))}
                                    className={`w-8 h-4 rounded-full relative transition-colors ${draft.createTask ? 'bg-microtermix-neon' : 'bg-slate-700'}`}
                                >
                                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${draft.createTask ? 'left-[18px]' : 'left-0.5'}`} />
                                </button>
                            </div>

                            {draft.createTask && (
                                <>
                                    <SelectField
                                        label="Épica"
                                        value={draft.epicKey}
                                        options={epics}
                                        loading={loadingEpics}
                                        disabled={!draft.projectKey}
                                        showFilter
                                        placeholder={draft.projectKey ? 'Selecciona una épica' : 'Primero selecciona proyecto'}
                                        onChange={v => setDraft(d => ({ ...d, epicKey: v, storyKey: '' }))}
                                    />

                                    <SelectField
                                        label="Historia Técnica"
                                        value={draft.storyKey}
                                        options={stories}
                                        loading={loadingStories}
                                        disabled={!draft.epicKey}
                                        showFilter
                                        placeholder={draft.epicKey ? 'Selecciona una historia' : 'Primero selecciona épica'}
                                        onChange={v => setDraft(d => ({ ...d, storyKey: v }))}
                                    />

                                    <SelectField
                                        label="Tipo de Actividad"
                                        value={draft.activityValue}
                                        options={activityOpts.map(a => ({ value: a.value, label: a.value }))}
                                        loading={loadingActivities}
                                        disabled={!draft.projectKey || activityOpts.length === 0}
                                        placeholder={draft.projectKey ? 'Selecciona una actividad' : 'Primero elige un proyecto'}
                                        onChange={v => {
                                            const found = activityOpts.find(a => a.value === v);
                                            setDraft(d => ({ ...d, activityValue: v, activityId: found?.id ?? '' }));
                                        }}
                                    />
                                </>
                            )}

                            <Button
                                onClick={handleSaveConfig}
                                disabled={!isConfigComplete(draft)}
                                className="w-full h-8 text-xs font-bold bg-microtermix-accent/20 text-microtermix-accent border border-microtermix-accent/40 hover:bg-microtermix-accent/30 rounded-lg"
                            >
                                <Check size={11} className="mr-1" /> Guardar
                            </Button>
                        </PopoverContent>
                    )}
                </Popover>

                {isConfigComplete(config) && (
                    <Button
                        onClick={handleCommitAndPush}
                        disabled={!canCommit}
                        className="flex-1 h-8 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 text-microtermix-neon text-xs font-bold rounded border border-microtermix-neon/20 hover:border-microtermix-neon/40 transition-all font-sans"
                    >
                        {isRunning
                            ? <><RefreshCw size={12} className="animate-spin mr-1.5" />{stepLabel(flowStep)}</>
                            : <><Zap size={13} className="mr-1.5" />{stepLabel('idle')}</>
                        }
                    </Button>
                )}
            </div>


            {flowStep === 'error' && errorMsg && (
                <div className="flex items-start gap-1.5 text-[10px] text-microtermix-danger mt-2 bg-microtermix-danger/5 p-1.5 rounded border border-microtermix-danger/10 animate-in fade-in slide-in-from-top-1">
                    <AlertCircle size={12} className="shrink-0 mt-0.5" />
                    <p className="leading-snug">{errorMsg}</p>
                </div>
            )}

            {flowStep === 'error' && createdTask && (
                <Button
                    onClick={handleTempoSuccess}
                    className="w-full h-8 mt-2 bg-microtermix-accent hover:bg-microtermix-accent/80 text-white text-xs font-bold rounded flex items-center justify-center font-sans"
                >
                    <RefreshCw size={12} className="mr-1.5" /> Reintentar Push & Cerrar
                </Button>
            )}

            {flowStep === 'tempo' && createdTask && (
                <TempoLogModal
                    issue={createdTask}
                    authorAccountId={jiraCfg.defaultAssigneeId}
                    onClose={handleTempoClose}
                    onSuccess={handleTempoSuccess}
                />
            )}
        </div>
    );
};
