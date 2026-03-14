
import { ExternalLink } from 'lucide-react';
import { JiraIssue, loadConfig } from '../jiraApi';
import { StatusBadge } from './StatusBadge';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { cn } from '../../lib/utils';

export function IssueCard({ issue, onClick }: { issue: JiraIssue; onClick: () => void }) {
    const { fields } = issue;
    const cfg = loadConfig();
    
    return (
        <Card
            onClick={onClick}
            className={cn(
                "flex items-start gap-3 px-4 py-3 bg-slate-900/40 hover:bg-slate-800/60 transition-all cursor-pointer group border-slate-800 hover:border-slate-600 shadow-sm hover:shadow-md",
                "relative overflow-hidden"
            )}
        >
            {/* Type Icon */}
            {fields.issuetype?.iconUrl && (
                <div className="mt-0.5 shrink-0">
                    <Tooltip>
                        <TooltipTrigger render={
                            <img src={fields.issuetype.iconUrl} alt={fields.issuetype.name} className="w-4 h-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                        } />
                        <TooltipContent>{fields.issuetype.name}</TooltipContent>
                    </Tooltip>
                </div>
            )}

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <a
                        href={`${cfg.baseUrl}/browse/${issue.key}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="font-mono text-[10px] font-bold text-nexus-neon/60 hover:text-nexus-neon flex items-center gap-1 transition-colors"
                    >
                        {issue.key}
                        <ExternalLink size={9} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                    
                    <StatusBadge status={fields.status} />

                    {/* Priority Icon */}
                    {fields.priority?.iconUrl && (
                        <Tooltip>
                            <TooltipTrigger render={
                                <img src={fields.priority.iconUrl} alt={fields.priority.name} className="w-3.5 h-3.5" />
                            } />
                            <TooltipContent>Prioridad: {fields.priority.name}</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                <p className="text-sm text-slate-200 leading-snug font-medium mb-2 group-hover:text-white transition-colors line-clamp-2">
                    {fields.summary}
                </p>

                {fields.labels.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                        {fields.labels.slice(0, 3).map(l => (
                            <Badge 
                                key={l} 
                                variant="outline" 
                                className="px-1.5 py-0 h-4 text-[9px] rounded-sm bg-slate-800/50 border-slate-700 text-slate-400 font-mono leading-none"
                            >
                                {l}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>

            {/* Assignee Avatar */}
            {fields.assignee && (
                <div className="shrink-0">
                    <Tooltip>
                        <TooltipTrigger render={
                            <img
                                src={fields.assignee.avatarUrls['24x24']}
                                alt={fields.assignee.displayName}
                                className="w-6 h-6 rounded-full border border-slate-700 group-hover:border-slate-500 transition-all"
                            />
                        } />
                        <TooltipContent>Asignado a: {fields.assignee.displayName}</TooltipContent>
                    </Tooltip>
                </div>
            )}
        </Card>
    );
}
