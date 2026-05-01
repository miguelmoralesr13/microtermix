# Tasks: Refactor Services & Processes

## Phase 1: Rust Backend — Module Split

### 1.1 Create `src-tauri/src/projects/` module
- [ ] **1.1.1** Create `src-tauri/src/projects/mod.rs` with public exports
- [ ] **1.1.2** Move `detect_project_in_path`, `scan_path`, `scan_projects` to `scanner.rs`
- [ ] **1.1.3** Move `read_project_envs` to `env_reader.rs`
- [ ] **1.1.4** Update `lib.rs` to use `mod projects` instead of `mod projects` (old file)
- [ ] **1.1.5** Delete old `src-tauri/src/projects.rs`

### 1.2 Create `src-tauri/src/registry/` module (NEW)
- [ ] **1.2.1** Create `src-tauri/src/registry/mod.rs`
- [ ] **1.2.2** Move `pypi_search`, `get_python_packages` to `pypi.rs`
- [ ] **1.2.3** Move `maven_search`, `get_cargo_details` (Java part) to `maven.rs`
- [ ] **1.2.4** Move `cargo_search`, `get_cargo_details` (Rust part) to `crates.rs`
- [ ] **1.2.5** Move `go_search`, `get_go_details` to `go.rs`
- [ ] **1.2.6** Register `mod registry` in `lib.rs`

### 1.3 Create `src-tauri/src/services/` module
- [ ] **1.3.1** Create `src-tauri/src/services/mod.rs`
- [ ] **1.3.2** Move `execute_service_script`, `kill_service`, `kill_all_services` to `executor.rs`
- [ ] **1.3.3** Move `execute_pipeline` and pipeline types to `pipeline.rs`
- [ ] **1.3.4** Move `spawn_local_git_terminal` and PTY types to `pty.rs`
- [ ] **1.3.5** Register `mod services` in `lib.rs`

### 1.4 Create `src-tauri/src/system/` module (NEW)
- [ ] **1.4.1** Create `src-tauri/src/system/mod.rs`
- [ ] **1.4.2** Move `get_listening_processes` to `process_scanner.rs`
- [ ] **1.4.3** Move `kill_process_by_pid`, `kill_tree_unix` to `process_killer.rs`
- [ ] **1.4.4** Register `mod system` in `lib.rs`

### 1.5 Create `src-tauri/src/fileops/` module (NEW)
- [ ] **1.5.1** Create `src-tauri/src/fileops/mod.rs`
- [ ] **1.5.2** Move `read_file_content`, `read_file_at_path` to `reader.rs`
- [ ] **1.5.3** Move `write_file_content`, `ensure_directory` to `writer.rs`
- [ ] **1.5.4** Move `list_diagram_files` to `diagrams.rs`
- [ ] **1.5.5** Register `mod fileops` in `lib.rs`

### 1.6 Fix `processes.rs` remnants
- [ ] **1.6.1** Move `get_service_logs` to `services/logs.rs`
- [ ] **1.6.2** Move `open_in_editor` to `fileops/reader.rs` or new `editor.rs`
- [ ] **1.6.3** Move `spawn_local_git_terminal` to `services/pty.rs`
- [ ] **1.6.4** Move Semgrep functions to appropriate module (or new `security.rs`)
- [ ] **1.6.5** Delete empty `src-tauri/src/processes.rs`

### 1.7 Fix process tracking race condition
- [ ] **1.7.1** Create `TrackedProcess` struct in `state.rs` with `notify`, `pid`, `started_at`
- [ ] **1.7.2** Replace `processes` + `process_pids` maps with single `processes: Arc<AsyncMutex<HashMap<String, TrackedProcess>>>`
- [ ] **1.7.3** Update all references in `services/executor.rs` to use new struct
- [ ] **1.7.4** Update `kill_all_pids_sync` in `state.rs` to work with new struct
- [ ] **1.7.5** Verify `cargo build` passes

