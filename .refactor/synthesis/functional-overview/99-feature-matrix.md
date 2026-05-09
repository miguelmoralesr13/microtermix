| Feature | Entity | Create | Read | Update | Delete | Other Ops |
|---------|--------|--------|------|--------|--------|-----------|
| **AWS** | | | | | | |
| | AWS Account | ✓ | ✓ | ✓ | ✓ | Test connection, Quick paste credentials |
| | API Gateway API | - | ✓ | - | - | Filter, Favorite, Search, Export OpenAPI |
| | API Gateway Resource | - | ✓ | - | - | Tree view |
| | API Gateway Stage | - | ✓ | - | - | Select, Preview |
| | API Gateway Method | - | ✓ | - | ✓ | Invoke/Execute |
| | EC2 Instance | - | ✓ | - | ✓ | Start, Stop, Reboot, Connect SSH/SSM, SSM Tunnel |
| | ECS Cluster | - | ✓ | - | - | Select prefix filter |
| | ECS Service | - | ✓ | - | - | View tasks |
| | ECS Task | - | ✓ | - | - | View containers |
| | Lambda Function | - | ✓ | - | - | Search, Invoke, View logs |
| | Step Functions Machine | - | ✓ | - | - | Invoke, View ASL diagram |
| | Step Functions Execution | - | ✓ | - | - | Inspect, List history |
| | S3 Bucket | - | ✓ | - | - | List objects, Download |
| | CloudWatch Log Group | - | ✓ | - | - | Filter, Export, Favorite |
| | CloudWatch Log Stream | - | ✓ | - | - | Stream events |
| | CloudWatch Metric | - | ✓ | - | - | Chart, Filter dimension, Set time range |
| | SSM Parameter | - | ✓ | - | - | Copy value |
| | Secrets Manager Secret | - | ✓ | - | - | Copy value |
| | SSM Tunnel | ✓ | ✓ | - | ✓ | Start/Stop port forward |
| **Docker** | | | | | | |
| | Container | - | ✓ | - | ✓ | Start, Stop, Restart, Inspect, Terminal, Logs, Explore files |
| | Container Image | - | ✓ | - | - | Inspect |
| | Container File | - | ✓ | - | - | Browse, View, Open in editor |
| | Docker Network | - | ✓ | - | - | View drivers |
| | Docker Volume | - | ✓ | - | - | View |
| **Git** | | | | | | |
| | Git Account | ✓ | ✓ | ✓ | ✓ | Verify token |
| | Repository | - | ✓ | - | - | Clone, Init, Open |
| | Remote | - | ✓ | - | ✓ | Add, Fetch, Push, Pull |
| | Branch | - | ✓ | - | ✓ | Create, Switch, Delete, Rename, Merge, Cherry-pick, Compare |
| | Commit | - | ✓ | - | ✓ | Amend, Squash, Reword, Revert, Delete |
| | Staged Changes | - | ✓ | - | ✓ | Stage, Unstage, Discard, Reset |
| | Stash | ✓ | ✓ | - | ✓ | Apply, Pop, Drop, View diff |
| | Remote Repo (Cloud) | - | ✓ | - | - | Browse files, View commits |
| | Pull Request | ✓ | ✓ | - | ✓ | Create, Merge, Close, Compare |
| | Merge Request | ✓ | ✓ | - | ✓ | Create, Merge, Close |
| | Workflow Run | - | ✓ | - | - | Trigger, View jobs/logs |
| | File History | - | ✓ | - | - | View commits, View diff |
| | Conflict | - | ✓ | - | - | Resolve, Mark resolved |
| **HTTP Client** | | | | | | |
| | Collection | ✓ | ✓ | ✓ | ✓ | Import/Export Postman, cURL parse |
| | Folder | ✓ | ✓ | ✓ | ✓ | - |
| | Request | ✓ | ✓ | ✓ | ✓ | Execute, Duplicate |
| | Environment | ✓ | ✓ | ✓ | ✓ | - |
| | Variable | ✓ | ✓ | ✓ | ✓ | Interpolate, Auto-complete |
| **Jira** | | | | | | |
| | Jira Account | ✓ | ✓ | ✓ | ✓ | Test connection |
| | Issue | ✓ | ✓ | ✓ | ✓ | Search, Transition, Assign, Link, Log work |
| | Epic | ✓ | ✓ | ✓ | - | View stories |
| | Subtask | ✓ | ✓ | - | ✓ | Create, Transition, Discard |
| | Comment | ✓ | ✓ | - | ✓ | Add attachments |
| | Worklog | ✓ | ✓ | ✓ | ✓ | View by day/issue, Tempo logs |
| | Board | - | ✓ | - | - | Filter, Search |
| | Calendar | - | ✓ | - | - | Week/month view |
| | Transition | - | ✓ | - | ✓ | Execute with fields |
| | Attachment | - | ✓ | - | - | View, Download, Full-screen |
| **Jenkins** | | | | | | |
| | Jenkins Account | ✓ | ✓ | ✓ | ✓ | - |
| | Job | - | ✓ | - | - | Trigger, Abort, Favorite |
| | Build | - | ✓ | - | - | View logs, View stages |
| | Pipeline Stage | - | ✓ | - | - | View nodes |
| | Project Link | ✓ | ✓ | ✓ | ✓ | Link workspace to job |
| **Sonar** | | | | | | |
| | Sonar Account | ✓ | ✓ | ✓ | ✓ | - |
| | Project | - | ✓ | - | - | Search, Link to workspace |
| | Metric | - | ✓ | - | - | Chart, Display dashboard |
| | Issue | - | ✓ | - | ✓ | View, Remediate |
| | Rule | - | ✓ | - | - | - |
| | Scan | ✓ | - | - | ✓ | Run, Stop |
| | Project Settings | - | ✓ | ✓ | - | Edit sonar-project.properties |
| **Semgrep** | | | | | | |
| | Scan | ✓ | - | - | ✓ | Run, Stop, Check installed |
| | Finding | - | ✓ | - | - | View, Remediate |
| **Services** | | | | | | |
| | Project | - | ✓ | - | - | Scan, Select, Filter, Settings |
| | Script | ✓ | ✓ | ✓ | ✓ | Execute, Save alias, Multi-execute |
| | Terminal | ✓ | - | - | ✓ | Open, Close, Restart, Stop, Detach, Reattach |
| | Environment | ✓ | ✓ | ✓ | ✓ | Import .env, Apply ENVS, Per-project JDK |
| | Package Dependency | - | ✓ | - | - | Search registry, Install, View local |
| | Vite Config | - | ✓ | ✓ | - | Preview, Configure MFE remotes |
| | Service Log | - | ✓ | - | - | Stream, Read history |
| **Processes** | | | | | | |
| | Listening Process | - | ✓ | - | ✓ | Kill, Filter by protocol/port, Launch browser |
| | System Metrics | - | ✓ | - | - | Monitor CPU/RAM/threads/uptime |
| **Notes** | | | | | | |
| | Note | ✓ | ✓ | ✓ | ✓ | Auto-save, Preview Markdown |
| **Regex** | | | | | | |
| | Pattern Test | - | - | - | - | Test, Match, Extract groups, Benchmark |
| **JSON Processor** | | | | | | |
| | JSON Input | ✓ | ✓ | ✓ | - | Validate, Format, Minify, Escape/Unescape |
| | JSON Diff | - | - | - | - | Compare two documents |
| | JSON Flatten | - | - | - | - | Convert to dot notation |
| | JSON Path Query | - | ✓ | - | - | Query with expressions |
| | JSON Tree View | - | ✓ | - | - | Interactive collapse |
| | JSON Node Editor | ✓ | - | ✓ | - | Build object visually |
| | JSON Type Converter | - | - | - | - | Generate TS/C#/Go/Python types |
| | JWT Decode | - | ✓ | - | - | Decode header/payload/signature |
| **Swagger** | | | | | | | |
| | OpenAPI Spec | ✓ | ✓ | ✓ | ✓ | Import, Export, Live preview, Convert JSON↔YAML |
| **Mock Server** | | | | | |
| | Mock Folder | ✓ | ✓ | ✓ | ✓ | - |
| | Mock Endpoint | ✓ | ✓ | ✓ | ✓ | - |
| | Mock Server | - | - | ✓ | - | Start, Stop, Configure port |
| **Networking** | | | | | | |
| | File Server | ✓ | ✓ | ✓ | ✓ | Start, Stop, Configure routes, QR code |
| | Proxy Route | ✓ | ✓ | ✓ | ✓ | Route requests |
| | Encryption Key | ✓ | ✓ | ✓ | ✓ | Fetch from service |
| | Cipher Value | - | - | - | - | Encrypt, Decrypt |
| **Zeplin** | | | | | | |
| | Zeplin Account | ✓ | ✓ | ✓ | ✓ | Verify token |
| | Project | - | ✓ | - | - | Browse screens |
| | Screen | - | ✓ | - | - | View, Annotations |
| | Flow | - | ✓ | - | - | View diagram |
| **Templates** | | | | | | |
| | Template | ✓ | ✓ | ✓ | ✓ | Compile with EJS/Liquid/Mustache/Pug |
| **Design** | | | | | | |
| | Flowchart | ✓ | ✓ | ✓ | ✓ | Export Mermaid, Visual design |
| **Testing** | | | | | | |
| | Test Run | ✓ | ✓ | - | ✓ | Execute, View coverage |
| | Coverage | - | ✓ | - | - | Dashboard, Per-project stats |