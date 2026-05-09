# PART 4/7: INTEGRATIONS

## External Services and APIs

### AWS Services

The application integrates with multiple AWS services through Tauri backend commands:

| Service | Purpose | Backend Commands Used |
|---------|---------|----------------------|
| **EC2** | Instance management, SSH connections | `ec2_list_instances`, `ec2_describe_instance` |
| **Lambda** | Function invocation, configuration viewing | `lambda_list_functions`, `lambda_invoke` |
| **API Gateway** | REST/HTTP API management | `apigw_list_apis`, `apigw_get_resources`, `apigw_get_stages` |
| **Step Functions** | State machine execution, inspection | `sfn_list_machines`, `sfn_start_execution`, `sfn_describe_execution` |
| **S3** | Bucket browsing, file downloads | `s3_list_buckets`, `s3_list_objects`, `s3_download_object` |
| **CloudWatch Logs** | Log streaming and querying | `cw_get_log_groups`, `cw_get_log_events`, `cw_filter_log_events`, `cw_start_tail` |
| **CloudWatch Metrics** | Metric data retrieval | `cw_list_metrics`, `cw_get_metric_data` |
| **ECS** | Container cluster management | `ecs_list_clusters`, `ecs_list_services`, `ecs_list_tasks` |
| **SSM Parameter Store** | Environment variable retrieval | `ssm_get_parameters`, `ssm_get_parameters_by_path` |
| **Secrets Manager** | Secure credential storage | `secretsmanager_get_secret_value` |

**AWS Authentication:**
- Credential management via `AccountCreateDialog` and `AccountDetailView` components
- Supports both static credentials (Access Key + Secret Key) and credential file parsing
- SSO profile support with `ProfileOverrideCard` for SSM plugin path customization
- Per-account credential storage in `awsStore.ts` with localStorage persistence

**SSM Session Manager:**
- Interactive terminal sessions via `SsmTerminal` component using xterm.js
- PTY (pseudo-terminal) communication through Tauri events (`ssm-output`, `ssm-input`)
- Port forwarding tunnels for database/service access via `SsmPortForwardModal`
- Platform-specific plugin installation guide via `PlatformSetupGuide`

### GitHub Integration

**Components:** `GithubPanel`, `WorkflowRunList`, `WorkflowRunModal`, `JobLogsDrawer`

| Feature | Endpoint Category | Implementation |
|---------|------------------|----------------|
| **Repository Access** | Repos, Contents | `GithubCloudAdapter` in `git/infrastructure/` |
| **Pull Requests** | PRs, Reviews | `PRSection`, `CreatePRModal`, `MergePRModal` |
| **Actions Workflows** | Actions, Runs, Jobs | `WorkflowRunList`, `JobLogsDrawer` |
| **Cloud Repo Explorer** | Tree, Blobs | `CloudRepoExplorer` with branch selection |

**Authentication:** GitHub personal access tokens stored per-account in `gitStore.ts`

**Real-time Updates:** GitHub Actions watcher via `useGithubActionsWatcher` hook using Tauri backend events

### GitLab Integration

**Components:** `GitlabBranchViewerModal`, `GitlabFileTree`

| Feature | API Version | Implementation |
|---------|-------------|----------------|
| **Repository Browser** | API v4 | `GitlabCloudAdapter` |
| **Merge Requests** | API v4 | `MergePRModal`, `PRSection` |
| **Pipelines** | API v4 | Via cloud adapter |

**Authentication:** GitLab personal access tokens with URL normalization in `GitAccount.ts`

### Jenkins Integration

**Components:** `JenkinsPanel`, `JenkinsJobsTab`, `JenkinsPipelineStages`, `JenkinsLogViewer`, `LinkedProjectsDirectory`

| Feature | API Endpoint | Implementation |
|---------|--------------|----------------|
| **Job Discovery** | `/api/json` | `useJenkinsJobs` hook |
| **Build Triggers** | `/job/{name}/build` | `useJenkinsTriggerBuild` mutation |
| **Pipeline Stages** | `/wfapi/describe` | `JenkinsPipelineStages` |
| **Build Logs** | `/consoleText`, `/logText/progressiveText` | `JenkinsLogViewer` |

