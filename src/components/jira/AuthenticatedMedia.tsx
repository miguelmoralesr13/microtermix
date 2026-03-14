import { useState, useEffect, useRef } from 'react';
import { loadConfig } from '../jiraApi';
import { fetch } from '@tauri-apps/plugin-http';
import { X, ChevronLeft, ChevronRight, Play, Download } from 'lucide-react';

export function AuthenticatedMedia({ url, mimeType, className, autoLoad = false, thumbnail = null }: {
    url: string;
    mimeType: string;
    className?: string;
    autoLoad?: boolean;
    thumbnail?: string | null;
}) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isInView, setIsInView] = useState(false);
    const [userRequested, setUserRequested] = useState(autoLoad);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (autoLoad) {
            setIsInView(true);
            setUserRequested(true);
        }
    }, [autoLoad]);

    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Progressive download bit-by-bit (simulated via fetch reader)
    const downloadMedia = async (mediaUrl: string) => {
        setIsLoading(true);
        setError(false);
        setErrorMsg(null);
        setProgress(0);

        try {
            const cfg = loadConfig();
            const token = btoa(`${cfg.email}:${cfg.apiToken}`);

            const response = await fetch(mediaUrl, {
                headers: { 'Authorization': `Basic ${token}` },
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText || 'de red'}`);
            }

            const contentType = response.headers.get('content-type') || 'application/octet-stream';
            const contentLength = +(response.headers.get('Content-Length') || 0);

            // Try to use streaming for progress, but fallback to blob() for robustness
            const reader = response.body?.getReader();
            if (!reader) {
                const blob = await response.blob();
                setBlobUrl(URL.createObjectURL(blob));
                return;
            }

            const chunks: Uint8Array[] = [];
            let receivedLength = 0;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        chunks.push(value);
                        receivedLength += value.length;
                        if (contentLength > 0) {
                            const pct = Math.round((receivedLength / contentLength) * 100);
                            setProgress(pct > 100 ? 100 : pct);
                        }
                    }
                }
            } catch (streamErr) {
                console.warn('Stream interrupted, attempting fallback to blob()', streamErr);
                // If stream fails halfway, we can't easily resume, but let's try a fresh blob load if chunks is small
                if (chunks.length === 0) {
                    const freshRes = await fetch(mediaUrl, { headers: { 'Authorization': `Basic ${token}` } });
                    const blob = await freshRes.blob();
                    setBlobUrl(URL.createObjectURL(blob));
                    return;
                }
                throw streamErr;
            }

            const blob = new Blob(chunks, { type: contentType });
            setBlobUrl(URL.createObjectURL(blob));
        } catch (e: any) {
            console.error('Error downloading media:', e);
            setError(true);
            setErrorMsg(e?.message || 'Error desconocido');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsInView(true);
                observer.disconnect();
            }
        }, { threshold: 0.1 });

        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [url]);

    // Auto-load images, but wait for videos unless requested
    useEffect(() => {
        if (!isInView) return;

        const isImage = mimeType.startsWith('image/');
        const isSmall = url.includes('thumbnail'); // thumbnails always load

        if (isImage || isSmall || userRequested) {
            downloadMedia(url);
        }
    }, [isInView, url, userRequested]);

    if (error) return (
        <div className={`flex flex-col items-center justify-center bg-red-500/5 border border-red-500/20 rounded p-4 text-center ${className} min-h-[120px]`}>
            <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Error de carga</span>
            {errorMsg && <p className="text-[9px] text-slate-500 mt-1 max-w-[150px] truncate">{errorMsg}</p>}
            <button onClick={() => downloadMedia(url)} className="mt-3 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[9px] font-bold rounded border border-red-500/30 transition-colors uppercase">
                Reintentar
            </button>
        </div>
    );

    if (!blobUrl) {
        return (
            <div ref={containerRef} className={`relative flex flex-col items-center justify-center bg-slate-950/40 border border-slate-800/50 rounded overflow-hidden min-h-[120px] ${className}`}>
                {isLoading ? (
                    <div className="flex flex-col items-center gap-2">
                        <div className="relative w-8 h-8">
                            <svg className="w-full h-full" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="16" fill="none" className="stroke-slate-800" strokeWidth="3" />
                                <circle cx="18" cy="18" r="16" fill="none" className="stroke-microtermix-neon transition-all duration-300" strokeWidth="3"
                                    strokeDasharray="100" strokeDashoffset={100 - progress} strokeLinecap="round" transform="rotate(-90 18 18)" />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-microtermix-neon">{progress}%</span>
                        </div>
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Cargando...</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 p-4 text-center">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform">
                            {mimeType.startsWith('video/') ? <Play size={18} fill="currentColor" /> : <Download size={18} />}
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); setUserRequested(true); }}
                            className="px-3 py-1.5 bg-microtermix-neon/10 border border-microtermix-neon/30 text-microtermix-neon rounded text-[10px] font-bold hover:bg-microtermix-neon/20 transition-colors uppercase tracking-wider"
                        >
                            Cargar {mimeType.startsWith('video/') ? 'Video' : 'Imagen'}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    if (mimeType.startsWith('image/')) {
        return <img src={blobUrl} alt="Adjunto" className={className} />;
    }
    if (mimeType.startsWith('video/')) {
        return <video src={blobUrl} controls autoPlay poster={thumbnail || undefined} className={className} />
    }
    return null;
}

export function AttachmentViewer({ attachments, initialIndex, onClose }: { attachments: any[]; initialIndex: number; onClose: () => void }) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
            if (e.key === 'ArrowRight') setCurrentIndex(i => (i + 1) % attachments.length);
            if (e.key === 'ArrowLeft') setCurrentIndex(i => (i - 1 + attachments.length) % attachments.length);
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [attachments.length, onClose]);

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
                    <AuthenticatedMedia
                        key={attachment.id}
                        url={attachment.content}
                        thumbnail={attachment.thumbnail}
                        mimeType={attachment.mimeType}
                        autoLoad={true}
                        className="max-w-full max-h-[90vh] object-contain rounded"
                    />
                ) : (
                    <div className="bg-slate-800 p-8 rounded-xl text-center">
                        <p className="text-slate-300 font-medium mb-4">{attachment.filename}</p>
                        <a href={attachment.content} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-microtermix-accent hover:bg-opacity-80 rounded text-white font-bold text-sm transition-colors decoration-none">
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