### 1.8 Implement buffered log writer
- [ ] **1.8.1** Create `services/logs.rs` with `LogWriter` struct
- [ ] **1.8.2** Implement mpsc channel + background writer task
- [ ] **1.8.3** Auto-flush every 100ms or when buffer reaches 500 lines
- [ ] **1.8.4** Flush on process exit (drop handler)
- [ ] **1.8.5** Replace `append_to_service_log_async` calls with channel send
- [ ] **1.8.6** Verify `cargo build` passes

---

## Phase 2: Frontend — Services Clean Architecture

### 2.1 Domain Layer
- [ ] **2.1.1** Create `src/services/domain/Project.ts` — entity with path, type, scripts, envs
- [ ] **2.1.2** Create `src/services/domain/ProcessState.ts` — entity with status, logs, restarts
- [ ] **2.1.3** Create `src/services/domain/ScriptCommand.ts` — value object for parsed commands
- [ ] **2.1.4** Create `src/services/domain/index.ts` barrel export

### 2.2 Application Ports
- [ ] **2.2.1** Create `src/services/application/ports/ProjectScannerPort.ts` — `scan(path) → Project[]`
- [ ] **2.2.2** Create `src/services/application/ports/ScriptExecutorPort.ts` — `execute(config) → void`
- [ ] **2.2.3** Create `src/services/application/ports/ProcessKillerPort.ts` — `kill(serviceId) → void`
- [ ] **2.2.4** Create `src/services/application/ports/LogReaderPort.ts` — `read(serviceId, limit) → string[]`
- [ ] **2.2.5** Create `src/services/application/ports/index.ts` barrel export

### 2.3 Application Use Cases
- [ ] **2.3.1** Create `src/services/application/usecases/ExecuteScript.ts`
- [ ] **2.3.2** Create `src/services/application/usecases/ScanProjects.ts`
- [ ] **2.3.3** Create `src/services/application/usecases/KillProcess.ts`
- [ ] **2.3.4** Create `src/services/application/usecases/index.ts` barrel export

### 2.4 Application DTOs
- [ ] **2.4.1** Create `src/services/application/dto/ProjectDTO.ts`
- [ ] **2.4.2** Create `src/services/application/dto/ScriptResultDTO.ts`
- [ ] **2.4.3** Create `src/services/application/dto/index.ts` barrel export

### 2.5 Infrastructure Adapters
- [ ] **2.5.1** Create `src/services/infrastructure/tauriProjectScanner.ts` — implements ProjectScannerPort
- [ ] **2.5.2** Create `src/services/infrastructure/tauriScriptExecutor.ts` — implements ScriptExecutorPort
- [ ] **2.5.3** Create `src/services/infrastructure/tauriProcessKiller.ts` — implements ProcessKillerPort
- [ ] **2.5.4** Create `src/services/infrastructure/tauriLogReader.ts` — implements LogReaderPort
- [ ] **2.5.5** Create `src/services/infrastructure/index.ts` barrel export

### 2.6 UI Migration — Components
- [ ] **2.6.1** Move `src/components/services/ServicesView.tsx` → `src/services/ui/ServicesView.tsx`
- [ ] **2.6.2** Move `src/components/services/ProjectListPane.tsx` → `src/services/ui/ProjectListPane.tsx`
- [ ] **2.6.3** Move `src/components/services/MultiExecutionBar.tsx` → `src/services/ui/MultiExecutionBar.tsx`
- [ ] **2.6.4** Move `src/components/services/TerminalTabsBar.tsx` → `src/services/ui/TerminalTabsBar.tsx`
- [ ] **2.6.5** Move `src/components/services/TerminalArea.tsx` → `src/services/ui/TerminalArea.tsx`
- [ ] **2.6.6** Move `src/components/services/TerminalView.tsx` → `src/services/ui/TerminalView.tsx`
- [ ] **2.6.7** Move `src/components/services/ServiceTerminals.tsx` → `src/services/ui/ServiceTerminals.tsx`
- [ ] **2.6.8** Move `src/components/services/CommandBuilderModal.tsx` → `src/services/ui/CommandBuilderModal.tsx`

