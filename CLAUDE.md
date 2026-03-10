# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Microtermix** (package: `microtermix`, binary: `devflow-nexus`) is a desktop developer workspace manager built with **Tauri v2 + React 19 + TypeScript + TailwindCSS v4**. It lets developers manage multiple sub-projects in a monorepo-style workspace: run scripts, view terminal output, manage environments, perform git operations, run a reverse proxy, and more — all from one native desktop app.

## Commands

```bash
# Full dev mode (Vite frontend + Tauri native window, hot-reload on both)
npm run tauri dev

# Frontend only (no native window) at http://localhost:1420
npm run dev

# TypeScript check + Vite production build
npm run build

# Windows portable .exe → portable/devflow-nexus.exe
npm run tauri:portable

# Linux AppImage (must run on Linux)
npm run tauri:linux

# macOS .app + .dmg (must run on macOS)
npm run tauri:mac
```

Vite dev server is locked to port **1420** (`vite.config.ts` uses `strictPort: true`).

## Architecture

### Frontend (`src/`)

The app has a single React tree wrapped by `WorkspaceContext`:

```
App.tsx
└── WorkspaceProvider (src/context/WorkspaceContext.tsx)
    └── AppContent → ServiceManager (src/components/ServiceManager.tsx)
```

**`WorkspaceContext`** is the central state hub. It holds:
- `currentPath` – opened workspace folder
- `projects` – discovered sub-projects (scanned by Rust)
- `activeProcesses` – map of `serviceId → ProcessState` (running terminals)
- `activeView` – which panel is visible
- `environments`, `activeEnvironment` – named env var sets
- `gitConfig` – provider/URL/token for GitHub/GitLab/Bitbucket
- `savedCommands`, `savedCommandSteps` – named reusable shell commands

**`ServiceManager`** orchestrates the layout: a sidebar nav + one of 13 content panels based on `activeView`. EC2 instances and SSM sessions are tabs inside `CloudWatchPanel`, not separate views.

| View | Panel | Purpose |
|---|---|---|
| `services` | ProjectListPane + TerminalArea | Run project scripts, view terminal output |
| `commands` | CommandsPanel | Save/run named commands (single or multi-step) |
| `git` | GitPanel | Git diff, staging, timeline, GitHub PR/push |
| `jira` | JiraPanel | Jira ticket browser |
| `time` | TempoTab (src/components/jira/) | Tempo Cloud API v4 worklogs: view by period, log/edit/delete time |
| `processes` | ProcessesPanel | Netstat-based listening ports viewer |
| `proxy` | ProxyPanel | Axum-based reverse proxy |
| `fileServer` | FileServerPanel | Axum-based static file server |
| `tests` | TestsPanel | Run and view test results |
| `sonar` | SonarPanel | SonarQube integration |
| `cloudwatch` | CloudWatchPanel | AWS CloudWatch logs viewer |
| `http` | HttpPanel | HTTP client with Postman import and collection sidebar |
| `jenkins` | JenkinsPanel | Jenkins CI/CD integration |
| `lib-cipher` | LibCipherPanel | Encryption/decryption utilities |

**Git state** is managed by a separate Zustand store at `src/stores/gitStore.ts` (with `persist` + `devtools` middleware), keyed by repo path. It holds branches, status files, timeline commits, and loading/error states per repo. Stale times: status 30s, branches/timeline 60s. Git panel components read from this store rather than `WorkspaceContext`.

### Backend (`src-tauri/src/`)

