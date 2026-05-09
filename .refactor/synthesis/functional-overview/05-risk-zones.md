# PART 6/7: RISK ZONES & COMPLEXITY

## 1. Complexity Hotspots

### Critical Complexity Zones

| Module | Files | Risk Level | Complexity Factors |
|--------|-------|------------|---------------------|
| **aws** | 55 | 🔴 CRITICAL | SSM tunnel management, PTY integration, multi-service integration (EC2/ECS/Lambda/SFN/S3/APIGW/CloudWatch) |
| **git** | 68 | 🔴 CRITICAL | Cloud provider abstraction (GitHub/GitLab), conflict resolution, PTY terminal integration, 3-way diff viewer |
| **jira** | 41 | 🟠 HIGH | ADF rendering, Tempo integration, workflow transitions, multi-account management |
| **services** | 48 | 🟠 HIGH | Script execution, project scanning, terminal management, registry abstraction |
| **sonar** | 23 | 🟡 MEDIUM | Scanner execution, metrics aggregation, issue remediation, local config parsing |
| **jenkins** | 15 | 🔴 CRITICAL | 7 files failed analysis - undocumented behavior; Pipeline stage visualization |

### Architecture Complexity Signals

- **Port/Adapter Proliferation**: 12+ infrastructure adapters across processes, semgrep, sonar, jira, git modules with similar patterns but inconsistent implementations
- **Cross-cutting Concerns**: 10+ stores (awsStore, gitStore, jiraStore, jenkinsStore, sonarStore, etc.) with overlapping concerns like account management and localStorage persistence
- **Hook Duplication**: 25+ query hooks with near-identical patterns (e.g., `useXxxInstalled`, `useXxxScan` across semgrep, sonar, tools)

---

## 2. High-Priority Refactoring Areas

### Refactoring Priority Matrix

| Priority | Area | File(s) | Issue | Suggested Action |
|----------|------|---------|-------|------------------|
| P0 | **Jenkins Components** | 7 files | All failed analysis - undocumented, untested | Complete analysis, add unit tests |
| P0 | **AWS SSM Tunneling** | Ec2Tab.tsx, SsmTerminal.tsx, EC2Panel.tsx | PTY lifecycle complexity, external Rust command coupling | Extract SSMTunnelManager class, add cleanup verification |
| P0 | **Git Conflict Resolution** | GitConflictResolver.tsx | Complex Monaco integration, conflict block parsing | Simplify or extract conflict parsing to domain layer |
| P1 | **Store Consolidation** | 15+ store files | Scattered state management, inconsistent patterns | Create domain-specific store factories |
| P1 | **Log Virtualization** | LogsTab.tsx | Virtualized rendering with JSON parsing | Consider WebWorker offloading for large logs |
| P1 | **Monaco Instance Management** | EditorPanel.tsx, 20+ usages | Duplicated editor instances | Implement editor pool or shared instance |
| P2 | **Query Hook Composition** | useXxxQueries.ts | 25+ similar hooks | Create generic hook factories |
| P2 | **AWS Query Patterns** | 6 AWS query hook files | Duplicated error handling and key factories | Extract shared query utilities |
| P2 | **Template Engines** | TemplateEngineFactory.ts, 5 engines | Dynamic import complexity | Standardize engine interface |

### Specific Refactoring Candidates

**1. Git Infrastructure Layer** (Medium Effort, High Impact)
```
git/infrastructure/
├── TauriGitAdapter.ts      # 1000+ lines, multiple concerns
├── TauriGitDiffAdapter.ts  # Diff parsing mixed with Tauri calls
├── GithubCloudAdapter.ts   # Similar to Gitlab adapter
└── GitlabCloudAdapter.ts    # Duplicate patterns
```
→ Extract pure domain functions, leave Tauri calls in adapters only

**2. AWS Credential Management** (High Effort, High Impact)
```
aws/AccountDetailView.tsx   # 500+ lines
aws/AccountCreateDialog.tsx
aws/SettingsTab.tsx
aws/cwUtils.tsx            # Shared credential utilities scattered
```
→ Create AwsCredentialService with clear CRUD interface

