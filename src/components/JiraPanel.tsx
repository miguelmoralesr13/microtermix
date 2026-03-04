import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Settings, Plus, RefreshCw, Search, X, CheckCircle,
    AlertCircle, Layers, ExternalLink, Star, ChevronRight, ChevronLeft, ChevronDown, Pin, UserCheck, Timer, Paperclip, Send
} from 'lucide-react';
import {
    JiraConfig, JiraIssue, JiraApiLogEntry, JiraTransition, jiraApiLog,
    loadConfig, saveConfig, testConnection,
    statusColor,
    getProjects, getIssueTypes, getUsers, createIssue,
    getEpics, getStoriesByEpic, getTasksByStory, createSubTask, transitionIssue,
    getTransitions, assignIssue, getBoardIssues, getIssueDetail, JiraIssueDetail, BoardFilter, getJiraMediaUrl,
    getActivityOptions, getProjectStatuses, addComment, uploadAttachment,
} from './jiraApi';
import { TempoLogModal } from './TempoLogModal';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'board' | 'stories' | 'create' | 'settings';
// type BoardFilter = 'mine' | 'project' | 'search'; (moved to jiraApi.ts with a richer signature)

// ── Escape key hook ─────────────────────────────────────────────────────────

function useEscape(onEscape: () => void) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onEscape(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onEscape]);
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JiraIssue['fields']['status'] }) {
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

// ── Issue Card ────────────────────────────────────────────────────────────────

function IssueCard({ issue, onClick }: { issue: JiraIssue; onClick: () => void }) {
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
                            <span key={l} className="px-1.5 py-px text-[9px] rounded bg-slate-700 text-slate-400 font-mono">{l}</span>
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

// ── ADF (Atlassian Document Format) renderer ──────────────────────────────────

function AdfMediaFile({ id }: { id: string }) {
    const cfg = loadConfig();
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        getJiraMediaUrl(`${cfg.baseUrl}/rest/api/3/attachment/content/${id}`)
            .then(setSrc).catch(() => {});
    }, [id, cfg.baseUrl]);
    if (!src) return null;
    return <img src={src} alt="" className="max-w-full rounded my-2 border border-slate-800" />;
}

function AdfInline({ node }: { node: any }): React.ReactElement | null {
    if (node.type === 'hardBreak') return <br />;
    if (node.type === 'mention') return <span className="text-nexus-accent font-medium">@{node.attrs?.text ?? node.attrs?.id}</span>;
    if (node.type === 'emoji') return <span>{node.attrs?.text ?? '😊'}</span>;
    if (node.type === 'inlineCard') return <a href={node.attrs?.url} target="_blank" rel="noopener noreferrer" className="text-nexus-neon underline text-xs break-all">{node.attrs?.url}</a>;
    if (node.type === 'text') {
        const marks: any[] = node.marks ?? [];
        let el: React.ReactNode = node.text;
        if (marks.some(m => m.type === 'strong')) el = <strong>{el}</strong>;
        if (marks.some(m => m.type === 'em')) el = <em>{el}</em>;
        if (marks.some(m => m.type === 'code')) el = <code className="bg-slate-800 px-1 rounded text-[11px] font-mono">{el}</code>;
        if (marks.some(m => m.type === 'strike')) el = <s>{el}</s>;
        const link = marks.find(m => m.type === 'link');
        if (link) el = <a href={link.attrs?.href} target="_blank" rel="noopener noreferrer" className="text-nexus-neon underline">{el}</a>;
        return <>{el}</>;
    }
    return <>{node.text ?? null}</>;
}

function AdfNode({ node }: { node: any }): React.ReactElement | null {
    const children = (nodes: any[]) => nodes?.map((n, i) => <AdfNode key={i} node={n} />) ?? null;
    const inlines = (nodes: any[]) => nodes?.map((n, i) => <AdfInline key={i} node={n} />) ?? null;

    switch (node.type) {
        case 'paragraph':
            return <p className="mb-2 last:mb-0 leading-relaxed">{inlines(node.content ?? [])}</p>;
        case 'hardBreak':
            return <br />;
        case 'heading':
            return <p className="font-bold mb-1 text-slate-200">{inlines(node.content ?? [])}</p>;
        case 'bulletList':
            return <ul className="list-disc pl-4 mb-2 space-y-0.5">{children(node.content)}</ul>;
        case 'orderedList':
            return <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children(node.content)}</ol>;
        case 'listItem':
            return <li className="text-sm text-slate-300">{children(node.content)}</li>;
        case 'blockquote':
            return <blockquote className="border-l-2 border-slate-600 pl-3 italic text-slate-400 my-2">{children(node.content)}</blockquote>;
        case 'codeBlock':
            return <pre className="bg-slate-950 border border-slate-700 rounded p-3 text-xs text-slate-300 overflow-x-auto my-2 font-mono">{(node.content ?? []).map((n: any) => n.text ?? '').join('')}</pre>;
        case 'rule':
            return <hr className="border-slate-700 my-3" />;
        case 'mediaSingle':
        case 'mediaInline': {
            const media = node.content?.[0];
            if (!media) return null;
            if (media.attrs?.type === 'external') return <img src={media.attrs.url} alt="" className="max-w-full rounded my-2 border border-slate-800" />;
            if (media.attrs?.type === 'file' && media.attrs.id) return <AdfMediaFile id={media.attrs.id} />;
            return null;
        }
        default:
            if (node.content) return <>{children(node.content)}</>;
            if (node.text) return <AdfInline node={node} />;
            return null;
    }
}

function AdfBody({ body }: { body: any }) {
    if (!body) return null;
    if (typeof body === 'string') return <span className="whitespace-pre-wrap text-sm text-slate-300">{body}</span>;
    if (!body.content?.length) return null;
    return <>{body.content.map((n: any, i: number) => <AdfNode key={i} node={n} />)}</>;
}

// ── Issue Detail Modal (Rich) ──────────────────────────────────────────────────

function AuthenticatedMedia({ url, mimeType, className }: { url: string; mimeType: string; className?: string }) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        getJiraMediaUrl(url).then(blob => {
            if (active) setBlobUrl(blob);
        }).catch(() => {
            if (active) setError(true);
        });
        return () => {
            active = false;
        };
    }, [url]);

    if (error) return <div className="text-red-400 p-4 text-sm text-center">Error al cargar el medio.</div>;
    if (!blobUrl) return <div className="p-8 text-slate-500 flex justify-center"><RefreshCw size={24} className="animate-spin" /></div>;

    if (mimeType.startsWith('image/')) {
        return <img src={blobUrl} alt="Adjunto" className={className} />;
    }
    if (mimeType.startsWith('video/')) {
        return <video src={blobUrl} controls autoPlay className={className} />;
    }
    return null;
}

function AttachmentViewer({ attachments, initialIndex, onClose }: { attachments: any[]; initialIndex: number; onClose: () => void }) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
    useEscape(onClose);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') setCurrentIndex(i => (i + 1) % attachments.length);
            if (e.key === 'ArrowLeft') setCurrentIndex(i => (i - 1 + attachments.length) % attachments.length);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [attachments.length]);

    const attachment = attachments[currentIndex];
    if (!attachment) return null;

    const isImage = attachment.mimeType.startsWith('image/');
    const isVideo = attachment.mimeType.startsWith('video/');

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={e => { e.stopPropagation(); onClose(); }}>
            <button onClick={e => { e.stopPropagation(); onClose(); }} className="absolute top-4 right-4 text-white/70 hover:text-white p-2 bg-black/50 rounded-full z-10 transition-colors">
                <X size={24} />
            </button>

            {attachments.length > 1 && (
                <>
                    <button onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => (i - 1 + attachments.length) % attachments.length); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-3 bg-black/50 hover:bg-black/80 rounded-full transition-all z-10">
                        <ChevronLeft size={32} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => (i + 1) % attachments.length); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-3 bg-black/50 hover:bg-black/80 rounded-full transition-all z-10">
                        <ChevronRight size={32} />
                    </button>
                </>
            )}

            <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                {isImage || isVideo ? (
                    <AuthenticatedMedia key={attachment.id} url={attachment.content} mimeType={attachment.mimeType} className="max-w-full max-h-[90vh] object-contain rounded" />
                ) : (
                    <div className="bg-slate-800 p-8 rounded-xl text-center">
                        <p className="text-slate-300 font-medium mb-4">{attachment.filename}</p>
                        <a href={attachment.content} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-nexus-accent hover:bg-opacity-80 rounded text-white font-bold text-sm transition-colors decoration-none">
                            Descargar Archivo
                        </a>
                    </div>
                )}
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 px-4 py-2 rounded-full text-white/80 text-xs font-mono flex items-center gap-3 z-10">
                <span>{attachment.filename}</span>
                {attachments.length > 1 && <span className="text-white/40 font-bold">{currentIndex + 1} / {attachments.length}</span>}
            </div>
        </div>
    );
}

// ── Comment Form ─────────────────────────────────────────────────────────────

