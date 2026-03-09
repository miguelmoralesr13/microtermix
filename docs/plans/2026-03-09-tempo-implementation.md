# Tempo Time Tracking — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Time" tab to JiraPanel with full Tempo Cloud API v4 integration: view worklogs by week/month, log time, edit/delete entries, issue enrichment via Jira API.

**Architecture:** New `src/services/tempoApi.ts` + `src/stores/tempoStore.ts` + 5 components in `src/components/jira/`. JiraPanel.tsx only gets minimal changes (new tab entry). shadcn/ui + sonner installed and layered on top of existing nexus-* token system.

**Tech Stack:** Tauri v2, React 19, TypeScript, TailwindCSS v4 (`@tailwindcss/vite`), shadcn/ui (new-york, no CSS vars), Zustand v5, Tempo Cloud API v4, Jira REST API v3.

---

## Context

- `tempoToken` already exists in `JiraConfig` (jiraApi.ts:55) and `emptyConfig()` — **no schema migration needed**
- `tempoFetch()` exists in `jiraApi.ts` but is a private singleton reader — we build a new standalone `tempoApi.ts` that takes token explicitly
- `clsx` + `tailwind-merge` already installed — shadcn `cn()` works immediately
- CSP is `null` in `tauri.conf.json` — plain `fetch()` to `api.tempo.io` works
- Tab type is at `JiraPanel.tsx:22`: `type Tab = 'board' | 'stories' | 'create' | 'settings'`
- JiraPanel content wrapper has `key={activeAccountId}` — TempoTab auto-remounts on account switch

---

## Task 1: Install shadcn/ui and sonner

**Files:**
- Modify: `src/index.css`
- Create: `src/lib/utils.ts`
- Modify: `package.json` (via npm)

**Step 1: Run shadcn init**

```bash
cd /mnt/datos/projects/microtermix
npx shadcn@latest init --defaults
```

When prompted:
- Style: **New York**
- Base color: **Neutral**
- CSS variables: **No**

This creates `src/lib/utils.ts`, updates `src/index.css`, and adds `components.json`.

> ⚠️ If shadcn init fails due to TailwindCSS v4, create manually:

```bash
# Manual fallback: create src/lib/utils.ts only
mkdir -p src/lib
```

Then write `src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 2: Install shadcn components needed**

```bash
npx shadcn@latest add dialog tabs badge calendar popover select input textarea button label separator tooltip
```

**Step 3: Install sonner**

```bash
npm install sonner
```

**Step 4: Add Toaster to App.tsx**

In `src/App.tsx`, add import and `<Toaster />` inside `<WorkspaceProvider>`:

```tsx
import { Toaster } from 'sonner';

function App() {
  return (
    <WorkspaceProvider>
      <AppContent />
      <Toaster position="bottom-right" theme="dark" richColors />
    </WorkspaceProvider>
  );
}
```

**Step 5: Verify build**

```bash
npm run build
```
Expected: `✓ built` with no TypeScript errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: install shadcn/ui (new-york) + sonner"
```

---

## Task 2: Create `src/services/tempoApi.ts`

**Files:**
- Create: `src/services/tempoApi.ts`

**Step 1: Write the file**

