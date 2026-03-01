# Git + Jira Commit Flow — Design

**Date:** 2026-03-01
**Status:** Approved

## Goal

Add a "Commit & Push" button to the Git staging panel that automates the full Jira + Tempo workflow for a commit: creates a task, transitions it, prepends the key to the commit message, logs time, pushes, and closes the task.

## Configuration

**Storage:** `localStorage` key `nexus-jira-git-${pathKey}` per project (same pattern as `nexus-envs-${pathKey}`).

```ts
interface GitJiraConfig {
  projectKey: string;  // e.g. "NCPPPMC"
  epicKey: string;     // e.g. "NCPPPMC-100"
  storyKey: string;    // e.g. "NCPPPMC-200" — parent technical story
}
```

**UI:** A ⚙️ gear icon next to the commit button opens an inline popover with 3 text fields (projectKey, epicKey, storyKey) + Save button. When all 3 are set, the "⚡ Commit & Push" button becomes visible.

## Commit & Push Flow

1. `createSubTask(storyKey, commitMessage)` → `taskKey`
2. `transitionIssue(taskKey, 'Working')`
3. `git commit -m "${taskKey} ${commitMessage}"`
4. Show `TempoLogModal` for the created task
5. **On confirm:**
   - `logTempoWorklog(...)`
   - `git push origin <currentBranch>`
   - `transitionIssue(taskKey, 'Released')`
   - Close modal, clear commit message, refresh timeline
6. **On cancel:** Only commit + task in Working remain; no push, no close.

The button shows a spinner with the current step label during execution (e.g. "Creando tarea…", "Haciendo commit…").

## Architecture

### New file: `src/components/GitJiraCommitButton.tsx`

- Self-contained component with config popover + commit flow logic
- **Props:** `projectPath: string`, `commitMessage: string`, `isAnythingStaged: boolean`, `currentBranch: string`, `onSuccess: () => void`
- Imports: `TempoLogModal`, `createSubTask`, `transitionIssue` from `./jiraApi`, `logTempoWorklog` from `./jiraApi`
- Internal state: `config`, `showConfigPopover`, `flowStep` (idle | creating | committing | tempo | pushing | done), `createdTask`

### Modified: `src/components/GitStagingPanel.tsx`

- Import `GitJiraCommitButton`
- Read `currentBranch` via `git_execute ['branch', '--show-current']` (add new `useEffect`)
- Render `<GitJiraCommitButton>` alongside the existing commit button

### Modified: `src/components/jiraApi.ts`

- Add `getIssueByKey(key: string): Promise<JiraIssue>` — needed to get the full `JiraIssue` object (with `id`, `key`, `fields`) to pass to `TempoLogModal`

## Error Handling

- If task creation fails → show error, abort entire flow (no commit)
- If transition to Working fails → show warning but continue with commit (non-blocking)
- If commit fails → show error, task stays in Working (user can clean up manually)
- If push fails → show error, task stays in Working (user retries push separately)
- If Tempo logging fails → `TempoLogModal` handles it inline

## Persistence

No changes to `WorkspaceContext`, `workspaceConfig.ts`, or Rust backend. Config lives only in `localStorage`.
