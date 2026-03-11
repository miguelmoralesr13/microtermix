import { useState, useEffect } from 'react';
import { getJiraMediaUrl } from '../jiraApi';
import { RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEscape } from '../../hooks/useEscape';

export function AuthenticatedMedia({ url, mimeType, className }: { url: string; mimeType: string; className?: string }) {
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
        return <video src={blobUrl} controls autoPlay className={className} />
    }
    return null;
}

export function AttachmentViewer({ attachments, initialIndex, onClose }: { attachments: any[]; initialIndex: number; onClose: () => void }) {
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
