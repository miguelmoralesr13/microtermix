# Data Flows

## Overview

microtermix employs a layered data flow architecture with distinct patterns for client-side state, server-state (via Tauri backend), and external API integration.

---

## 1. Data Fetching Patterns

### 1.1 External API Integration (GitHub, GitLab, Jira, AWS, SonarQube)

```
External API → Tauri HTTP Plugin → TauriJiraAdapter / TauriSonarAdapter / etc.
                                                    ↓
                                          Domain Entities (JiraIssue, SonarMetrics)
                                                    ↓
                                          React Query Cache / UI Components
```

**Implementation:**
- `src/services/githubApi.ts`, `src/services/gitlabApi.ts` - GitHub/GitLab REST API clients
- `src/services/tempoApi.ts` - Tempo time tracking API
- `src/services/cloudwatchApi.ts` - AWS CloudWatch/S3/SSM API wrapper
- `src/services/zeplinApi.ts` - Zeplin design platform API
- `src/jira/infrastructure/TauriJiraAdapter.ts` - Jira REST API v3 adapter via Tauri HTTP

### 1.2 Tauri Backend Commands

```
React Component → Tauri invoke() → Rust Backend → Return structured data
                                              ↓
                                    Domain Model Mapping (mapRustProject)
```

**Key Commands:**
- `scan_projects` - Discovers workspace projects
- `execute_service_script` - Runs scripts as child processes
- `kill_process` - Terminates services
- `read_log_file` - Retrieves historical logs
- `aws_*` commands - AWS SDK operations

### 1.3 React Query Data Layer

```
Component → useQuery/useMutation → Query Function → Tauri invoke/API call
                                      ↓
                              React Query Cache (staleTime, refetch intervals)
                                      ↓
                              Component Re-render
```

**Query Key Factories:**
- `src/hooks/queries/useGitQueries.ts` - `gitKeys`
- `src/hooks/queries/useJiraQueries.ts` - `jiraKeys`
- `src/hooks/queries/useAwsQueries.ts` - `awsKeys`
- `src/hooks/queries/useSonarQueries.ts` - `sonarKeys`

---

## 2. State Management Architecture

### 2.1 Zustand Stores (Global Client State)

```
┌─────────────────────────────────────────────────────────────┐
│                        Zustand Stores                        │
├──────────────┬──────────────┬───────────────┬───────────────┤
│ gitStore     │ jiraStore    │ awsStore      │ uiStore       │
│ jenkinsStore │ sonarStore   │ processStore  │ dockerStore   │
│ jiraStore    │ tempoStore   │ toolStore     │ mockStore     │
└──────────────┴──────────────┴───────────────┴───────────────┘
```

**Storage Pattern:**
- `src/stores/*.ts` - Each store manages a specific domain
- Persistence middleware writes to localStorage
- Stores hydrated on application startup

### 2.2 React Context (Workspace Context)

```
App.tsx
    ↓
WorkspaceProvider (src/context/WorkspaceContext.tsx)
    ↓
┌────────────────────────────────────────┐
│ WorkspaceContext                        │
│ - projects: Project[]                   │
│ - selectedProjects: string[]            │
│ - activeView: AppView                   │
│ - savedCommands: SavedCommand[]         │
│ - pipelines: PipelineConfig[]           │
└────────────────────────────────────────┘
    ↓
ServiceManager → ServicesView → Child Components
```

### 2.3 React Query (Server State Cache)

```
┌────────────────────────────────────────┐
│           React Query Cache             │
├────────────────────────────────────────┤
│ Query Keys:                             │
│ - ['git', 'status', repoPath]           │
│ - ['jira', 'issues', projectKey]        │
│ - ['sonar', 'metrics', projectId]       │
│ - ['aws', 'ec2', accountId, region]     │
└────────────────────────────────────────┘
```

---

## 3. Operation Triggering Patterns

### 3.1 User Interaction → State Update Flow

