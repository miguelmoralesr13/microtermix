# Change Proposal: Refactor Services & Processes Utilities

**Type:** refactor  
**Scope:** `src/services/`, `src/processes/`, `src-tauri/src/services/`, `src-tauri/src/system/`, `src-tauri/src/projects/`, `src-tauri/src/registry/`, `src-tauri/src/fileops/`  
**Priority:** high

---

## Intent

Refactor the **Services & Terminals** and **Processes** utilities to follow Clean Architecture, SOLID principles, and established design patterns. This eliminates god objects, reduces coupling, improves testability, and makes both utilities extensible without modification (OCP).

---

## Problems Addressed

| # | Problem | Location | Impact |
|---|---------|----------|--------|
| 1 | `processes.rs` (1099 lines) does 9 unrelated things | `src-tauri/src/processes.rs` | Unmaintainable, hard to test |
| 2 | `projects.rs` (587 lines) mixes discovery + registry search | `src-tauri/src/projects.rs` | Single responsibility violated |
| 3 | `WorkspaceContext.tsx` (558 lines) is a god object | `src/context/WorkspaceContext.tsx` | Tight coupling to 8 stores |
| 4 | No abstraction between frontend and Tauri backend | All components | DIP violated, impossible to mock |
| 5 | Fragile string-matching filters | `MultiExecutionBar`, `ProcessesPanel` | OCP violated |
| 6 | Race condition in process tracking (dual mutex) | `processes.rs`, `state.rs` | Data inconsistency |
| 7 | Log file open/write/close per line | `processes.rs` | Severe I/O inefficiency |
| 8 | Direct localStorage reads in components | `ProjectListPane`, `WorkspaceContext` | Hidden dependencies |
| 9 | All terminals always mounted in DOM | `TerminalArea.tsx` | Memory waste |
| 10 | `alert()` instead of toasts | `ProcessesPanel.tsx` | Inconsistent UX |

---

## Approach

### Architecture: Clean Architecture per utility

Each utility gets its own `domain/`, `application/`, `infrastructure/`, `ui/` layers:

```
domain/          → Pure entities, value objects, domain events (NO imports from other layers)
application/     → Ports (interfaces), use cases, DTOs (depends on domain only)
infrastructure/  → Tauri adapters, HTTP clients, file I/O (implements ports)
ui/              → React components, hooks (depends on application)
```

### Rust Backend: Module split

```
src-tauri/src/
├── services/
│   ├── mod.rs
│   ├── executor.rs       # execute_service_script, kill_service, kill_all_services
│   ├── pipeline.rs       # execute_pipeline, PipelineState
│   ├── logs.rs           # buffered log writer (mpsc channel → single task)
│   └── pty.rs            # spawn_local_git_terminal, PTY management
├── projects/
│   ├── mod.rs
│   ├── scanner.rs        # detect_project_in_path, scan_path, scan_projects
│   └── env_reader.rs     # read_project_envs
├── registry/             # NEW — extracted from projects.rs
│   ├── mod.rs
│   ├── pypi.rs
│   ├── maven.rs
│   ├── crates.rs
│   └── go.rs
├── system/               # NEW — extracted from processes.rs
│   ├── mod.rs
│   ├── process_scanner.rs    # get_listening_processes (netstat/lsof/ss)
│   └── process_killer.rs     # kill_process_by_pid, kill_tree_unix
├── fileops/              # NEW — extracted from processes.rs
│   ├── mod.rs
│   ├── reader.rs         # read_file_content, read_file_at_path
│   ├── writer.rs         # write_file_content, ensure_directory
│   └── diagrams.rs       # list_diagram_files
└── (keep: lib.rs, state.rs, proxy.rs, file_server.rs, git_diff.rs, git_native.rs, etc.)
```

### Frontend: Clean Architecture per utility

```
src/
├── services/
│   ├── domain/
│   │   ├── Project.ts           # Entity: path, type, scripts, envs
│   │   ├── ProcessState.ts      # Entity: status, logs, restarts
│   │   └── ScriptCommand.ts     # Value object: parsed command
│   ├── application/
│   │   ├── ports/
│   │   │   ├── ProjectScannerPort.ts    # scan(path) → Project[]
│   │   │   ├── ScriptExecutorPort.ts    # execute(config) → void
│   │   │   ├── ProcessKillerPort.ts     # kill(serviceId) → void
│   │   │   └── LogReaderPort.ts         # read(serviceId, limit) → string[]
│   │   ├── usecases/
│   │   │   ├── ExecuteScript.ts
│   │   │   ├── ScanProjects.ts
│   │   │   └── KillProcess.ts
│   │   └── dto/
│   │       ├── ProjectDTO.ts
│   │       └── ScriptResultDTO.ts
│   ├── infrastructure/
│   │   ├── tauriProjectScanner.ts   # implements ProjectScannerPort
│   │   ├── tauriScriptExecutor.ts   # implements ScriptExecutorPort
│   │   ├── tauriProcessKiller.ts    # implements ProcessKillerPort
│   │   └── tauriLogReader.ts        # implements LogReaderPort
│   └── ui/
│       ├── ServicesView.tsx
│       ├── ProjectListPane.tsx
│       ├── TerminalArea.tsx
│       ├── TerminalTabsBar.tsx
│       ├── TerminalView.tsx
│       ├── MultiExecutionBar.tsx
│       ├── TerminalView.tsx
│       ├── ServiceTerminals.tsx
│       └── CommandBuilderModal.tsx
│
├── processes/
│   ├── domain/
│   │   └── ListeningProcess.ts  # Entity: port, pid, name, protocol, serviceId
│   ├── application/
│   │   ├── ports/
│   │   │   ├── ProcessScannerPort.ts     # scan() → ListeningProcess[]
│   │   │   └── ProcessTerminatorPort.ts  # terminate(pid) → void
│   │   └── usecases/
│   │       ├── ScanListeningProcesses.ts
│   │       └── TerminateProcess.ts
│   ├── infrastructure/
│   │   ├── tauriProcessScanner.ts   # implements ProcessScannerPort
│   │   └── tauriProcessTerminator.ts # implements ProcessTerminatorPort
│   └── ui/
│       └── ProcessesPanel.tsx
```

