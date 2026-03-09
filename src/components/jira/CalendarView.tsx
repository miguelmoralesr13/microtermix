import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { TempoWorklog } from '../../services/tempoApi';
import { type Period, periodRange, formatDuration } from '../../stores/tempoStore';

interface CalendarViewProps {
  worklogs: TempoWorklog[];
  period: Period;
  onEdit: (w: TempoWorklog) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 52;   // px per hour on the timeline
const START_HOUR = 7;     // timeline starts at 07:00
const END_HOUR = 21;      // timeline ends at 21:00
const TOTAL_HOURS = END_HOUR - START_HOUR;

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseStartTime(startTime?: string): { h: number; m: number } {
  if (!startTime) return { h: START_HOUR, m: 0 };
  const [h, m] = startTime.split(':').map(Number);
  return { h: isNaN(h) ? START_HOUR : h, m: isNaN(m) ? 0 : m };
}

function issueColor(key: string): { bg: string; border: string; text: string } {
  const palettes = [
    { bg: 'bg-cyan-500/20',    border: 'border-cyan-500/60',   text: 'text-cyan-300' },
    { bg: 'bg-violet-500/20',  border: 'border-violet-500/60', text: 'text-violet-300' },
    { bg: 'bg-amber-500/20',   border: 'border-amber-500/60',  text: 'text-amber-300' },
    { bg: 'bg-emerald-500/20', border: 'border-emerald-500/60',text: 'text-emerald-300' },
    { bg: 'bg-rose-500/20',    border: 'border-rose-500/60',   text: 'text-rose-300' },
    { bg: 'bg-sky-500/20',     border: 'border-sky-500/60',    text: 'text-sky-300' },
    { bg: 'bg-orange-500/20',  border: 'border-orange-500/60', text: 'text-orange-300' },
    { bg: 'bg-pink-500/20',    border: 'border-pink-500/60',   text: 'text-pink-300' },
  ];
  let hash = 0;
  for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return palettes[hash % palettes.length];
}

/** Get all dates between from and to inclusive */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function dayLabel(iso: string, short = false): string {
  const d = new Date(iso + 'T12:00:00');
  if (short) return d.toLocaleDateString('es-MX', { weekday: 'short' }).slice(0, 3);
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
}

function isToday(iso: string): boolean {
  return iso === new Date().toISOString().split('T')[0];
}

// ── Week timeline view ─────────────────────────────────────────────────────────

const WeekView: React.FC<{ days: string[]; byDate: Map<string, TempoWorklog[]>; onEdit: (w: TempoWorklog) => void }> = ({ days, byDate, onEdit }) => {
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);
  const containerHeight = TOTAL_HOURS * HOUR_HEIGHT;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Day header row */}
      <div className="flex shrink-0 pl-10 border-b border-slate-800">
        {days.map(d => (
          <div key={d} className="flex-1 min-w-0 py-2 text-center border-r border-slate-800 last:border-r-0">
            <div className={cn('text-[10px] font-medium uppercase tracking-wide', isToday(d) ? 'text-nexus-neon' : 'text-slate-500')}>
              {dayLabel(d)}
            </div>
            {byDate.get(d)?.length ? (
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                {formatDuration(byDate.get(d)!.reduce((s, w) => s + w.timeSpentSeconds, 0))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Scrollable timeline */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="flex" style={{ height: containerHeight }}>
          {/* Hour labels */}
          <div className="w-10 shrink-0 relative">
            {hours.map(h => (
              <div
                key={h}
                className="absolute right-2 text-[10px] text-slate-600 font-mono"
                style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 7 }}
              >
                {String(h).padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map(d => {
            const worklogs = byDate.get(d) ?? [];
            return (
              <div key={d} className="flex-1 min-w-0 relative border-r border-slate-800/60 last:border-r-0">
                {/* Hour grid lines */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-slate-800/50"
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}
                {/* Half-hour lines (subtle) */}
                {hours.map(h => (
                  <div
                    key={`${h}h`}
                    className="absolute inset-x-0 border-t border-slate-800/20"
                    style={{ top: (h - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Today highlight */}
                {isToday(d) && (
                  <div className="absolute inset-0 bg-nexus-neon/3 pointer-events-none" />
                )}

                {/* Worklog blocks */}
                {worklogs.map(w => {
                  const { h, m } = parseStartTime(w.startTime);
                  const clampedH = Math.max(START_HOUR, Math.min(h, END_HOUR - 0.25));
                  const topOffset = ((clampedH - START_HOUR) + m / 60) * HOUR_HEIGHT;
                  const heightPx = Math.max((w.timeSpentSeconds / 3600) * HOUR_HEIGHT, 18);
                  const color = issueColor(w.issueKey ?? String(w.issue.id));

                  return (
                    <button
                      key={w.tempoWorklogId}
                      onClick={() => onEdit(w)}
                      title={`${w.issueKey ?? ''} ${w.issueSummary ?? ''}\n${formatDuration(w.timeSpentSeconds)}${w.description ? '\n' + w.description : ''}`}
                      className={cn(
                        'absolute inset-x-0.5 rounded border text-left overflow-hidden cursor-pointer transition-opacity hover:opacity-80',
                        color.bg, color.border,
                      )}
                      style={{ top: topOffset, height: heightPx }}
                    >
                      <div className={cn('px-1.5 py-0.5 truncate text-[10px] font-mono leading-tight', color.text)}>
                        {w.issueKey && <span className="font-bold">{w.issueKey}</span>}
                        {heightPx > 28 && w.issueSummary && (
                          <span className="text-slate-400 ml-1">{w.issueSummary}</span>
                        )}
                        {heightPx > 40 && (
                          <div className="text-[9px] opacity-70">{formatDuration(w.timeSpentSeconds)}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Month calendar view ────────────────────────────────────────────────────────

const MonthView: React.FC<{ from: string; to: string; byDate: Map<string, TempoWorklog[]>; onEdit: (w: TempoWorklog) => void }> = ({ from, to, byDate, onEdit }) => {
  // Build full 6-week grid anchored to start of from month
  const anchor = new Date(from + 'T12:00:00');
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startDay = new Date(firstDay);
  // Shift to Monday
  const dow = startDay.getDay();
  startDay.setDate(startDay.getDate() - (dow === 0 ? 6 : dow - 1));

  const cells: string[] = [];
  const cur = new Date(startDay);
  for (let i = 0; i < 42; i++) {
    cells.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  const today = new Date().toISOString().split('T')[0];
  const maxHours = Math.max(...[...byDate.values()].map(ws => ws.reduce((s, w) => s + w.timeSpentSeconds, 0)), 1);

  const WEEK_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  return (
    <div className="flex flex-col h-full min-h-0 px-1">
      {/* Week day headers */}
      <div className="grid grid-cols-7 mb-1 shrink-0">
        {WEEK_DAYS.map(d => (
          <div key={d} className="text-center text-[10px] text-slate-500 uppercase tracking-wide py-1.5 font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* 6-row grid */}
      <div className="grid grid-cols-7 flex-1 min-h-0 gap-px bg-slate-800">
        {cells.map((date, i) => {
          const ws = byDate.get(date) ?? [];
          const totalSeconds = ws.reduce((s, w) => s + w.timeSpentSeconds, 0);
          const isInPeriod = date >= from && date <= to;
          const isCurrentDay = date === today;
          const barWidth = totalSeconds > 0 ? Math.max((totalSeconds / maxHours) * 100, 10) : 0;

          return (
            <div
              key={i}
              className={cn(
                'bg-slate-950 p-1.5 flex flex-col gap-1 min-h-0',
                !isInPeriod && 'opacity-30',
              )}
            >
              {/* Date number */}
              <div className={cn(
                'text-[11px] font-mono leading-none w-5 h-5 flex items-center justify-center rounded-full shrink-0',
                isCurrentDay ? 'bg-nexus-neon text-slate-900 font-bold' : 'text-slate-400',
              )}>
                {new Date(date + 'T12:00:00').getDate()}
              </div>

              {/* Hours total */}
              {totalSeconds > 0 && (
                <div className="text-[10px] text-slate-300 font-mono leading-none">
                  {formatDuration(totalSeconds)}
                </div>
              )}

              {/* Proportional bar */}
              {barWidth > 0 && (
                <div className="h-1.5 rounded-full bg-slate-800 w-full overflow-hidden mt-auto">
                  <div
                    className="h-full rounded-full bg-nexus-neon/70"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              )}

              {/* Issue dots (up to 3) */}
              {ws.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                  {ws.slice(0, 3).map(w => {
                    const color = issueColor(w.issueKey ?? String(w.issue.id));
                    return (
                      <button
                        key={w.tempoWorklogId}
                        onClick={() => onEdit(w)}
                        title={`${w.issueKey ?? ''} · ${formatDuration(w.timeSpentSeconds)}`}
                        className={cn('text-[9px] font-mono px-1 py-0.5 rounded truncate max-w-full border', color.bg, color.border, color.text)}
                      >
                        {w.issueKey?.split('-')[1] ?? '?'}
                      </button>
                    );
                  })}
                  {ws.length > 3 && (
                    <span className="text-[9px] text-slate-600">+{ws.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Root CalendarView ──────────────────────────────────────────────────────────

export const CalendarView: React.FC<CalendarViewProps> = ({ worklogs, period, onEdit }) => {
  const { from, to } = periodRange(period);

  const byDate = useMemo(() => {
    const map = new Map<string, TempoWorklog[]>();
    for (const w of worklogs) {
      const key = w.startDate;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    }
    return map;
  }, [worklogs]);

  const days = useMemo(() => dateRange(from, to), [from, to]);

  if (period.type === 'month') {
    return <MonthView from={from} to={to} byDate={byDate} onEdit={onEdit} />;
  }

  return <WeekView days={days} byDate={byDate} onEdit={onEdit} />;
};
