import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { fetch } from '@tauri-apps/plugin-http';
import { getMyWorklogs, getIssueWorklogs, type TempoWorklog } from '../services/tempoApi';

export type PeriodType = 'week' | 'month';

export interface Period {
  type: PeriodType;
  anchor: string;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
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

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function parseTimeInput(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const hm = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+)\s*m?$/);
  if (hm) return Math.round(parseFloat(hm[1]) * 3600 + parseInt(hm[2]) * 60);
  const h = s.match(/^(\d+(?:\.\d+)?)\s*h$/);
  if (h) return Math.round(parseFloat(h[1]) * 3600);
  const m = s.match(/^(\d+)\s*m$/);
  if (m) return parseInt(m[1]) * 60;
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 0) return n;
  return null;
}

const issueCache = new Map<string, { key: string; summary: string }>();

async function enrichWorklogs(
  worklogs: TempoWorklog[],
  jiraBaseUrl: string,
  jiraEmail: string,
  jiraToken: string,
): Promise<TempoWorklog[]> {
  const unknownIds = [...new Set(
    worklogs.map(w => String(w.issue.id)).filter(id => !issueCache.has(id)),
  )];
  if (unknownIds.length > 0) {
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < unknownIds.length; i += 100) chunks.push(unknownIds.slice(i, i + 100));
      for (const chunk of chunks) {
        const jql = `id in (${chunk.join(',')})`;
        const res = await fetch(
          `${jiraBaseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=100`,
          { headers: { Authorization: `Basic ${btoa(`${jiraEmail}:${jiraToken}`)}`, Accept: 'application/json' } },
        );
        if (res.ok) {
          const data = await res.json();
          for (const issue of data.issues ?? []) {
            issueCache.set(String(issue.id), { key: issue.key, summary: issue.fields?.summary ?? '' });
          }
        }
      }
    } catch { /* silently skip */ }
  }
  return worklogs.map(w => {
    const info = issueCache.get(String(w.issue.id));
    return info ? { ...w, issueKey: info.key, issueSummary: info.summary } : w;
  });
}

export interface TempoStore {
  worklogs: TempoWorklog[];
  issueWorklogs: TempoWorklog[];
  period: Period;
  loading: boolean;
  loadingIssue: boolean;
  error: string | null;
  setPeriod: (period: Period) => void;
  fetchWorklogs: (tempoToken: string, accountId: string, jiraBaseUrl: string, jiraEmail: string, jiraToken: string) => Promise<void>;
  fetchIssueWorklogs: (tempoToken: string, issueId: number, jiraBaseUrl: string, jiraEmail: string, jiraToken: string, authorAccountId?: string) => Promise<void>;
  removeWorklog: (tempoWorklogId: number) => void;
  upsertWorklog: (worklog: TempoWorklog) => void;
}

export const useTempoStore = create<TempoStore>()(
  devtools(
    persist(
      (set, get) => ({
        worklogs: [],
        issueWorklogs: [],
        period: { type: 'week', anchor: new Date().toISOString().split('T')[0] },
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

        fetchIssueWorklogs: async (tempoToken, issueId, jiraBaseUrl, jiraEmail, jiraToken, authorAccountId) => {
          set({ loadingIssue: true });
          try {
            const raw = await getIssueWorklogs(tempoToken, issueId, authorAccountId);
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
            return idx >= 0 ? list.map(w => w.tempoWorklogId === worklog.tempoWorklogId ? worklog : w) : [worklog, ...list];
          };
          return { worklogs: upsert(s.worklogs), issueWorklogs: upsert(s.issueWorklogs) };
        }),
      }),
      {
        name: 'microtermix-tempo-store',
        partialize: (s) => ({ period: s.period }),
      },
    ),
    { name: 'TempoStore' },
  ),
);
