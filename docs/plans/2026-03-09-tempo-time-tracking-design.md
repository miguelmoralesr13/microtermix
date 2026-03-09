# Tempo Time Tracking — Design Doc
**Date:** 2026-03-09
**Status:** Approved

## Overview

Add a "Time" tab to the existing JiraPanel that integrates the Tempo Cloud API v4 (`api.tempo.io/4`). Users can view their worklogs by week/month, log time, edit and delete entries, and see totals per issue — all without leaving Microtermix.

shadcn/ui is introduced as the component library (style: new-york, no CSS variables, preserves nexus-* tokens). Toast notifications via sonner.

---

## File Structure

```
src/
├── components/
│   └── jira/
│       ├── TempoTab.tsx         # Root of the Time tab
│       ├── WorklogList.tsx      # Worklogs grouped by day
│       ├── WorklogCard.tsx      # Individual worklog card
│       ├── LogTimeModal.tsx     # shadcn Dialog: create / edit worklog
│       └── PeriodSelector.tsx  # Week / Month navigator
├── services/
│   └── tempoApi.ts             # Tempo Cloud API v4 calls
└── stores/
    └── tempoStore.ts           # Zustand with persist
```

shadcn components to install: `dialog`, `tabs`, `badge`, `calendar`, `popover`, `select`, `input`, `textarea`, `button`, `label`, `separator`, `tooltip`, `sonner`.

---

## UX Layout

### Tab: "Time" (new tab in JiraPanel tab bar)

#### Sub-tab: "Mis Worklogs" (default)
- `PeriodSelector`: Semana / Mes toggle + ← → navigation showing current range
- `WorklogList`: worklogs grouped by day (desc), each day showing total
- `WorklogCard`: issue key + summary, time logged, description, edit/delete buttons
- Footer: total hours for the period

#### Sub-tab: "Por Issue"
- Issue key input / dropdown of assigned issues
- All worklogs for that issue + cumulative total
- "Log Time" floating button always visible

### LogTimeModal (shadcn Dialog)
- DatePicker: Calendar inside Popover
- Time input: parses `1h 30m`, `1.5h`, `90m` → seconds
- Textarea: description
- Issue selector: searchable, pre-populated when opened from a card
- On success: sonner toast + invalidate store
- On error: sonner toast with API error message

---

## API Layer — tempoApi.ts

Base URL: `https://api.tempo.io/4`
Auth: `Authorization: Bearer <tempoToken>`
All calls go through the existing Tauri `make_http_request` command (CORS bypass).

| Function | Method | Endpoint |
|---|---|---|
| `getMyWorklogs(token, accountId, from, to)` | GET | `/worklogs?authorAccountId=&from=&to=` |
| `getIssueWorklogs(token, issueId)` | GET | `/worklogs?issue={issueId}` |
| `createWorklog(token, data)` | POST | `/worklogs` |
| `updateWorklog(token, id, data)` | PUT | `/worklogs/{id}` |
| `deleteWorklog(token, id)` | DELETE | `/worklogs/{id}` |

Payload for create/update:
```ts
{
  issueId: number,
  authorAccountId: string,
  timeSpentSeconds: number,
  startDate: string,       // YYYY-MM-DD
  startTime?: string,      // HH:mm:ss
  description?: string,
}
```

---

## State — tempoStore.ts

```ts
interface TempoStore {
  worklogs: Record<string, Worklog[]>  // key = accountId
  period: { type: 'week' | 'month'; anchor: string }  // anchor = ISO date
  loading: boolean
  error: string | null

  setPeriod(type, anchor): void
  fetchWorklogs(token, accountId, jiraBaseUrl): Promise<void>
  addWorklog / updateWorklog / removeWorklog: optimistic updates
}
```

Persisted: `period` only. Worklogs always re-fetched on mount.

---

## Integration Points

1. **JiraPanel.tsx**: add `'time'` to tabs list, render `<TempoTab>` when active
2. **Settings tab** (existing): add `tempoToken` field to JiraAccount form
3. **jiraStore.ts**: add `tempoToken?: string` to `JiraAccount` interface
4. **WorklogCard** "Log Time" button on issue cards in Board/Stories views (stretch goal, not in MVP)

---

## shadcn/ui Setup

```bash
npx shadcn@latest init
# style: new-york
# base color: neutral
# CSS variables: NO  (preserves nexus-* token system)
```

Components added to `src/components/ui/` (coexist with existing custom components).

---

## Decisions

- Tempo token stored per JiraAccount (some users have multiple Jira + Tempo accounts)
- No Tempo periods API — derive week/month ranges client-side (simpler, no extra endpoint)
- Time parsing: `1h 30m` → 5400s, `1.5h` → 5400s, `90m` → 5400s, `3600` → 3600s (plain number = seconds)
- Dates in YYYY-MM-DD throughout; display formatted to locale in UI
