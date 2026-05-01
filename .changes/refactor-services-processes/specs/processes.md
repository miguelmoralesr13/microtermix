# Spec: Processes Utility Refactoring

## Requirement: Processes follows Clean Architecture

The Processes utility MUST be organized into `domain/`, `application/`, `infrastructure/`, and `ui/` layers.

### Scenarios

#### Scenario: Domain layer is pure
- **Given** the `src/processes/domain/` directory exists
- **When** any file in `domain/` is analyzed
- **Then** it contains only TypeScript interfaces/types
- **And** it has NO imports from other layers or external libraries

#### Scenario: Application ports define contracts
- **Given** the `src/processes/application/ports/` directory exists
- **When** ports are defined
- **Then** `ProcessScannerPort` has a `scan(): Promise<ListeningProcess[]>` method
- **And** `ProcessTerminatorPort` has a `terminate(pid: number): Promise<void>` method

#### Scenario: Infrastructure implements ports
- **Given** the `src/processes/infrastructure/` directory exists
- **When** adapters are implemented
- **Then** `tauriProcessScanner` implements `ProcessScannerPort`
- **And** `tauriProcessTerminator` implements `ProcessTerminatorPort`

---

## Requirement: Rust system module structure

The Rust backend MUST have a dedicated `src-tauri/src/system/` module for system-level operations.

### Scenarios

#### Scenario: process_scanner.rs contains port scanning
- **Given** the `system/process_scanner.rs` file exists
- **When** it is analyzed
- **Then** it contains `get_listening_processes`
- **And** it contains the netstat/lsof/ss parsing logic
- **And** it does NOT contain script execution or file I/O

#### Scenario: process_killer.rs contains process termination
- **Given** the `system/process_killer.rs` file exists
- **When** it is analyzed
- **Then** it contains `kill_process_by_pid` and `kill_tree_unix`
- **And** it does NOT contain port scanning logic

---

## Requirement: Tech filter as Strategy pattern

Technology filtering MUST use the Strategy pattern so new filters can be added without modifying existing code (OCP).

### Scenarios

#### Scenario: Filter interface exists
- **Given** the application needs to filter processes by technology
- **When** the filter system is designed
- **Then** there is a `TechFilter` interface with `matches(process: ListeningProcess): boolean`
- **And** filters are registered in a map or registry

#### Scenario: Built-in filters work correctly
- **Given** the filter registry is initialized
- **When** `NodeJsFilter` is applied
- **Then** it matches processes with `node`, `npm`, `npx`, `bun`, `yarn` in name or path
- **When** `JavaFilter` is applied
- **Then** it matches processes with `java`, `mvn`, `gradle`, `tomcat` in name or path
- **When** `WebFilter` is applied
- **Then** it matches processes with `nginx`, `apache`, `caddy`, `python -m http` in name

#### Scenario: Custom filters can be added
- **Given** a new technology filter is needed (e.g., Go)
- **When** a developer creates `GoFilter implements TechFilter`
- **Then** it can be registered without modifying any existing filter code
- **And** the UI automatically includes it in the filter dropdown

---

## Requirement: No native alert() usage

All user notifications MUST use sonner toasts, not native `alert()`.

### Scenarios

#### Scenario: Error notification
- **Given** a process kill operation fails
- **When** the error is handled
- **Then** `toast.error('Failed to kill process: ...')` is called
- **And** `alert()` is NOT called

#### Scenario: Success notification
- **Given** a process is successfully killed
- **When** the operation completes
- **Then** `toast.success('Process killed')` is called
- **And** `alert()` is NOT called

---

## Requirement: Open URL uses window.open

Opening a URL in the browser MUST use `window.open()`, not `invoke('open_in_editor')`.

### Scenarios

#### Scenario: Open in browser
- **Given** a listening process on port 3000
- **When** the user clicks "Open in Browser"
- **Then** `window.open('http://localhost:3000', '_blank')` is called
- **And** `invoke('open_in_editor')` is NOT called with the URL

---

## Requirement: Rust projects module structure

The Rust backend MUST split `projects.rs` into `scanner.rs` and `env_reader.rs`.

### Scenarios

#### Scenario: scanner.rs contains project discovery
- **Given** the `projects/scanner.rs` file exists
- **When** it is analyzed
- **Then** it contains `detect_project_in_path`, `scan_path`, `scan_projects`
- **And** it does NOT contain package registry search functions

#### Scenario: env_reader.rs contains env file parsing
- **Given** the `projects/env_reader.rs` file exists
- **When** it is analyzed
- **Then** it contains `read_project_envs`
- **And** it does NOT contain project scanning logic

---

## Requirement: Rust registry module (NEW)

Package registry search MUST be in a dedicated `src-tauri/src/registry/` module.

### Scenarios

#### Scenario: Registry module contains all search functions
- **Given** the `registry/` directory exists
- **When** it is analyzed
- **Then** `pypi.rs` contains PyPI search and Python package details
- **And** `maven.rs` contains Maven search and Java package details
- **And** `crates.rs` contains Crates.io search and Rust package details
- **And** `go.rs` contains Go package search and details