| Module | Responsibility |
|---|---|
| `lib.rs` | Tauri app entry, command registration, workspace config persistence |
| `state.rs` | `AppState`: async-mutex maps for active processes, proxy, file server, and pending multi-window workspaces |
| `projects.rs` | `scan_projects` – discovers child dirs with `package.json` (node), `go.mod` (go), `Cargo.toml` (rust); reads `.env*` files |
| `processes.rs` | `execute_service_script` – spawns async child process, streams stdout/stderr as `service-logs` Tauri events; `kill_service`, `kill_all_services` |
| `proxy.rs` | Axum reverse proxy with Vite Module Federation support (`parse_vite_federation`, `start_proxy`) |
| `file_server.rs` | Axum static file server (`start_file_server`, `stop_file_server`) |
| `git_diff.rs` | Unified diff, hunk-based diff review, `git_execute`, `git_reword_commit`, `git_apply_patch` |
| `git_native.rs` | Native git operations (branch, checkout, merge, rebase, stash) without shelling out |
| `cloudwatch.rs` | AWS CloudWatch API: list log groups/streams, fetch log events |
| `ec2.rs` | AWS EC2: list/start/stop instances, connect via SSH or SSM |
| `ssm.rs` | AWS SSM session management: start/send-input/terminate sessions |
| `http_client.rs` | Tauri-side HTTP client commands (bypasses CORS for frontend requests) |
| `crypto.rs` | AES-256-GCM encrypt/decrypt for the LibCipher panel |
| `workspace.rs` | Multi-window support: `open_new_workspace`, `get_initial_workspace_for_window` |

### Key Conventions

**Service ID format:** `"${projectPath}::${script} "` (note the trailing space). This is the key in `activeProcesses` and what Rust uses to identify running processes.

**Workspace config:** Saved as `nexus-workspace.json` in the workspace root. Projects are stored by **folder name only** (not full path) to be machine-portable. The `NexusWorkspaceConfig` type in `src/types/workspaceConfig.ts` defines the schema. Config is auto-saved 1.5s after any state change.

**Per-project localStorage keys:** `nexus-envs-${pathKey}` and `nexus-vite-wrapper-${pathKey}` where `pathKey` replaces `/ \ :` with `_`. These are synced to/from `nexus-workspace.json` on load/save.

**`{{ENVS}}` placeholder:** Scripts may contain `{{ENVS}}` which is stripped before execution; the resolved env vars are passed to Rust as `envVarsJson` and injected into the child process environment.

**Tauri events:** The backend emits `service-logs` events with `{ service_id, line, is_error }`. `WorkspaceContext` has a single global listener that appends logs to `activeProcesses[serviceId].logs` (capped at 1000 lines).

### Frontend Component Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx        # Icon nav (13 views)
│   │   └── Header.tsx         # Workspace path + config save/load
│   ├── services/
│   │   ├── ProjectListPane.tsx
│   │   ├── MultiExecutionBar.tsx
│   │   ├── TerminalTabsBar.tsx
│   │   ├── TerminalArea.tsx
│   │   └── CommandBuilderModal.tsx
│   ├── http/                  # Full HTTP client
│   │   ├── HttpPanel.tsx
│   │   ├── CollectionSidebar.tsx
│   │   ├── RequestUrlBar.tsx
│   │   ├── RequestConfigPanel.tsx
│   │   ├── ResponsePanel.tsx
│   │   ├── PostmanImporter.ts
│   │   ├── CurlParser.ts
│   │   ├── HttpClientState.ts
│   │   ├── useHttpState.ts
│   │   └── EnvironmentManager.tsx
│   ├── lib-cipher/            # Encryption tools
│   │   ├── LibCipherCipherTab.tsx
│   │   ├── LibCipherJsonTab.tsx
│   │   └── LibCipherKeysPanel.tsx
│   ├── jira/                      # Tempo time tracking
│   │   ├── TempoTab.tsx           # Root: My Worklogs + By Issue
│   │   ├── WorklogList.tsx        # Grouped by day with totals
│   │   ├── WorklogCard.tsx        # Individual worklog card
│   │   ├── LogTimeModal.tsx       # Create/edit worklog dialog
│   │   └── PeriodSelector.tsx    # Week/Month period navigator
│   ├── ui/                    # Button, Checkbox, IconButton, Select
│   ├── GitPanel.tsx + Git*.tsx + GitConsole.tsx + GitConflict*.tsx
│   ├── SsmTerminal.tsx        # AWS SSM session terminal
│   ├── CloudWatchPanel.tsx
│   ├── EC2Panel.tsx
│   ├── JenkinsPanel.tsx
│   ├── JiraPanel.tsx
│   ├── SonarPanel.tsx
│   ├── TestsPanel.tsx
│   ├── ProxyPanel.tsx
│   ├── FileServerPanel.tsx
│   ├── CommandsPanel.tsx
│   └── ServiceManager.tsx     # Top-level workspace layout
├── context/
│   └── WorkspaceContext.tsx
├── stores/
│   ├── gitStore.ts            # Zustand store for git state
│   └── tempoStore.ts          # Zustand: worklogs, period, CRUD
└── services/                  # External API clients
    ├── githubApi.ts
    ├── cloudwatchApi.ts
    ├── jenkinsApi.ts
    └── tempoApi.ts            # Tempo Cloud API v4
