import { ChevronRight, Star, UserCheck } from 'lucide-react';
import { JiraIssue, isReleased, statusColor } from './jiraApi';

export function HierarchyCard({
    issue, selected, pinned, onSelect, onPin, onDetail, onAssign, onLinkedIssues, showPin = true
}: {
    issue: JiraIssue; selected: boolean; pinned: boolean;
    onSelect: () => void; onPin: () => void;
    onDetail?: () => void;
    onAssign?: () => void;
    onLinkedIssues?: () => void;
    showPin?: boolean;
}) {
    const released = isReleased(issue);
    return (
        <div
            onClick={onSelect}
            className={`group flex items-start gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${selected
                ? 'bg-microtermix-neon/20 border-microtermix-neon/60 shadow-[0_0_12px_rgba(0,255,170,0.15)] border-l-4'
                : released
                    ? 'bg-slate-900/40 border-slate-800/50 opacity-60 hover:opacity-80'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 hover:border-slate-600 border-l-4 border-l-transparent'
                }`}
        >
            {showPin && (
                <button
                    onClick={e => { e.stopPropagation(); onPin(); }}
                    className={`shrink-0 mt-0.5 transition-colors ${pinned ? 'text-yellow-400' : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-yellow-400'}`}
                >
                    <Star size={12} fill={pinned ? 'currentColor' : 'none'} />
                </button>
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="font-mono text-[10px] text-microtermix-neon/60">{issue.key}</span>
                    {released && (
                        <span className="px-1.5 py-px text-[9px] rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                            {issue.fields.status.name}
                        </span>
                    )}
                    {!released && (
                        <span
                            className="px-1.5 py-px text-[9px] rounded-full font-bold uppercase"
                            style={{
                                background: statusColor(issue.fields.status.statusCategory.colorName) + '22',
                                color: statusColor(issue.fields.status.statusCategory.colorName),
                                border: `1px solid ${statusColor(issue.fields.status.statusCategory.colorName)}44`,
                            }}
                        >{issue.fields.status.name}</span>
                    )}
                    {onAssign && (
                        <button
                            onClick={e => { e.stopPropagation(); onAssign(); }}
                            className="p-0.5 rounded flex items-center justify-center hover:bg-microtermix-neon/10 text-slate-500 hover:text-microtermix-neon shrink-0 transition-colors"
                            title="Asignarme esta tarea"
                        >
                            <UserCheck size={11} />
                        </button>
                    )}
                    <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onLinkedIssues && (
                            <button
                                onClick={e => { e.stopPropagation(); onLinkedIssues(); }}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 font-bold flex items-center gap-1 shrink-0"
                                title="Ver Defectos Asociados"
                            >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                                </svg>
                                Bugs
                            </button>
                        )}
                        {onDetail && (
                            <button
                                onClick={e => { e.stopPropagation(); onDetail(); }}
                                className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 font-mono shrink-0"
                            >
                                info
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-xs text-slate-200 leading-snug line-clamp-2">{issue.fields.summary}</p>
                {issue.fields.assignee && (
                    <div className="flex items-center gap-1 mt-1.5">
                        <img
                            src={issue.fields.assignee.avatarUrls['16x16']}
                            alt={issue.fields.assignee.displayName}
                            title={issue.fields.assignee.displayName}
                            className="w-3.5 h-3.5 rounded-full opacity-80"
                        />
                        <span className="text-[10px] text-slate-500 truncate">{issue.fields.assignee.displayName}</span>
                    </div>
                )}
            </div>
            {selected && <ChevronRight size={12} className="text-microtermix-neon shrink-0 mt-1" />}
        </div>
    );
}