```
User Action (Click, Input, Drag)
    ↓
Event Handler (onClick, onChange)
    ↓
┌─────────────────────────────────────────┐
│ Option A: Direct State Update           │
│   → Zustand store.setState()            │
│   → Local component setState()           │
├─────────────────────────────────────────┤
│ Option B: Mutation Flow                  │
│   → React Query useMutation()           │
│   → Tauri invoke() / API call          │
│   → Cache invalidation                  │
│   → Automatic refetch                   │
├─────────────────────────────────────────┤
│ Option C: Command Execution              │
│   → scriptProcessorFactory              │
│   → Tauri scriptExecutor                │
│   → processStore update                 │
└─────────────────────────────────────────┘
```

### 3.2 Git Operations Flow

```
GitPanel → GitStagingPanel → GitTimeline
    ↓                ↓              ↓
gitStore ←── useGitStaging ──── useGitTimelineView
    ↓                ↓              ↓
TauriGitAdapter ←────┴───────────────┘
    ↓
Rust git2 library
    ↓
GitCommit / GitBranch / GitStatusEntry
```

### 3.3 Jira Workflow Flow

```
JiraPanel → BoardView/StoriesView/CalendarView
    ↓                    ↓                 ↓
jiraStore ←──── useJiraIssues ─── useTempoWorklogs
    ↓                    ↓                 ↓
TauriJiraAdapter ←── TauriTempoAdapter ────┘
    ↓                    ↓
Jira REST API v3 ←── Tempo API v4
```

### 3.4 AWS Operations Flow

```
CloudWatchPanel → Ec2Tab/LambdaTab/LogsTab/MetricsTab
    ↓                  ↓          ↓         ↓
awsStore ←──── useEc2Queries ──────────────┘
    ↓                  ↓
awsEnvStore ←──── useAwsEnvStore (SSM Parameters)
    ↓                  ↓
Tauri HTTP Plugin → AWS SDK (Rust)
```

---

## 4. Data Transformation Steps

### 4.1 Rust → Domain Model Mapping

```
TauriProjectScanner.ts
┌─────────────────────────────────────────────┐
│ Rust Response:                               │
│ {                                           │
│   path: "/project",                          │
│   project_type: "JavaMaven",                 │
│   scripts: ["dev", "build", "test"]         │
│ }                                           │
└─────────────────────────────────────────────┘
                    ↓
           mapRustProject()
                    ↓
┌─────────────────────────────────────────────┐
│ Domain Model:                                │
│ {                                           │
│   path: "/project",                          │
│   type: "java-maven",                        │
│   commands: [ScriptCommand, ...]            │
│ }                                           │
└─────────────────────────────────────────────┘
```

### 4.2 External API → Domain Entity

```
TauriJiraAdapter.jiraFetch()
┌─────────────────────────────────────────────┐
│ Jira API Response:                           │
│ {                                           │
│   id: "12345",                               │
│   fields: {                                  │
│     summary: "Fix bug",                      │
│     status: { name: "In Progress" }         │
│   }                                          │
│ }                                           │
└─────────────────────────────────────────────┘
                    ↓
           Transform in adapter
                    ↓
┌─────────────────────────────────────────────┐
│ JiraIssue Domain Entity:                     │
│ {                                           │
│   id: "12345",                               │
│   summary: "Fix bug",                        │
│   status: "In Progress"                      │
│ }                                           │
└─────────────────────────────────────────────┘
```

### 4.3 Diff Parsing Pipeline

```
Git Diff Output (unified format)
    ↓
TauriGitDiffAdapter.parseUnifiedDiffLines()
    ↓
Hunk[] (src/git/domain/GitDiff.ts)
    ↓
GitDiffViewer / ReadOnlyDiff (rendering)
```

---

## 5. Storage and Retrieval Patterns

### 5.1 LocalStorage Persistence (Zustand Middleware)

```
┌─────────────────────────────────────────────────────┐
│ Zustand Store Creation                              │
│ ┌─────────────────────────────────────────────────┐ │
│ │ create<Store>()((set, get) => ({               │ │
│ │   data: {},                                     │ │
│ │   setData: (data) => set({ data })             │ │
│ │ }),                                             │ │
│ │ {                                              │ │
│ │   name: 'store-key',                           │ │
│ │   partialize: (state) => ({ data: state.data })│ │
│ │ })                                              │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
                    ↓
         localStorage.setItem('store-key', ...)
                    ↓
         Application Reload
                    ↓
         localStorage.getItem('store-key')
                    ↓
         Store Rehydration
```