**Project Linking:** LocalStorage-persisted links between workspace projects and Jenkins jobs via `useJenkinsProjectLinks`

**Watcher System:** `useJenkinsWatcher` manages backend Rust worker for real-time build status updates

### Jira Integration

**Components:** `JiraPanel`, `BoardView`, `StoriesView`, `CalendarView`, `IssueDetailModal`, `CreateIssueForm`, `TransitionFieldsModal`

| Feature | API Version | Implementation |
|---------|-------------|----------------|
| **Issue CRUD** | REST API v3 | `TauriJiraAdapter` |
| **Projects/Metadata** | REST API v3 | `jiraApi.ts` |
| **Transitions** | REST API v3 | `useJiraTransitionMutation` |
| **Comments** | REST API v3 | `useJiraAddComment` |
| **Worklogs (Tempo)** | API v4 | `TauriTempoAdapter` |

**Authentication:** Multiple Jira accounts with token-based auth stored in `jiraStore.ts`

**ADF Rendering:** `AdfRenderer` component for Atlassian Document Format display

### SonarQube Integration

**Components:** `SonarPanel`, `SonarDashboard`, `SonarIssueRemediator`, `SonarAccountsManager`

| Feature | Implementation |
|---------|----------------|
| **Metrics Fetching** | `FetchMetricsUseCase` via `TauriSonarApiAdapter` |
| **Issue Discovery** | `FetchIssuesUseCase` via `TauriSonarApiAdapter` |
| **Project Scanning** | `TauriSonarScannerAdapter` |
| **Configuration** | `TauriSonarConfigAdapter` for `sonar-project.properties` |

**Authentication:** HTTP Basic auth or token-based auth per account

### Semgrep Integration

**Components:** `SemgrepPanel`, `SemgrepSidebarList`, `SemgrepFindingRemediator`

| Feature | Implementation |
|---------|----------------|
| **Installation Check** | `CheckSemgrepInstalledUseCase` |
| **Scan Execution** | `RunSemgrepScanUseCase` via `TauriSemgrepScannerAdapter` |
| **Event Streaming** | `TauriSemgrepEventAdapter` for real-time progress |

### Zeplin Integration

**Components:** `ZeplinPanel`

| Feature | Implementation |
|---------|----------------|
| **Project Listing** | `zeplinApi.ts` |
| **Screen/Flow Browsing** | `fetchZeplinScreenDetails`, `fetchZeplinFlowDetails` |
| **Design Diagrams** | `ZeplinFlowDiagram` component |

**Authentication:** Bearer token via Tauri HTTP plugin

### Docker Integration

**Components:** `DockerPanel`, `ContainerList`, `ContainerActions`, `ContainerFileExplorer`, `DockerInspectModal`

| Feature | Tauri Commands |
|---------|---------------|
| **Container Management** | `docker_list_containers`, `docker_start`, `docker_stop`, `docker_restart`, `docker_remove` |
| **File System** | `docker_cp` for file explorer and viewer |
| **Inspect** | `docker_inspect` for container/image metadata |
| **Logs** | `docker_logs` streaming |

**Hook:** `useDocker` provides React Query hooks for all Docker operations

### Package Registries

**Components:** `PackageExplorer`

| Registry | Implementation | Capabilities |
|----------|---------------|--------------|
| **npm** | `NpmRegistry` | Search, package details, local `package.json` parsing |
| **PyPI** | `PyPiRegistry` | Search, package details, local `requirements.txt` parsing |
| **Maven Central** | `JavaRegistry` | Search, local `pom.xml`/Gradle parsing |
| **Go** | `GoRegistry` | Package details, local `go.mod` parsing |
| **Cargo** | `CargoRegistry` | Package details, local `Cargo.toml` parsing |

**Registry Manager:** `RegistryManager` singleton maps project types to appropriate registry strategy

---

## Frontend-Backend Communication

### Tauri IPC Architecture

The application uses Tauri's IPC mechanism for all backend communication:

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  invoke(cmd, args)  │  events.listen()  │  emit(event, payload) │
└──────────┬──────────┴─────────┬────────┴──────────┬────────────┘
           │                    │                   │
           ▼                    ▼                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     TAURI IPC BRIDGE                             │
