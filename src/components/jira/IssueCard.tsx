
import { ExternalLink } from 'lucide-react';
import { JiraIssue, loadConfig } from '../jiraApi';
import { StatusBadge } from './StatusBadge';
import { Badge } from '../ui/badge';

export function IssueCard({ issue, onClick }: { issue: JiraIssue; onClick: () => void }) {
    const { fields } = issue;
    const cfg = loadConfig();
    return (
        <div
            onClick={onClick}
            className="flex items-start gap-3 px-4 py-3 bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-600 rounded-lg cursor-pointer transition-colors group"
        >
            {fields.issuetype?.iconUrl && (
                <img src={fields.issuetype.iconUrl} alt={fields.issuetype.name} className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <a
                        href={`${cfg.baseUrl}/browse/${issue.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="font-mono text-[11px] text-nexus-neon/70 hover:text-nexus-neon flex items-center gap-0.5"
                    >
                        {issue.key}<ExternalLink size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    <StatusBadge status={fields.status} />
                    {fields.priority?.iconUrl && (
                        <img src={fields.priority.iconUrl} alt={fields.priority.name} title={fields.priority.name} className="w-3.5 h-3.5" />
                    )}
                </div>
                <p className="text-sm text-slate-200 leading-snug truncate">{fields.summary}</p>
                {fields.labels.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                        {fields.labels.slice(0, 3).map(l => (
                            <Badge key={l} variant="outline" className="px-1.5 py-px text-[9px] rounded bg-slate-700 border-none text-slate-400 font-mono h-auto leading-none">
                                {l}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
            {fields.assignee && (
                <img
                    src={fields.assignee.avatarUrls['24x24']}
                    alt={fields.assignee.displayName}
                    title={fields.assignee.displayName}
                    className="w-6 h-6 rounded-full shrink-0"
                />
            )}
        </div>
    );
}