```ts
// src/services/tempoApi.ts
// Tempo Cloud API v4 — https://api.tempo.io/4
// All calls use plain fetch() (CSP is null in tauri.conf.json)

const TEMPO_BASE = 'https://api.tempo.io/4';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TempoWorklog {
  tempoWorklogId: number;
  jiraWorklogId?: number;
  issue: { id: number };
  timeSpentSeconds: number;
  startDate: string;          // YYYY-MM-DD
  startTime?: string;         // HH:mm:ss
  description?: string;
  author: { accountId: string; displayName: string };
  createdAt: string;
  updatedAt: string;
  // enriched client-side after Jira lookup:
  issueKey?: string;
  issueSummary?: string;
}

export interface WorklogPayload {
  issueId: number;
  authorAccountId: string;
  timeSpentSeconds: number;
  startDate: string;
  startTime?: string;
  description?: string;
}

interface TempoPage<T> {
  results: T[];
  metadata: { count: number; limit: number; offset: number; next?: string };
}

// ── Helper ─────────────────────────────────────────────────────────────────────

async function tempoRequest<T>(
  token: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${TEMPO_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Tempo ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : ({} as T);
}

// Fetch ALL pages for a paginated endpoint (Tempo default limit = 50)
async function fetchAllPages<T>(
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  const limit = 50;
  while (true) {
    const qs = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) });
    const page = await tempoRequest<TempoPage<T>>(token, `${path}?${qs}`);
    results.push(...page.results);
    if (results.length >= page.metadata.count) break;
    offset += limit;
  }
  return results;
}

// ── API functions ──────────────────────────────────────────────────────────────

/** Fetch all worklogs for a user in a date range */
export async function getMyWorklogs(
  token: string,
  authorAccountId: string,
  from: string,
  to: string,
): Promise<TempoWorklog[]> {
  return fetchAllPages<TempoWorklog>(token, '/worklogs', {
    authorAccountId,
    from,
    to,
  });
}

/** Fetch all worklogs for a specific Jira issue (by numeric id) */
export async function getIssueWorklogs(
  token: string,
  issueId: number,
): Promise<TempoWorklog[]> {
  return fetchAllPages<TempoWorklog>(token, '/worklogs', {
    issue: String(issueId),
  });
}

/** Log time */
export async function createWorklog(
  token: string,
  payload: WorklogPayload,
): Promise<TempoWorklog> {
  return tempoRequest<TempoWorklog>(token, '/worklogs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Edit a worklog */
export async function updateWorklog(
  token: string,
  tempoWorklogId: number,
  payload: Partial<WorklogPayload>,
): Promise<TempoWorklog> {
  return tempoRequest<TempoWorklog>(token, `/worklogs/${tempoWorklogId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

/** Delete a worklog */
export async function deleteWorklog(
  token: string,
  tempoWorklogId: number,
): Promise<void> {
  await tempoRequest<void>(token, `/worklogs/${tempoWorklogId}`, {
    method: 'DELETE',
  });
}
```

**Step 2: Verify build**
```bash
npm run build 2>&1 | grep "error TS"
```
Expected: no output (no errors).

**Step 3: Commit**
```bash
git add src/services/tempoApi.ts
git commit -m "feat(tempo): add tempoApi.ts with CRUD worklog functions"
```

---

## Task 3: Create `src/stores/tempoStore.ts`

**Files:**
- Create: `src/stores/tempoStore.ts`

**Step 1: Write the file**

```ts
// src/stores/tempoStore.ts
import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { getMyWorklogs, getIssueWorklogs, type TempoWorklog } from '../services/tempoApi';
import { jiraFetch } from '../components/jiraApi';

// ── Period helpers ─────────────────────────────────────────────────────────────

export type PeriodType = 'week' | 'month';

export interface Period {
  type: PeriodType;
  anchor: string; // ISO date (YYYY-MM-DD) — any date within the period
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Monday = start
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function periodRange(period: Period): { from: string; to: string } {
  const anchor = new Date(period.anchor + 'T12:00:00');
  if (period.type === 'week') {
    const start = startOfWeek(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { from: toISO(start), to: toISO(end) };
  } else {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: toISO(start), to: toISO(end) };
  }
}

export function shiftPeriod(period: Period, direction: -1 | 1): Period {
  const anchor = new Date(period.anchor + 'T12:00:00');
  if (period.type === 'week') {
    anchor.setDate(anchor.getDate() + direction * 7);
  } else {
    anchor.setMonth(anchor.getMonth() + direction);
  }
  return { ...period, anchor: toISO(anchor) };
}

/** Format seconds → "1h 30m" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Parse "1h 30m", "1.5h", "90m", "3600" → seconds */
export function parseTimeInput(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  // "1h 30m" or "1h30m"
  const hm = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+)\s*m?$/);
  if (hm) return Math.round(parseFloat(hm[1]) * 3600 + parseInt(hm[2]) * 60);
  // "1.5h" or "2h"
  const h = s.match(/^(\d+(?:\.\d+)?)\s*h$/);
  if (h) return Math.round(parseFloat(h[1]) * 3600);
  // "90m"
  const m = s.match(/^(\d+)\s*m$/);
  if (m) return parseInt(m[1]) * 60;
  // plain number → seconds
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 0) return n;
  return null;
}

// ── Issue enrichment ───────────────────────────────────────────────────────────

interface JiraIssueSummary {
  key: string;
  summary: string;
}

// Cache keyed by issue id (number as string)
const issueCache = new Map<string, JiraIssueSummary>();

async function enrichWorklogs(
  worklogs: TempoWorklog[],
  jiraBaseUrl: string,
  jiraEmail: string,
  jiraToken: string,
): Promise<TempoWorklog[]> {
  const unknownIds = [...new Set(
    worklogs
      .map(w => String(w.issue.id))
      .filter(id => !issueCache.has(id)),
  )];

  if (unknownIds.length > 0) {
    try {
      // Batch lookup via JQL — up to 100 ids at once
      const chunks: string[][] = [];
      for (let i = 0; i < unknownIds.length; i += 100) {
        chunks.push(unknownIds.slice(i, i + 100));
      }
      for (const chunk of chunks) {
        const jql = `id in (${chunk.join(',')})`;
        const res = await fetch(
          `${jiraBaseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=100`,
          {
            headers: {
              Authorization: `Basic ${btoa(`${jiraEmail}:${jiraToken}`)}`,
              Accept: 'application/json',
            },
          },
        );
        if (res.ok) {
          const data = await res.json();
          for (const issue of data.issues ?? []) {
            issueCache.set(String(issue.id), {
              key: issue.key,
              summary: issue.fields?.summary ?? '',
            });
          }
        }
      }
    } catch { /* silently skip enrichment */ }
  }

  return worklogs.map(w => {
    const info = issueCache.get(String(w.issue.id));
    return info ? { ...w, issueKey: info.key, issueSummary: info.summary } : w;
  });
}

