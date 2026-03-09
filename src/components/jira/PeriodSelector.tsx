import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Period, type PeriodType, shiftPeriod, periodRange } from '../../stores/tempoStore';

interface PeriodSelectorProps {
  period: Period;
  onChange: (p: Period) => void;
  className?: string;
}

function formatPeriodLabel(period: Period): string {
  const { from, to } = periodRange(period);
  const f = (iso: string) => { const [, mm, dd] = iso.split('-'); return `${dd}/${mm}`; };
  if (period.type === 'week') {
    return `${f(from)} – ${f(to)} · ${new Date(from + 'T12:00:00').getFullYear()}`;
  }
  return new Date(from + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({ period, onChange, className }) => {
  const { from, to } = periodRange(period);
  const today = new Date().toISOString().split('T')[0];
  const isCurrentPeriod = today >= from && today <= to;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex rounded-md bg-slate-800/80 p-0.5 text-[11px] font-medium">
        {(['week', 'month'] as PeriodType[]).map(t => (
          <button
            key={t}
            onClick={() => onChange({ ...period, type: t })}
            className={cn(
              'px-2.5 py-1 rounded capitalize transition-colors',
              period.type === t ? 'bg-nexus-neon text-slate-900' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {t === 'week' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>
      <button
        onClick={() => onChange(shiftPeriod(period, -1))}
        className="p-1 text-slate-400 hover:text-white rounded transition-colors"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-xs text-slate-300 min-w-[150px] text-center font-mono">
        {formatPeriodLabel(period)}
      </span>
      <button
        onClick={() => onChange(shiftPeriod(period, 1))}
        className="p-1 text-slate-400 hover:text-white rounded transition-colors"
      >
        <ChevronRight size={14} />
      </button>
      {!isCurrentPeriod && (
        <button
          onClick={() => onChange({ ...period, anchor: today })}
          className="text-[10px] text-slate-500 hover:text-slate-200 px-2 py-0.5 rounded transition-colors"
        >
          Hoy
        </button>
      )}
    </div>
  );
};
