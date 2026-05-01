# Technical Design: Services & Processes Refactoring

## Architecture Decision: Clean Architecture per Utility

### Decision
Each utility (Services, Processes) gets its own Clean Architecture structure with `domain/`, `application/`, `infrastructure/`, `ui/` layers.

### Rationale
- **Separation of concerns**: Domain logic is pure and testable
- **Testability**: Ports can be mocked easily in unit tests
- **Extensibility**: New implementations (e.g., non-Tauri backend) only require new infrastructure adapters
- **Maintainability**: Clear boundaries prevent god objects from forming again

### Alternatives Considered
1. **Feature folders without layers** — simpler but doesn't enforce dependency rules
2. **Shared domain layer** — would couple Services and Processes unnecessarily
3. **Keep current structure** — rejected due to SRP violations and unmaintainability

---

## Architecture Decision: Rust Module Split Strategy

### Decision
Split `processes.rs` (1099 lines) into 4 modules: `services/`, `system/`, `fileops/`, and keep pipeline/PTY in `services/`. Split `projects.rs` (587 lines) into `projects/` + new `registry/`.

### Rationale
- **Cohesion**: Each module groups related functionality
- **Compile times**: Smaller modules compile faster
- **Ownership**: Clear responsibility per module

### Module Map

| New Module | Source (from) | Functions |
|---|---|---|
| `services/executor.rs` | `processes.rs` | `execute_service_script`, `kill_service`, `kill_all_services` |
| `services/pipeline.rs` | `processes.rs` | `execute_pipeline`, pipeline types |
| `services/pty.rs` | `processes.rs` | `spawn_local_git_terminal` |
| `services/logs.rs` | `processes.rs` | `get_service_logs`, buffered writer |
| `system/process_scanner.rs` | `processes.rs` | `get_listening_processes` |
| `system/process_killer.rs` | `processes.rs` | `kill_process_by_pid`, `kill_tree_unix` |
| `fileops/reader.rs` | `processes.rs` | `read_file_content`, `read_file_at_path`, `open_in_editor` |
| `fileops/writer.rs` | `processes.rs` | `write_file_content`, `ensure_directory` |
| `fileops/diagrams.rs` | `processes.rs` | `list_diagram_files` |
| `projects/scanner.rs` | `projects.rs` | `detect_project_in_path`, `scan_path`, `scan_projects` |
| `projects/env_reader.rs` | `projects.rs` | `read_project_envs` |
| `registry/pypi.rs` | `projects.rs` | `pypi_search`, `get_python_packages` |
| `registry/maven.rs` | `projects.rs` | `maven_search` |
| `registry/crates.rs` | `projects.rs` | `cargo_search`, `get_cargo_details` |
| `registry/go.rs` | `projects.rs` | `go_search`, `get_go_details` |

---

## Architecture Decision: Buffer Log Writer

### Decision
Replace per-line file I/O with mpsc channel + background writer task that flushes every 100ms or at 500 lines.

### Rationale
- **Performance**: Reduces file open/close syscalls by ~100x
- **Durability**: Timed flush ensures no data loss on crash
- **Simplicity**: tokio mpsc channel is well-tested

### Design

```
Process stdout/stderr line
    ↓
append_to_service_log_async(line)
    ↓
tx.send(line).await  (mpsc channel, capacity 1000)
    ↓
Background writer task:
    ├── Buffer accumulates lines
    ├── Every 100ms: flush buffer to file
    ├── Every 500 lines: flush buffer to file
    └── On drop/exit: flush remaining lines
```

### Trade-offs
- **Memory**: Buffer uses ~50KB max (500 lines × 100 chars) — acceptable
- **Latency**: Up to 100ms delay before logs hit disk — acceptable for dev tool

---

## Architecture Decision: Single Mutex for Process Tracking

### Decision
Replace `processes: AsyncMutex<HashMap>` + `process_pids: Mutex<HashMap>` with single `processes: AsyncMutex<HashMap<String, TrackedProcess>>`.

