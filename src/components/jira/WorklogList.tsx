import React from 'react';
import { type TempoWorklog } from '../../services/tempoApi';
import { formatDuration } from '../../stores/tempoStore';
import { WorklogCard } from './WorklogCard';

interface WorklogListProps {
  worklogs: TempoWorklog[];
  onEdit: (w: TempoWorklog) => void;
  onDelete: (id: number) => void;
}

function groupByDay(worklogs: TempoWorklog[]): [string, TempoWorklog[]][] {
  const map = new Map<string, TempoWorklog[]>();
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
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (iso === today) return 'Hoy';
  if (iso === yesterday) return 'Ayer';
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
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 capitalize">{formatDayLabel(day)}</span>
              <span className="text-[11px] font-mono text-slate-500">{formatDuration(dayTotal)}</span>
            </div>
            <div className="space-y-1.5">
              {dayWorklogs.map(w => (
                <WorklogCard key={w.tempoWorklogId} worklog={w} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </div>
          </div>
        );
      })}
      <div className="border-t border-slate-800 pt-3 flex justify-between items-center px-1">
        <span className="text-xs text-slate-500">Total del período</span>
        <span className="text-sm font-bold font-mono text-microtermix-neon">{formatDuration(totalSeconds)}</span>
      </div>
    </div>
  );
};
