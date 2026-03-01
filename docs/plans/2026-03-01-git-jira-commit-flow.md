# Git + Jira Commit Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "⚡ Commit & Push" button to the Git staging panel that creates a Jira task, commits with the task key prefixed, shows the Tempo time log modal, then pushes and closes the task on confirm.

**Architecture:** New self-contained `GitJiraCommitButton` component with its own config popover (localStorage per project) and step-by-step flow state machine. `GitStagingPanel` reads the current branch and renders the new button alongside the existing commit button. Reuses `TempoLogModal` and existing `jiraApi` functions.

**Tech Stack:** React 19, TypeScript, TailwindCSS v4, Tauri v2 (`invoke('git_execute')`), existing `jiraApi.ts` + `TempoLogModal.tsx`

---

## Task 1: Add `getIssueByKey` to `jiraApi.ts`

**Files:**
- Modify: `src/components/jiraApi.ts`

`TempoLogModal` requires a full `JiraIssue` object (with `id`, `key`, `fields.summary`, `fields.status`). After `createSubTask` we only get `{ id, key }`. We need to load the full issue.

### Step 1 — Locate the `getIssue` function

Search for `export async function getIssue` in `src/components/jiraApi.ts` (around line 296).

It currently exists but only returns `any`. We need a typed version that returns `JiraIssue`.

### Step 2 — Add `getIssueByKey` after `getIssue`

Find this existing function (around line 296):
```ts
export async function getIssue(key: string): Promise<JiraIssue> {
    return jiraFetch(`/issue/${key}`);
}
```

This already exists and returns `JiraIssue`. **No change needed to jiraApi.ts** — use the existing `getIssue(key)` function directly. Skip to Task 2.

> **Note:** If `getIssue` does not return a properly typed `JiraIssue` (check the return: it uses `jiraFetch` which returns `any`), add this typed wrapper after it:
>
> ```ts
> export async function getIssueByKey(key: string): Promise<JiraIssue> {
>     const data = await jiraFetch(
>         `/issue/${key}?fields=summary,status,issuetype,assignee`
>     );
>     return data as JiraIssue;
> }
> ```

### Step 3 — Verify build

```bash
npm run build
```
Expected: `✓ built` with no TypeScript errors.

---

## Task 2: Create `GitJiraCommitButton.tsx`

**Files:**
- Create: `src/components/GitJiraCommitButton.tsx`

This component handles:
1. Per-project config storage (localStorage)
2. Gear icon → config popover
3. "⚡ Commit & Push" button with full flow state machine
4. Step labels during execution
5. `TempoLogModal` rendered after commit

### Step 1 — Create the file with types and config helpers

```tsx
import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Zap, RefreshCw, X, Check } from 'lucide-react';
import { JiraIssue, createSubTask, transitionIssue, getIssue, loadConfig } from './jiraApi';
import { TempoLogModal } from './TempoLogModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GitJiraConfig {
    projectKey: string;
    epicKey: string;
    storyKey: string;
}

type FlowStep =
    | 'idle'
    | 'creating'    // createSubTask
    | 'transitioning' // transitionIssue → Working
    | 'committing'  // git commit
    | 'tempo'       // TempoLogModal open
    | 'pushing'     // git push
    | 'closing'     // transitionIssue → Released
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
        if (!raw) return { projectKey: '', epicKey: '', storyKey: '' };
        return { projectKey: '', epicKey: '', storyKey: '', ...JSON.parse(raw) };
    } catch {
        return { projectKey: '', epicKey: '', storyKey: '' };
    }
}

function saveGitJiraConfig(projectPath: string, cfg: GitJiraConfig): void {
    localStorage.setItem(configKey(projectPath), JSON.stringify(cfg));
}

function isConfigComplete(cfg: GitJiraConfig): boolean {
    return !!cfg.projectKey.trim() && !!cfg.epicKey.trim() && !!cfg.storyKey.trim();
}
```

### Step 2 — Add step label helper and main component shell

Continue in the same file:

```tsx
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

    // Reload config when projectPath changes
    useEffect(() => {
        const cfg = loadGitJiraConfig(projectPath);
        setConfig(cfg);
        setDraft(cfg);
    }, [projectPath]);

    const isRunning = flowStep !== 'idle' && flowStep !== 'done' && flowStep !== 'error' && flowStep !== 'tempo';
    const canCommit = isAnythingStaged && !!commitMessage.trim() && isConfigComplete(config) && !isRunning;
    const jiraCfg = loadConfig(); // Jira global config for authorAccountId
```

### Step 3 — Add config save handler and popover JSX

Continue in the same file:

```tsx
    const handleSaveConfig = () => {
        saveGitJiraConfig(projectPath, draft);
        setConfig(draft);
        setShowPopover(false);
    };

    const handleCommitAndPush = async () => {
        if (!canCommit) return;
        setErrorMsg(null);
        setFlowStep('idle');

        let taskKey = '';
        let taskId = '';

        try {
            // Step 1: Create Jira task
            setFlowStep('creating');
            const created = await createSubTask(config.storyKey, commitMessage);
            taskKey = created.key;
            taskId = created.id;

            // Step 2: Transition to Working
            setFlowStep('transitioning');
            try {
                await transitionIssue(taskKey, 'Working');
            } catch {
                // Non-blocking — continue even if transition fails
            }

            // Step 3: Git commit with task key prefix
            setFlowStep('committing');
            const prefixedMessage = `${taskKey} ${commitMessage}`;
            const commitResult: any = await invoke('git_execute', {
                projectPath,
                args: ['commit', '-m', prefixedMessage],
            });
            if (!commitResult.success) {
                throw new Error(commitResult.stderr || 'Git commit failed');
            }

            // Step 4: Load full JiraIssue for TempoLogModal
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
            // Step 5: Push
            setFlowStep('pushing');
            const branch = currentBranch || 'main';
            const pushResult: any = await invoke('git_execute', {
                projectPath,
                args: ['push', 'origin', branch],
            });
            if (!pushResult.success) {
                throw new Error(pushResult.stderr || 'Git push failed');
            }

            // Step 6: Close task
            setFlowStep('closing');
            try {
                await transitionIssue(createdTask.key, 'Released');
            } catch {
                // Non-blocking
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
        // User cancelled tempo — commit already done, task in Working
        setCreatedTask(null);
        setFlowStep('idle');
        onSuccess(); // refresh timeline since commit happened
    };
```