### Rationale
- **Atomicity**: No race window between notify handle and PID
- **Simplicity**: One lock instead of two
- **Correctness**: Kill operations see consistent state

### TrackedProcess struct

```rust
pub struct TrackedProcess {
    pub notify: Arc<Notify>,
    pub pid: u32,
    pub started_at: std::time::Instant,
}
```

### Sync kill handler
For the non-async exit handler that needs to kill all processes:
```rust
pub fn kill_all_pids_sync(state: &AppState) {
    // Use try_lock() on the AsyncMutex's inner MutexGuard
    // Or use a separate std::sync::Mutex for emergency kills
}
```

---

## Architecture Decision: Lazy Terminal Mounting

### Decision
Only render the active terminal component. Preserve log history in Zustand store for re-mounting.

### Rationale
- **Memory**: xterm.js instances consume ~5-10MB each. For 10 processes, that's 50-100MB saved
- **Performance**: Fewer DOM nodes, faster renders

### Design

```tsx
// TerminalArea.tsx
function TerminalArea({ activeTab, processIds }: Props) {
  return (
    <div className="relative h-full">
      {processIds.map(id => (
        <div key={id} style={{ display: id === activeTab ? 'block' : 'none' }}>
          {id === activeTab && <TerminalView serviceId={id} />}
        </div>
      ))}
    </div>
  );
}
```

The `display: none` wrapper prevents layout shift. The conditional `{id === activeTab && ...}` ensures the component is actually unmounted.

### Trade-offs
- **Re-mount cost**: xterm.js takes ~50ms to initialize — acceptable
- **Log history**: Must be preserved in store (already is via `processStore`)

---

## Architecture Decision: Tech Filter as Strategy

### Decision
Implement technology filtering as a Strategy pattern with a registry of filters.

### Rationale
- **OCP**: New filters added without modifying existing code
- **Testability**: Each filter tested in isolation
- **Extensibility**: Users could add custom filters in the future

### Design

```typescript
interface TechFilter {
  id: string;
  label: string;
  matches(process: ListeningProcess): boolean;
}

class NodeJsFilter implements TechFilter {
  id = 'nodejs';
  label = 'Node.js';
  matches(p) {
    const haystack = `${p.name} ${p.path} ${p.serviceId ?? ''}`.toLowerCase();
    return /node|npm|npx|bun|yarn|pnpm/.test(haystack);
  }
}

class JavaFilter implements TechFilter {
  id = 'java';
  label = 'Java';
  matches(p) {
    const haystack = `${p.name} ${p.path} ${p.serviceId ?? ''}`.toLowerCase();
    return /java|mvn|gradle|tomcat|jetty/.test(haystack);
  }
}

const filterRegistry: TechFilter[] = [
  new NodeJsFilter(),
  new JavaFilter(),
  // ... more filters
];
```

---

## Architecture Decision: Composition Root for Dependency Injection

### Decision
Create a composition root in `src/services/infrastructure/compositionRoot.ts` that wires ports to implementations.

### Rationale
- **Single place** to configure dependencies
- **Easy to swap** implementations for testing
- **Clear ownership** of what depends on what

### Design

```typescript
// compositionRoot.ts
export const projectScanner: ProjectScannerPort = new TauriProjectScanner();
export const scriptExecutor: ScriptExecutorPort = new TauriScriptExecutor();
export const processKiller: ProcessKillerPort = new TauriProcessKiller();
export const logReader: LogReaderPort = new TauriLogReader();

// Components import from compositionRoot, not directly from infrastructure
```

---

## Migration Order

```
Phase 1: Rust backend (modules split)
    ↓ (Tauri commands unchanged → no frontend breakage)
Phase 2: Frontend Services (domain → ports → usecases → infrastructure → ui)
    ↓
Phase 3: Frontend Processes (domain → ports → usecases → infrastructure → ui)
    ↓
Phase 4: Cleanup & verification
```

Each phase is independently compilable and testable.