**Persisted Stores:**
- `gitStore` - Git accounts, favorites, UI settings
- `jiraStore` - Jira accounts, board filters, pinned items
- `awsStore` - AWS accounts, SSM tunnels
- `sonarStore` - SonarQube accounts, project links
- `uiStore` - Theme, selected projects, visible utilities

### 5.2 Tauri Storage Plugin (Rust-Side Persistence)

```
React Component
    ↓
Tauri Store Plugin (JavaScript)
    ↓
Tauri invoke('plugin:store|get' / 'plugin:store|set')
    ↓
Rust Backend (tauri-plugin-store)
    ↓
File System: ~/.local/share/microtermix/
```

### 5.3 Workspace Configuration Flow

```
src/types/workspaceConfig.ts
┌─────────────────────────────────────────────────────┐
│ .microtermix.json                                   │
│ {                                                   │
│   "projects": ["/path/to/project1"],                │
│   "pipelines": [...],                               │
│   "savedCommands": [...]                            │
│ }                                                   │
└─────────────────────────────────────────────────────┘
                    ↓
        applyWorkspaceConfigToStorage()
                    ↓
        Zustand Stores + WorkspaceContext
```

---

## 6. Real-Time Data Flows

### 6.1 Process Output Streaming

```
Rust Backend (script execution)
    ↓
Tauri Event: 'service-output' / 'service-error'
    ↓
ProcessStore (batchedAppendLogs)
    ↓
React Component Subscribes to Store
    ↓
TerminalView / ServiceTerminals (xterm.js)
```

### 6.2 SSM Terminal Streaming

```
Ec2Tab → SsmTerminal
    ↓
Tauri PTY Events: 'ssm-data' / 'ssm-exit'
    ↓
xterm.js Terminal (write, scroll)
```

### 6.3 GitHub Actions Watching

```
useGithubActionsWatcher.ts
    ↓
Tauri invoke('start_github_watcher', { repo })
    ↓
Rust Backend: Polls GitHub API periodically
    ↓
Tauri Event: 'github-action-update'
    ↓
WorkflowRunList (re-render)
```

---

## 7. Query Invalidation Patterns

### 7.1 Mutation → Cache Invalidation

```
GitCommit (user clicks commit)
    ↓
useGitCommit() mutation
    ↓
TauriGitAdapter.commit()
    ↓
Cache Keys Invalidated:
  - ['git', 'status', repoPath]
  - ['git', 'timeline', repoPath]
    ↓
Automatic Refetch → UI Update
```

### 7.2 Optimistic Updates

```
JiraTransition (user changes status)
    ↓
useJiraTransition() mutation (optimistic)
    ↓
Immediate UI Update
    ↓
API Request
    ↓
Rollback on Error
```

---

## 8. Error Handling Flow

```
API/Invoke Call
    ↓
Error Response
    ↓
┌────────────────────────────────────────────┐
│ Error Handlers:                             │
│ - useJenkins.ts handleJenkinsError()       │
│ - useAwsQueries.ts handleAwsError()       │
│ - useSemgrepQueries.ts (semgrep errors)    │
└────────────────────────────────────────────┘
    ↓
React Query onError Callback
    ↓
Toast/Notification + Retry Logic
    ↓
Store Update (error state)
```

---

## 9. Service Execution Pipeline

```
ProjectRow (click run)
    ↓
scriptProcessorFactory.getProcessor(projectType)
    ↓
Inject Environment Variables (parseInlineEnvs)
    ↓
TauriScriptExecutor.execute_service_script()
    ↓
Rust Backend: spawn_child()
    ↓
┌────────────────────────────────────────────┐
│ Process Lifecycle:                         │
│ - STARTING → RUNNING → STOPPED/ERROR       │
│ - Logs streamed via Tauri events           │
│ - processStore tracks all subprocesses     │
└────────────────────────────────────────────┘
    ↓
TerminalView displays output
```