# microtermix - Functional Specification

## Part 1: Project Overview

### What is microtermix?

**microtermix** is a unified developer workspace application that consolidates essential development tools and cloud service management into a single, integrated desktop environment. Built as a Tauri-based desktop application, it provides developers with centralized access to AWS cloud services, Docker containers, Git version control, HTTP API testing, CI/CD pipelines (Jenkins), issue tracking (Jira), security scanning, code quality analysis, and numerous developer utilities.

### Who is it for?

microtermix targets **full-stack developers and DevOps engineers** who work with multiple cloud platforms, containerized applications, and distributed services. The application serves:

- Backend developers managing AWS infrastructure (Lambda, EC2, ECS, Step Functions)
- DevOps engineers orchestrating Docker containers and CI/CD pipelines
- Full-stack teams requiring integrated Git workflows with issue tracking
- Security-conscious developers using static analysis tools (Semgrep, SonarQube)
- Teams needing unified HTTP API development and testing capabilities

### What problem does it solve?

Modern development workflows require constant context-switching between disparate tools:

| Pain Point | Solution |
|------------|----------|
| Fragmented tool landscape | Single application with unified UI for all dev tools |
| AWS Console complexity | Integrated browser for EC2, Lambda, Step Functions, S3, CloudWatch |
| Docker CLI tedium | Visual container management with file explorer and terminal access |
| Git command-line overhead | Visual staging, conflict resolution, timeline graphs, PR management |
| Postman/browser API testing | Built-in HTTP client with collections, environments, variable interpolation |
| Jenkins web UI latency | Native desktop integration with real-time build monitoring |
| Jira/Tempo context switching | Embedded issue boards, worklog management, and commit integration |
| Scattered terminals | Multi-tab terminal emulator with PTY support and theme customization |
| Security blind spots | Integrated Semgrep scanning and SonarQube quality gates |

### Core Value Proposition

1. **Unified Workspace**: One application replaces 10+ browser tabs and CLI tools
2. **Native Performance**: Tauri/Rust backend provides low-latency file system and process operations
3. **Integrated Workflows**: Git commits automatically link to Jira tickets; AWS Lambda invocations show CloudWatch logs
4. **Visual Operations**: Complex Git operations (rebase, merge, conflict resolution) become point-and-click
5. **Enterprise-Ready**: Multi-account support for AWS, Jira, SonarQube, GitHub/GitLab
6. **Extensible**: Modular architecture allows adding new tools and integrations

### Key Technologies and Frameworks

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Runtime** | Tauri 2.x | Desktop application shell with WebView |
| **Frontend** | React 18 + TypeScript | Reactive UI framework |
| **State Management** | Zustand | Lightweight state store with persistence |
| **Data Fetching** | TanStack Query (React Query) | Async state management and caching |
| **Styling** | Tailwind CSS + Base UI | Utility-first CSS with accessible primitives |
| **Code Editor** | Monaco Editor | VS Code's editor component |
| **Terminal** | xterm.js | Terminal emulator with PTY support |
| **Charts** | Recharts | Data visualization for metrics |
| **Icons** | Lucide React | Consistent icon system |
| **HTTP Client** | Tauri HTTP Plugin | Secure outbound requests |
| **File System** | Tauri FS Plugin | Native file operations |
| **Process Management** | Tauri IPC + Rust backends | Service spawning, process killing |

#### Backend Integrations

- **AWS SDK**: EC2, Lambda, Step Functions, ECS, S3, CloudWatch, API Gateway, Secrets Manager, SSM
- **Docker Engine API**: Container lifecycle, file browsing, logs, inspect
- **Git (libgit2 via Tauri)**: Full version control operations
- **Jenkins API**: Job triggers, build logs, pipeline stage visualization
- **Jira REST API v3**: Issue CRUD, transitions, attachments, comments
- **Tempo API v4**: Worklog creation, editing, time tracking
- **GitHub/GitLab APIs**: PRs/MRs, workflows, repository browsing

#### Testing & Quality

- Vitest for unit testing
- TypeScript strict mode throughout
- Modular architecture with port/adapter pattern for testability