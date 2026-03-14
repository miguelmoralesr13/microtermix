import React, { useEffect, useState } from 'react';
import { X, RefreshCw, AlertCircle } from 'lucide-react';
import { JiraIssue, getLinkedDefects } from '../jiraApi';
import { HierarchyCard } from './HierarchyCard';
import { useEscape } from '../../hooks/useEscape';

export function LinkedIssuesModal({ parentKey, onClose, onDetail }: {
    parentKey: string;
    onClose: () => void;
    onDetail: (issue: JiraIssue) => void;
}) {
    const [issues, setIssues] = useState<JiraIssue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEscape(onClose);

    useEffect(() => {
        setLoading(true);
        getLinkedDefects(parentKey)
            .then(setIssues)
            .catch(e => setError(e?.message ?? 'Error cargando defectos asociados'))
            .finally(() => setLoading(false));
    }, [parentKey]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[85vh] shadow-2xl flex flex-col" onClick={(e: React.MouseEvent) => e.stopPropagation()}>                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                    <h3 className="text-sm font-bold text-slate-200">
                        Defectos Asociados a <span className="font-mono text-microtermix-neon">{parentKey}</span>
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white shrink-0"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 relative">
                    {error && (
                        <div className="flex items-start gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span className="text-xs">{error}</span>
                        </div>
                    )}
                    {loading ? (
                        <div className="flex justify-center py-8 text-slate-500">
                            <RefreshCw size={18} className="animate-spin" />
                        </div>
                    ) : issues.length === 0 && !error ? (
                        <p className="text-xs text-slate-500 text-center py-8 italic border border-dashed border-slate-700 rounded-lg">
                            Ningún defecto o bug asociado
                        </p>
                    ) : (
                        issues.map(issue => (
                            <HierarchyCard
                                key={issue.id}
                                issue={issue}
                                selected={false}
                                pinned={false}
                                onSelect={() => onDetail(issue)}
                                showPin={false}
                                onPin={() => { }}
                                onDetail={() => onDetail(issue)}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
