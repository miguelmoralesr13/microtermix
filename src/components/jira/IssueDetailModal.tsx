import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, X, Layers } from 'lucide-react';
import { JiraIssue, loadConfig, JiraIssueDetail, getIssueDetail } from './jiraApi';
import { StatusBadge } from './StatusBadge';
import { AdfBody } from './AdfRenderer';
import { AuthenticatedMedia, AttachmentViewer } from './AuthenticatedMedia';
import { CommentForm } from './CommentForm';
import { useEscape } from '../../hooks/useEscape';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

export function IssueDetailModal({ issue, onClose }: { issue: JiraIssue; onClose: () => void }) {
    const cfg = loadConfig();
    const { fields: initialFields } = issue;

    const [detail, setDetail] = useState<JiraIssueDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewingAttachment, setViewingAttachment] = useState<any | null>(null);
    const [reloadTick, setReloadTick] = useState(0);

    const handleClose = useCallback(() => {
        if (!viewingAttachment) onClose();
    }, [viewingAttachment, onClose]);
    useEscape(handleClose);

    useEffect(() => {
        setLoading(true);
        getIssueDetail(issue.key)
            .then(setDetail)
            .catch(e => setError(e?.message ?? 'Error cargando detalles'))
            .finally(() => setLoading(false));
    }, [issue.key, reloadTick]);

    const fields = detail?.fields ?? initialFields;
    const descText = !fields.description ? null
        : typeof fields.description === 'string' ? fields.description
            : fields.description?.content?.[0]?.content?.[0]?.text ?? null;

    const closeAttachment = useCallback(() => setViewingAttachment(null), []);

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) handleClose(); }}>
            <DialogContent className="sm:max-w-[70vw] max-h-[90vh] p-0 flex flex-col overflow-hidden bg-slate-900 border-slate-700 shadow-2xl" showCloseButton={false}>
                {/* Header */}
                <DialogHeader className="p-5 sm:p-6 border-b border-slate-800 shrink-0 bg-slate-900/50 flex-row items-start gap-4 space-y-0">
                    {fields.issuetype?.iconUrl && <img src={fields.issuetype.iconUrl} alt="" className="w-6 h-6 mt-1 shrink-0" />}
                    <div className="flex-1 min-w-0 flex flex-col items-start gap-1">
                        <div className="flex items-center gap-2 flex-wrap text-left">
                            <a href={`${cfg.baseUrl}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-mono text-microtermix-neon hover:underline flex items-center gap-1">
                                {issue.key} <ExternalLink size={11} />
                            </a>
                            <StatusBadge status={fields.status} />
                            {loading && <RefreshCw size={12} className="animate-spin text-slate-500 ml-2" />}
                        </div>
                        <DialogTitle className="text-lg sm:text-xl font-bold text-slate-100 leading-snug">{fields.summary}</DialogTitle>
                        <DialogDescription className="hidden">Detalles del issue {issue.key}</DialogDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-500 hover:text-white shrink-0">
                        <X size={20} />
                    </Button>
                </DialogHeader>

                {/* Body */}
                <div className="flex-1 overflow-y-auto w-full flex flex-col md:flex-row">
                    {/* Left Column (Main content) */}
                    <div className="flex-1 p-5 sm:p-6 space-y-8 md:border-r border-slate-800 shrink-0 md:w-2/3">
                        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">{error}</div>}

                        <section>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Descripción</h3>
                            {descText ? (
                                <div className="text-sm text-slate-300 bg-slate-800/30 border border-slate-800/50 rounded-xl p-4 whitespace-pre-wrap leading-relaxed shadow-inner">
                                    {descText}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-600 italic px-2">Sin descripción proporcionada.</p>
                            )}
                        </section>

                        {detail?.attachments && detail.attachments.length > 0 && (
                            <section>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    Adjuntos <Badge variant="secondary" className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 h-auto leading-none border-none">{detail.attachments.length}</Badge>
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {detail.attachments.map(att => {
                                        const isMedia = att.mimeType.startsWith('image/') || att.mimeType.startsWith('video/');
                                        return (
                                            <div key={att.id} onClick={() => isMedia && setViewingAttachment(att)}
                                                className={`group relative border border-slate-800 rounded-lg overflow-hidden bg-slate-950 flex flex-col ${isMedia ? 'cursor-pointer hover:border-microtermix-neon/50' : ''}`}>
                                                <div className="h-24 bg-slate-900 border-b border-slate-800 flex flex-col items-center justify-center p-2">
                                                    {att.thumbnail ? (
                                                        <AuthenticatedMedia url={att.thumbnail} mimeType="image/png" autoLoad={true} className="max-w-full max-h-full object-contain" />
                                                    ) : isMedia ? (
                                                        <span className="text-xs text-slate-500 uppercase font-bold tracking-widest px-2 text-center break-all">{att.mimeType.split('/')[1]}</span>
                                                    ) : (
                                                        <Layers size={20} className="text-slate-600 mb-2" />
                                                    )}
                                                </div>
                                                <div className="p-2 min-w-0">
                                                    <p className="text-[10px] text-slate-300 truncate font-mono" title={att.filename}>{att.filename}</p>
                                                    <p className="text-[9px] text-slate-500 mt-0.5">{Math.round(att.size / 1024)} KB</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {detail?.comments && detail.comments.length > 0 && (
                            <section>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    Comentarios <Badge variant="secondary" className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 h-auto leading-none border-none">{detail.comments.length}</Badge>
                                </h3>
                                <div className="space-y-4">
                                    {detail.comments.map(comment => (
                                        <div key={comment.id} className="flex gap-3">
                                            <img src={comment.author.avatarUrls['32x32']} alt="" className="w-8 h-8 rounded-full shrink-0 border border-slate-700" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                                                    <span className="text-xs font-bold text-slate-200">{comment.author.displayName}</span>
                                                    <span className="text-[10px] text-slate-500">{new Date(comment.created).toLocaleString()}</span>
                                                </div>
                                                <div className="text-sm text-slate-300 bg-slate-900 rounded-b-xl rounded-tr-xl p-3 border border-slate-800 leading-relaxed shadow-sm">
                                                    <AdfBody body={comment.body} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {!loading && !detail?.comments?.length && !error && (
                            <section>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Comentarios</h3>
                                <p className="text-sm text-slate-600 italic px-2">Sin comentarios en este issue.</p>
                            </section>
                        )}

                        <CommentForm issueKey={issue.key} onSuccess={() => setReloadTick(t => t + 1)} />
                    </div>

                    {/* Right Column (Metadata) */}
                    <div className="w-full md:w-1/3 bg-slate-900/30 p-5 sm:p-6 space-y-6 shrink-0">
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Asignado a</p>
                            <div className="flex items-center gap-2.5">
                                {fields.assignee ? (
                                    <>
                                        <img src={fields.assignee.avatarUrls['24x24']} alt="" className="w-6 h-6 rounded-full" />
                                        <span className="text-sm text-slate-200 font-medium">{fields.assignee.displayName}</span>
                                    </>
                                ) : (
                                    <span className="text-sm text-slate-500 italic">Sin asignar</span>
                                )}
                            </div>
                        </div>

                        {fields.priority && (
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Prioridad</p>
                                <div className="flex items-center gap-1.5 text-sm text-slate-300">
                                    {fields.priority.iconUrl && <img src={fields.priority.iconUrl} alt="" className="w-4 h-4" />}
                                    <span>{fields.priority.name}</span>
                                </div>
                            </div>
                        )}

                        {fields.labels?.length > 0 && (
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2">Labels</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {fields.labels.map((l: string) => (
                                        <Badge key={l} variant="outline" className="px-2 py-0.5 text-xs rounded border border-slate-700 bg-slate-800 text-slate-300 font-mono leading-none h-auto">{l}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t border-slate-800 space-y-1">
                            <p className="text-[10px] text-slate-500">
                                <span className="inline-block w-20 font-medium">Creado:</span>
                                <span className="text-slate-400">{new Date(fields.created).toLocaleString()}</span>
                            </p>
                            <p className="text-[10px] text-slate-500">
                                <span className="inline-block w-20 font-medium">Actualizado:</span>
                                <span className="text-slate-400">{new Date(fields.updated).toLocaleString()}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </DialogContent>

            {detail && viewingAttachment && (
                <AttachmentViewer
                    attachments={detail.attachments.filter(a => a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/'))}
                    initialIndex={detail.attachments.filter(a => a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/')).findIndex(a => a.id === viewingAttachment.id)}
                    onClose={closeAttachment}
                />
            )}
        </Dialog>
    );
}
