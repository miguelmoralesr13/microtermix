import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Zap, RefreshCw, X, Check, ChevronDown } from 'lucide-react';
import {
    JiraIssue, createSubTask, transitionIssue, getIssue, loadConfig,
    getProjects, getEpics, getStoriesByEpic, getActivityOptions,
} from './jiraApi';
import { TempoLogModal } from './TempoLogModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GitJiraConfig {
    projectKey: string;
    epicKey: string;
    storyKey: string;
    activityId: string;
    activityValue: string;
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
    return `nexus-jira-git-${projectPath.replace(/[/\\:]/g, '_')}`;
}

function loadGitJiraConfig(projectPath: string): GitJiraConfig {
    try {
        const raw = localStorage.getItem(configKey(projectPath));
        if (!raw) return { projectKey: '', epicKey: '', storyKey: '', activityId: '', activityValue: '' };
        return { projectKey: '', epicKey: '', storyKey: '', activityId: '', activityValue: '', ...JSON.parse(raw) };
    } catch {
        return { projectKey: '', epicKey: '', storyKey: '', activityId: '', activityValue: '' };
    }
}

function saveGitJiraConfig(projectPath: string, cfg: GitJiraConfig): void {
    localStorage.setItem(configKey(projectPath), JSON.stringify(cfg));
}

