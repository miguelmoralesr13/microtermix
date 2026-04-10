# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When creating a pull request, opening a PR, or preparing changes for review | branch-pr | ~/.claude/skills/branch-pr/SKILL.md |
| When writing Go tests, using teatest, or adding test coverage | go-testing | ~/.claude/skills/go-testing/SKILL.md |
| When creating a GitHub issue, reporting a bug, or requesting a feature | issue-creation | ~/.claude/skills/issue-creation/SKILL.md |
| When user says "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen" | judgment-day | ~/.claude/skills/judgment-day/SKILL.md |
| When user asks to create a new skill, add agent instructions, or document patterns for AI | skill-creator | ~/.claude/skills/skill-creator/SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### branch-pr
- Every PR MUST link an approved issue — no exceptions
- Every PR MUST have exactly one `type:*` label
- Automated checks must pass before merge is possible
- Branch naming: `type/description` (lowercase, regex `^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$`)
- Workflow: verify issue `status:approved` → create branch → implement → run shellcheck → open PR → add label → wait for checks
- Blank PRs without issue linkage are blocked by GitHub Actions

### go-testing
- Use table-driven tests with named cases: `tests := []struct{ name, input, expected string; wantErr bool }{...}`
- Run subtests with `t.Run(tt.name, func(t *testing.T) {...})`
- Test Bubbletea models directly by calling `m.Update(msg)` and asserting state
- Use `teatest` (Charmbracelet) for integration/TUI testing — send input, assert output
- Use golden files for complex output: read expected from `testdata/*.golden`, update with `-update` flag
- `go test ./...` runs all tests; `go test -run TestName ./pkg/...` for targeted runs
- NOTE: This project is Tauri/Rust+React — go-testing applies only if Go code is added

### issue-creation
- Blank issues are disabled — MUST use a template (bug report or feature request)
- Every issue gets `status:needs-review` automatically on creation
- A maintainer MUST add `status:approved` before any PR can be opened
- Questions go to Discussions, not issues
- Workflow: search for duplicates → choose template → fill ALL fields → check checkboxes → submit → wait for approval
- Bug report requires: description, steps to reproduce, expected vs actual behavior, OS

### judgment-day
- Launch TWO sub-agents in parallel (blind, independent — neither knows about the other)
- Orchestrator synthesizes: Confirmed (both found) / Suspect A / Suspect B / Contradiction
- Classify warnings: real (can happen in normal usage) vs theoretical (contrived scenario) — theoretical → report as INFO only
- Round 1: present verdict, ask user to confirm fixes before applying; Round 2+: re-judge only for confirmed CRITICALs
- After 2 fix iterations with remaining issues → JUDGMENT: ESCALATED, ask user to continue
- Resolve skill registry BEFORE launching judges — inject compact rules into both judge prompts

### skill-creator
- Skills live in `~/.claude/skills/{name}/SKILL.md` (user-level) or `{project}/.claude/skills/{name}/SKILL.md` (project-level)
- SKILL.md MUST have frontmatter: `name`, `description` (with `Trigger:` line), `license`
- Critical Patterns section is most important — keep actionable, no fluff
- Compact rules must be 5–15 lines per skill
- Use `assets/` for templates/schemas, `references/` for local docs
- Naming: `{technology}` for generic, `{project}-{component}` for project-specific, `{action}-{target}` for workflows

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| CLAUDE.md | /Users/miguelangelmorales/projects/personal/microtermix/CLAUDE.md | Project-level conventions, architecture, shadcn/ui rules |

Read the convention files listed above for project-specific patterns and rules.
