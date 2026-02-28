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

**`ServiceManager`** orchestrates the layout: a sidebar nav + one of 7 content panels based on `activeView`:

| View | Panel | Purpose |
|---|---|---|
| `services` | ProjectListPane + TerminalArea | Run project scripts, view terminal output |
| `commands` | CommandsPanel | Save/run named commands (single or multi-step) |
| `git` | GitPanel | Git diff, staging, timeline, GitHub PR/push |
| `jira` | JiraPanel | Jira ticket browser |
| `processes` | ProcessesPanel | Netstat-based listening ports viewer |
| `proxy` | ProxyPanel | Axum-based reverse proxy |
| `fileServer` | FileServerPanel | Axum-based static file server |

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
| `workspace.rs` | Multi-window support: `open_new_workspace`, `get_initial_workspace_for_window` |

### Key Conventions

**Service ID format:** `"${projectPath}::${script} "` (note the trailing space). This is the key in `activeProcesses` and what Rust uses to identify running processes.

**Workspace config:** Saved as `nexus-workspace.json` in the workspace root. Projects are stored by **folder name only** (not full path) to be machine-portable. The `NexusWorkspaceConfig` type in `src/types/workspaceConfig.ts` defines the schema. Config is auto-saved 1.5s after any state change.

**Per-project localStorage keys:** `nexus-envs-${pathKey}` and `nexus-vite-wrapper-${pathKey}` where `pathKey` replaces `/ \ :` with `_`. These are synced to/from `nexus-workspace.json` on load/save.

**`{{ENVS}}` placeholder:** Scripts may contain `{{ENVS}}` which is stripped before execution; the resolved env vars are passed to Rust as `envVarsJson` and injected into the child process environment.

**Tauri events:** The backend emits `service-logs` events with `{ service_id, line, is_error }`. `WorkspaceContext` has a single global listener that appends logs to `activeProcesses[serviceId].logs` (capped at 1000 lines).

### Frontend Component Structure

```
src/components/
├── layout/
│   ├── Sidebar.tsx        # Icon nav (7 views)
│   └── Header.tsx         # Workspace path + config save/load
├── services/
│   ├── ProjectListPane.tsx
│   ├── MultiExecutionBar.tsx
│   ├── TerminalTabsBar.tsx
│   └── TerminalArea.tsx
├── ui/                    # Button, Checkbox, IconButton, Select
├── GitPanel.tsx + Git*.tsx  # Full git workflow UI
├── JiraPanel.tsx
├── ProxyPanel.tsx
├── FileServerPanel.tsx
├── CommandsPanel.tsx
└── ServiceManager.tsx     # Top-level workspace layout
```

### Styling

TailwindCSS v4 is used via the `@tailwindcss/vite` plugin (no `tailwind.config.js`). Custom design tokens (e.g., `nexus-neon`, `nexus-accent`, `nexus-dark`) are defined in `src/index.css`. The dark theme base color is `#020617`.