// ── Store ──────────────────────────────────────────────────────────────────────

export interface TempoStoreState {
  worklogs: TempoWorklog[];
  issueWorklogs: TempoWorklog[];    // for "Por Issue" sub-tab
  period: Period;
  loading: boolean;
  loadingIssue: boolean;
  error: string | null;

  setPeriod: (period: Period) => void;
  fetchWorklogs: (
    tempoToken: string,
    accountId: string,
    jiraBaseUrl: string,
    jiraEmail: string,
    jiraToken: string,
  ) => Promise<void>;
  fetchIssueWorklogs: (
    tempoToken: string,
    issueId: number,
    jiraBaseUrl: string,
    jiraEmail: string,
    jiraToken: string,
  ) => Promise<void>;
  // Optimistic updates
  removeWorklog: (tempoWorklogId: number) => void;
  upsertWorklog: (worklog: TempoWorklog) => void;
}

export const useTempoStore = create<TempoStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        worklogs: [],
        issueWorklogs: [],
        period: { type: 'week', anchor: toISO(new Date()) },
        loading: false,
        loadingIssue: false,
        error: null,

        setPeriod: (period) => set({ period }),

        fetchWorklogs: async (tempoToken, accountId, jiraBaseUrl, jiraEmail, jiraToken) => {
          set({ loading: true, error: null });
          try {
            const { from, to } = periodRange(get().period);
            const raw = await getMyWorklogs(tempoToken, accountId, from, to);
            const enriched = await enrichWorklogs(raw, jiraBaseUrl, jiraEmail, jiraToken);
            set({ worklogs: enriched });
          } catch (e: any) {
            set({ error: e.message ?? 'Error fetching worklogs' });
          } finally {
            set({ loading: false });
          }
        },

        fetchIssueWorklogs: async (tempoToken, issueId, jiraBaseUrl, jiraEmail, jiraToken) => {
          set({ loadingIssue: true });
          try {
            const raw = await getIssueWorklogs(tempoToken, issueId);
            const enriched = await enrichWorklogs(raw, jiraBaseUrl, jiraEmail, jiraToken);
            set({ issueWorklogs: enriched });
          } catch { /* no-op */ } finally {
            set({ loadingIssue: false });
          }
        },

        removeWorklog: (id) => set(s => ({
          worklogs: s.worklogs.filter(w => w.tempoWorklogId !== id),
          issueWorklogs: s.issueWorklogs.filter(w => w.tempoWorklogId !== id),
        })),

        upsertWorklog: (worklog) => set(s => {
          const upsert = (list: TempoWorklog[]) => {
            const idx = list.findIndex(w => w.tempoWorklogId === worklog.tempoWorklogId);
            return idx >= 0
              ? list.map(w => w.tempoWorklogId === worklog.tempoWorklogId ? worklog : w)
              : [worklog, ...list];
          };
          return { worklogs: upsert(s.worklogs), issueWorklogs: upsert(s.issueWorklogs) };
        }),
      }),
      {
        name: 'nexus-tempo-store',
        partialize: (s) => ({ period: s.period }), // only persist period selection
      },
    ),
    { name: 'TempoStore' },
  ),
);
```

**Step 2: Verify build**
```bash
npm run build 2>&1 | grep "error TS"
```
Expected: no output.

**Step 3: Commit**
```bash
git add src/stores/tempoStore.ts
git commit -m "feat(tempo): add tempoStore with period helpers and worklog CRUD"
```

---

## Task 4: Create `src/components/jira/PeriodSelector.tsx`

**Files:**
- Create: `src/components/jira/PeriodSelector.tsx`

**Step 1: Create the directory and file**

```bash
mkdir -p src/components/jira
```

```tsx
// src/components/jira/PeriodSelector.tsx
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type Period, type PeriodType, shiftPeriod, periodRange } from '../../stores/tempoStore';

interface PeriodSelectorProps {
  period: Period;
  onChange: (p: Period) => void;
  className?: string;
}

