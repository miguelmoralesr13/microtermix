# Tempo Time Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Tempo worklog modal to the Jira panel that lets users log time on tasks in "Working" status, with a day preview to detect overlaps.

**Architecture:** Add `tempoToken` to `JiraConfig`, create `tempoFetch` + two API functions in `jiraApi.ts`, build `TempoLogModal.tsx` as a standalone modal, then wire a "Log Time" button into the existing `selectedTask` detail panel in `JiraPanel.tsx` (visible only when status === "Working").

**Tech Stack:** React 19, TypeScript, TailwindCSS v4, `@tauri-apps/plugin-http` fetch (bypasses CORS), Tempo Cloud API v4 (`https://api.tempo.io/4`)

---

## Task 1: Add `tempoToken` to JiraConfig and Tempo API functions

**Files:**
- Modify: `src/components/jiraApi.ts`

### Step 1 — Add `tempoToken` field to the `JiraConfig` interface

Find the `JiraConfig` interface (around line 30) and add one field after `releasedStatuses`:

```ts
releasedStatuses: string[];
tempoToken: string;          // Tempo Cloud API token (Bearer auth)
```

### Step 2 — Add `tempoToken` to `emptyConfig()`

Find `emptyConfig()` (around line 53) and add:

```ts
releasedStatuses: ['Released', 'Discarded'],
tempoToken: '',
```

### Step 3 — Add Tempo types after the existing `JiraIssue` interface

Add after the `JiraIssueDetail` interface (search for `export interface JiraIssueDetail`):

```ts
// ── Tempo types ────────────────────────────────────────────────────────────

export interface TempoWorklogEntry {
    tempoWorklogId: number;
    issue: { id: number; key?: string };
    timeSpentSeconds: number;
    startDate: string;   // "YYYY-MM-DD"
    startTime: string;   // "HH:MM:SS"
    description?: string;
    author: { accountId: string };
}
```

### Step 4 — Add `tempoFetch` function after `getJiraMediaUrl`

Add after the `getJiraMediaUrl` function (after line ~172):

```ts
// ── Tempo REST API v4 helper ──────────────────────────────────────────────

async function tempoFetch(path: string, opts?: RequestInit): Promise<any> {
    const cfg = loadConfig();
    if (!cfg.tempoToken) throw new Error('Tempo token not configured. Go to Jira Settings.');

    const method = (opts?.method ?? 'GET').toUpperCase();
    const fullUrl = `https://api.tempo.io/4${path}`;
    const bodyStr = opts?.body ? String(opts.body) : undefined;

    const curlParts = [
        `curl -s -X ${method}`,
        `'${fullUrl}'`,
        `-H 'Authorization: Bearer <TOKEN>'`,
        `-H 'Content-Type: application/json'`,
    ];
    if (bodyStr) curlParts.push(`-d '${bodyStr}'`);
    const curl = curlParts.join(' \\');

    const t0 = Date.now();
    const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const id = ++_logSeq;

    try {
        const res = await fetch(fullUrl, {
            ...opts,
            headers: {
                'Authorization': `Bearer ${cfg.tempoToken}`,
                'Content-Type': 'application/json',
                ...(opts?.headers ?? {}),
            },
        });
        const durationMs = Date.now() - t0;
        const text = await res.text();
        if (!res.ok) {
            jiraApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, status: res.status, durationMs, ok: false, curl, error: text });
            throw new Error(`Tempo ${res.status}: ${text}`);
        }
        jiraApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, status: res.status, durationMs, ok: true, curl });
        if (!text) return {};
        try { return JSON.parse(text); } catch { return {}; }
    } catch (e: any) {
        const durationMs = Date.now() - t0;
        if (!String(e?.message).startsWith('Tempo ')) {
            jiraApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, durationMs, ok: false, curl, error: e?.message });
        }
        throw new Error(e?.message || 'Error de conexión con Tempo.');
    }
}
```

### Step 5 — Add the two exported Tempo API functions at the end of `jiraApi.ts`

```ts
// ── Tempo API methods ────────────────────────────────────────────────────

/**
 * Fetch all worklogs for a given date range and author.
 * from/to format: "YYYY-MM-DD"
 */
