# Spec: Services Utility Refactoring

## Requirement: Services follows Clean Architecture

The Services utility MUST be organized into `domain/`, `application/`, `infrastructure/`, and `ui/` layers with dependencies flowing inward.

### Scenarios

#### Scenario: Domain layer has zero external dependencies
- **Given** the `src/services/domain/` directory exists
- **When** any file in `domain/` is analyzed for imports
- **Then** it MUST NOT import from `application/`, `infrastructure/`, or `ui/`
- **And** it MUST NOT import from `@tauri-apps`, `zustand`, or any UI library

#### Scenario: Application layer depends only on domain
- **Given** the `src/services/application/` directory exists
- **When** any file in `application/` is analyzed for imports
- **Then** it MAY import from `domain/`
- **And** it MUST NOT import from `infrastructure/` or `ui/`
- **And** it MUST NOT import from `@tauri-apps`

#### Scenario: Infrastructure implements application ports
- **Given** a port interface is defined in `application/ports/`
- **When** an adapter is created in `infrastructure/`
- **Then** it MUST implement the port interface
- **And** it MAY import from `@tauri-apps` and `domain/`

#### Scenario: UI depends on application ports, not infrastructure
- **Given** a UI component needs to execute a script
- **When** the component is implemented
- **Then** it MUST depend on `ScriptExecutorPort` (interface)
- **And** it MUST NOT call `invoke()` directly

---

## Requirement: Port interfaces for all backend interactions

All communication with the Tauri backend MUST go through port interfaces defined in the application layer.

### Scenarios

#### Scenario: ProjectScannerPort
- **Given** the application needs to scan for projects
- **When** `ProjectScannerPort.scan(path)` is called
- **Then** it returns a `Promise<Project[]>`
- **And** the implementation calls `invoke('scan_projects', { rootPath: path })`

#### Scenario: ScriptExecutorPort
- **Given** the application needs to run a project script
- **When** `ScriptExecutorPort.execute(config)` is called
- **Then** it invokes `invoke('execute_service_script', config)`
- **And** it does NOT return a value (logs stream via events)

#### Scenario: ProcessKillerPort
- **Given** the application needs to stop a running process
- **When** `ProcessKillerPort.kill(serviceId)` is called
- **Then** it invokes `invoke('kill_service', { serviceId })`

#### Scenario: LogReaderPort
- **Given** the application needs historical logs for a service
- **When** `LogReaderPort.read(serviceId, limit)` is called
- **Then** it invokes `invoke('get_service_logs', { serviceId, limit })`
- **And** it returns a `Promise<string[]>`

---

## Requirement: Lazy terminal mounting

Terminal components MUST only be mounted when their tab is active to conserve memory.

### Scenarios

#### Scenario: Only active terminal is mounted
- **Given** there are 5 running services with 5 terminal tabs
- **When** tab #3 is selected
- **Then** ONLY the TerminalView for tab #3 is rendered in the DOM
- **And** the other 4 terminals are NOT in the DOM

#### Scenario: Log history preserved across mount/unmount
- **Given** a terminal was mounted, received 200 log lines, then was unmounted
- **When** the terminal is mounted again (tab re-selected)
- **Then** all 200 log lines are rendered immediately from the store
- **And** new log lines continue to append

---

## Requirement: No direct localStorage access in components

Components MUST read/write state through stores, not directly from localStorage.

### Scenarios

#### Scenario: Active env vars count
- **Given** `ProjectListPane` needs to show env var count badge
- **When** the count is computed
- **Then** it reads from a Zustand store or React context
- **And** it does NOT call `localStorage.getItem()` directly

#### Scenario: Environment variables on script execution
- **Given** `executeProjectScript` needs env vars for a project
- **When** env vars are loaded
- **Then** they come from a store or injected dependency
- **And** they are NOT read directly from `localStorage`

---

## Requirement: Rust services module structure

The Rust backend MUST split `processes.rs` into dedicated modules under `src-tauri/src/services/`.

### Scenarios

#### Scenario: executor.rs contains process execution
- **Given** the `services/executor.rs` file exists
- **When** it is analyzed
- **Then** it contains `execute_service_script`, `kill_service`, `kill_all_services`
- **And** it does NOT contain port scanning, file I/O, or Semgrep functions

#### Scenario: pipeline.rs contains pipeline logic
- **Given** the `services/pipeline.rs` file exists
- **When** it is analyzed
- **Then** it contains `execute_pipeline` and pipeline types
- **And** it does NOT contain single-script execution logic

#### Scenario: pty.rs contains PTY terminal logic
- **Given** the `services/pty.rs` file exists
- **When** it is analyzed
- **Then** it contains `spawn_local_git_terminal` and PTY management
- **And** it does NOT contain script execution logic

---

## Requirement: Buffered log writer

Log file I/O MUST use a buffered writer with mpsc channel, not per-line open/write/close.

### Scenarios

#### Scenario: Logs are batched in memory
- **Given** a process is producing output at 100 lines/second
- **When** the log writer is active
- **Then** it buffers lines in memory
- **And** flushes to disk every 100ms OR when buffer reaches 500 lines
- **And** it does NOT open/close the file for each line

#### Scenario: Logs are flushed on process exit
- **Given** a process exits with buffered logs pending
- **When** the process termination is detected
- **Then** all remaining buffered logs are flushed to disk
- **And** no log data is lost

---

## Requirement: Atomic process tracking

Process tracking MUST use a single mutex to prevent race conditions.

### Scenarios

#### Scenario: Single mutex for process data
- **Given** `AppState` tracks running processes
- **When** a process is started
- **Then** its `Notify` handle and `PID` are stored in a single `TrackedProcess` struct
- **And** the struct is inserted into a single `AsyncMutex<HashMap>`
- **And** there is NO separate `process_pids` map

#### Scenario: Kill operation is atomic
- **Given** a process needs to be killed
- **When** `kill_service` is called
- **Then** it acquires the single mutex once
- **And** retrieves both the `Notify` handle and `PID` atomically
- **And** there is NO window where one map has the entry and the other doesn't