├──────────────────────────────────────────────────────────────────┤
│  Commands (request/response)  │  Events (pub/sub)  │  Windows   │
└──────────┬────────────────────┴─────────┬──────────┴────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────────────────┐
│   RUST BACKEND      │      │         RUST BACKEND                │
│   (blocking ops)    │      │         (async/streaming)          │
├─────────────────────┤      ├─────────────────────────────────────┤
│ • scan_projects     │      │ • Log streaming (service output)   │
│ • execute_script    │      │ • Process status updates            │
│ • docker_* commands │      │ • SSM terminal I/O                  │
│ • aws_* commands    │      │ • GitHub Actions watcher            │
│ • git_* commands    │      │ • Jenkins build watcher             │
└─────────────────────┘      └─────────────────────────────────────┘
```

### Command Categories

**1. Blocking Commands (invoke):**
- `scan_projects` - Project discovery
- `execute_service_script` - Script execution
- `kill_process` - Process termination
- All Docker operations (list, start, stop, inspect)
- All AWS operations (list, describe, invoke)
- Git operations (status, diff, commit, push, pull)

**2. Event Listeners (events.listen):**
- `service-output` - Service log streaming
- `process-update` - Process status changes
- `ssm-output` / `ssm-input` - SSM terminal I/O
- `github-actions-event` - GitHub Actions updates
- `jenkins-build-event` - Jenkins build updates
- `app-log-event` - Application logging
- `semgrep-event` - Semgrep scan progress

### HTTP Communication

External API calls use Tauri's HTTP plugin:

```typescript
// Example: Jira API via Tauri HTTP
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

**API Wrappers:**
- `jiraApi.ts` - Jira REST API v3
- `githubApi.ts` - GitHub REST API
- `gitlabApi.ts` - GitLab API v4
- `jenkinsApi.ts` - Jenkins API
- `tempoApi.ts` - Tempo API v4
- `zeplinApi.ts` - Zeplin API
- `cloudwatchApi.ts` - AWS CloudWatch/S3/SSM

---

## Third-Party Libraries

### UI and Styling

| Library | Version | Purpose |
|---------|---------|---------|
| **@base-ui-components/react** | ^1.0.0 | Headless UI primitives (Dialog, Popover, Select, Tabs) |
| **tailwindcss** | ^3.4.0 | Utility-first CSS framework |
| **class-variance-authority** | ^0.7.0 | Component variant styling |
| **lucide-react** | ^0.400.0 | Icon library |

### Code Editing

| Library | Version | Purpose |
|---------|---------|---------|
| **@monaco-editor/react** | ^4.6.0 | Monaco Editor integration for React |
| **recharts** | ^2.12.0 | Chart library for metrics visualization |

### Terminal Emulation

| Library | Version | Purpose |
|---------|---------|---------|
| **xterm** | ^5.3.0 | Terminal emulator for browser |
| **xterm-addon-fit** | ^0.8.0 | Auto-sizing terminal |
| **xterm-addon-search** | ^0.14.0 | Terminal search functionality |
| **xterm-addon-web-links** | ^0.9.0 | Clickable URLs in terminal |

### Data Fetching

| Library | Version | Purpose |
|---------|---------|---------|
| **@tanstack/react-query** | ^5.28.0 | Async state management and caching |

### State Management

| Library | Version | Purpose |
|---------|---------|---------|
| **zustand** | ^4.5.0 | Lightweight state management for stores |

### Diagram and Visualization

| Library | Version | Purpose |
|---------|---------|---------|
| **@xyflow/react** | ^12.0.0 | React Flow for visual workflow designer |
| **mermaid** | ^10.9.0 | Diagram rendering from text |

### Template Engines

| Library | Version | Purpose |
|---------|---------|---------|
| **ejs** | ^3.1.10 | Embedded JavaScript templates |
| **mustache** | ^4.2.0 | Logic-less templates |
| **liquidjs** | ^10.14.0 | Shopify Liquid templates |
| **pug** | ^3.0.3 | Pug template engine |

### Testing