export async function getTempoWorklogs(
    from: string,
    to: string,
    authorAccountId: string,
): Promise<TempoWorklogEntry[]> {
    const params = new URLSearchParams({ from, to, limit: '200' });
    if (authorAccountId) params.set('authorAccountId', authorAccountId);
    const data = await tempoFetch(`/worklogs?${params.toString()}`);
    return (data.results ?? []).map((r: any): TempoWorklogEntry => ({
        tempoWorklogId: r.tempoWorklogId,
        issue: { id: r.issue?.id ?? 0, key: r.issue?.key },
        timeSpentSeconds: r.timeSpentSeconds ?? 0,
        startDate: r.startDate ?? '',
        startTime: r.startTime ?? '00:00:00',
        description: r.description,
        author: { accountId: r.author?.accountId ?? '' },
    }));
}

/**
 * Create a new Tempo worklog.
 * startDate: "YYYY-MM-DD", startTime: "HH:MM:SS"
 */
export async function logTempoWorklog(
    issueId: number,
    authorAccountId: string,
    timeSpentSeconds: number,
    startDate: string,
    startTime: string,
    description?: string,
): Promise<void> {
    const body: Record<string, any> = {
        issueId,
        authorAccountId,
        timeSpentSeconds,
        startDate,
        startTime,
    };
    if (description?.trim()) body.description = description.trim();
    await tempoFetch('/worklogs', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
```

### Step 6 — Verify TypeScript compiles

```bash
npm run build
```
Expected: no TypeScript errors related to `jiraApi.ts`.

### Step 7 — Commit

```bash
git add src/components/jiraApi.ts
git commit -m "feat: add Tempo API types and functions to jiraApi"
```

---

## Task 2: Add Tempo Token field in Jira Settings panel

**Files:**
- Modify: `src/components/JiraPanel.tsx`

### Step 1 — Add a new "Tempo" settings section after the "Conexión" section

Find this block in `JiraPanel.tsx` (around line 1625):
```tsx
            </section>

            {/* Default fields */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valores por defecto (para crear issues)</h3>
```

Insert a new section between `</section>` and `{/* Default fields */}`:

```tsx
            {/* Tempo */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Timer size={12} /> Tempo
                </h3>
                {field('Tempo API Token (app.tempo.io → API Integration)', 'tempoToken', 'password')}
                <p className="text-[10px] text-slate-600">El account ID del autor se toma del campo "Account ID del asignado por defecto" de arriba.</p>
            </section>
```

### Step 2 — Add `Timer` to the lucide-react import at the top of `JiraPanel.tsx`

Find the import line:
```ts
import {
    Settings, Plus, RefreshCw, Search, X, CheckCircle,
    AlertCircle, Layers, ExternalLink, Star, ChevronRight, ChevronLeft, Pin, UserCheck
} from 'lucide-react';
```

Add `Timer` to the list:
```ts
import {
    Settings, Plus, RefreshCw, Search, X, CheckCircle,
    AlertCircle, Layers, ExternalLink, Star, ChevronRight, ChevronLeft, Pin, UserCheck, Timer
} from 'lucide-react';
```

### Step 3 — Verify the settings section renders correctly

Run `npm run dev` and open the Jira → Settings tab. Confirm a "Tempo" section with a password input for the token appears.

### Step 4 — Commit

```bash
git add src/components/JiraPanel.tsx
git commit -m "feat: add Tempo token field in Jira settings panel"
```

---

## Task 3: Create TempoLogModal component

**Files:**
- Create: `src/components/TempoLogModal.tsx`

### Step 1 — Create the file with all imports and types

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { X, Clock, AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { JiraIssue, TempoWorklogEntry, getTempoWorklogs, logTempoWorklog } from './jiraApi';

interface TempoLogModalProps {
    issue: JiraIssue;
    authorAccountId: string;
    onClose: () => void;
    onSuccess: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** Round current time down to nearest :00 or :30 */
function defaultStartTime(): { h: number; m: number } {
    const now = new Date();
    return { h: now.getHours(), m: now.getMinutes() < 30 ? 0 : 30 };
}

function toTotalMinutes(h: number, m: number): number {
    return h * 60 + m;
}

/** Parse "HH:MM:SS" → total minutes */
function parseTimeToMinutes(t: string): number {
    const parts = t.split(':').map(Number);
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function formatMinutes(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
}

function formatHHMM(h: number, m: number): string {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function checkOverlap(
    logs: TempoWorklogEntry[],
    startH: number,
    startM: number,
    durationSeconds: number,
): boolean {
    const newStart = toTotalMinutes(startH, startM);
    const newEnd = newStart + Math.floor(durationSeconds / 60);
    return logs.some(log => {
        const logStart = parseTimeToMinutes(log.startTime);
        const logEnd = logStart + Math.floor(log.timeSpentSeconds / 60);
        return newStart < logEnd && newEnd > logStart;
    });
}
```

### Step 2 — Add the main component function and state

Continue in the same file:

```tsx
export const TempoLogModal: React.FC<TempoLogModalProps> = ({ issue, authorAccountId, onClose, onSuccess }) => {
    const def = defaultStartTime();
    const [date, setDate] = useState(todayStr());
    const [startH, setStartH] = useState(def.h);
    const [startM, setStartM] = useState(def.m);
    const [durH, setDurH] = useState(1);
    const [durM, setDurM] = useState(0);
    const [description, setDescription] = useState('');
    const [worklogs, setWorklogs] = useState<TempoWorklogEntry[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // ── Derived ───────────────────────────────────────────────────────────────
    const durationSeconds = (durH * 60 + durM) * 60;
    const endTotalMin = toTotalMinutes(startH, startM) + durH * 60 + durM;
    const endH = Math.floor(endTotalMin / 60) % 24;
    const endM = endTotalMin % 60;
    const hasOverlap = durationSeconds > 0 && checkOverlap(worklogs, startH, startM, durationSeconds);
    const totalDaySeconds = worklogs.reduce((acc, l) => acc + l.timeSpentSeconds, 0);
    const isValid = durationSeconds > 0;
```

### Step 3 — Add the worklog fetcher effect

```tsx
    const fetchWorklogs = useCallback(async () => {
        if (!authorAccountId) return;
        setLoadingLogs(true);
        try {
            const data = await getTempoWorklogs(date, date, authorAccountId);
            setWorklogs(data);
        } catch (e: any) {
            // silently fail — preview is non-critical
            setWorklogs([]);
        } finally {
            setLoadingLogs(false);
        }
    }, [date, authorAccountId]);

    useEffect(() => { fetchWorklogs(); }, [fetchWorklogs]);
```

### Step 4 — Add the submit handler

```tsx
    const handleSubmit = async () => {
        if (!isValid || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            await logTempoWorklog(
                parseInt(issue.id, 10),
                authorAccountId,
                durationSeconds,
                date,
                `${formatHHMM(startH, startM)}:00`,
                description || undefined,
            );
            setSuccess(true);
            setTimeout(() => { onSuccess(); onClose(); }, 1200);
        } catch (e: any) {
            setError(e?.message ?? 'Error al registrar tiempo.');
        } finally {
            setSubmitting(false);
        }
    };
```

### Step 5 — Add the JSX render

```tsx
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                        <Clock size={15} className="text-microtermix-accent" />
                        <span className="text-sm font-bold text-slate-200">Log Time</span>
                        <span className="font-mono text-xs text-microtermix-neon/70 ml-1">{issue.key}</span>
                    </div>
                    <button onClick={onClose} className="p-1 text-slate-500 hover:text-white rounded transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-hide">
                    {/* Issue summary */}
                    <p className="text-xs text-slate-400 leading-snug truncate">{issue.fields.summary}</p>

                    {/* Form row */}
                    <div className="grid grid-cols-4 gap-3">
                        {/* Date */}
                        <div className="col-span-2">
                            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fecha</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-microtermix-accent transition-colors"
                            />
                        </div>
                        {/* Start time */}
                        <div>
                            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Inicio</label>
                            <div className="flex gap-1">
                                <select
                                    value={startH}
                                    onChange={e => setStartH(Number(e.target.value))}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-microtermix-accent"
                                >
                                    {Array.from({ length: 24 }, (_, i) => (
                                        <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                                    ))}
                                </select>
                                <select
                                    value={startM}
                                    onChange={e => setStartM(Number(e.target.value))}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-microtermix-accent"
                                >
                                    {[0, 15, 30, 45].map(m => (
                                        <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {/* End time (read-only) */}
                        <div>
                            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fin</label>
                            <div className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono">
                                {durationSeconds > 0 ? formatHHMM(endH, endM) : '--:--'}
                            </div>
                        </div>
                    </div>

                    {/* Duration row */}
                    <div>
                        <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Duración</label>
                        <div className="flex items-center gap-2">
                            <select
                                value={durH}
                                onChange={e => setDurH(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-microtermix-accent"
                            >
                                {Array.from({ length: 9 }, (_, i) => (
                                    <option key={i} value={i}>{i}h</option>
                                ))}
                            </select>
                            <select
                                value={durM}
                                onChange={e => setDurM(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-microtermix-accent"
                            >
                                {[0, 15, 30, 45].map(m => (
                                    <option key={m} value={m}>{m}m</option>
                                ))}
                            </select>
                            {durationSeconds > 0 && (
                                <span className="text-xs text-slate-400">= {formatMinutes(durH * 60 + durM)}</span>
                            )}
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Descripción (opcional)</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe el trabajo realizado..."
                            rows={2}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-accent transition-colors resize-none scrollbar-hide"
                        />
                    </div>

                    {/* Overlap warning */}
                    {hasOverlap && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                            <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                            <p className="text-xs text-amber-300">Este horario se solapa con otro registro existente.</p>
                        </div>
                    )}

                    {/* Day preview */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Preview — {date}
                            </span>
                            {loadingLogs && <RefreshCw size={11} className="animate-spin text-slate-600" />}
                            <span className="text-[10px] text-slate-600">
                                Registrado: {formatMinutes(Math.floor(totalDaySeconds / 60))}
                                {durationSeconds > 0 && ` → con este: ${formatMinutes(Math.floor((totalDaySeconds + durationSeconds) / 60))}`}
                            </span>
                        </div>

                        <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-hide">
                            {worklogs.length === 0 && !loadingLogs && (
                                <p className="text-xs text-slate-700 italic py-2 text-center">Sin registros este día.</p>
                            )}
                            {/* Existing worklogs */}
                            {[...worklogs]
                                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                                .map(log => {
                                    const logStartMin = parseTimeToMinutes(log.startTime);
                                    const logEndMin = logStartMin + Math.floor(log.timeSpentSeconds / 60);
                                    const logEndH = Math.floor(logEndMin / 60) % 24;
                                    const logEndM = logEndMin % 60;
                                    return (
                                        <div
                                            key={log.tempoWorklogId}
                                            className="flex items-center gap-2 px-2 py-1.5 bg-slate-800/50 rounded text-xs"
                                        >
                                            <span className="font-mono text-slate-500 shrink-0 w-20">
                                                {log.startTime.slice(0, 5)} – {formatHHMM(logEndH, logEndM)}
                                            </span>
                                            <span className="text-microtermix-accent/80 font-mono text-[10px] shrink-0">
                                                {log.issue.key ?? `#${log.issue.id}`}
                                            </span>
                                            <span className="text-slate-400 truncate flex-1">
                                                {log.description || '—'}
                                            </span>
                                            <span className="text-slate-600 shrink-0">
                                                {formatMinutes(Math.floor(log.timeSpentSeconds / 60))}
                                            </span>
                                        </div>
                                    );
                                })}
                            {/* New entry preview */}
                            {durationSeconds > 0 && (
                                <div className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs border ${hasOverlap ? 'bg-amber-500/10 border-amber-500/30' : 'bg-microtermix-neon/10 border-microtermix-neon/30'}`}>
                                    <span className={`font-mono shrink-0 w-20 ${hasOverlap ? 'text-amber-400' : 'text-microtermix-neon'}`}>
                                        {formatHHMM(startH, startM)} – {formatHHMM(endH, endM)}
                                    </span>
                                    <span className="font-mono text-[10px] shrink-0 text-microtermix-accent">{issue.key}</span>
                                    <span className={`truncate flex-1 ${hasOverlap ? 'text-amber-300' : 'text-microtermix-neon/80'}`}>
                                        {description || '(nuevo)'}
                                    </span>
                                    <span className={`shrink-0 ${hasOverlap ? 'text-amber-400' : 'text-microtermix-neon'}`}>
                                        {formatMinutes(durH * 60 + durM)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-slate-800 shrink-0 flex items-center justify-between gap-3">
                    {error && (
                        <p className="text-xs text-microtermix-danger flex-1 truncate">{error}</p>
                    )}
                    {success && (
                        <p className="text-xs text-microtermix-success flex items-center gap-1 flex-1">
                            <CheckCircle size={12} /> Tiempo registrado correctamente
                        </p>
                    )}
                    {!error && !success && <div className="flex-1" />}
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid || submitting || success}
                        className="px-4 py-2 text-xs font-bold bg-microtermix-accent hover:bg-opacity-80 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-1.5"
                    >
                        {submitting && <RefreshCw size={11} className="animate-spin" />}
                        {submitting ? 'Registrando...' : 'Registrar tiempo'}
                    </button>
                </div>
            </div>
        </div>
    );
};
```

### Step 6 — Verify TypeScript compiles

```bash
npm run build
```
Expected: no errors in `TempoLogModal.tsx`.

### Step 7 — Commit

```bash
git add src/components/TempoLogModal.tsx
git commit -m "feat: add TempoLogModal component"
```

---

## Task 4: Wire Log Time button into the task detail panel

**Files:**
- Modify: `src/components/JiraPanel.tsx`

### Step 1 — Import `TempoLogModal` at the top of `JiraPanel.tsx`

Add after the existing imports (before the `// ── Types` comment):

```ts
import { TempoLogModal } from './TempoLogModal';
```

### Step 2 — Add modal state to the StoriesTab component

In the `StoriesTab` component (search for `const [selectedTask, setSelectedTask]`), add two new state variables right after `selectedTask`:

```tsx
const [showTempoModal, setShowTempoModal] = useState(false);
```

### Step 3 — Find the task detail panel where selectedTask status is shown

Find this block (around line 1339–1355):
```tsx
                        {!selectedTask ? (
                            <p className="text-xs text-slate-600 text-center py-8">← Selecciona una Task</p>
                        ) : (
                            <div className="space-y-3">
                                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                                    <p className="font-mono text-[10px] text-microtermix-neon/60 mb-1">{selectedTask.key}</p>
                                    <p className="text-xs text-slate-200 leading-snug">{selectedTask.fields.summary}</p>
                                    <div className="mt-2">
                                        <span
                                            className="px-2 py-0.5 text-[9px] rounded-full font-bold uppercase"
                                            style={{
                                                background: statusColor(selectedTask.fields.status.statusCategory.colorName) + '22',
                                                color: statusColor(selectedTask.fields.status.statusCategory.colorName),
                                                border: `1px solid ${statusColor(selectedTask.fields.status.statusCategory.colorName)}44`,
                                            }}
                                        >{selectedTask.fields.status.name}</span>
                                    </div>
```

After the closing `</div>` of the status badge `<div className="mt-2">`, add the Log Time button:

```tsx
                                    {selectedTask.fields.status.name.toLowerCase() === 'working' && (
                                        <button
                                            onClick={() => setShowTempoModal(true)}
                                            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-microtermix-accent/20 text-microtermix-accent border border-microtermix-accent/40 hover:bg-microtermix-accent/30 rounded-lg transition-colors"
                                        >
                                            <Timer size={12} />
                                            Log Time
                                        </button>
                                    )}
```

### Step 4 — Add the TempoLogModal at the end of the StoriesTab return

Find the closing `</div>` of the StoriesTab component (the last `</div>` before `</>`  or end of JSX return). Add the modal render just before the final closing tag:

```tsx
                {/* Tempo Log Time Modal */}
                {showTempoModal && selectedTask && (
                    <TempoLogModal
                        issue={selectedTask}
                        authorAccountId={cfg.defaultAssigneeId}
                        onClose={() => setShowTempoModal(false)}
                        onSuccess={() => setShowTempoModal(false)}
                    />
                )}
```

### Step 5 — Verify TypeScript compiles

```bash
npm run build
```
Expected: no errors. If there's a `cfg` not in scope error, note that `loadConfig()` is already called at the top of `StoriesTab` — use that reference.

### Step 6 — Manual verification

1. Run `npm run tauri dev`
2. Open Jira panel → Settings → confirm "Tempo" section with token field
3. Enter a valid Tempo API token and save
4. Go to Stories tab, select a task that is in "Working" status
5. Confirm "Log Time" button appears in the detail panel
6. Confirm button does NOT appear for tasks in other statuses (e.g. "To Do", "Done")
7. Click "Log Time" → modal opens pre-filled with today's date and current time
8. Change date → confirm day preview loads worklogs
9. Set duration → confirm end time auto-calculates and preview entry appears
10. If a worklog exists that overlaps → confirm amber warning
11. Click "Registrar tiempo" → confirm Tempo API is called (check Jira Console) → modal closes

### Step 7 — Commit

```bash
git add src/components/JiraPanel.tsx
git commit -m "feat: add Log Time button to task detail panel (Working status only)"
```

---

## Summary

| Task | Files | What it does |
|---|---|---|
| 1 | `jiraApi.ts` | `tempoToken` config + `tempoFetch` + `getTempoWorklogs` + `logTempoWorklog` |
| 2 | `JiraPanel.tsx` | Tempo token field in Settings section |
| 3 | `TempoLogModal.tsx` | Full modal: date/time/duration form + day preview + overlap detection |
| 4 | `JiraPanel.tsx` | Log Time button (visible only when status === "Working") + modal wiring |
