// src/services/tempoApi.ts
import { fetch } from '@tauri-apps/plugin-http';

const TEMPO_BASE = 'https://api.tempo.io/4';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TempoWorklog {
  tempoWorklogId: number;
  jiraWorklogId?: number;
  issue: { id: number };
  timeSpentSeconds: number;
  startDate: string;
  startTime?: string;
  description?: string;
  author: { accountId: string; displayName: string };
  createdAt: string;
  updatedAt: string;
  issueKey?: string;
  issueSummary?: string;
}

export interface WorklogPayload {
  issueId?: number;
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

// ── API Logger (same pattern as jiraApiLog) ────────────────────────────────────

export interface TempoApiLogEntry {
  id: number;
  time: string;       // HH:MM:SS
  method: string;
  path: string;       // /worklogs?...
  url: string;        // full URL
  body?: string;
  status?: number;
  durationMs?: number;
  ok: boolean;
  curl: string;
  error?: string;
  responsePreview?: string; // first 300 chars of response
}

type TempoLogListener = (entry: TempoApiLogEntry) => void;
let _listeners: TempoLogListener[] = [];
let _seq = 0;

export const tempoApiLog = {
  on(fn: TempoLogListener)  { _listeners.push(fn); },
  off(fn: TempoLogListener) { _listeners = _listeners.filter(l => l !== fn); },
  emit(entry: TempoApiLogEntry) { _listeners.forEach(l => l(entry)); },
};

// ── Request helper ─────────────────────────────────────────────────────────────

async function tempoRequest<T>(token: string, path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();
  const fullUrl = `${TEMPO_BASE}${path}`;
  const bodyStr = options?.body ? String(options.body) : undefined;
  const id = ++_seq;
  const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const curlParts = [
    `curl -s -X ${method}`,
    `'${fullUrl}'`,
    `-H 'Authorization: Bearer <TOKEN>'`,
    `-H 'Accept: application/json'`,
    `-H 'Content-Type: application/json'`,
  ];
  if (bodyStr) curlParts.push(`-d '${bodyStr}'`);
  const curl = curlParts.join(' \\\n  ');

  const t0 = Date.now();
  try {
    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });
    const durationMs = Date.now() - t0;
    const text = await res.text();

    if (!res.ok) {
      tempoApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, status: res.status, durationMs, ok: false, curl, error: text, responsePreview: text.slice(0, 300) });
      throw new Error(`Tempo ${res.status}: ${text}`);
    }

    tempoApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, status: res.status, durationMs, ok: true, curl, responsePreview: text.slice(0, 300) });
    return text ? JSON.parse(text) : ({} as T);
  } catch (e: any) {
    const durationMs = Date.now() - t0;
    // Only emit if not already emitted (non-HTTP errors like network failure)
    if (!e.message?.startsWith('Tempo ')) {
      tempoApiLog.emit({ id, time, method, path, url: fullUrl, body: bodyStr, durationMs, ok: false, curl, error: e.message });
    }
    throw e;
  }
}

async function fetchAllPages<T>(token: string, path: string, params: Record<string, string>): Promise<T[]> {
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

// ── Exported API functions ─────────────────────────────────────────────────────

export async function getMyWorklogs(token: string, authorAccountId: string, from: string, to: string): Promise<TempoWorklog[]> {
  // Use the dedicated user endpoint — filters strictly by that user
  return fetchAllPages<TempoWorklog>(token, `/worklogs/user/${authorAccountId}`, { from, to });
}

export async function getIssueWorklogs(token: string, issueId: number, authorAccountId?: string): Promise<TempoWorklog[]> {
  // Fetch issue worklogs then client-side filter by author if needed
  const all = await fetchAllPages<TempoWorklog>(token, `/worklogs/issue/${issueId}`, {});
  if (!authorAccountId) return all;
  return all.filter(w => w.author.accountId === authorAccountId);
}

export async function createWorklog(token: string, payload: object): Promise<TempoWorklog> {
  return tempoRequest<TempoWorklog>(token, '/worklogs', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateWorklog(token: string, tempoWorklogId: number, payload: Partial<WorklogPayload>): Promise<TempoWorklog> {
  return tempoRequest<TempoWorklog>(token, `/worklogs/${tempoWorklogId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteWorklog(token: string, tempoWorklogId: number): Promise<void> {
  await tempoRequest<void>(token, `/worklogs/${tempoWorklogId}`, { method: 'DELETE' });
}

/** Resolve the current user's Jira accountId via /rest/api/3/myself */
export async function resolveMyAccountId(jiraBaseUrl: string, email: string, apiToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${jiraBaseUrl}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${btoa(`${email}:${apiToken}`)}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.accountId ?? null;
  } catch {
    return null;
  }
}
