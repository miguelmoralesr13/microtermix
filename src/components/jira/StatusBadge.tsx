
import { JiraIssue, statusColor } from '../jiraApi';

export function StatusBadge({ status }: { status: JiraIssue['fields']['status'] }) {
    const color = statusColor(status.statusCategory.colorName);
    return (
        <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
        >
            {status.name}
        </span>
    );
}