### 2.7 UI Fixes
- [ ] **2.7.1** Implement lazy terminal mounting in `TerminalArea.tsx` (only active tab)
- [ ] **2.7.2** Remove `useMemo` inside JSX in `ServicesView.tsx` (line 231)
- [ ] **2.7.3** Fix fake event objects in `TerminalTabsBar.tsx` (lines 111, 120, 131)
- [ ] **2.7.4** Replace `Math.random()` with `crypto.randomUUID()` in `CommandBuilderModal.tsx`
- [ ] **2.7.5** Remove direct localStorage read in `useActiveVarsCount` — use store instead
- [ ] **2.7.6** Fix eslint-disable incomplete deps in `ProjectListPane.tsx` (line 307)
- [ ] **2.7.7** Delete old `src/components/services/` directory

---

## Phase 3: Frontend — Processes Clean Architecture

### 3.1 Domain Layer
- [ ] **3.1.1** Create `src/processes/domain/ListeningProcess.ts` — entity with port, pid, name, protocol
- [ ] **3.1.2** Create `src/processes/domain/index.ts` barrel export

### 3.2 Application Ports
- [ ] **3.2.1** Create `src/processes/application/ports/ProcessScannerPort.ts` — `scan() → ListeningProcess[]`
- [ ] **3.2.2** Create `src/processes/application/ports/ProcessTerminatorPort.ts` — `terminate(pid) → void`
- [ ] **3.2.3** Create `src/processes/application/ports/index.ts` barrel export

### 3.3 Application Use Cases
- [ ] **3.3.1** Create `src/processes/application/usecases/ScanListeningProcesses.ts`
- [ ] **3.3.2** Create `src/processes/application/usecases/TerminateProcess.ts`
- [ ] **3.3.3** Create `src/processes/application/usecases/index.ts` barrel export

### 3.4 Infrastructure Adapters
- [ ] **3.4.1** Create `src/processes/infrastructure/tauriProcessScanner.ts` — implements ProcessScannerPort
- [ ] **3.4.2** Create `src/processes/infrastructure/tauriProcessTerminator.ts` — implements ProcessTerminatorPort
- [ ] **3.4.3** Create `src/processes/infrastructure/index.ts` barrel export

### 3.5 UI Migration
- [ ] **3.5.1** Move `src/components/system/ProcessesPanel.tsx` → `src/processes/ui/ProcessesPanel.tsx`
- [ ] **3.5.2** Replace `alert()` with `toast.error()` / `toast.success()` from sonner
- [ ] **3.5.3** Implement Tech Filter as Strategy pattern (extensible without modification)
- [ ] **3.5.4** Fix `openInBrowser` — remove `invoke('open_in_editor')` for URLs, use `window.open`
- [ ] **3.5.5** Delete old `src/components/system/ProcessesPanel.tsx`

---

## Phase 4: Cleanup & Verification

### 4.1 Import Updates
- [ ] **4.1.1** Update all imports in `ServiceManager.tsx` to use new paths
- [ ] **4.1.2** Update all imports in `Sidebar.tsx` to use new paths
- [ ] **4.1.3** Update `UtilityRenderer.tsx` imports
- [ ] **4.1.4** Run `npx madge --circular --extensions ts ./src` — verify no cycles

### 4.2 Build Verification
- [ ] **4.2.1** `cargo build` — Rust compiles without errors
- [ ] **4.2.2** `npm run build` — TypeScript compiles without errors
- [ ] **4.2.3** `npm run tauri dev` — app runs correctly
- [ ] **4.2.4** Test Services: scan projects, run script, view logs, kill process
- [ ] **4.2.5** Test Processes: view listening processes, filter by tech, kill process

### 4.3 Final Cleanup
- [ ] **4.3.1** Remove any unused imports
- [ ] **4.3.2** Remove old `src/components/services/` directory if not already done
- [ ] **4.3.3** Remove old `src/components/system/ProcessesPanel.tsx` if not already done
- [ ] **4.3.4** Verify `microtermix.json` load/save still works
- [ ] **4.3.5** Verify Tauri events (`service-logs`, `service-stopped`) still fire correctly
