import React from 'react';
import { Pencil, Trash2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type TempoWorklog } from '../../services/tempoApi';
import { formatDuration } from '../../stores/tempoStore';

interface WorklogCardProps {
  worklog: TempoWorklog;
  onEdit: (worklog: TempoWorklog) => void;
  onDelete: (tempoWorklogId: number) => void;
  className?: string;
}

export const WorklogCard: React.FC<WorklogCardProps> = ({ worklog, onEdit, onDelete, className }) => {
  const issueLabel = worklog.issueKey ?? `#${worklog.issue.id}`;

  return (
    <div className={cn(
      'group flex items-start gap-3 px-4 py-3 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 transition-colors',
      className,
    )}>
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        <Clock size={12} className="text-slate-500" />
        <span className="bg-nexus-neon/10 text-nexus-neon border border-nexus-neon/20 font-mono text-[11px] px-1.5 py-0.5 rounded">
          {formatDuration(worklog.timeSpentSeconds)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-slate-300 font-mono shrink-0">{issueLabel}</span>
          {worklog.issueSummary && (
            <span className="text-xs text-slate-500 truncate">{worklog.issueSummary}</span>
          )}
        </div>
        {worklog.description && (
          <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{worklog.description}</p>
        )}
        <p className="text-[10px] text-slate-600 mt-1">
          {worklog.startTime ? `${worklog.startDate} ${worklog.startTime.slice(0, 5)}` : worklog.startDate}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onEdit(worklog)}
          className="p-1 rounded text-slate-500 hover:text-nexus-accent hover:bg-slate-700 transition-colors"
          title="Editar"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={() => onDelete(worklog.tempoWorklogId)}
          className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 transition-colors"
          title="Eliminar"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
};