**3. Jira ADF Rendering** (Medium Effort, Medium Impact)
```
jira/AdfRenderer.tsx      # Failed analysis - complex rendering logic
jira/AuthenticatedMedia.tsx
```
→ Needs documentation and potential React component refactoring

---

## 3. Technical Debt Inventory

### Immediate Debt (Address Within Current Sprint)

| Debt Item | Location | Impact | Effort |
|-----------|----------|--------|--------|
| Undocumented Jenkins components | src/components/jenkins/* (7 files) | Bug risk, unknown behavior | 2-3 days |
| Missing test coverage | stores/, hooks/ | Regression risk | 3-4 days |
| Inconsistent error handling | AWS queries, Git operations | Poor UX | 1-2 days |
| Hardcoded timeouts | Ec2Terminal.tsx, SsmTerminal.tsx | Reliability | 0.5 day |

### Medium-Term Debt (Address in 1-2 Sprints)

| Debt Item | Location | Impact | Effort |
|-----------|----------|--------|--------|
| Store proliferation | 15+ Zustand stores | Cognitive load, state sync bugs | 1-2 weeks |
| Duplicate Monaco instances | 20+ editor usages | Performance, theme sync issues | 1 week |
| Inconsistent API error formats | services/*.ts | Error handling complexity | 1 week |
| Missing loading/error states | Several panels | UX consistency | 3-4 days |
| Type duplication | components/aws/*.ts vs stores/*.ts | Maintenance burden | 2-3 days |

### Long-Term Debt (Plan for Refactoring)

| Debt Item | Impact | Mitigation |
|-----------|--------|------------|
| Monorepo structure within single package | Scaling challenges | Consider workspace splitting if >50% growth |
| PTY integration complexity | Reliability on multiple platforms | Abstract into isolated service with extensive tests |
| Cloud provider abstraction leaks | GitHub-specific assumptions in GitLab adapter | Define strict port interfaces |

---

## 4. Security Concerns

### 🔴 Critical Security Issues

| Issue | Location | Description | Mitigation |
|-------|----------|-------------|------------|
| **Plain-text credential storage** | awsStore.ts, AccountDetailView.tsx | AWS credentials stored in localStorage without encryption | Implement encrypted storage or use OS keychain |
| **Token exposure in logs** | jira/jiraApi.ts, git services | API tokens may appear in console logs or error messages | Audit all jiraFetch, gitFetch calls for token masking |
| **SSM tunnel port binding** | EC2Panel.tsx, SsmTunnel | Arbitrary port forwarding could conflict with existing services | Add port collision detection |
| **Git clone URL validation** | CloneRepoModal.tsx | Repository URLs accepted without sanitization | Validate against allowlist or warn on suspicious URLs |

### 🟠 High-Risk Security Areas

| Area | Risk | Description |
|------|------|-------------|
| **LibCipher** | Crypto implementation | Browser-side encryption may be used incorrectly; no formal crypto audit |
| **Template Engine Execution** | Arbitrary code execution | Mustache/EJS/Pug engines execute arbitrary template code |
| **Docker File Explorer** | Path traversal | ContainerFileExplorer.tsx navigates arbitrary container paths |
| **Mock Server** | HTTP server binding | MockServerControls.tsx creates HTTP endpoints from user input |

### 🟡 Medium Security Concerns

- **XSS via Mermaid diagrams** (VisualDesigner.tsx, MermaidRenderer.tsx): User-controlled node data rendered as SVG
- **OAuth token persistence** (JiraPanel.tsx, GithubPanel.tsx): Tokens persisted without expiry validation
- **Command injection potential** (ScriptCommand.ts, tauriScriptExecutor.ts): Shell command construction from user scripts
- **Cross-origin requests** (ZeplinPanel.tsx, services/*): HTTP requests to external APIs without CORS validation

---

## 5. Performance Bottlenecks

### Critical Performance Issues

| Issue | Location | Evidence | Fix |
|-------|----------|----------|-----|
| **CloudWatch log streaming** | LogsTab.tsx | 10,000+ events without WebWorker | Offload parsing to WebWorker |
| **Monaco editor duplication** | 20+ instances | Each panel creates new editor | Implement editor pool/registry |
| **Git timeline rendering** | GitTimeline.tsx | 500+ commits causes lag | Virtualize with react-window |
| **EC2 instance list** | Ec2InstanceRow.tsx | Large AWS accounts slow | Add pagination |
| **Project scanning** | tauriProjectScanner.ts | Recursive directory scan blocks UI | Async with progress events |

### Performance Risk Areas

```
High Risk:
├── useEc2Instances (no pagination/caching)
├── useLogGroups + useLogEvents (no pagination)
├── CloudRepoExplorer (unbounded API results)
├── GitTimeline (unbounded commit history)
└── ServiceTerminals (multiple xterm instances)

Medium Risk:
├── useHttpState (large collection state)
├── ProjectListPane (100+ projects)
├── SemgrepPanel (large finding sets)
└── SonarDashboard (multi-metric aggregation)
```

### Memory Leak Risks

| Component | Issue | Detection |
|-----------|-------|-----------|
| **Terminal instances** | xterm.js not disposed on tab close | Add disposal verification |
| **Monaco editors** | Editor state retained after modal close | Verify dispose() calls |
| **Event listeners** | Tauri event listeners not removed on unmount | Audit useEffect cleanup |
| **React Query cache** | Infinite cache growth without stale time | Configure cache limits |

---

## 6. Maintainability Issues

### Code Organization Problems

| Problem | Evidence | Impact |
|---------|----------|--------|
| **Unclear module boundaries** | aws/ contains both components and types | Difficulty locating code |
| **Duplicate types** | GitCommit in components/git AND git/domain | Confusion on which to use |
| **Mixed abstraction layers** | useXxxQueries (hooks) alongside useXxx (hooks) | Inconsistent patterns |
| **Inconsistent naming** | `SsmTunnel` vs `SsmPortForwardModal` vs `Ec2SshSettings` | Hard to find related code |

### Test Coverage Gaps

| Area | Coverage | Risk |
|------|----------|------|
| Stores (15 files) | Minimal unit tests | State mutations unreliably tested |
| Jenkins integration | Zero tests | Failed analysis files = zero tests |
| AWS SSM tunneling | No tests | Critical reliability path untested |
| Git cloud adapters | Basic tests only | Complex API integration untested |
| Jira ADF renderer | Failed analysis | Core component untested |

### Technical Debt by Module

```
aws/        → 180 issues: Credential management, SSM lifecycle, PTY complexity
git/        → 224 issues: Cloud provider abstraction, conflict resolution, PTY
jira/       → 151 issues: ADF rendering, Tempo integration, multi-account
services/   → 149 issues: Script execution, terminal management
sonar/      →  83 issues: Scanner execution, metrics aggregation
jenkins/    →  27 issues: 7 failed files = undocumented/untested code
ui/         → 106 issues: Component inconsistency, duplicated patterns
```

---

## 7. Recommended Priority Actions

### Immediately (P0)
1. **Document 7 failed Jenkins components** - unknown behavior is critical risk
2. **Add SSM tunnel cleanup verification** - prevent orphaned port forwards
3. **Audit credential storage** - encrypt or migrate to OS keychain
4. **Add test coverage for critical paths** - Git operations, AWS SSM, service execution

### Short-term (P1)
1. **Consolidate similar query hooks** - reduce duplication, ease maintenance
2. **Implement virtualized lists** - Git timeline, CloudWatch logs, EC2 instances
3. **Add Monaco editor pooling** - reduce memory usage
4. **Standardize error handling patterns** - consistent UX across modules

### Medium-term (P2)
1. **Refactor store architecture** - consider domain-specific store factories
2. **Extract pure domain from adapters** - improve testability
3. **Create shared component library** - reduce duplication in UI layer
4. **Add performance monitoring** - track render times, API latency