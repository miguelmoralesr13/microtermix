import { X, ExternalLink } from 'lucide-react';
import { JiraIssue, loadConfig, statusColor } from './jiraApi';
import { useEscape } from '../../hooks/useEscape';

export function EpicDetailModal({ epic, onClose }: { epic: JiraIssue; onClose: () => void }) {
    const cfg = loadConfig();
    const { fields } = epic;
    useEscape(onClose);
    const descText = !fields.description ? null
        : typeof fields.description === 'string' ? fields.description
            : fields.description?.content?.[0]?.content?.[0]?.text ?? null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl w-full sm:max-w-[70vw] max-h-[75vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 p-4 border-b border-slate-800">
                    {fields.issuetype?.iconUrl && <img src={fields.issuetype.iconUrl} alt="" className="w-5 h-5 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                        <a href={`${cfg.baseUrl}/browse/${epic.key}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-microtermix-neon hover:underline flex items-center gap-1">
                            {epic.key} <ExternalLink size={10} />
                        </a>
                        <h2 className="text-sm font-bold text-white mt-0.5 leading-snug">{fields.summary}</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-700 shrink-0">
                        <X size={16} />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-3 text-xs">
                        <div className="flex items-center gap-1.5">
                            <span className="text-slate-500">Status:</span>
                            <span className="px-1.5 py-px rounded-full font-bold uppercase text-[10px]"
                                style={{
                                    background: statusColor(fields.status.statusCategory.colorName) + '22',
                                    color: statusColor(fields.status.statusCategory.colorName),
                                    border: `1px solid ${statusColor(fields.status.statusCategory.colorName)}44`,
                                }}
                            >{fields.status.name}</span>
                        </div>
                        {fields.assignee && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Assignee:</span>
                                <img src={fields.assignee.avatarUrls['16x16']} alt="" className="w-4 h-4 rounded-full" />
                                <span className="text-slate-300">{fields.assignee.displayName}</span>
                            </div>
                        )}
                        {fields.priority && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-500">Priority:</span>
                                {fields.priority.iconUrl && <img src={fields.priority.iconUrl} alt="" className="w-3.5 h-3.5" />}
                                <span className="text-slate-300">{fields.priority.name}</span>
                            </div>
                        )}
                    </div>
                    {descText ? (
                        <div className="text-sm text-slate-300 bg-slate-800/40 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">{descText}</div>
                    ) : (
                        <p className="text-xs text-slate-600 italic">Sin descripción.</p>
                    )}
                    {fields.labels?.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                            {fields.labels.map((l: string) => (
                                <span key={l} className="px-2 py-0.5 text-[10px] rounded bg-slate-700 text-slate-300 font-mono">{l}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