### Step 4 — Add JSX render

Continue in the same file:

```tsx
    return (
        <div className="relative">
            {/* Config popover */}
            {showPopover && (
                <div className="absolute bottom-full right-0 mb-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jira Git Config</span>
                        <button onClick={() => setShowPopover(false)} className="text-slate-600 hover:text-slate-300">
                            <X size={12} />
                        </button>
                    </div>
                    {(['projectKey', 'epicKey', 'storyKey'] as const).map(field => (
                        <div key={field}>
                            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                                {field === 'projectKey' ? 'Proyecto (ej. NCPPPMC)' :
                                 field === 'epicKey' ? 'Epic Key (ej. NCPPPMC-100)' :
                                 'Historia Técnica (ej. NCPPPMC-200)'}
                            </label>
                            <input
                                type="text"
                                value={draft[field]}
                                onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-nexus-accent font-mono"
                                placeholder={field === 'projectKey' ? 'PROJ' : 'PROJ-123'}
                            />
                        </div>
                    ))}
                    <button
                        onClick={handleSaveConfig}
                        className="w-full py-1.5 text-xs font-bold bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40 hover:bg-nexus-accent/30 rounded-lg transition-colors flex items-center justify-center gap-1"
                    >
                        <Check size={11} /> Guardar
                    </button>
                </div>
            )}

            <div className="flex items-center gap-1.5 mt-2">
                {/* Gear icon */}
                <button
                    onClick={() => setShowPopover(v => !v)}
                    title="Configurar Jira Git"
                    className={`p-1.5 rounded transition-colors ${isConfigComplete(config) ? 'text-nexus-accent hover:bg-nexus-accent/10' : 'text-slate-600 hover:text-slate-400'}`}
                >
                    <Settings size={14} />
                </button>

                {/* Commit & Push button — only when config is complete */}
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

            {/* Error message */}
            {flowStep === 'error' && errorMsg && (
                <p className="text-[10px] text-nexus-danger mt-1 leading-snug">{errorMsg}</p>
            )}

            {/* Tempo modal */}
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
```

### Step 5 — Verify build

```bash
npm run build
```
Expected: `✓ built` with no TypeScript errors.

---

## Task 3: Wire `GitJiraCommitButton` into `GitStagingPanel.tsx`

**Files:**
- Modify: `src/components/GitStagingPanel.tsx`

### Step 1 — Add `currentBranch` state

In `GitStagingPanel.tsx`, find the state declarations block (around line 212–220). After the existing state declarations, add:

```tsx
const [currentBranch, setCurrentBranch] = useState('');
```

### Step 2 — Add useEffect to load current branch

After the existing `useEffect` hooks in `GitStagingPanel`, add:

```tsx
useEffect(() => {
    if (!projectPath) return;
    invoke<{ stdout: string; success: boolean }>('git_execute', {
        projectPath,
        args: ['branch', '--show-current'],
    }).then(res => {
        if (res.success) setCurrentBranch(res.stdout.trim());
    }).catch(() => {});
}, [projectPath]);
```

### Step 3 — Import `GitJiraCommitButton`

Add to the imports at the top of `GitStagingPanel.tsx` (after the last import line):

```tsx
import { GitJiraCommitButton } from './GitJiraCommitButton';
```

### Step 4 — Render `GitJiraCommitButton` after the commit button

Find the commit button block (around line 497–504):

```tsx
                <button
                    onClick={handleCommit}
                    disabled={isCommitting || !isAnythingStaged || !commitMessage.trim()}
                    className="w-full flex items-center justify-center py-2 bg-nexus-accent hover:bg-opacity-80 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-bold rounded transition-all"
                >
                    <GitCommit size={16} className="mr-2" />
                    {isCommitting ? 'Committing...' : 'Commit'}
                </button>
```

After the closing `</button>`, add:

```tsx
                <GitJiraCommitButton
                    projectPath={projectPath}
                    commitMessage={commitMessage}
                    isAnythingStaged={isAnythingStaged}
                    currentBranch={currentBranch}
                    onSuccess={() => {
                        setCommitMessage('');
                        if (onTimelineRefresh) onTimelineRefresh();
                        if (onStatusRefresh) onStatusRefresh();
                        if (!onTimelineRefresh && !onStatusRefresh) loadStatus();
                    }}
                />
```

### Step 5 — Verify build

```bash
npm run build
```
Expected: `✓ built` with no TypeScript errors in either file.

### Step 6 — Manual smoke test

1. Run `npm run tauri dev`
2. Open the Git panel on a project with staged files
3. Confirm the ⚙️ gear icon appears below the commit button
4. Click ⚙️ → popover opens with 3 fields
5. Fill in projectKey, epicKey, storyKey → Save
6. Confirm "⚡ Commit & Push" button appears
7. Write a commit message, stage files
8. Click "⚡ Commit & Push" → watch step labels change
9. TempoLogModal opens with the created task key
10. Cancel → commit happened, push did not
11. Repeat → confirm time → push executes, task transitions to Released