### Design Patterns Applied

| Pattern | Where | Why |
|---|---|---|
| **Port/Adapter** | All `*Port.ts` interfaces | DIP — frontend depends on abstractions, not Tauri |
| **Strategy** | `ScriptProcessorFactory` (keep existing) | `{{ENVS}}` handling per project type |
| **Observer** | Buffered log writer (mpsc channel) | Efficient I/O, batch writes every 100ms |
| **Factory** | `ScriptProcessorFactory` | Create processors by project type |
| **Command** | Pipeline steps | Each step as executable command |
| **Repository** | `ProjectScannerPort`, `ProcessScannerPort` | Data access abstraction |
| **Composition** | UI components | Pure presentational + container separation |

---

## Key Technical Changes

### 1. Buffered Log Writer (Rust)
Replace per-line file open/write/close with:
```rust
// mpsc channel → single writer task → flush every 100ms or 500 lines
let (tx, mut rx) = tokio::sync::mpsc::channel(1000);
tokio::spawn(async move {
    let mut buf = String::with_capacity(8192);
    let mut file = OpenOptions::new().append(true).create(true).open(path)?;
    loop {
        tokio::select! {
            line = rx.recv() => { /* append to buf */ }
            _ = tokio::time::sleep(Duration::from_millis(100)) => { /* flush */ }
        }
    }
});
```

### 2. Atomic Process Tracking
Replace dual mutex with single struct:
```rust
pub struct TrackedProcess {
    pub notify: Arc<Notify>,
    pub pid: u32,
    pub started_at: Instant,
}
// Single AsyncMutex<HashMap<String, TrackedProcess>>
```

### 3. Port Interfaces (TypeScript)
```typescript
export interface ScriptExecutorPort {
  execute(config: ScriptExecutionConfig): Promise<void>;
}

export interface ProcessScannerPort {
  scan(): Promise<ListeningProcess[]>;
}
```

### 4. Lazy Terminal Mounting
Only render the active terminal component. Unmount others. Use a log buffer to preserve history.

### 5. Tech Filter as Strategy
```typescript
interface TechFilter {
  matches(process: ListeningProcess): boolean;
}

class NodeJsFilter implements TechFilter { ... }
class JavaFilter implements TechFilter { ... }
// Extensible without modifying existing code (OCP)
```

### 6. Replace `alert()` with Sonner Toasts
All error/success notifications use `toast.error()` / `toast.success()`.

---

## Scope

### In Scope
- Split `processes.rs` into 4 modules
- Split `projects.rs` into 2 modules + new `registry/` module
- Create Clean Architecture structure for `services/` frontend
- Create Clean Architecture structure for `processes/` frontend
- Port interfaces for all backend interactions
- Buffered log writer
- Atomic process tracking
- Lazy terminal mounting
- Tech filter as strategy
- Replace `alert()` with toasts
- Remove direct localStorage reads from components

### Out of Scope
- Git utility refactoring
- Jira/Tempo refactoring
- AWS Manager refactoring
- HTTP Client refactoring
- Any other utility not listed
- Changes to `lib.rs` command signatures (Tauri commands stay the same)
- Changes to `state.rs` structure beyond process tracking fix

---

## Migration Strategy

1. **Rust backend first** — split modules, keep Tauri command signatures identical
2. **Frontend ports** — define interfaces that match current Tauri commands
3. **Infrastructure adapters** — implement ports using existing `invoke()` calls
4. **Domain layer** — extract entities from current types
5. **Use cases** — wrap current logic in use case classes
6. **UI migration** — move components one by one, updating imports
7. **Cleanup** — remove old files, update `lib.rs` module declarations

### Backward Compatibility
- All Tauri `invoke()` calls keep the same signatures
- All Tauri events keep the same names and payloads
- `microtermix.json` format unchanged
- localStorage keys unchanged (during migration)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tauri command signature mismatch | Low | High | Keep signatures identical, only reorganize internal modules |
| Log buffering loses data | Medium | High | Flush on process exit, use large channel buffer |
| Lazy terminal loses xterm state | Medium | Medium | Preserve log history in store, re-render on tab switch |
| Breaking existing workspace configs | Low | High | No changes to config format |
| Refactoring takes too long | Medium | Medium | Do it incrementally, module by module |