| Library | Version | Purpose |
|---------|---------|---------|
| **vitest** | ^1.4.0 | Unit testing framework |
| **@testing-library/react** | ^14.2.0 | React component testing |
| **jsdom** | ^24.0.0 | DOM environment for tests |

### Miscellaneous

| Library | Version | Purpose |
|---------|---------|---------|
| **date-fns** | ^3.6.0 | Date manipulation |
| **uuid** | ^9.0.0 | UUID generation |
| **@tauri-apps/api** | ^1.5.0 | Tauri JavaScript API |
| **@tauri-apps/plugin-http** | ^1.5.0 | Tauri HTTP plugin |
| **@tauri-apps/plugin-shell** | ^1.5.0 | Tauri shell plugin |
| **qrcode** | ^1.5.3 | QR code generation for file server |

---

## Event-Driven Integrations

### Process Event Stream

```
Backend Rust ──(service-output event)──► Frontend ──(Terminal component)
                                          │
                                          ▼
                                    xterm.js Display
```

- Services emit stdout/stderr via `service-output` events
- `TerminalView` and `TaskTerminal` components subscribe to these events
- Logs are batched in `processStore.ts` for performance

### SSM Terminal I/O

```
User Input ──(ssm-input event)──► Backend ──(ssh connection)──► EC2 Instance
                                    │
                                    ▼
Backend ──(ssm-output event)──► SsmTerminal component ──► xterm.js
```

### GitHub Actions Watcher

```
Backend Worker ──(github-actions-event)──► useGithubActionsWatcher ──► React Query Cache
```

### Jenkins Build Watcher

```
Backend Worker ──(jenkins-build-event)──► useJenkinsWatcher ──► useJenkinsJobs refetch
```

### Semgrep Scan Progress

```
Backend ──(semgrep-event)──► useSemgrepScan hook ──► Progress UI
```

---

## Authentication Mechanisms

### AWS Credentials

```typescript
interface AwsAccount {
  id: string;
  name: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  ssmPluginPath?: string;  // Per-account SSM override
}
```

**Storage:** localStorage via `awsStore` with optional encryption

### GitHub/GitLab Tokens

```typescript
interface GitAccount {
  id: string;
  provider: 'github' | 'gitlab';
  token: string;
  apiUrl: string;  // Supports GitHub Enterprise, GitLab self-hosted
}
```

**Storage:** `gitStore.ts` with per-repository account assignment support

### Jira Authentication

```typescript
interface JiraAccount {
  id: string;
  domain: string;
  email: string;
  token: string;  // API token
  tempoToken?: string;  // Tempo API token
}
```

### SonarQube Authentication

```typescript
interface SonarAccount {
  id: string;
  url: string;
  authType: 'token' | 'basic';
  token?: string;
  username?: string;
  password?: string;
}
```

### Zeplin Authentication

```typescript
interface ZeplinAccount {
  id: string;
  token: string;
}
```

---

## Data Flow Patterns

### API Query Pattern (React Query)

```typescript
// Example: Lambda functions
const { data, isLoading } = useQuery({
  queryKey: awsKeys.lambda.functions(accountId),
  queryFn: () => invoke('lambda_list_functions', { 
    credentials: getAwsCredentials(accountId),
    region 
  }),
  enabled: !!accountId && !!region,
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

### Mutation Pattern

```typescript
// Example: Trigger Jenkins build
const triggerBuild = useMutation({
  mutationFn: ({ jobUrl, params }) => 
    invoke('jenkins_trigger_build', { jobUrl, params }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: jenkinsKeys.builds });
  }
});
```

### Real-time Event Pattern

```typescript
// Example: Service log streaming
useEffect(() => {
  const unlisten = listen('service-output', (event) => {
    appendLogsToProcess(event.payload.processId, event.payload.output);
  });
  return () => { unlisten.then(fn => fn()); };
}, []);
```

---

## Webhook Considerations

Currently, the application does **not** implement outbound webhooks. All integrations are:

1. **Pull-based:** Frontend polls or uses backend workers to check for updates
2. **Event-driven internally:** Backend emits events that frontend subscribes to

**Future webhook support would enable:**
- External CI/CD triggers on git events
- Slack/Teams notifications on build status
- Custom automation triggers on Jira issue changes