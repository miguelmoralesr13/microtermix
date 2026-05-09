# microtermix — Functional Specification
## Part 5/7: Technical Architecture

---

### 1. Layer Separation

The application follows a **layered architecture with hexagonal (ports-and-adapters) elements**, providing clear boundaries between UI, business logic, and infrastructure.

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer                                 │
│  src/components/*  (React components, views, panels)           │
│  src/context/*     (React Context providers)                   │
│  src/hooks/*       (React hooks, UI bindings)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Application Layer                             │
│  src/*/application/ports/*  (Interface definitions)            │
│  src/*/application/usecases/*  (Business logic orchestration)   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Domain Layer                               │
│  src/*/domain/*.ts  (Entities, value objects, pure functions)   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                          │
│  src/*/infrastructure/*  (Tauri adapters, external integrations)│
└─────────────────────────────────────────────────────────────────┘
```

**UI Layer (`src/components/*`)**
- React functional components with hooks
- Presentation logic only (rendering, user interaction handling)
- Delegates to application hooks for data operations
- Sub-organized by feature domain (aws, git, jira, docker, etc.)

**Application Layer (`src/*/application/*`)**
- Use cases encapsulate business workflows (e.g., `GitCommitUseCase`, `RunSemgrepScanUseCase`)
- Ports define interfaces that infrastructure must implement
- No direct framework dependencies

**Domain Layer (`src/*/domain/*`)**
- Pure TypeScript entities and functions
- No side effects; all operations are synchronous
- Examples: `GitCommit`, `ListeningProcess`, `JiraWorklog`
- Includes domain-specific test suites (`.test.ts` files)

**Infrastructure Layer (`src/*/infrastructure/*`)**
- Tauri adapters implementing application ports
- Bridges to Rust backend via `tauri::invoke`
- External HTTP calls via Tauri HTTP plugin
- PTY communication for terminal sessions

---

### 2. Key Architectural Patterns

#### 2.1 Hexagonal Architecture (Ports & Adapters)

Each feature module follows the hexagonal pattern:

```
┌──────────────────────────────────────────────────────┐
│                   APPLICATION                        │
│  ports/ (interfaces) ←── infrastructure/ (adapters)│
│  usecases/ (business logic)                          │
└──────────────────────────────────────────────────────┘
```

**Example: Semgrep Module**
- `src/semgrep/application/ports/SemgrepPorts.ts` — defines `SemgrepScannerPort`, `SemgrepFilePort`, `SemgrepEventPort`
- `src/semgrep/infrastructure/TauriSemgrepAdapter.ts` — implements ports via Tauri invoke
- `src/semgrep/application/usecases/` — orchestrates business logic

**Example: Git Module**
- `src/git/application/ports/GitPorts.ts` — defines `GitRepositoryPort`, `GitDiffPort`, `GitCloudPort`
- `src/git/infrastructure/TauriGitAdapter.ts` — local git operations
- `src/git/infrastructure/GithubCloudAdapter.ts` — GitHub API integration
- `src/git/infrastructure/GitlabCloudAdapter.ts` — GitLab API integration

#### 2.2 Composition Root Pattern

Dependency injection wiring occurs at a single composition root per module:

**`src/services/infrastructure/compositionRoot.ts`**
```typescript
export const projectScanner = new TauriProjectScanner();
export const scriptExecutor = new TauriScriptExecutor();
export const processKiller = new TauriProcessKiller();
export const logReader = new TauriLogReader();
```

**`src/processes/infrastructure/compositionRoot.ts`**
```typescript
export const processScanner = new TauriProcessScanner();
export const processTerminator = new TauriProcessTerminator();
```

#### 2.3 Custom Hooks Pattern

Business logic is encapsulated in custom hooks that wrap React Query:

**`src/hooks/queries/useGitQueries.ts`** — Git operations
**`src/hooks/queries/useAwsQueries.ts`** — AWS operations
**`src/hooks/queries/useJiraQueries.ts`** — Jira operations

Hooks follow a consistent naming: `use[Resource][Operation]` (e.g., `useEc2Instances`, `useGitStatus`).

#### 2.4 Store Pattern with Zustand

Feature state is managed via Zustand with standardized patterns:

```typescript
// Store definition
export const useAwsStore = create<AwsStore>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  ssmTunnels: [],
  // ... methods
  addAccount: (account) => set((state) => ({
    accounts: [...state.accounts, account]
  })),
}));

// Hook export for consumption
export { useAwsStore };
```

---

### 3. State Management Approach

The application employs a **multi-layered state management strategy**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Zustand Stores                               │
│  src/stores/*.ts — Feature-specific state (UI, features)        │
│  Synchronous, mutable state with persistence middleware         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   React Query (TanStack Query)                  │
│  src/hooks/queries/*.ts — Server state, caching, mutations      │
│  Async data fetching with stale-while-revalidate               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    React Context                                │
│  src/context/WorkspaceContext.tsx — Cross-cutting state         │
│  Workspace projects, views, saved commands, pipelines           │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.1 Zustand Stores

| Store | Purpose |
|-------|---------|
| `uiStore.ts` | Global UI state (theme, selected projects, utility visibility) |
| `gitStore.ts` | Git accounts, repository mappings, UI settings |
| `awsStore.ts` | AWS accounts, credentials, SSM tunnels |
| `jiraStore.ts` | Jira configurations, board filters, stories selection |
| `dockerStore.ts` | Docker container state, view modes, explorer state |
| `processStore.ts` | Subprocesses from services, sonar, semgrep, git |
| `sonarStore.ts` | SonarQube accounts, project links |
| `mockStore.ts` | Mock server folders/endpoints, server state |

Stores use `persist` middleware for localStorage serialization on applicable state slices.

#### 3.2 React Query

Used for **all async data operations** against external systems:

- AWS API calls (EC2, Lambda, CloudWatch, S3, ECS, Step Functions)
- Git operations (status, timeline, diff, commits)
- Jira/Tempo API calls (issues, worklogs, transitions)
- Docker operations (container list, logs, file system)
- SonarQube metrics and issues
- Jenkins jobs and builds
- Semgrep scans

Query keys follow a consistent factory pattern:
```typescript
export const awsKeys = {
  all: ['aws'] as const,
  instances: () => [...awsKeys.all, 'instances'] as const,
  logs: (group: string) => [...awsKeys.all, 'logs', group] as const,
};
```

#### 3.3 React Context

**`WorkspaceContext`** provides:
- Active workspace path and project list
- Selected view state
- Saved commands and pipelines
- Auto-save functionality

---

### 4. Error Handling Patterns

#### 4.1 Error Formatting Utilities

**`src/lib/utils.ts`** — General utilities
```typescript
export function formatAwsError(error: unknown): string {
  // Normalizes AWS SDK errors to human-readable messages
}
```

**`src/stores/appLogStore.ts`** — Application event logging
- Ring buffer (200-entry limit) for application events
- Supports levels: `log`, `info`, `warn`, `error`
- Listener for backend `app-log-event` messages

#### 4.2 Try-Catch with Result Pattern

Infrastructure adapters wrap operations with error handling:

```typescript
export class TauriProcessScanner implements ProcessScannerPort {
  async scan(): Promise<ListeningProcess[]> {
    try {
      const result = await invoke<RustProcess[]>('scan_processes');
      return result.map(mapRustProcess);
    } catch (error) {
      console.error('Process scan failed:', error);
      return [];
    }
  }
}
```

#### 4.3 Error Store Integration

Components access error state via Zustand hooks and display via UI components (e.g., `ConfirmationDialog` with danger variant).

---

### 5. Configuration Management

#### 5.1 Configuration Storage Strategy

| Storage | Use Case | Implementation |
|---------|----------|-----------------|
| **localStorage** | UI preferences, theme, selected projects | Zustand `persist` middleware |
| **localStorage** | Feature-specific settings (Jira accounts, AWS credentials) | Per-store persistence |
| **localStorage** | Project-level configuration (JDK paths, env vars) | `useProjectEnvs.ts` hook |
| **tauri.conf.json** | Application metadata, window config | Build-time |
| **Workspace files** | Per-project `.env`, properties files | File system via Tauri FS |

#### 5.2 Workspace Configuration

**`src/types/workspaceConfig.ts`** manages multi-project workspace setup:

```typescript
interface MicrotermixConfig {
  pipelines?: PipelineConfig[];
  utilities?: AppView[];
  projectSettings?: Record<string, ProjectSettings>;
}
const WORKSPACE_CONFIG_FILENAME = '.microtermix.json';
```

Configuration is synchronized between file and localStorage via `applyWorkspaceConfigToStorage` and `buildWorkspaceConfigFromCurrentState`.

#### 5.3 Environment Variables

**`src/components/project/EnvManager.tsx`** — Multi-env tabs per project
**`src/utils/parseInlineEnvs.ts`** — Extract inline env vars from scripts before execution

---

### 6. Module/File Organization Rationale

#### 6.1 Feature-Based Organization

Components are grouped by feature domain, not technical function:

```
src/components/
├── aws/           # AWS-specific components (EC2, Lambda, S3, etc.)
├── git/           # Git operations (panels, modals, timeline)
├── jira/          # Jira/Tempo integration
├── http/          # HTTP client functionality
├── docker/        # Docker management
├── jenkins/       # Jenkins CI integration
├── ...
```

This allows features to be self-contained and enables utility visibility configuration (users can show/hide entire feature modules).

#### 6.2 Cross-Cutting Concerns

**`src/hooks/queries/`** — Shared React Query hooks across features
**`src/stores/`** — Shared state across features
**`src/components/ui/`** — Reusable UI primitives (buttons, dialogs, tables)

#### 6.3 Clean Architecture Boundaries

| Path Pattern | Contents | Dependencies |
|--------------|----------|--------------|
| `src/components/ui/*` | Reusable primitives | Only React/base-ui |
| `src/components/[feature]/*` | Feature UI | UI components, stores, hooks |
| `src/[feature]/application/*` | Use cases, ports | Domain, infrastructure interfaces |
| `src/[feature]/domain/*` | Entities, pure functions | None |
| `src/[feature]/infrastructure/*` | Adapters | Application ports, Tauri |
| `src/stores/*` | Feature state | Zustand, storage |
| `src/hooks/queries/*` | Data hooks | React Query, stores |

#### 6.4 Dual Component Locations

Some features maintain components in two locations:

| Feature | UI Components Location | Rationale |
|---------|----------------------|-----------|
| **Sonar** | `src/components/sonar/` + `src/sonar/ui/` | Migration from old structure |
| **Semgrep** | `src/components/semgrep/` + `src/semgrep/ui/` | Migration from old structure |

Both locations are used; new development should prefer `src/[feature]/ui/`.

#### 6.5 Infrastructure Adapters

Tauri bridges are isolated in infrastructure layer:

```
src/[feature]/infrastructure/
├── Tauri[Feature]Adapter.ts      # Primary Tauri bridge
├── Tauri[Feature]Adapter.test.ts # Unit tests
└── compositionRoot.ts            # DI wiring
```

This isolates Tauri-specific code, making ports reusable with alternative adapters (e.g., web-based implementations for testing).

---

### 7. Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Zustand over Redux** | Lighter weight, simpler API, built-in persist middleware |
| **React Query for server state** | Automatic caching, stale-while-revalidate, loading states |
| **Ports as interfaces** | Enables testing with mock adapters and future alternative implementations |
| **Hooks for business logic** | Encapsulates async operations, enables composition, testable in isolation |
| **Feature modules over technical layers** | Co-locates related code, enables feature visibility toggles |
| **Tauri for native features** | Rust backend for PTY, file system, subprocess management |
| **localStorage for persistence** | Simple, zero-backend, synchronous access |
| **Composition roots per module** | Clear DI boundaries, enables selective mocking in tests |

---

### 8. Cross-Module Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                     WorkspaceContext                            │
│  Provides: projects, views, saved commands                     │
│  Consumes: UIStore, ProjectScannerPort                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      ServiceManager                             │
│  Orchestrates: Sidebar, Header, ServiceTerminals              │
│  Uses: GitStore, UIStore, ProcessStore, various feature stores │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    GitJiraCommitButton                          │
│  Cross-cutting integration: Git + Jira + Tempo                 │
│  Uses: Git staging, Jira transitions, Tempo worklogs          │
└─────────────────────────────────────────────────────────────────┘
```

---

### 9. Testing Architecture

```
src/[feature]/domain/*.test.ts      # Pure unit tests (no mocks)
src/[feature]/infrastructure/*.test.ts # Adapter tests (mocked Tauri)
src/[module]/ui/*.test.tsx          # Component tests (React Testing Library)
```

Test utilities in `src/utils/testUtils.ts` provide:
- Language presets for test configuration
- Coverage XML parsing
- localStorage management for tests