function formatPeriodLabel(period: Period): string {
  const { from, to } = periodRange(period);
  const f = (iso: string) => {
    const [, mm, dd] = iso.split('-');
    return `${dd}/${mm}`;
  };
  if (period.type === 'week') {
    const fromDate = new Date(from + 'T12:00:00');
    const year = fromDate.getFullYear();
    return `${f(from)} – ${f(to)} · ${year}`;
  } else {
    const d = new Date(from + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  }
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({ period, onChange, className }) => {
  const isCurrentPeriod = (() => {
    const { from, to } = periodRange(period);
    const today = new Date().toISOString().split('T')[0];
    return today >= from && today <= to;
  })();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Type toggle */}
      <div className="flex rounded-md bg-slate-800/80 p-0.5 text-[11px] font-medium">
        {(['week', 'month'] as PeriodType[]).map(t => (
          <button
            key={t}
            onClick={() => onChange({ ...period, type: t })}
            className={cn(
              'px-2.5 py-1 rounded capitalize transition-colors',
              period.type === t
                ? 'bg-nexus-neon text-slate-900'
                : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {t === 'week' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-slate-400 hover:text-white"
        onClick={() => onChange(shiftPeriod(period, -1))}
      >
        <ChevronLeft size={14} />
      </Button>

      <span className="text-xs text-slate-300 min-w-[140px] text-center font-mono">
        {formatPeriodLabel(period)}
      </span>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-slate-400 hover:text-white"
        onClick={() => onChange(shiftPeriod(period, 1))}
      >
        <ChevronRight size={14} />
      </Button>

      {!isCurrentPeriod && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] text-slate-500 hover:text-slate-200 px-2"
          onClick={() => onChange({ ...period, anchor: new Date().toISOString().split('T')[0] })}
        >
          Hoy
        </Button>
      )}
    </div>
  );
};
```

**Step 2: Verify build**
```bash
npm run build 2>&1 | grep "error TS"
```

**Step 3: Commit**
```bash
git add src/components/jira/PeriodSelector.tsx
git commit -m "feat(tempo): add PeriodSelector component"
```

---

## Task 5: Create `src/components/jira/WorklogCard.tsx`

**Files:**
- Create: `src/components/jira/WorklogCard.tsx`

**Step 1: Write the file**

```tsx
// src/components/jira/WorklogCard.tsx
import React from 'react';
import { Pencil, Trash2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type TempoWorklog } from '../../services/tempoApi';
import { formatDuration } from '../../stores/tempoStore';

interface WorklogCardProps {
  worklog: TempoWorklog;
  onEdit: (worklog: TempoWorklog) => void;
  onDelete: (tempoWorklogId: number) => void;
  className?: string;
}

export const WorklogCard: React.FC<WorklogCardProps> = ({
  worklog,
  onEdit,
  onDelete,
  className,
}) => {
  const issueLabel = worklog.issueKey ?? `#${worklog.issue.id}`;
  const summary = worklog.issueSummary;

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/50',
        'hover:border-slate-600 transition-colors',
        className,
      )}
    >
      {/* Time badge */}
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <Clock size={12} className="text-slate-500" />
        <Badge
          variant="secondary"
          className="bg-nexus-neon/10 text-nexus-neon border-nexus-neon/20 font-mono text-[11px] px-1.5"
        >
          {formatDuration(worklog.timeSpentSeconds)}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-slate-300 font-mono shrink-0">
            {issueLabel}
          </span>
          {summary && (
            <span className="text-xs text-slate-500 truncate">{summary}</span>
          )}
        </div>
        {worklog.description && (
          <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
            {worklog.description}
          </p>
        )}
        <p className="text-[10px] text-slate-600 mt-1">
          {worklog.startTime
            ? `${worklog.startDate} ${worklog.startTime.slice(0, 5)}`
            : worklog.startDate}
        </p>
      </div>

      {/* Actions */}
      <TooltipProvider>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-500 hover:text-nexus-accent"
                onClick={() => onEdit(worklog)}
              >
                <Pencil size={12} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Editar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-500 hover:text-red-400"
                onClick={() => onDelete(worklog.tempoWorklogId)}
              >
                <Trash2 size={12} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Eliminar</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
};
```

**Step 2: Verify build**
```bash
npm run build 2>&1 | grep "error TS"
```

**Step 3: Commit**
```bash
git add src/components/jira/WorklogCard.tsx
git commit -m "feat(tempo): add WorklogCard component"
```

---

## Task 6: Create `src/components/jira/LogTimeModal.tsx`

**Files:**
- Create: `src/components/jira/LogTimeModal.tsx`

**Step 1: Write the file**

```tsx
// src/components/jira/LogTimeModal.tsx
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { type TempoWorklog, type WorklogPayload, createWorklog, updateWorklog } from '../../services/tempoApi';
import { parseTimeInput, formatDuration } from '../../stores/tempoStore';

interface LogTimeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tempoToken: string;
  authorAccountId: string;
  /** Pre-fill issue key when opening from an issue context */
  defaultIssueKey?: string;
  /** Worklog to edit (undefined = create mode) */
  editingWorklog?: TempoWorklog;
  onSuccess: (worklog: TempoWorklog) => void;
}

export const LogTimeModal: React.FC<LogTimeModalProps> = ({
  open,
  onOpenChange,
  tempoToken,
  authorAccountId,
  defaultIssueKey,
  editingWorklog,
  onSuccess,
}) => {
  const isEditing = !!editingWorklog;

  const [issueInput, setIssueInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timeError, setTimeError] = useState('');

  // Populate form when editing or opening with defaults
  useEffect(() => {
    if (!open) return;
    if (editingWorklog) {
      setIssueInput(editingWorklog.issueKey ?? String(editingWorklog.issue.id));
      setTimeInput(formatDuration(editingWorklog.timeSpentSeconds));
      setDescription(editingWorklog.description ?? '');
      setDate(new Date(editingWorklog.startDate + 'T12:00:00'));
    } else {
      setIssueInput(defaultIssueKey ?? '');
      setTimeInput('');
      setDescription('');
      setDate(new Date());
    }
    setTimeError('');
  }, [open, editingWorklog, defaultIssueKey]);

  const handleSave = async () => {
    const seconds = parseTimeInput(timeInput);
    if (!seconds) {
      setTimeError('Formato inválido. Usa: 1h 30m, 1.5h, 90m');
      return;
    }
    if (!issueInput.trim()) return;

    setSaving(true);
    try {
      const startDate = date.toISOString().split('T')[0];
      const payload: WorklogPayload = {
        issueId: editingWorklog?.issue.id ?? 0, // 0 triggers key lookup below
        authorAccountId,
        timeSpentSeconds: seconds,
        startDate,
        description: description.trim() || undefined,
      };

      // If we have a key like "PROJ-123", resolve it to an ID via Jira is complex.
      // Instead: if editing, reuse existing issueId. If creating, pass the key as
      // issueId workaround — Tempo API v4 accepts issue keys as well in issueId field
      // by using the alternate endpoint /worklogs with issue key.
      // Simplest: Tempo also accepts issueKey in the body with field name "issue": { "key": "..." }
      // We use a slightly different payload shape for creation:
      let result: TempoWorklog;
      if (isEditing && editingWorklog) {
        result = await updateWorklog(tempoToken, editingWorklog.tempoWorklogId, {
          timeSpentSeconds: seconds,
          startDate,
          description: description.trim() || undefined,
        });
        // Preserve enriched fields from the original
        result = {
          ...result,
          issueKey: editingWorklog.issueKey,
          issueSummary: editingWorklog.issueSummary,
          issue: editingWorklog.issue,
        };
      } else {
        // For creation, Tempo v4 accepts { "issue": { "key": "PROJ-123" } }
        const createPayload = {
          issue: { key: issueInput.trim().toUpperCase() },
          authorAccountId,
          timeSpentSeconds: seconds,
          startDate,
          description: description.trim() || undefined,
        };
        result = await fetch('https://api.tempo.io/4/worklogs', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tempoToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(createPayload),
        }).then(async r => {
          const t = await r.text();
          if (!r.ok) throw new Error(`Tempo ${r.status}: ${t}`);
          return JSON.parse(t);
        });
        result.issueKey = issueInput.trim().toUpperCase();
      }

      onSuccess(result);
      toast.success(isEditing ? 'Worklog actualizado' : 'Tiempo registrado', {
        description: `${formatDuration(seconds)} en ${issueInput.trim().toUpperCase()}`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Error al guardar', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const parsedSeconds = parseTimeInput(timeInput);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-white">
            {isEditing ? 'Editar tiempo' : 'Registrar tiempo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Issue */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Issue key</Label>
            <Input
              value={issueInput}
              onChange={e => setIssueInput(e.target.value)}
              placeholder="PROJ-123"
              disabled={isEditing}
              className="bg-slate-800 border-slate-700 text-white font-mono text-sm focus:border-nexus-neon disabled:opacity-60"
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Fecha</Label>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:text-white text-sm',
                    !date && 'text-slate-500',
                  )}
                >
                  <CalendarIcon size={14} className="mr-2 text-slate-400" />
                  {date ? format(date, 'dd/MM/yyyy') : 'Seleccionar fecha'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={d => { if (d) { setDate(d); setCalOpen(false); } }}
                  initialFocus
                  className="text-white"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">
              Tiempo{parsedSeconds ? <span className="text-nexus-neon ml-1">→ {formatDuration(parsedSeconds)}</span> : null}
            </Label>
            <Input
              value={timeInput}
              onChange={e => { setTimeInput(e.target.value); setTimeError(''); }}
              placeholder="1h 30m · 1.5h · 90m"
              className={cn(
                'bg-slate-800 border-slate-700 text-white font-mono text-sm focus:border-nexus-neon',
                timeError && 'border-red-500',
              )}
            />
            {timeError && <p className="text-xs text-red-400">{timeError}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Descripción <span className="text-slate-600">(opcional)</span></Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="¿En qué trabajaste?"
              rows={3}
              className="bg-slate-800 border-slate-700 text-white text-sm resize-none focus:border-nexus-neon"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-slate-400 hover:text-white"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !issueInput.trim() || !timeInput.trim()}
            className="bg-nexus-neon text-slate-900 hover:bg-nexus-neon/80 font-semibold disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
            {isEditing ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

**Step 2: Install date-fns (used by shadcn Calendar)**
```bash
npm install date-fns
```

**Step 3: Verify build**
```bash
npm run build 2>&1 | grep "error TS"
```

**Step 4: Commit**
```bash
git add src/components/jira/LogTimeModal.tsx
git commit -m "feat(tempo): add LogTimeModal with date picker + time parser"
```

---

## Task 7: Create `src/components/jira/WorklogList.tsx`

**Files:**
- Create: `src/components/jira/WorklogList.tsx`

**Step 1: Write the file**

```tsx
// src/components/jira/WorklogList.tsx
import React from 'react';
import { Separator } from '@/components/ui/separator';
import { formatDuration } from '../../stores/tempoStore';
import { WorklogCard } from './WorklogCard';
import type { TempoWorklog } from '../../services/tempoApi';

interface WorklogListProps {
  worklogs: TempoWorklog[];
  onEdit: (w: TempoWorklog) => void;
  onDelete: (id: number) => void;
}

function groupByDay(worklogs: TempoWorklog[]): [string, TempoWorklog[]][] {
  const map = new Map<string, TempoWorklog[]>();
  // Sort desc by startDate then startTime
  const sorted = [...worklogs].sort((a, b) => {
    const da = a.startDate + (a.startTime ?? '');
    const db = b.startDate + (b.startTime ?? '');
    return db.localeCompare(da);
  });
  for (const w of sorted) {
    const list = map.get(w.startDate) ?? [];
    list.push(w);
    map.set(w.startDate, list);
  }
  return [...map.entries()];
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === today.toISOString().split('T')[0]) return 'Hoy';
  if (iso === yesterday.toISOString().split('T')[0]) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
}

export const WorklogList: React.FC<WorklogListProps> = ({ worklogs, onEdit, onDelete }) => {
  if (worklogs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-600">
        <p className="text-sm">Sin worklogs en este período</p>
      </div>
    );
  }

  const grouped = groupByDay(worklogs);
  const totalSeconds = worklogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);

  return (
    <div className="space-y-4">
      {grouped.map(([day, dayWorklogs]) => {
        const dayTotal = dayWorklogs.reduce((s, w) => s + w.timeSpentSeconds, 0);
        return (
          <div key={day}>
            {/* Day header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 capitalize">
                {formatDayLabel(day)}
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {formatDuration(dayTotal)}
              </span>
            </div>
            <div className="space-y-1.5">
              {dayWorklogs.map(w => (
                <WorklogCard
                  key={w.tempoWorklogId}
                  worklog={w}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Footer total */}
      <Separator className="bg-slate-800" />
      <div className="flex justify-between items-center px-1 pb-2">
        <span className="text-xs text-slate-500">Total del período</span>
        <span className="text-sm font-bold font-mono text-nexus-neon">
          {formatDuration(totalSeconds)}
        </span>
      </div>
    </div>
  );
};
```

**Step 2: Verify build**
```bash
npm run build 2>&1 | grep "error TS"
```

**Step 3: Commit**
```bash
git add src/components/jira/WorklogList.tsx
git commit -m "feat(tempo): add WorklogList with day grouping and totals"
```

---

## Task 8: Create `src/components/jira/TempoTab.tsx`

**Files:**
- Create: `src/components/jira/TempoTab.tsx`

**Step 1: Write the file**

```tsx
// src/components/jira/TempoTab.tsx
import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, AlertCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTempoStore, formatDuration, periodRange } from '../../stores/tempoStore';
import { deleteWorklog } from '../../services/tempoApi';
import type { TempoWorklog } from '../../services/tempoApi';
import type { JiraConfig } from '../jiraApi';
import { PeriodSelector } from './PeriodSelector';
import { WorklogList } from './WorklogList';
import { LogTimeModal } from './LogTimeModal';

interface TempoTabProps {
  config: JiraConfig;
  accountId: string;
}

export const TempoTab: React.FC<TempoTabProps> = ({ config, accountId }) => {
  const {
    worklogs, issueWorklogs, period, loading, loadingIssue,
    error, setPeriod, fetchWorklogs, fetchIssueWorklogs, removeWorklog, upsertWorklog,
  } = useTempoStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorklog, setEditingWorklog] = useState<TempoWorklog | undefined>();
  const [defaultIssueKey, setDefaultIssueKey] = useState('');
  const [issueSearchInput, setIssueSearchInput] = useState('');
  const [activeIssueId, setActiveIssueId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const token = config.tempoToken;
  const hasToken = !!token;

  // Fetch worklogs when period or account changes
  useEffect(() => {
    if (!hasToken) return;
    fetchWorklogs(token, accountId, config.baseUrl, config.email, config.apiToken);
  }, [period, accountId, token]);

  const handleRefresh = () => {
    if (!hasToken) return;
    fetchWorklogs(token, accountId, config.baseUrl, config.email, config.apiToken);
  };

  const handleEdit = (worklog: TempoWorklog) => {
    setEditingWorklog(worklog);
    setDefaultIssueKey('');
    setModalOpen(true);
  };

  const handleLogTime = (issueKey?: string) => {
    setEditingWorklog(undefined);
    setDefaultIssueKey(issueKey ?? '');
    setModalOpen(true);
  };

  const handleDelete = async (tempoWorklogId: number) => {
    if (!confirm('¿Eliminar este worklog?')) return;
    setDeletingId(tempoWorklogId);
    try {
      await deleteWorklog(token, tempoWorklogId);
      removeWorklog(tempoWorklogId);
      toast.success('Worklog eliminado');
    } catch (e: any) {
      toast.error('Error al eliminar', { description: e.message });
    } finally {
      setDeletingId(null);
    }
  };

  const handleModalSuccess = (worklog: TempoWorklog) => {
    upsertWorklog(worklog);
  };

  const handleIssueSearch = () => {
    const key = issueSearchInput.trim().toUpperCase();
    if (!key || !hasToken) return;
    // We need the numeric issue ID — search via Jira API
    fetch(`${config.baseUrl}/rest/api/3/issue/${key}?fields=id,summary`, {
      headers: {
        Authorization: `Basic ${btoa(`${config.email}:${config.apiToken}`)}`,
        Accept: 'application/json',
      },
    })
      .then(r => r.json())
      .then(data => {
        const id = parseInt(data.id, 10);
        if (!isNaN(id)) {
          setActiveIssueId(id);
          fetchIssueWorklogs(token, id, config.baseUrl, config.email, config.apiToken);
        } else {
          toast.error('Issue no encontrado');
        }
      })
      .catch(() => toast.error('Error buscando issue'));
  };

  if (!hasToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 p-8 text-center">
        <AlertCircle size={24} />
        <p className="text-sm">Tempo token no configurado.</p>
        <p className="text-xs text-slate-600">
          Ve a <span className="text-nexus-neon">Configuración</span> y completa el campo "Tempo Token".
        </p>
      </div>
    );
  }

  const { from, to } = periodRange(period);
  const totalPeriod = worklogs.reduce((s, w) => s + w.timeSpentSeconds, 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <Tabs defaultValue="my-worklogs" className="flex flex-col h-full min-h-0">
        {/* Sub-tab bar */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-800 shrink-0">
          <TabsList className="bg-slate-800/60 h-7">
            <TabsTrigger value="my-worklogs" className="text-xs h-6 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Mis Worklogs
            </TabsTrigger>
            <TabsTrigger value="by-issue" className="text-xs h-6 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Por Issue
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {totalPeriod > 0 && (
              <Badge variant="outline" className="border-nexus-neon/30 text-nexus-neon font-mono text-[11px]">
                {formatDuration(totalPeriod)} total
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-white"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </Button>
            <Button
              size="sm"
              className="h-7 bg-nexus-neon text-slate-900 hover:bg-nexus-neon/80 text-xs font-semibold px-3 gap-1"
              onClick={() => handleLogTime()}
            >
              <Plus size={12} /> Registrar
            </Button>
          </div>
        </div>

        {/* My Worklogs */}
        <TabsContent value="my-worklogs" className="flex-1 min-h-0 overflow-y-auto px-4 py-3 mt-0 scrollbar-hide">
          <div className="flex items-center justify-between mb-3">
            <PeriodSelector period={period} onChange={setPeriod} />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
              <RefreshCw size={14} className="animate-spin" /> Cargando...
            </div>
          ) : (
            <WorklogList
              worklogs={worklogs}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </TabsContent>

        {/* By Issue */}
        <TabsContent value="by-issue" className="flex-1 min-h-0 flex flex-col min-h-0 mt-0">
          <div className="px-4 py-3 border-b border-slate-800 shrink-0">
            <div className="flex gap-2">
              <Input
                value={issueSearchInput}
                onChange={e => setIssueSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleIssueSearch()}
                placeholder="PROJ-123"
                className="bg-slate-800 border-slate-700 text-white font-mono text-sm focus:border-nexus-neon h-8"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5"
                onClick={handleIssueSearch}
              >
                <Search size={13} /> Buscar
              </Button>
              {activeIssueId && (
                <Button
                  size="sm"
                  className="h-8 bg-nexus-neon text-slate-900 hover:bg-nexus-neon/80 text-xs font-semibold gap-1"
                  onClick={() => handleLogTime(issueSearchInput.trim().toUpperCase())}
                >
                  <Plus size={12} /> Log
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-hide">
            {loadingIssue ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
                <RefreshCw size={14} className="animate-spin" /> Cargando...
              </div>
            ) : (
              <WorklogList
                worklogs={issueWorklogs}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      <LogTimeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        tempoToken={token}
        authorAccountId={accountId}
        defaultIssueKey={defaultIssueKey}
        editingWorklog={editingWorklog}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
};
```

**Step 2: Verify build**
```bash
npm run build 2>&1 | grep "error TS"
```

**Step 3: Commit**
```bash
git add src/components/jira/
git commit -m "feat(tempo): add TempoTab with My Worklogs and By Issue sub-tabs"
```

---

## Task 9: Wire TempoTab into JiraPanel.tsx

**Files:**
- Modify: `src/components/JiraPanel.tsx` lines 22, 2631–2636, 2685–2698

**Step 1: Add `'time'` to the Tab type (line 22)**

Find:
```ts
type Tab = 'board' | 'stories' | 'create' | 'settings';
```
Replace with:
```ts
type Tab = 'board' | 'stories' | 'create' | 'settings' | 'time';
```

**Step 2: Update the saved-tab validation (line 2610)**

Find:
```ts
return (saved === 'board' || saved === 'stories' || saved === 'create' || saved === 'settings') ? saved : 'board';
```
Replace with:
```ts
return (saved === 'board' || saved === 'stories' || saved === 'create' || saved === 'settings' || saved === 'time') ? saved : 'board';
```

**Step 3: Add import at top of file**

After the existing imports block, add:
```tsx
import { TempoTab } from './jira/TempoTab';
import { Timer } from 'lucide-react';
```

**Step 4: Add the Time tab to the tabs array (after settings)**

Find:
```ts
const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'board', label: 'Board', icon: <Layers size={14} /> },
    { id: 'stories', label: 'Stories', icon: <Pin size={14} /> },
    { id: 'create', label: 'Crear Issue', icon: <Plus size={14} /> },
    { id: 'settings', label: 'Configuración', icon: <Settings size={14} /> },
];
```
Replace with:
```ts
const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'board', label: 'Board', icon: <Layers size={14} /> },
    { id: 'stories', label: 'Stories', icon: <Pin size={14} /> },
    { id: 'create', label: 'Crear Issue', icon: <Plus size={14} /> },
    { id: 'time', label: 'Time', icon: <Timer size={14} /> },
    { id: 'settings', label: 'Configuración', icon: <Settings size={14} /> },
];
```

**Step 5: Add TempoTab render in the content area**

Find the closing `{tab === 'settings' && ...}` block:
```tsx
            {tab === 'settings' && (
                <SettingsPanel onSaved={handleSettingsSaved} />
            )}
```
Add after it:
```tsx
            {tab === 'time' && (() => {
                const activeAcc = accounts.find(a => a.id === activeAccountId);
                if (!activeAcc) return null;
                return (
                    <TempoTab
                        config={activeAcc.config}
                        accountId={activeAcc.config.defaultAssigneeId}
                    />
                );
            })()}
```

**Step 6: Verify build**
```bash
npm run build 2>&1 | grep "error TS"
```
Expected: no errors.

**Step 7: Commit**
```bash
git add src/components/JiraPanel.tsx
git commit -m "feat(tempo): wire TempoTab into JiraPanel as 'Time' tab"
```

---

## Task 10: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add shadcn/ui section and Tempo to the backend table**

Add to the **Styling** section at the bottom:
```markdown
**shadcn/ui** is installed (style: new-york, no CSS variables). Components live in `src/components/ui/` alongside existing custom components. Use `cn()` from `src/lib/utils.ts` for class merging. Toast notifications via `sonner` — `<Toaster>` is mounted in `App.tsx`.
```

Add to the view table:
```markdown
| `time` | TempoTab (src/components/jira/) | Tempo Cloud API v4 worklogs: view by period, log/edit/delete time |
```

Add to the **Frontend Component Structure** section:
```markdown
├── jira/                      # Tempo time tracking components
│   ├── TempoTab.tsx           # Root: My Worklogs + By Issue sub-tabs
│   ├── WorklogList.tsx        # Grouped by day with totals
│   ├── WorklogCard.tsx        # Individual worklog (edit/delete)
│   ├── LogTimeModal.tsx       # shadcn Dialog: create/edit worklog + date picker
│   └── PeriodSelector.tsx    # Week/Month navigator
```

Add to services:
```markdown
├── tempoApi.ts                # Tempo Cloud API v4 (getMyWorklogs, createWorklog, etc.)
```

Add to stores:
```markdown
└── tempoStore.ts              # Zustand: worklogs, period, enrichment, CRUD helpers
```

**Step 2: Commit**
```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with shadcn/ui setup and Tempo architecture"
```

---

## Summary of all files touched

| Action | File |
|---|---|
| Modify | `src/App.tsx` — add `<Toaster />` |
| Create | `src/lib/utils.ts` — `cn()` helper |
| Create | `src/services/tempoApi.ts` — Tempo API v4 |
| Create | `src/stores/tempoStore.ts` — Zustand + period helpers |
| Create | `src/components/jira/PeriodSelector.tsx` |
| Create | `src/components/jira/WorklogCard.tsx` |
| Create | `src/components/jira/LogTimeModal.tsx` |
| Create | `src/components/jira/WorklogList.tsx` |
| Create | `src/components/jira/TempoTab.tsx` |
| Modify | `src/components/JiraPanel.tsx` — add 'time' tab |
| Modify | `CLAUDE.md` |
| Auto-added | `src/components/ui/*` (shadcn components) |