function isConfigComplete(cfg: GitJiraConfig): boolean {
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
    label, value, options, loading, disabled, placeholder, onChange,
}: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    loading?: boolean;
    disabled?: boolean;
    placeholder: string;
    onChange: (v: string) => void;
}) {
    return (
        <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
            <div className="relative">
                <select
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    disabled={disabled || loading}
                    className="w-full appearance-none bg-slate-950 border border-slate-700 rounded px-2 py-1.5 pr-6 text-xs text-slate-100 focus:outline-none focus:border-nexus-accent disabled:text-slate-600 disabled:cursor-not-allowed font-mono"
                >
                    <option value="">{loading ? 'Cargando…' : placeholder}</option>
                    {options.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <div className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500">
                    {loading ? <RefreshCw size={10} className="animate-spin" /> : <ChevronDown size={10} />}
                </div>
            </div>
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

    const gearRef = useRef<HTMLButtonElement>(null);
    const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null);

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
            .then(list => setProjects(list.map(p => ({ value: p.key, label: `${p.key} — ${p.name}` }))))
            .catch(() => setProjects([]))
            .finally(() => setLoadingProjects(false));
    }, [showPopover]);

    // Load epics when draft.projectKey changes
    useEffect(() => {
        if (!draft.projectKey) { setEpics([]); return; }
        setLoadingEpics(true);
        setEpics([]);
        getEpics(draft.projectKey)
            .then(list => setEpics(list.map(e => ({ value: e.key, label: `${e.key} — ${e.fields.summary}` }))))
            .catch(() => setEpics([]))
            .finally(() => setLoadingEpics(false));
    }, [draft.projectKey]);

    // Load stories when draft.epicKey changes
    useEffect(() => {
        if (!draft.epicKey) { setStories([]); return; }
        setLoadingStories(true);
        setStories([]);
        getStoriesByEpic(draft.epicKey)
            .then(list => setStories(list.map(s => ({ value: s.key, label: `${s.key} — ${s.fields.summary}` }))))
            .catch(() => setStories([]))
            .finally(() => setLoadingStories(false));
    }, [draft.epicKey]);

    // Load activity options when draft.projectKey changes
    useEffect(() => {
        if (!draft.projectKey || !loadConfig().activityFieldId) { setActivityOpts([]); return; }
        setLoadingActivities(true);
        setActivityOpts([]);
        getActivityOptions(draft.projectKey)
            .then(list => setActivityOpts(list))
            .catch(() => setActivityOpts([]))
            .finally(() => setLoadingActivities(false));
    }, [draft.projectKey]);

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
            setFlowStep('creating');
            const created = await createSubTask(config.storyKey, commitMessage, undefined,
                config.activityId ? { id: config.activityId, value: config.activityValue } : undefined,
            );
            const taskKey = created.key;

            setFlowStep('transitioning');
            try {
                await transitionIssue(taskKey, 'Working');
            } catch {
                // non-blocking
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
            const pushResult: any = await invoke('git_execute', {
                projectPath,
                args: ['push', 'origin', branch],
            });
            if (!pushResult.success) {
                throw new Error(pushResult.stderr || 'Git push failed');
            }

            setFlowStep('closing');
            try {
                await transitionIssue(createdTask.key, 'Released');
            } catch {
                // non-blocking
            }

            setFlowStep('done');
            setCreatedTask(null);
            onSuccess();
        } catch (e: any) {
            setErrorMsg(e?.message ?? 'Error al hacer push');
            setFlowStep('error');
        }
    };

    const handleTempoClose = () => {
        setCreatedTask(null);
        setFlowStep('idle');
        onSuccess();
    };

    const openPopover = () => {
        if (gearRef.current) {
            const rect = gearRef.current.getBoundingClientRect();
            setPopoverPos({
                top: rect.top - 8,   // will be translated upward via transform
                right: window.innerWidth - rect.right,
            });
        }
        setShowPopover(v => !v);
    };

    // Hide entirely if Jira is not configured
    if (!isJiraConnected()) return null;

    return (
        <div className="relative">
            {/* Popover rendered via portal to escape overflow:hidden parents */}
            {showPopover && popoverPos && createPortal(
                <div
                    className="fixed w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[9999] p-4 space-y-3"
                    style={{ top: popoverPos.top, right: popoverPos.right, transform: 'translateY(-100%) translateY(-8px)' }}
                >
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jira Git Config</span>
                        <button onClick={() => setShowPopover(false)} className="text-slate-600 hover:text-slate-300">
                            <X size={12} />
                        </button>
                    </div>

                    <SelectField
                        label="Proyecto"
                        value={draft.projectKey}
                        options={projects}
                        loading={loadingProjects}
                        placeholder="Selecciona un proyecto"
                        onChange={v => setDraft(d => ({ ...d, projectKey: v, epicKey: '', storyKey: '', activityId: '', activityValue: '' }))}
                    />

                    <SelectField
                        label="Épica"
                        value={draft.epicKey}
                        options={epics}
                        loading={loadingEpics}
                        disabled={!draft.projectKey}
                        placeholder={draft.projectKey ? 'Selecciona una épica' : 'Primero selecciona proyecto'}
                        onChange={v => setDraft(d => ({ ...d, epicKey: v, storyKey: '' }))}
                    />

                    <SelectField
                        label="Historia Técnica"
                        value={draft.storyKey}
                        options={stories}
                        loading={loadingStories}
                        disabled={!draft.epicKey}
                        placeholder={draft.epicKey ? 'Selecciona una historia' : 'Primero selecciona épica'}
                        onChange={v => setDraft(d => ({ ...d, storyKey: v }))}
                    />

                    <SelectField
                        label="Tipo de Actividad"
                        value={draft.activityValue}
                        options={activityOpts.map(a => ({ value: a.value, label: a.value }))}
                        loading={loadingActivities}
                        disabled={!draft.projectKey || activityOpts.length === 0}
                        placeholder={draft.projectKey ? 'Selecciona una actividad' : 'Primero selecciona proyecto'}
                        onChange={v => {
                            const found = activityOpts.find(a => a.value === v);
                            setDraft(d => ({ ...d, activityValue: v, activityId: found?.id ?? '' }));
                        }}
                    />

                    <button
                        onClick={handleSaveConfig}
                        disabled={!isConfigComplete(draft)}
                        className="w-full py-1.5 text-xs font-bold bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40 hover:bg-nexus-accent/30 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                        <Check size={11} /> Guardar
                    </button>
                </div>,
                document.body,
            )}

            <div className="flex items-center gap-1.5 mt-2">
                <button
                    ref={gearRef}
                    onClick={openPopover}
                    title="Configurar Jira Git"
                    className={`p-1.5 rounded transition-colors ${isConfigComplete(config) ? 'text-nexus-accent hover:bg-nexus-accent/10' : 'text-slate-600 hover:text-slate-400'}`}
                >
                    <Settings size={14} />
                </button>

                {isConfigComplete(config) && (
                    <button
                        onClick={handleCommitAndPush}
                        disabled={!canCommit}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-nexus-neon text-xs font-bold rounded border border-nexus-neon/20 hover:border-nexus-neon/40 transition-all"
                    >
                        {isRunning
                            ? <><RefreshCw size={12} className="animate-spin" />{stepLabel(flowStep)}</>
                            : <><Zap size={13} />{stepLabel('idle')}</>
                        }
                    </button>
                )}
            </div>


            {flowStep === 'error' && errorMsg && (
                <p className="text-[10px] text-nexus-danger mt-1 leading-snug">{errorMsg}</p>
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