function CommentForm({ issueKey, onSuccess }: { issueKey: string; onSuccess: () => void }) {
    const [text, setText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async () => {
        if (!text.trim() && files.length === 0) return;
        setSubmitting(true);
        setError(null);
        try {
            if (text.trim()) await addComment(issueKey, text.trim());
            if (files.length > 0) await uploadAttachment(issueKey, files);
            setText('');
            setFiles([]);
            onSuccess();
        } catch (e: any) {
            setError(e?.message ?? 'Error al enviar');
        } finally {
            setSubmitting(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
        e.target.value = '';
    };

    const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

    return (
        <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Agregar Comentario</h3>
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden">
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Escribe un comentario…"
                    rows={3}
                    className="w-full bg-transparent px-4 py-3 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none"
                />
                {files.length > 0 && (
                    <div className="px-4 pb-2 flex flex-wrap gap-2">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5 bg-slate-700 rounded-full px-2.5 py-1 text-[11px] text-slate-300 max-w-[180px]">
                                <Paperclip size={10} className="shrink-0 text-slate-400" />
                                <span className="truncate">{f.name}</span>
                                <button onClick={() => removeFile(i)} className="text-slate-500 hover:text-red-400 shrink-0 ml-0.5"><X size={10} /></button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/60">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        title="Adjuntar archivo"
                        className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
                    >
                        <Paperclip size={15} />
                    </button>
                    <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || (!text.trim() && files.length === 0)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-nexus-accent/20 hover:bg-nexus-accent/30 disabled:opacity-40 disabled:cursor-not-allowed text-nexus-accent text-xs font-bold rounded-lg border border-nexus-accent/30 transition-colors"
                    >
                        {submitting ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                        {submitting ? 'Enviando…' : 'Comentar'}
                    </button>
                </div>
            </div>
            {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
        </section>
    );
}

// ── Issue Detail Modal ────────────────────────────────────────────────────────

function IssueDetailModal({ issue, onClose }: { issue: JiraIssue; onClose: () => void }) {
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-full overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start gap-4 p-5 sm:p-6 border-b border-slate-800 shrink-0 bg-slate-900/50">
                    {fields.issuetype?.iconUrl && <img src={fields.issuetype.iconUrl} alt="" className="w-6 h-6 mt-1 shrink-0" />}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <a href={`${cfg.baseUrl}/browse/${issue.key}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-mono text-nexus-neon hover:underline flex items-center gap-1">
                                {issue.key} <ExternalLink size={11} />
                            </a>
                            <StatusBadge status={fields.status} />
                            {loading && <RefreshCw size={12} className="animate-spin text-slate-500 ml-2" />}
                        </div>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-100 leading-snug">{fields.summary}</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors shrink-0">
                        <X size={20} />
                    </button>
                </div>

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
                                    Adjuntos <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">{detail.attachments.length}</span>
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {detail.attachments.map(att => {
                                        const isMedia = att.mimeType.startsWith('image/') || att.mimeType.startsWith('video/');
                                        return (
                                            <div key={att.id} onClick={() => isMedia && setViewingAttachment(att)}
                                                className={`group relative border border-slate-800 rounded-lg overflow-hidden bg-slate-950 flex flex-col ${isMedia ? 'cursor-pointer hover:border-nexus-neon/50' : ''}`}>
                                                <div className="h-24 bg-slate-900 border-b border-slate-800 flex flex-col items-center justify-center p-2">
                                                    {att.thumbnail ? (
                                                        <AuthenticatedMedia url={att.thumbnail} mimeType="image/png" className="max-w-full max-h-full object-contain" />
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
                                    Comentarios <span className="bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">{detail.comments.length}</span>
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
                                        <span key={l} className="px-2 py-0.5 text-xs rounded border border-slate-700 bg-slate-800 text-slate-300 font-mono">{l}</span>
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
            </div>

            {detail && viewingAttachment && (
                <AttachmentViewer
                    attachments={detail.attachments.filter(a => a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/'))}
                    initialIndex={detail.attachments.filter(a => a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/')).findIndex(a => a.id === viewingAttachment.id)}
                    onClose={() => setViewingAttachment(null)}
                />
            )}
        </div>
    );
}

// ── Stories View (3-Column Hierarchy) ────────────────────────────────────────

const PINNED_EPICS_KEY = 'nexus-jira-pinned-epics';
const PINNED_STORIES_KEY = 'nexus-jira-pinned-stories';
const PERSIST_EPICS_KEY = 'nexus-jira-epics';
const PERSIST_STORIES_KEY = 'nexus-jira-stories';
const PERSIST_TASKS_KEY = 'nexus-jira-tasks';
const PERSIST_SEL_EPIC_KEY = 'nexus-jira-sel-epic';
const PERSIST_SEL_STORY_KEY = 'nexus-jira-sel-story';

function loadPinned(key: string): string[] {
    try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}
function savePinned(key: string, keys: string[]) {
    localStorage.setItem(key, JSON.stringify(keys));
}
function loadLS<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch { return fallback; }
}
function saveLS(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}

function isReleased(issue: JiraIssue): boolean {
    const cfg = loadConfig();
    const statuses = (cfg.releasedStatuses ?? ['Released', 'Discarded']).map(s => s.toLowerCase().trim());
    return statuses.includes(issue.fields.status.name.toLowerCase());
}

function HierarchyCard({
    issue, selected, pinned, onSelect, onPin, onDetail, onAssign, showPin = true
}: {
    issue: JiraIssue; selected: boolean; pinned: boolean;
    onSelect: () => void; onPin: () => void;
    onDetail?: () => void;
    onAssign?: () => void;
    showPin?: boolean;
}) {
    const released = isReleased(issue);
    return (
        <div
            onClick={onSelect}
            className={`group flex items-start gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${selected
                ? 'bg-nexus-neon/10 border-nexus-neon/50 shadow-[0_0_8px_rgba(0,255,170,0.1)]'
                : released
                    ? 'bg-slate-900/40 border-slate-800/50 opacity-60 hover:opacity-80'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 hover:border-slate-600'
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
                    <span className="font-mono text-[10px] text-nexus-neon/60">{issue.key}</span>
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
                            className="p-0.5 rounded hover:bg-nexus-neon/10 text-slate-500 hover:text-nexus-neon shrink-0 transition-colors"
                            title="Asignarme esta tarea"
                        >
                            <UserCheck size={11} />
                        </button>
                    )}
                    {onDetail && (
                        <button
                            onClick={e => { e.stopPropagation(); onDetail(); }}
                            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[9px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 font-mono shrink-0"
                        >
                            info
                        </button>
                    )}
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
            {selected && <ChevronRight size={12} className="text-nexus-neon shrink-0 mt-1" />}
        </div>
    );
}

// ── Epic Detail Modal ─────────────────────────────────────────────────────────

function EpicDetailModal({ epic, onClose }: { epic: JiraIssue; onClose: () => void }) {
    const cfg = loadConfig();
    const { fields } = epic;
    useEscape(onClose);
    const descText = !fields.description ? null
        : typeof fields.description === 'string' ? fields.description
            : fields.description?.content?.[0]?.content?.[0]?.text ?? null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl max-h-[75vh] overflow-y-auto shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 p-4 border-b border-slate-800">
                    {fields.issuetype?.iconUrl && <img src={fields.issuetype.iconUrl} alt="" className="w-5 h-5 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                        <a href={`${cfg.baseUrl}/browse/${epic.key}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-nexus-neon hover:underline flex items-center gap-1">
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

// ── Generic Transition Fields Modal ──────────────────────────────────────────

interface TransitionTarget { task: JiraIssue; transition: JiraTransition; }

function TransitionFieldsModal({ target, onConfirm, onClose }: {
    target: TransitionTarget;
    onConfirm: (comment: string, fields: Record<string, any>) => void;
    onClose: () => void;
}) {
    loadConfig();
    const isDiscard = /discard/i.test(target.transition.toName) || /discard/i.test(target.transition.name);
    const reqFields = Object.entries(target.transition.fields ?? {}).filter(([, f]) => f.required);
    const hasCommentField = reqFields.some(([k]) => k === 'comment');
    const needsComment = isDiscard || hasCommentField;
    const otherFields = reqFields.filter(([k]) => k !== 'comment');

    const [comment, setComment] = useState('');
    const [values, setValues] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const firstRef = useRef<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement | null>(null);
    useEscape(onClose);
    useEffect(() => { (firstRef.current as HTMLElement | null)?.focus(); }, []);

    const allFilled =
        (!needsComment || comment.trim().length > 0) &&
        otherFields.every(([k]) => (values[k] ?? '').trim().length > 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!allFilled || submitting) return;
        setSubmitting(true);
        const fieldPayload: Record<string, any> = {};
        otherFields.forEach(([key, field]) => {
            const v = (values[key] ?? '').trim();
            if (!v) return;
            if (field.allowedValues?.length) {
                const av = field.allowedValues.find(a => a.name === v || a.id === v);
                fieldPayload[key] = av ? { id: av.id, name: av.name } : { name: v };
            } else {
                fieldPayload[key] = v;
            }
        });
        onConfirm(comment.trim(), fieldPayload);
    };

    const borderColor = isDiscard ? 'border-red-500/30' : 'border-slate-700';
    const accentColor = isDiscard ? 'text-red-400' : 'text-nexus-neon';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className={`bg-slate-900 border ${borderColor} rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col`} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                    <h3 className={`text-sm font-bold ${accentColor} flex items-center gap-2`}>
                        <AlertCircle size={14} />
                        {target.transition.name}
                        <span className="text-[10px] font-normal text-slate-400">→ {target.transition.toName}</span>
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto">
                    <p className="text-xs text-slate-300 font-semibold">{target.task.key} · {target.task.fields.summary}</p>

                    {/* Comment / Motivo */}
                    {needsComment && (
                        <div>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                                {isDiscard ? 'Motivo del descarte' : 'Comentario'} <span className="text-red-400">*</span>
                            </label>
                            <textarea
                                ref={firstRef as React.RefObject<HTMLTextAreaElement>}
                                value={comment}
                                onChange={e => setComment(e.target.value)}
                                placeholder={isDiscard ? 'Explica por qué se descarta...' : 'Escribe un comentario...'}
                                rows={3}
                                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 resize-none focus:border-slate-400 focus:outline-none"
                            />
                        </div>
                    )}

                    {/* Other required fields */}
                    {otherFields.map(([key, field], i) => (
                        <div key={key}>
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
                                {field.name} <span className="text-red-400">*</span>
                            </label>
                            {field.allowedValues?.length ? (
                                <select
                                    ref={i === 0 && !needsComment ? firstRef as React.RefObject<HTMLSelectElement> : undefined}
                                    value={values[key] ?? ''}
                                    onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-slate-400 focus:outline-none"
                                >
                                    <option value="">Seleccionar...</option>
                                    {field.allowedValues.map(av => (
                                        <option key={av.id} value={av.name}>{av.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    ref={i === 0 && !needsComment ? firstRef as React.RefObject<HTMLInputElement> : undefined}
                                    type="text"
                                    value={values[key] ?? ''}
                                    onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-slate-400 focus:outline-none"
                                />
                            )}
                        </div>
                    ))}

                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose}
                            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" disabled={!allFilled || submitting}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${isDiscard ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30' : 'bg-nexus-neon/10 border-nexus-neon/30 text-nexus-neon hover:bg-nexus-neon/20'}`}>
                            {submitting ? <RefreshCw size={11} className="animate-spin mx-auto" /> : 'Confirmar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Task Detail Modal ─────────────────────────────────────────────────────────

function TaskDetailModal({ task, onClose, onTransition, onAssign }: {
    task: JiraIssue;
    onClose: () => void;
    onTransition: (tr: JiraTransition) => void;
    onAssign: (() => void) | undefined;
}) {
    const cfg = loadConfig();
    const { fields } = task;
    useEscape(onClose);

    // Load transitions internally — works for any issue type
    const [transitions, setTransitions] = useState<JiraTransition[]>([]);
    const [loadingTr, setLoadingTr] = useState(true);
    const [transitioningTask, setTransitioningTask] = useState<string | null>(null);

    useEffect(() => {
        setLoadingTr(true);
        getTransitions(task.key)
            .then(setTransitions)
            .catch(() => setTransitions([]))
            .finally(() => setLoadingTr(false));
    }, [task.key]);

    const descText = !fields.description ? null
        : typeof fields.description === 'string' ? fields.description
            : fields.description?.content?.[0]?.content?.[0]?.text ?? null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[85vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start gap-3 p-4 border-b border-slate-800 shrink-0">
                    {fields.issuetype?.iconUrl && <img src={fields.issuetype.iconUrl} alt="" className="w-5 h-5 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                        <a href={`${cfg.baseUrl}/browse/${task.key}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-nexus-neon hover:underline flex items-center gap-1">
                            {task.key} <ExternalLink size={10} />
                        </a>
                        <p className="text-sm font-semibold text-slate-100 mt-0.5 leading-snug">{fields.summary}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white shrink-0"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Status + type */}
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="px-2 py-0.5 text-[9px] rounded-full font-bold uppercase"
                            style={{
                                background: statusColor(fields.status.statusCategory.colorName) + '22',
                                color: statusColor(fields.status.statusCategory.colorName),
                                border: `1px solid ${statusColor(fields.status.statusCategory.colorName)}44`,
                            }}>{fields.status.name}</span>
                        {fields.issuetype?.name && (
                            <span className="text-[10px] text-slate-500">{fields.issuetype.name}</span>
                        )}
                        {fields.priority?.name && (
                            <span className="text-[10px] text-slate-500">{fields.priority.name}</span>
                        )}
                    </div>

                    {/* Assignee */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {fields.assignee ? (
                                <>
                                    <img src={fields.assignee.avatarUrls['24x24']} alt="" className="w-5 h-5 rounded-full" />
                                    <span className="text-xs text-slate-300">{fields.assignee.displayName}</span>
                                </>
                            ) : (
                                <span className="text-xs text-slate-500 italic">Sin asignar</span>
                            )}
                        </div>
                        {onAssign && (
                            <button onClick={onAssign}
                                className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold rounded-lg bg-nexus-neon/10 border border-nexus-neon/30 text-nexus-neon hover:bg-nexus-neon/20 transition-colors">
                                <UserCheck size={11} /> Asignarme
                            </button>
                        )}
                    </div>

                    {/* Description */}
                    {descText && (
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Descripción</p>
                            <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{descText}</p>
                        </div>
                    )}

                    {/* Transitions */}
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2 flex items-center gap-1.5">
                            Transiciones
                            {loadingTr && <RefreshCw size={9} className="animate-spin text-slate-600" />}
                        </p>
                        {!loadingTr && transitions.length === 0 && (
                            <p className="text-[10px] text-slate-600 italic">Sin transiciones disponibles</p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                            {transitions.map(tr => {
                                const isCurrent = fields.status.name.toLowerCase() === tr.toName.toLowerCase();
                                const color = /discard/i.test(tr.toName) ? '#ef4444' : statusColor(tr.toColor);
                                return (
                                    <button key={tr.id}
                                        onClick={() => { setTransitioningTask(task.key); onTransition(tr); }}
                                        disabled={transitioningTask === task.key || isCurrent}
                                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-40 flex items-center gap-1"
                                        style={{ background: color + '18', borderColor: color + '44', color }}
                                        title={`${tr.name} → ${tr.toName}`}>
                                        {transitioningTask === task.key ? <RefreshCw size={10} className="animate-spin" /> : null}
                                        {tr.toName}
                                        {isCurrent && <span className="text-[9px] opacity-60">(actual)</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CreateSubTaskModal({ parentKey, onCreated, onClose }: {
    parentKey: string; onCreated: (key: string) => void; onClose: () => void;
}) {
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    useEscape(onClose);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const cfg = loadConfig();
            const res = await createSubTask(parentKey, summary.trim(), description);
            // Auto-transition to Working
            try { await transitionIssue(res.key, 'Working'); } catch { }
            // Auto-assign — propagate error so user can see if assignment fails
            if (cfg.defaultAssigneeId) {
                await assignIssue(res.key, cfg.defaultAssigneeId);
            }
            onCreated(res.key);
        } catch (err: any) {
            setError(err?.message ?? 'Error al crear la tarea');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <Plus size={14} className="text-nexus-neon" /> Nueva Sub-tarea en <span className="font-mono text-nexus-neon text-xs">{parentKey}</span>
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">{error}</p>}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Resumen *</label>
                        <input
                            ref={inputRef}
                            value={summary}
                            onChange={e => setSummary(e.target.value)}
                            required
                            placeholder="¿Qué hay que hacer?"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Descripción (opcional)</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={3}
                            placeholder="Detalles adicionales..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon resize-none"
                        />
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={onClose} className="flex-1 py-2 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !summary.trim()}
                            className="flex-1 py-2 text-xs rounded-lg bg-nexus-accent hover:bg-opacity-80 text-white font-bold disabled:opacity-50"
                        >
                            {submitting ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : null}
                            {submitting ? 'Creando...' : 'Crear + Working'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function StoriesView() {
    const cfg = loadConfig();
    const project = cfg.storiesProject || cfg.defaultProject;

    // Current user's accountId — auto-fetched from /myself
    const [myAccountId, setMyAccountId] = useState<string>(() => cfg.defaultAssigneeId ?? '');

    // Auto-fetch and persist accountId from /myself if not yet configured
    useEffect(() => {
        if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) return;
        if (cfg.defaultAssigneeId) { setMyAccountId(cfg.defaultAssigneeId); return; }
        testConnection()
            .then(me => {
                if (me.accountId) {
                    const updated = { ...loadConfig(), defaultAssigneeId: me.accountId };
                    saveConfig(updated);
                    setMyAccountId(me.accountId);
                }
            })
            .catch(() => { }); // silent — don't block the UI
    }, []);

    // ── Persistent issues cache ──
    const [epics, setEpics] = useState<JiraIssue[]>(() => loadLS<JiraIssue[]>(PERSIST_EPICS_KEY, []));
    const [stories, setStories] = useState<JiraIssue[]>(() => loadLS<JiraIssue[]>(PERSIST_STORIES_KEY, []));
    const [tasks, setTasks] = useState<JiraIssue[]>(() => loadLS<JiraIssue[]>(PERSIST_TASKS_KEY, []));

    // ── Persistent selection ──
    const [selectedEpic, setSelectedEpicRaw] = useState<JiraIssue | null>(() => loadLS<JiraIssue | null>(PERSIST_SEL_EPIC_KEY, null));
    const [selectedStory, setSelectedStoryRaw] = useState<JiraIssue | null>(() => loadLS<JiraIssue | null>(PERSIST_SEL_STORY_KEY, null));

    // Cascade setters: changing Epic clears Story+Tasks; changing Story clears Tasks
    const setSelectedEpic = (v: JiraIssue | null) => {
        setSelectedEpicRaw(v);
        saveLS(PERSIST_SEL_EPIC_KEY, v);
        // cascade clear downstream
        setSelectedStoryRaw(null); saveLS(PERSIST_SEL_STORY_KEY, null);
        setSelectedTask(null);
        setStories([]); saveLS(PERSIST_STORIES_KEY, []);
        setTasks([]); saveLS(PERSIST_TASKS_KEY, []);
    };
    const setSelectedStory = (v: JiraIssue | null) => {
        setSelectedStoryRaw(v);
        saveLS(PERSIST_SEL_STORY_KEY, v);
        // cascade clear downstream
        setSelectedTask(null);
        setTasks([]); saveLS(PERSIST_TASKS_KEY, []);
    };

    const [createForStory, setCreateForStory] = useState<JiraIssue | null>(null);
    const [detailEpic, setDetailEpic] = useState<JiraIssue | null>(null);

    const [epicSearchInput, setEpicSearchInput] = useState('');
    const [epicSearch, setEpicSearch] = useState('');
    const [storySearch, setStorySearch] = useState('');
    const [storyFilterAssignee, setStoryFilterAssignee] = useState('');
    const [storyFilterStatus, setStoryFilterStatus] = useState('');
    const [showStoryFilters, setShowStoryFilters] = useState(false);
    const availableStatuses = ['Open', 'In Progress', 'Done', 'Released', 'Discarded', 'Blocked', 'To Do', 'Review'];
    const [pinnedEpics, setPinnedEpics] = useState<string[]>(() => loadPinned(PINNED_EPICS_KEY));
    const [pinnedStories, setPinnedStories] = useState<string[]>(() => loadPinned(PINNED_STORIES_KEY));

    const [loadingEpics, setLoadingEpics] = useState(false);
    const [loadingStories, setLoadingStories] = useState(false);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [epicError, setEpicError] = useState<string | null>(null);
    const [storyError, setStoryError] = useState<string | null>(null);
    const [taskError, setTaskError] = useState<string | null>(null);

    const [selectedTask, setSelectedTask] = useState<JiraIssue | null>(null);
    const [showTempoModal, setShowTempoModal] = useState(false);
    const [taskTransitions, setTaskTransitions] = useState<JiraTransition[]>([]);
    const [loadingTransitions, setLoadingTransitions] = useState(false);
    const [transitioningTask, setTransitioningTask] = useState<string | null>(null);
    const [apiLog, setApiLog] = useState<JiraApiLogEntry[]>([]);
    const [expandedLog, setExpandedLog] = useState<number | null>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [logVisible, setLogVisible] = useState(true);

    // Subscribe to jiraApiLog events
    useEffect(() => {
        const handler = (entry: JiraApiLogEntry) => setApiLog(prev => [entry, ...prev].slice(0, 80));
        jiraApiLog.on(handler);
        return () => jiraApiLog.off(handler);
    }, []);

    const copyCurl = (entry: JiraApiLogEntry) => {
        navigator.clipboard.writeText(entry.curl).then(() => {
            setCopiedId(entry.id);
            setTimeout(() => setCopiedId(null), 1500);
        });
    };

    // Load epics
    const loadEpics = useCallback(async (search?: string) => {
        if (!project) return;
        setLoadingEpics(true);
        setEpicError(null);
        try {
            const data = await getEpics(project, search);
            setEpics(data);
            saveLS(PERSIST_EPICS_KEY, data);
        } catch (e: any) {
            setEpicError(e?.message ?? 'Error cargando Epics');
        } finally {
            setLoadingEpics(false);
        }
    }, [project]);

    useEffect(() => { loadEpics(); }, [loadEpics]);

    // Only reload when epicSearch (committed on Enter) changes
    useEffect(() => { loadEpics(epicSearch || undefined); }, [epicSearch, loadEpics]);

    // Load stories when epic selected
    useEffect(() => {
        if (!selectedEpic) { setStories([]); setSelectedStory(null); setTasks([]); return; }
        setLoadingStories(true);
        setStoryError(null);
        setTasks([]);
        getStoriesByEpic(selectedEpic.key)
            .then(data => { setStories(data); saveLS(PERSIST_STORIES_KEY, data); })
            .catch((e: any) => setStoryError(e?.message ?? 'Error cargando Stories'))
            .finally(() => setLoadingStories(false));
    }, [selectedEpic?.key]);

    // Load tasks when story selected
    useEffect(() => {
        if (!selectedStory) { setTasks([]); return; }
        setLoadingTasks(true);
        setTaskError(null);
        getTasksByStory(selectedStory.key)
            .then(data => { setTasks(data); saveLS(PERSIST_TASKS_KEY, data); })
            .catch((e: any) => setTaskError(e?.message ?? 'Error cargando Tasks'))
            .finally(() => setLoadingTasks(false));
    }, [selectedStory?.key]);

    const togglePin = (key: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, storageKey: string) => {
        const next = list.includes(key) ? list.filter(k => k !== key) : [key, ...list];
        setList(next);
        savePinned(storageKey, next);
    };

    const sortWithPins = (items: JiraIssue[], pinned: string[]) => [
        ...items.filter(i => pinned.includes(i.key)),
        ...items.filter(i => !pinned.includes(i.key)),
    ];

    // Load available transitions when a task is selected
    useEffect(() => {
        if (!selectedTask) { setTaskTransitions([]); return; }
        setLoadingTransitions(true);
        getTransitions(selectedTask.key)
            .then(setTaskTransitions)
            .catch(() => setTaskTransitions([]))
            .finally(() => setLoadingTransitions(false));
    }, [selectedTask?.key]);

    const [transitionError, setTransitionError] = useState<string | null>(null);
    const [transitionTarget, setTransitionTarget] = useState<TransitionTarget | null>(null);
    const [taskDetailTarget, setTaskDetailTarget] = useState<JiraIssue | null>(null);

    // Intercept transition clicks — show modal when required fields exist or it's Discard
    const handleTransitionClick = (task: JiraIssue, tr: JiraTransition) => {
        const hasRequired = Object.values(tr.fields ?? {}).some(f => f.required);
        const isDiscard = /discard/i.test(tr.toName) || /discard/i.test(tr.name);
        if (hasRequired || isDiscard) {
            setTransitionTarget({ task, transition: tr });
        } else {
            handleTransition(task, tr.toName);
        }
    };

    const handleTransition = async (task: JiraIssue, status: string, comment?: string, fields?: Record<string, any>) => {
        setTransitioningTask(task.key);
        setTransitionError(null);
        try {
            await transitionIssue(task.key, status, comment, fields);
            if (selectedStory) {
                const updated = await getTasksByStory(selectedStory.key);
                setTasks(updated);
                saveLS(PERSIST_TASKS_KEY, updated);
                const refreshed = updated.find(t => t.key === task.key);
                if (refreshed) { setSelectedTask(refreshed); setTaskDetailTarget(refreshed); }
            }
        } catch (e: any) {
            setTransitionError(e?.message ?? 'Error al cambiar estado');
        } finally {
            setTransitioningTask(null);
        }
    };

    const colCls = "flex flex-col h-full border-r border-slate-800 last:border-r-0";
    const colHeaderCls = "shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/70";
    const colBodyCls = "flex-1 overflow-y-auto scrollbar-hide p-2 space-y-1.5";

    if (!project) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 p-12">
                <AlertCircle size={36} />
                <p className="text-sm text-center">Configura un proyecto en <strong className="text-slate-300">Settings → Stories Project</strong> para usar esta vista.</p>
            </div>
        );
    }


    const sortedEpics = sortWithPins(epics, pinnedEpics);
    const sortedStories = sortWithPins(
        stories.filter(s => {
            const matchText = !storySearch.trim() || (
                s.key.toLowerCase().includes(storySearch.toLowerCase()) ||
                s.fields.summary.toLowerCase().includes(storySearch.toLowerCase())
            );
            const matchAssignee = !storyFilterAssignee || (
                storyFilterAssignee === 'me'
                    ? s.fields.assignee?.accountId === myAccountId
                    : !s.fields.assignee
            );
            const matchStatus = !storyFilterStatus ||
                s.fields.status.name.toLowerCase() === storyFilterStatus.toLowerCase();
            return matchText && matchAssignee && matchStatus;
        }),
        pinnedStories
    );
    const hasStoryFilters = !!(storySearch || storyFilterAssignee || storyFilterStatus);

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* 3 columns */}
            <div className="flex flex-1 min-h-0">
                {/* Column 1: Epics */}
                <div className={`${colCls} w-1/4`}>
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Business ({epics.length})</p>
                        <div className="relative">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                value={epicSearchInput}
                                onChange={e => setEpicSearchInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') setEpicSearch(epicSearchInput);
                                    if (e.key === 'Escape') { setEpicSearchInput(''); setEpicSearch(''); }
                                }}
                                placeholder="Título o clave... ↵"
                                className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-6 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                            />
                            {epicSearchInput && <button onClick={() => { setEpicSearchInput(''); setEpicSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"><X size={10} /></button>}
                        </div>
                    </div>
                    <div className={colBodyCls}>
                        {epicError && <p className="text-xs text-red-400 p-2">{epicError}</p>}
                        {loadingEpics ? (
                            <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div>
                        ) : sortedEpics.length === 0 ? (
                            <p className="text-xs text-slate-600 text-center py-8">Sin resultados</p>
                        ) : sortedEpics.map(epic => (
                            <HierarchyCard
                                key={epic.id}
                                issue={epic}
                                selected={selectedEpic?.key === epic.key}
                                pinned={pinnedEpics.includes(epic.key)}
                                onSelect={() => setSelectedEpic(epic)}
                                onPin={() => togglePin(epic.key, pinnedEpics, setPinnedEpics, PINNED_EPICS_KEY)}
                                onDetail={() => setTaskDetailTarget(epic)}
                                onAssign={epic.fields.assignee?.accountId === myAccountId ? undefined : async () => {
                                    const accountId = myAccountId || loadConfig().defaultAssigneeId;
                                    if (!accountId) { setTransitionError('Falta Account ID en Settings'); return; }
                                    try {
                                        await assignIssue(epic.key, accountId);
                                        // Refresh epics
                                        const updated = await getEpics(project);
                                        setEpics(updated);
                                        saveLS(PERSIST_EPICS_KEY, updated);
                                    } catch (e: any) {
                                        setTransitionError(e?.message ?? 'Error al asignar');
                                    }
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Column 2: Stories */}
                <div className={`${colCls} w-1/4`}>
                    <div className={colHeaderCls}>
                        {/* title + filter toggle */}
                        <div className="flex items-center gap-1 mb-0.5">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex-1">
                                Technical {selectedEpic ? `(${sortedStories.length})` : ''}
                            </p>
                            {selectedEpic && (
                                <>
                                    {hasStoryFilters && (
                                        <button onClick={() => { setStorySearch(''); setStoryFilterAssignee(''); setStoryFilterStatus(''); }}
                                            className="text-[9px] text-nexus-neon/70 hover:text-nexus-neon flex items-center gap-0.5" title="Limpiar filtros">
                                            <X size={9} /> {[storySearch, storyFilterAssignee, storyFilterStatus].filter(Boolean).length}
                                        </button>
                                    )}
                                    <button onClick={() => setShowStoryFilters(v => !v)}
                                        className={`p-0.5 rounded transition-colors ${showStoryFilters ? 'text-nexus-neon' : 'text-slate-500 hover:text-slate-300'}`}
                                        title="Filtros">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
                                        </svg>
                                    </button>
                                </>
                            )}
                        </div>
                        {selectedEpic && <p className="text-[10px] text-nexus-neon/60 mb-1 truncate">{selectedEpic.key}</p>}
                        {/* Collapsible filter panel */}
                        {selectedEpic && showStoryFilters && (
                            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2 space-y-1.5 mt-1">
                                {/* Text search */}
                                <div className="relative">
                                    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input value={storySearch} onChange={e => setStorySearch(e.target.value)}
                                        placeholder="Título o clave..."
                                        className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-6 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon" />
                                    {storySearch && <button onClick={() => setStorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"><X size={10} /></button>}
                                </div>
                                {/* Assignee */}
                                <div>
                                    <label className="text-[9px] text-slate-600 uppercase tracking-wider font-bold block mb-0.5">Asignado</label>
                                    <select value={storyFilterAssignee} onChange={e => setStoryFilterAssignee(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-nexus-neon">
                                        <option value="">Todos</option>
                                        <option value="me">👤 Yo</option>
                                        <option value="unassigned">Sin asignar</option>
                                    </select>
                                </div>
                                {/* Status */}
                                <div>
                                    <label className="text-[9px] text-slate-600 uppercase tracking-wider font-bold block mb-0.5">Estado</label>
                                    <select value={storyFilterStatus} onChange={e => setStoryFilterStatus(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-nexus-neon">
                                        <option value="">Todos</option>
                                        {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className={colBodyCls}>
                        {!selectedEpic && <p className="text-xs text-slate-600 text-center py-8">← Selecciona un Epic</p>}
                        {storyError && <p className="text-xs text-red-400 p-2">{storyError}</p>}
                        {selectedEpic && loadingStories ? (
                            <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div>
                        ) : sortedStories.map(story => (
                            <div key={story.id} className="relative group/story">
                                <HierarchyCard
                                    issue={story}
                                    selected={selectedStory?.key === story.key}
                                    pinned={pinnedStories.includes(story.key)}
                                    onSelect={() => setSelectedStory(story)}
                                    onPin={() => togglePin(story.key, pinnedStories, setPinnedStories, PINNED_STORIES_KEY)}
                                    onDetail={() => {
                                        setSelectedTask(null);
                                        setTaskDetailTarget(story);
                                    }}
                                    onAssign={story.fields.assignee?.accountId === myAccountId ? undefined : async () => {
                                        const accountId = myAccountId || loadConfig().defaultAssigneeId;
                                        if (!accountId) { setTransitionError('Falta Account ID en Settings'); return; }
                                        try {
                                            await assignIssue(story.key, accountId);
                                            if (selectedEpic) {
                                                const updated = await getStoriesByEpic(selectedEpic.key);
                                                setStories(updated);
                                                saveLS(PERSIST_STORIES_KEY, updated);
                                            }
                                        } catch (e: any) {
                                            setTransitionError(e?.message ?? 'Error al asignar');
                                        }
                                    }}
                                />
                                <button
                                    onClick={e => { e.stopPropagation(); setCreateForStory(story); }}
                                    title="Crear sub-tarea"
                                    className="absolute right-2 bottom-2 opacity-0 group-hover/story:opacity-100 transition-opacity bg-nexus-neon text-nexus-darker rounded-full w-5 h-5 flex items-center justify-center shadow-lg hover:scale-110"
                                >
                                    <Plus size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 3: Tasks */}
                <div className={`${colCls} w-1/4`}>
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Tasks {selectedStory ? `(${tasks.length})` : ''}
                        </p>
                        {selectedStory && <p className="text-[10px] text-nexus-neon/60 mt-0.5 truncate">{selectedStory.key}</p>}
                    </div>
                    <div className={colBodyCls}>
                        {!selectedStory && <p className="text-xs text-slate-600 text-center py-8">← Selecciona una Story</p>}
                        {taskError && <p className="text-xs text-red-400 p-2">{taskError}</p>}
                        {selectedStory && loadingTasks ? (
                            <div className="flex justify-center py-8 text-slate-500"><RefreshCw size={14} className="animate-spin" /></div>
                        ) : tasks.length === 0 && selectedStory && !loadingTasks ? (
                            <p className="text-xs text-slate-600 text-center py-8">Sin tasks todavía</p>
                        ) : tasks.map(task => (
                            <HierarchyCard
                                key={task.id}
                                issue={task}
                                selected={selectedTask?.key === task.key}
                                pinned={false}
                                onSelect={() => setSelectedTask(prev => prev?.key === task.key ? null : task)}
                                onPin={() => { }}
                                showPin={false}
                                onAssign={task.fields.assignee?.accountId === myAccountId ? undefined : async () => {
                                    try {
                                        const accountId = myAccountId || loadConfig().defaultAssigneeId;
                                        if (!accountId) { setTransitionError('Falta Account ID en Settings'); return; }
                                        await assignIssue(task.key, accountId);
                                        if (selectedStory) {
                                            const updated = await getTasksByStory(selectedStory.key);
                                            setTasks(updated);
                                            saveLS(PERSIST_TASKS_KEY, updated);
                                            const refreshed = updated.find(t => t.key === task.key);
                                            if (refreshed) setSelectedTask(refreshed);
                                        }
                                    } catch (e: any) {
                                        setTransitionError(e?.message ?? 'Error al asignar');
                                    }
                                }}
                                onDetail={() => {
                                    // Select task so transitions load, then open detail modal
                                    setSelectedTask(task);
                                    setTaskDetailTarget(task);
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Column 4: Task Detail + Transitions */}
                <div className="flex flex-col w-1/4 h-full border-slate-800">
                    <div className={colHeaderCls}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalle / Acción</p>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-hide p-3">
                        {!selectedTask ? (
                            <p className="text-xs text-slate-600 text-center py-8">← Selecciona una Task</p>
                        ) : (
                            <div className="space-y-3">
                                <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-800">
                                    <p className="font-mono text-[10px] text-nexus-neon/60 mb-1">{selectedTask.key}</p>
                                    <p className="text-xs text-slate-200 leading-snug">{selectedTask.fields.summary}</p>
                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                        <span
                                            className="px-2 py-0.5 text-[9px] rounded-full font-bold uppercase"
                                            style={{
                                                background: statusColor(selectedTask.fields.status.statusCategory.colorName) + '22',
                                                color: statusColor(selectedTask.fields.status.statusCategory.colorName),
                                                border: `1px solid ${statusColor(selectedTask.fields.status.statusCategory.colorName)}44`,
                                            }}
                                        >{selectedTask.fields.status.name}</span>
                                        {selectedTask.fields.status.name.toLowerCase() === 'working' && (
                                            <button
                                                onClick={() => setShowTempoModal(true)}
                                                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold bg-nexus-accent/20 text-nexus-accent border border-nexus-accent/40 hover:bg-nexus-accent/30 rounded-full transition-colors"
                                            >
                                                <Timer size={10} />
                                                Log Time
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold flex items-center gap-1.5">
                                        Transiciones
                                        {loadingTransitions && <RefreshCw size={9} className="animate-spin text-slate-600" />}
                                    </p>
                                    {transitionError && (
                                        <div className="flex items-start gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                                            <AlertCircle size={11} className="text-red-400 shrink-0 mt-0.5" />
                                            <span className="text-[10px] text-red-400 leading-snug flex-1">{transitionError}</span>
                                            <button onClick={() => setTransitionError(null)} className="text-red-500/60 hover:text-red-400 shrink-0"><X size={10} /></button>
                                        </div>
                                    )}
                                    {taskTransitions.length === 0 && !loadingTransitions && (
                                        <p className="text-[10px] text-slate-600 italic">Sin transiciones disponibles</p>
                                    )}
                                    {taskTransitions.map(tr => {
                                        const isCurrent = selectedTask.fields.status.name.toLowerCase() === tr.toName.toLowerCase();
                                        const isDiscard = /discard/i.test(tr.toName) || /discard/i.test(tr.name);
                                        const color = isDiscard ? '#ef4444' : statusColor(tr.toColor);
                                        return (
                                            <button
                                                key={tr.id}
                                                onClick={() => handleTransitionClick(selectedTask, tr)}
                                                disabled={transitioningTask === selectedTask.key || isCurrent}
                                                className="w-full px-3 py-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                                                style={{
                                                    background: color + '18',
                                                    borderColor: color + '44',
                                                    color,
                                                }}
                                                title={`${tr.name} → ${tr.toName}`}
                                            >
                                                {transitioningTask === selectedTask.key
                                                    ? <RefreshCw size={11} className="animate-spin" />
                                                    : null
                                                }
                                                {tr.toName}
                                                {isCurrent && <span className="text-[9px] opacity-60 ml-1">(actual)</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Generic transition fields modal (required fields / Discard) */}
            {transitionTarget && (
                <TransitionFieldsModal
                    target={transitionTarget}
                    onClose={() => setTransitionTarget(null)}
                    onConfirm={async (comment, fields) => {
                        const { task, transition } = transitionTarget;
                        setTransitionTarget(null);
                        await handleTransition(task, transition.toName, comment, fields);
                    }}
                />
            )}

            {/* Task / Story / Epic detail modal */}
            {taskDetailTarget && (
                <TaskDetailModal
                    task={taskDetailTarget}
                    onClose={() => setTaskDetailTarget(null)}
                    onTransition={(tr) => handleTransitionClick(taskDetailTarget, tr)}
                    onAssign={taskDetailTarget.fields.assignee?.accountId === myAccountId ? undefined : async () => {
                        const accountId = myAccountId || loadConfig().defaultAssigneeId;
                        if (!accountId) { setTransitionError('Falta Account ID en Settings'); return; }
                        try {
                            await assignIssue(taskDetailTarget.key, accountId);
                            // Refresh the right column depending on issue type
                            const type = taskDetailTarget.fields.issuetype?.name?.toLowerCase() ?? '';
                            if (type === (cfg.taskType || 'task').toLowerCase() && selectedStory) {
                                const updated = await getTasksByStory(selectedStory.key);
                                setTasks(updated);
                                saveLS(PERSIST_TASKS_KEY, updated);
                                const r = updated.find(t => t.key === taskDetailTarget.key);
                                if (r) { setTaskDetailTarget(r); setSelectedTask(r); }
                            } else if (selectedEpic) {
                                const updated = await getStoriesByEpic(selectedEpic.key);
                                setStories(updated);
                                saveLS(PERSIST_STORIES_KEY, updated);
                                const r = updated.find(s => s.key === taskDetailTarget.key);
                                if (r) setTaskDetailTarget(r);
                            }
                        } catch (e: any) {
                            setTransitionError(e?.message ?? 'Error al asignar');
                        }
                    }}
                />
            )}

            {/* API Request Log */}
            <div className="shrink-0 border-t border-slate-800 bg-slate-950">
                <div
                    className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60 cursor-pointer hover:bg-slate-900/40 select-none"
                    onClick={() => setLogVisible(v => !v)}
                >
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">API Log</span>
                    <span className="text-[9px] text-slate-700">{apiLog.length} req</span>
                    <ChevronRight size={10} className={`text-slate-600 transition-transform ml-0.5 ${logVisible ? 'rotate-90' : ''}`} />
                    {apiLog.length > 0 && (
                        <button
                            onClick={e => { e.stopPropagation(); setApiLog([]); }}
                            className="ml-auto text-[10px] text-slate-600 hover:text-slate-400"
                        >Clear</button>
                    )}
                </div>
                {logVisible && (
                    <div className="h-36 overflow-y-auto scrollbar-hide">
                        {apiLog.length === 0 ? (
                            <p className="text-[10px] text-slate-700 py-3 px-3 font-mono">Waiting for requests...</p>
                        ) : apiLog.map((entry) => (
                            <div key={entry.id} className="border-b border-slate-900">
                                {/* Row summary */}
                                <div
                                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-900/60 group"
                                    onClick={() => setExpandedLog(expandedLog === entry.id ? null : entry.id)}
                                >
                                    {/* Method pill */}
                                    <span className={`shrink-0 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${entry.method === 'GET' ? 'bg-sky-500/20 text-sky-400'
                                        : entry.method === 'POST' ? 'bg-violet-500/20 text-violet-400'
                                            : 'bg-amber-500/20 text-amber-400'
                                        }`}>{entry.method}</span>
                                    {/* Status badge */}
                                    {entry.status !== undefined && (
                                        <span className={`shrink-0 font-mono text-[9px] font-bold ${entry.ok ? 'text-emerald-400' : 'text-red-400'
                                            }`}>{entry.status}</span>
                                    )}
                                    {/* Path */}
                                    <span className="flex-1 font-mono text-[10px] text-slate-400 truncate">{entry.path}</span>
                                    {/* Duration */}
                                    {entry.durationMs !== undefined && (
                                        <span className="shrink-0 text-[9px] text-slate-600 font-mono">{entry.durationMs}ms</span>
                                    )}
                                    {/* Time */}
                                    <span className="shrink-0 text-[9px] text-slate-700 font-mono">{entry.time}</span>
                                    {/* Copy curl button */}
                                    <button
                                        onClick={e => { e.stopPropagation(); copyCurl(entry); }}
                                        title="Copy as curl"
                                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 font-mono"
                                    >
                                        {copiedId === entry.id ? '✓' : 'curl'}
                                    </button>
                                </div>
                                {/* Expanded: body + curl */}
                                {expandedLog === entry.id && (
                                    <div className="bg-slate-950 px-3 pb-2 space-y-1.5">
                                        {entry.error && (
                                            <p className="text-[10px] text-red-400 font-mono bg-red-500/5 p-1.5 rounded">{entry.error}</p>
                                        )}
                                        {entry.body && (
                                            <div>
                                                <p className="text-[9px] text-slate-600 uppercase font-bold mb-0.5">Body</p>
                                                <pre className="text-[10px] text-slate-400 font-mono bg-slate-900 rounded p-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(JSON.parse(entry.body), null, 2)}</pre>
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-[9px] text-slate-600 uppercase font-bold mb-0.5">cURL</p>
                                            <pre className="text-[10px] text-nexus-neon/80 font-mono bg-slate-900 rounded p-2 overflow-x-auto whitespace-pre-wrap select-all">{entry.curl}</pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {createForStory && (
                <CreateSubTaskModal
                    parentKey={createForStory.key}
                    onClose={() => setCreateForStory(null)}
                    onCreated={newKey => {
                        console.log(`Sub-tarea ${newKey} creada en ${createForStory.key}`);
                        setCreateForStory(null);
                        if (selectedStory?.key === createForStory.key) {
                            setLoadingTasks(true);
                            getTasksByStory(createForStory.key)
                                .then(data => { setTasks(data); saveLS(PERSIST_TASKS_KEY, data); })
                                .finally(() => setLoadingTasks(false));
                        }
                    }}
                />
            )}
            {detailEpic && <EpicDetailModal epic={detailEpic} onClose={() => setDetailEpic(null)} />}
            {showTempoModal && selectedTask && (
                <TempoLogModal
                    issue={selectedTask}
                    authorAccountId={myAccountId}
                    onClose={() => setShowTempoModal(false)}
                    onSuccess={() => setShowTempoModal(false)}
                />
            )}
        </div>
    );
}

// ── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel({ onSaved }: { onSaved: () => void }) {
    const [cfg, setCfg] = useState<JiraConfig>(loadConfig());
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
    const [saving, setSaving] = useState(false);
    // For custom fields editor
    const [newFieldKey, setNewFieldKey] = useState('');
    const [newFieldVal, setNewFieldVal] = useState('');
    // Activity field options
    const [activityOpts, setActivityOpts] = useState<{ id: string; value: string }[]>([]);
    const [loadingActivityOpts, setLoadingActivityOpts] = useState(false);

    const loadActivityOpts = (fieldId: string, proj: string) => {
        if (!fieldId || !proj) return;
        setLoadingActivityOpts(true);
        getActivityOptions(proj)
            .then(list => setActivityOpts(list))
            .catch(() => setActivityOpts([]))
            .finally(() => setLoadingActivityOpts(false));
    };

    // Auto-load on mount using saved config
    useEffect(() => {
        const saved = loadConfig();
        loadActivityOpts(saved.activityFieldId, saved.storiesProject || saved.defaultProject);
    }, []);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const me = await testConnection();
            setTestResult({ ok: true, msg: `✅ Conectado como ${me.displayName}` });
            if (!cfg.defaultAssigneeId) {
                setCfg(c => ({ ...c, defaultAssigneeId: me.accountId }));
            }
        } catch (e: any) {
            setTestResult({ ok: false, msg: `❌ ${e.message}` });
        } finally {
            setTesting(false);
        }
    };

    const handleSave = () => {
        setSaving(true);
        saveConfig(cfg);
        setTimeout(() => { setSaving(false); onSaved(); }, 400);
    };

    const addCustomField = () => {
        if (!newFieldKey.trim()) return;
        setCfg(c => ({ ...c, customFields: { ...c.customFields, [newFieldKey.trim()]: newFieldVal } }));
        setNewFieldKey(''); setNewFieldVal('');
    };

    const removeCustomField = (key: string) => {
        setCfg(c => {
            const cf = { ...c.customFields };
            delete cf[key];
            return { ...c, customFields: cf };
        });
    };

    const field = (label: string, key: keyof JiraConfig, type: 'text' | 'password' = 'text') => (
        <div>
            <label className="block text-xs text-slate-400 mb-1">{label}</label>
            <input
                type={type}
                value={(cfg[key] as string) ?? ''}
                onChange={e => setCfg(c => ({ ...c, [key]: e.target.value }))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon transition-colors"
            />
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto space-y-6 py-6 px-4">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Settings size={16} /> Configuración de Jira</h2>

            {/* Connection */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conexión</h3>
                {field('Jira Base URL (ej. https://empresa.atlassian.net)', 'baseUrl')}
                {field('Email de Atlassian', 'email')}
                {field('API Token', 'apiToken', 'password')}
                <button onClick={handleTest} disabled={testing}
                    className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50">
                    {testing ? <RefreshCw size={12} className="inline animate-spin mr-1" /> : null}
                    {testing ? 'Probando...' : 'Probar conexión'}
                </button>
                {testResult && (
                    <p className={`text-xs ${testResult.ok ? 'text-nexus-success' : 'text-nexus-danger'}`}>{testResult.msg}</p>
                )}
            </section>

            {/* Tempo */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Timer size={12} /> Tempo
                </h3>
                {field('Tempo API Token (app.tempo.io → API Integration)', 'tempoToken', 'password')}
                <p className="text-[10px] text-slate-600">El account ID del autor se toma del campo "Account ID del asignado por defecto" de arriba.</p>
            </section>

            {/* Default fields */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valores por defecto (para crear issues)</h3>
                {field('Clave de proyecto por defecto (ej. NCPPPMC)', 'defaultProject')}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Tipo de issue por defecto</label>
                    <select value={cfg.defaultIssueType}
                        onChange={e => setCfg(c => ({ ...c, defaultIssueType: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon">
                        {['Story', 'Bug', 'Task', 'Sub-task', 'Epic'].map(t => <option key={t}>{t}</option>)}
                    </select>
                </div>
                {field('Account ID del asignado por defecto', 'defaultAssigneeId')}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Prioridad por defecto</label>
                    <select value={cfg.defaultPriority}
                        onChange={e => setCfg(c => ({ ...c, defaultPriority: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon">
                        {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Labels por defecto (separados por coma)</label>
                    <input
                        type="text"
                        value={cfg.defaultLabels.join(', ')}
                        onChange={e => setCfg(c => ({ ...c, defaultLabels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                        placeholder="frontend, microfrontend"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon"
                    />
                </div>
            </section>

            {/* Hierarchy config */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stories View — Jerarquía</h3>
                {field('Proyecto para vista Stories (ej. NCPPPMC)', 'storiesProject')}
                {field('Tipo Epic (Business)', 'epicType')}
                {field('Tipo Story (Technical)', 'storyType')}
                {field('Tipo Task (Sub-tarea)', 'taskType')}
                {field('ID del campo Activity (ej. customfield_10115) — dejar vacío para omitir', 'activityFieldId')}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Valor de Activity</label>
                    <div className="flex gap-2">
                        <select
                            value={cfg.activityValue}
                            onChange={e => {
                                const found = activityOpts.find(a => a.value === e.target.value);
                                setCfg(c => ({ ...c, activityValue: e.target.value, activityId: found?.id ?? c.activityId }));
                            }}
                            disabled={activityOpts.length === 0}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon disabled:text-slate-600"
                        >
                            <option value="">{activityOpts.length === 0 ? 'Carga las opciones primero →' : 'Selecciona un valor'}</option>
                            {activityOpts.map(a => (
                                <option key={a.id} value={a.value}>{a.value}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => loadActivityOpts(cfg.activityFieldId, cfg.storiesProject || cfg.defaultProject)}
                            disabled={!cfg.activityFieldId || !(cfg.storiesProject || cfg.defaultProject) || loadingActivityOpts}
                            className="px-3 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {loadingActivityOpts ? <RefreshCw size={12} className="animate-spin" /> : 'Recargar'}
                        </button>
                    </div>
                    {cfg.activityId && (
                        <p className="text-[10px] text-slate-600 mt-1">ID: {cfg.activityId}</p>
                    )}
                </div>
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Statuses con color especial (separados por coma)</label>
                    <input
                        type="text"
                        value={(cfg.releasedStatuses ?? []).join(', ')}
                        onChange={e => setCfg(c => ({ ...c, releasedStatuses: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                        placeholder="Released, Discarded"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon"
                    />
                </div>
            </section>

            {/* Custom fields */}
            <section className="space-y-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Campos personalizados (custom fields Jira)</h3>
                <p className="text-[11px] text-slate-500">Agrega campos como <code className="bg-slate-800 px-1 rounded">customfield_10020</code> con su valor por defecto. Se enviarán automáticamente al crear un issue.</p>
                {Object.entries(cfg.customFields).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-nexus-neon/80 bg-slate-800 px-2 py-1 rounded flex-1">{k}</span>
                        <span className="text-slate-300 flex-1 truncate">{JSON.stringify(v)}</span>
                        <button onClick={() => removeCustomField(k)} className="text-nexus-danger hover:bg-slate-700 p-1 rounded"><X size={12} /></button>
                    </div>
                ))}
                <div className="flex gap-2">
                    <input value={newFieldKey} onChange={e => setNewFieldKey(e.target.value)}
                        placeholder="customfield_XXXXX"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-nexus-neon font-mono" />
                    <input value={newFieldVal} onChange={e => setNewFieldVal(e.target.value)}
                        placeholder="valor"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-nexus-neon" />
                    <button onClick={addCustomField} className="px-3 py-1 text-xs bg-nexus-neon text-nexus-darker rounded font-bold hover:bg-opacity-80 transition-colors">+</button>
                </div>
            </section>

            <button onClick={handleSave} disabled={saving}
                className="w-full py-2.5 rounded-lg bg-nexus-accent hover:bg-opacity-80 text-white font-bold text-sm transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
        </div>
    );
}

// ── Create Issue Form ─────────────────────────────────────────────────────────

function CreateIssueForm({ onCreated }: { onCreated: (key: string) => void }) {
    const cfg = loadConfig();
    const [summary, setSummary] = useState('');
    const [description, setDescription] = useState('');
    const [projectKey, setProjectKey] = useState(cfg.defaultProject);
    const [issueType, setIssueType] = useState(cfg.defaultIssueType);
    const [priority, setPriority] = useState(cfg.defaultPriority);
    const [assigneeId, setAssigneeId] = useState(cfg.defaultAssigneeId);
    const [labels, setLabels] = useState(cfg.defaultLabels.join(', '));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [projects, setProjects] = useState<{ key: string; name: string }[]>([]);
    const [issueTypes, setIssueTypes] = useState<{ id: string; name: string }[]>([]);
    const [users, setUsers] = useState<{ accountId: string; displayName: string }[]>([]);

    useEffect(() => {
        getProjects().then(setProjects).catch(() => { });
    }, []);

    useEffect(() => {
        if (projectKey) {
            getIssueTypes(projectKey).then(setIssueTypes).catch(() => { });
            getUsers(projectKey).then(setUsers).catch(() => { });
        }
    }, [projectKey]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary.trim()) return;
        setSubmitting(true);
        setError(null);
        try {
            const fields: Record<string, any> = {
                project: { key: projectKey },
                issuetype: { name: issueType },
                summary: summary.trim(),
                priority: { name: priority },
                labels: labels.split(',').map(l => l.trim()).filter(Boolean),
                ...cfg.customFields,
            };
            if (description.trim()) {
                fields.description = {
                    type: 'doc', version: 1,
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: description.trim() }] }]
                };
            }
            if (assigneeId) fields.assignee = { id: assigneeId };
            const res = await createIssue(fields);
            setSummary(''); setDescription(''); setError(null);
            onCreated(res.key);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-nexus-neon transition-colors";
    const labelCls = "block text-xs text-slate-400 mb-1";

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto py-6 px-4 space-y-4">
            <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Plus size={16} /> Crear Issue</h2>

            {error && (
                <div className="p-3 bg-nexus-danger/10 border border-nexus-danger/30 rounded-lg text-nexus-danger text-xs">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>Proyecto</label>
                    <select value={projectKey} onChange={e => setProjectKey(e.target.value)} className={inputCls}>
                        {projects.length > 0
                            ? projects.map(p => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)
                            : <option value={projectKey}>{projectKey}</option>
                        }
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Tipo</label>
                    <select value={issueType} onChange={e => setIssueType(e.target.value)} className={inputCls}>
                        {issueTypes.length > 0
                            ? issueTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)
                            : ['Story', 'Bug', 'Task'].map(t => <option key={t}>{t}</option>)
                        }
                    </select>
                </div>
            </div>

            <div>
                <label className={labelCls}>Resumen *</label>
                <input value={summary} onChange={e => setSummary(e.target.value)} required placeholder="Resumen del issue..." className={inputCls} />
            </div>

            <div>
                <label className={labelCls}>Descripción</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
                    placeholder="Descripción detallada..." className={`${inputCls} resize-none`} />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>Asignado a</label>
                    <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className={inputCls}>
                        <option value="">— Sin asignar —</option>
                        {users.map(u => <option key={u.accountId} value={u.accountId}>{u.displayName}</option>)}
                        {users.length === 0 && assigneeId && <option value={assigneeId}>{assigneeId}</option>}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Prioridad</label>
                    <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                        {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map(p => <option key={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            <div>
                <label className={labelCls}>Labels (separados por coma)</label>
                <input value={labels} onChange={e => setLabels(e.target.value)} placeholder="frontend, bug" className={inputCls} />
            </div>

            {Object.keys(cfg.customFields).length > 0 && (
                <div className="p-3 bg-slate-800/40 rounded-lg text-xs text-slate-400">
                    <span className="font-bold">Campos personalizados que se enviarán: </span>
                    {Object.keys(cfg.customFields).join(', ')}
                </div>
            )}

            <button type="submit" disabled={submitting || !summary.trim()}
                className="w-full py-2.5 rounded-lg bg-nexus-accent hover:bg-opacity-80 text-white font-bold text-sm transition-colors disabled:opacity-50">
                {submitting ? <RefreshCw size={14} className="inline animate-spin mr-2" /> : null}
                {submitting ? 'Creando...' : 'Crear Issue'}
            </button>
        </form>
    );
}

// ── MultiSelect ────────────────────────────────────────────────────────────────

function MultiSelect({ label, options, selected, onChange }: {
    label: string;
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (v: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    useEffect(() => {
        if (open) { setSearch(''); setTimeout(() => searchRef.current?.focus(), 0); }
    }, [open]);

    const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

    const filtered = search.trim()
        ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    const display = selected.length === 0 ? 'Todos'
        : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} sel.`;

    const active = selected.length > 0;

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] rounded border transition-colors ${active
                    ? 'bg-nexus-accent/10 border-nexus-accent/40 text-nexus-accent'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'}`}
            >
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</span>
                <span className="font-medium">{display}</span>
                {active && (
                    <span onClick={e => { e.stopPropagation(); onChange([]); }} className="opacity-60 hover:opacity-100">
                        <X size={9} />
                    </span>
                )}
                <ChevronDown size={9} className={`opacity-40 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute top-full mt-1 left-0 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl min-w-[180px] flex flex-col max-h-64">
                    <div className="p-1.5 border-b border-slate-800 shrink-0">
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            placeholder="Buscar..."
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                        />
                    </div>
                    <div className="overflow-y-auto py-1">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-600 italic">Sin resultados</p>
                        ) : filtered.map(opt => (
                            <label key={opt.value} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-800 cursor-pointer text-xs text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(opt.value)}
                                    onChange={() => toggle(opt.value)}
                                    className="accent-nexus-accent w-3 h-3"
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function BoardView() {
    const cfg = loadConfig();
    const [issues, setIssues] = useState<JiraIssue[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<JiraIssue | null>(null);
    const [filter, setFilter] = useState<BoardFilter>(() => {
        try {
            const saved = localStorage.getItem('nexus_jira_board_filter');
            if (!saved) return { assignees: ['me'] };
            const p = JSON.parse(saved);
            // Migrate old single-value fields to arrays
            if (p.assignee !== undefined && !p.assignees) {
                p.assignees = p.assignee ? [p.assignee] : [];
                delete p.assignee;
            }
            if (p.issueType !== undefined && !p.issueTypes) {
                p.issueTypes = p.issueType ? [p.issueType] : [];
                delete p.issueType;
            }
            return p;
        } catch { return { assignees: ['me'] }; }
    });

    const [searchInput, setSearchInput] = useState(() =>
        loadLS<BoardFilter>('nexus_jira_board_filter', {}).text ?? ''
    );

    const [projectKey, setProjectKey] = useState<string>(() =>
        localStorage.getItem('nexus_jira_board_proj') || cfg.defaultProject
    );
    const [projects, setProjects] = useState<{ key: string; name: string }[]>([]);
    const [projectIssueTypes, setProjectIssueTypes] = useState<{ id: string; name: string }[]>([]);
    const [projectStatuses, setProjectStatuses] = useState<string[]>([]);
    const [projectEpics, setProjectEpics] = useState<JiraIssue[]>([]);
    const [projectAssignees, setProjectAssignees] = useState<{ value: string; label: string }[]>([]);

    // Accumulate labels across loads so options don't disappear when filter changes
    const [allLabels, setAllLabels] = useState<string[]>([]);
    useEffect(() => {
        const newLabels = issues.flatMap(i => (i.fields as any).labels ?? []) as string[];
        if (newLabels.length === 0) return;
        setAllLabels(prev => [...new Set([...prev, ...newLabels])].sort());
    }, [issues]);
    const labelOptions = allLabels.map(l => ({ value: l, label: l }));

    const PRIORITIES = [
        { value: 'Highest', label: '🔴 Highest' },
        { value: 'High', label: '🟠 High' },
        { value: 'Medium', label: '🟡 Medium' },
        { value: 'Low', label: '🔵 Low' },
        { value: 'Lowest', label: '⚪ Lowest' },
    ];

    // Persist filter & project
    useEffect(() => { localStorage.setItem('nexus_jira_board_filter', JSON.stringify(filter)); }, [filter]);
    useEffect(() => {
        if (projectKey) localStorage.setItem('nexus_jira_board_proj', projectKey);
        else localStorage.removeItem('nexus_jira_board_proj');
    }, [projectKey]);

    // Load projects once
    useEffect(() => { getProjects().then(setProjects).catch(() => {}); }, []);

    // Load project metadata when project changes
    useEffect(() => {
        if (!projectKey) return;
        setProjectAssignees([]);
        setAllLabels([]);
        Promise.all([
            getIssueTypes(projectKey).catch(() => [] as { id: string; name: string }[]),
            getProjectStatuses(projectKey).catch(() => [] as string[]),
            getEpics(projectKey).catch(() => [] as JiraIssue[]),
            getUsers(projectKey).catch(() => [] as { accountId: string; displayName: string }[]),
        ]).then(([types, statuses, epics, users]) => {
            setProjectIssueTypes(types);
            setProjectStatuses(statuses);
            setProjectEpics(epics);
            setProjectAssignees(users.map(u => ({ value: u.accountId, label: u.displayName })));
        });
    }, [projectKey]);

    const load = useCallback(async () => {
        if (!projectKey) { setError('Falta seleccionar un proyecto'); return; }
        setLoading(true);
        setError(null);
        try {
            setIssues(await getBoardIssues(projectKey, filter));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [filter, projectKey]);

    useEffect(() => { load(); }, [load]);

    const hasFilters = !!(
        filter.assignees?.length || filter.issueTypes?.length || filter.statuses?.length ||
        filter.priorities?.length || filter.labels?.length || filter.epicKeys?.length || filter.text
    );
    const resetFilters = () => { setSearchInput(''); setFilter({ assignees: ['me'] }); };

    if (!cfg.baseUrl) return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500 p-12">
            <AlertCircle size={40} />
            <p className="text-sm text-center">Jira no está configurado.<br />Ve a <strong className="text-slate-300">Settings</strong> para agregar tus credenciales.</p>
        </div>
    );

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/50 shrink-0">
                {/* Row 1: project, search, actions */}
                <div className="flex items-center gap-2">
                    <select
                        value={projectKey || ''}
                        onChange={e => { setProjectKey(e.target.value); setFilter(prev => ({ ...prev, issueTypes: [], epicKeys: [] })); }}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-[11px] font-bold text-nexus-neon focus:outline-none focus:border-nexus-neon"
                    >
                        <option value="">Seleccionar Proyecto...</option>
                        {projects.map(p => <option key={p.key} value={p.key}>{p.key} — {p.name}</option>)}
                    </select>

                    <div className="relative flex-1">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') setFilter(prev => ({ ...prev, text: searchInput || undefined }));
                                if (e.key === 'Escape') { setSearchInput(''); setFilter(prev => ({ ...prev, text: undefined })); }
                            }}
                            placeholder="Buscar título o clave... ↵"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-7 pr-7 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-nexus-neon"
                        />
                        {searchInput && (
                            <button onClick={() => { setSearchInput(''); setFilter(prev => ({ ...prev, text: undefined })); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                                <X size={11} />
                            </button>
                        )}
                    </div>

                    {hasFilters && (
                        <button onClick={resetFilters}
                            className="text-[10px] text-nexus-neon flex items-center gap-1 border border-nexus-neon/30 bg-nexus-neon/10 px-2 py-1.5 rounded whitespace-nowrap">
                            <X size={10} /> Reset
                        </button>
                    )}
                    <button onClick={load} disabled={loading}
                        className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded border border-slate-700 bg-slate-950">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Row 2: multi-select filters */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <MultiSelect
                        label="Asignado"
                        options={[{ value: 'me', label: '👤 Yo' }, { value: 'unassigned', label: '— Sin asignar' }, ...projectAssignees]}
                        selected={filter.assignees ?? []}
                        onChange={v => setFilter(prev => ({ ...prev, assignees: v }))}
                    />
                    <MultiSelect
                        label="Tipo"
                        options={projectIssueTypes.map(t => ({ value: t.name, label: t.name }))}
                        selected={filter.issueTypes ?? []}
                        onChange={v => setFilter(prev => ({ ...prev, issueTypes: v }))}
                    />
                    <MultiSelect
                        label="Estado"
                        options={projectStatuses.map(s => ({ value: s, label: s }))}
                        selected={filter.statuses ?? []}
                        onChange={v => setFilter(prev => ({ ...prev, statuses: v }))}
                    />
                    <MultiSelect
                        label="Prioridad"
                        options={PRIORITIES}
                        selected={filter.priorities ?? []}
                        onChange={v => setFilter(prev => ({ ...prev, priorities: v }))}
                    />
                    <MultiSelect
                        label="Épica"
                        options={projectEpics.map(e => ({ value: e.key, label: `${e.key} — ${e.fields.summary}` }))}
                        selected={filter.epicKeys ?? []}
                        onChange={v => setFilter(prev => ({ ...prev, epicKeys: v }))}
                    />
                    {labelOptions.length > 0 && (
                        <MultiSelect
                            label="Label"
                            options={labelOptions}
                            selected={filter.labels ?? []}
                            onChange={v => setFilter(prev => ({ ...prev, labels: v }))}
                        />
                    )}
                    <span className="ml-auto text-[10px] text-slate-600 font-bold uppercase tracking-wider">
                        {issues.length} resultados
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-2 bg-slate-950">
                {error && (
                    <div className="p-3 bg-nexus-danger/10 border border-nexus-danger/30 rounded-lg text-nexus-danger text-xs flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                {loading && !issues.length ? (
                    <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
                        <RefreshCw size={16} className="animate-spin" /> Cargando tablero...
                    </div>
                ) : issues.length === 0 ? (
                    <div className="text-center text-slate-500 py-16 text-[13px] border border-dashed border-slate-800 rounded-xl m-4 bg-slate-900/40">
                        No se encontraron issues con los filtros actuales en {projectKey || 'el proyecto'}.
                        {hasFilters && <p className="mt-2"><button onClick={resetFilters} className="text-nexus-neon underline decoration-nexus-neon/30 hover:decoration-nexus-neon">Restablecer filtros</button></p>}
                    </div>
                ) : (
                    issues.map(issue => <IssueCard key={issue.id} issue={issue} onClick={() => setSelected(issue)} />)
                )}
            </div>

            {selected && <IssueDetailModal issue={selected} onClose={() => setSelected(null)} />}
        </div>
    );
}

// ── Main JiraPanel ─────────────────────────────────────────────────────────────

const STORAGE_JIRA_TAB = 'nexus-jira-active-tab';

export const JiraPanel: React.FC = () => {
    const [tab, setTab] = useState<Tab>(() => {
        const saved = localStorage.getItem(STORAGE_JIRA_TAB);
        return (saved === 'board' || saved === 'stories' || saved === 'create' || saved === 'settings') ? saved : 'board';
    });
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    useEffect(() => { localStorage.setItem(STORAGE_JIRA_TAB, tab); }, [tab]);

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'board', label: 'Board', icon: <Layers size={14} /> },
        { id: 'stories', label: 'Stories', icon: <Pin size={14} /> },
        { id: 'create', label: 'Crear Issue', icon: <Plus size={14} /> },
        { id: 'settings', label: 'Configuración', icon: <Settings size={14} /> },
    ];

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-950">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-800 shrink-0 bg-slate-900/50">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${tab === t.id
                            ? 'border-nexus-neon text-white'
                            : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}>
                        {t.icon}{t.label}
                    </button>
                ))}
                {successMsg && (
                    <div className="ml-auto flex items-center gap-1.5 text-xs text-nexus-success">
                        <CheckCircle size={13} /> {successMsg}
                        <button onClick={() => setSuccessMsg(null)} className="ml-1 text-slate-500 hover:text-slate-300"><X size={11} /></button>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {tab === 'board' && <BoardView />}
                {tab === 'stories' && <StoriesView />}
                {tab === 'create' && (
                    <div className="h-full overflow-y-auto scrollbar-hide">
                        <CreateIssueForm onCreated={key => {
                            setSuccessMsg(`Issue ${key} creado`);
                            setTab('board');
                        }} />
                    </div>
                )}
                {tab === 'settings' && (
                    <div className="h-full overflow-y-auto scrollbar-hide">
                        <SettingsPanel onSaved={() => {
                            setSuccessMsg('Configuración guardada');
                            setTab('board');
                        }} />
                    </div>
                )}
            </div>
        </div>
    );
};
