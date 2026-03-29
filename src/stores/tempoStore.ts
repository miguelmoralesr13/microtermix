import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

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

interface TempoState {
  period: Period;
  setPeriod: (period: Period) => void;
}

export const useTempoStore = create<TempoState>()(
  devtools(
    persist(
      (set) => ({
        period: { type: 'week', anchor: new Date().toISOString().split('T')[0] },
        setPeriod: (period) => set({ period }),
      }),
      {
        name: 'microtermix-tempo-store',
        partialize: (s) => ({ period: s.period }),
      },
    ),
    { name: 'TempoStore' },
  ),
);