```

### Styling

TailwindCSS v4 is used via the `@tailwindcss/vite` plugin (no `tailwind.config.js`). Custom design tokens (`nexus-neon`, `nexus-accent`, `nexus-dark`, etc.) are defined in `src/App.css` inside the `@theme` block. The dark theme base color is `#020617`.

**shadcn/ui** is installed (style: new-york). Components live in `src/components/ui/`. Use `cn()` from `src/lib/utils.ts` for class merging. Toast notifications via `sonner` — `<Toaster>` is mounted in `App.tsx`.

#### Regla: usar shadcn/ui siempre

**Para cualquier componente nuevo o modificado, usar shadcn/ui obligatoriamente:**

| Necesidad | Usar |
|---|---|
| Botón | `Button` de `@/components/ui/button` — variants: `default`, `outline`, `ghost`, `destructive`, `secondary`; sizes: `xs`, `sm`, `default`, `lg`, `icon-xs`, `icon-sm`, `icon` |
| Select / dropdown | `Select + SelectTrigger + SelectContent + SelectItem` de `@/components/ui/select` |
| Modal / diálogo | `Dialog + DialogContent + DialogHeader + DialogTitle + DialogFooter` de `@/components/ui/dialog` |
| Tooltip en botones | `TooltipProvider + Tooltip + TooltipTrigger + TooltipContent` de `@/components/ui/tooltip` |
| Menú contextual / popover | `Popover + PopoverTrigger + PopoverContent` de `@/components/ui/popover` |
| Badge / etiqueta | `Badge` de `@/components/ui/badge` |
| Input de texto | `Input` de `@/components/ui/input` |
| Textarea | `Textarea` de `@/components/ui/textarea` |
| Separador | `Separator` de `@/components/ui/separator` |
| Tabs | `Tabs + TabsList + TabsTrigger + TabsContent` de `@/components/ui/tabs` |

**Jamás crear botones, modales o dropdowns raw** (`<button>`, `div fixed inset-0 backdrop`, `<select>` nativo) cuando existe un componente shadcn equivalente.

#### API crítica de base-ui (este proyecto NO usa Radix UI)

shadcn/ui aquí está construido sobre `@base-ui/react`, no Radix. Diferencias clave:

- **`TooltipTrigger`** no acepta `asChild`. Usar prop `render`: `<TooltipTrigger render={<Button ... />}>`
- **`Select`** usa `onValueChange` (no `onChange`) en el Root
- **`Dialog`** se controla con `open` + `onOpenChange` — siempre montar el componente, no usar `{condition && <Dialog>}`
- **`PopoverContent`** acepta `side` y `align` directamente

#### CSS variables shadcn (TailwindCSS v4)

Los tokens de color de shadcn (`bg-popover`, `bg-muted`, `text-foreground`, etc.) están definidos como `--color-*` en el bloque `@theme` de `src/App.css` — NO en `:root`. Para agregar un nuevo color shadcn, añadirlo ahí como `--color-nombre: #hex`.
