import React, { useState, useEffect } from 'react';
import { 
    Database, Folder, File, ChevronRight, 
    RefreshCw, Search, ArrowLeft, Download,
    Calendar, Loader2
} from 'lucide-react';
import { s3ListBuckets, s3ListObjects, s3DownloadObject, S3Bucket, S3Object } from '../../services/cloudwatchApi';
import { useAwsStore } from '../../stores/awsStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { save } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

export function S3Tab() {
    const credentials = useAwsStore(s => s.credentials);
    const [buckets, setBuckets] = useState<S3Bucket[]>([]);
    const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
    const [objects, setObjects] = useState<S3Object[]>([]);
    const [prefix, setPrefix] = useState('');
    const [loading, setLoading] = useState(false);
    const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (credentials) {
            loadBuckets();
        }
    }, [credentials]);

    useEffect(() => {
        if (selectedBucket) {
            loadObjects();
        }
    }, [selectedBucket, prefix]);

    const loadBuckets = async () => {
        if (!credentials) return;
        setLoading(true);
        try {
            const res = await s3ListBuckets(credentials);
            setBuckets(res);
        } catch (e) {
            console.error(e);
            toast.error("Error al cargar buckets");
        } finally {
            setLoading(false);
        }
    };

    const loadObjects = async () => {
        if (!credentials || !selectedBucket) return;
        setLoading(true);
        try {
            // Using / as delimiter to simulate folder navigation
            const res = await s3ListObjects(credentials, selectedBucket, prefix || undefined, '/');
            // Sort: folders first, then files
            const sorted = [...res].sort((a, b) => {
                if (a.is_folder && !b.is_folder) return -1;
                if (!a.is_folder && b.is_folder) return 1;
                return a.key.localeCompare(b.key);
            });
            setObjects(sorted);
        } catch (e) {
            console.error(e);
            toast.error("Error al cargar objetos");
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (obj: S3Object) => {
        if (!credentials || !selectedBucket || obj.is_folder) return;
        
        try {
            const fileName = obj.key.split('/').pop() || 'download';
            const filePath = await save({
                defaultPath: fileName,
                title: 'Guardar archivo de S3'
            });

            if (filePath) {
                setDownloadingKey(obj.key);
                await s3DownloadObject(credentials, selectedBucket, obj.key, filePath);
                toast.success("Descarga completada");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error en la descarga");
        } finally {
            setDownloadingKey(null);
        }
    };

    const handleItemClick = (obj: S3Object) => {
        if (obj.is_folder) {
            setPrefix(obj.key);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (secs: number | null) => {
        if (!secs) return '-';
        return new Date(secs * 1000).toLocaleString();
    };

    // Breadcrumbs logic
    const pathParts = prefix.split('/').filter(Boolean);
    const navigateToPart = (index: number) => {
        const newPrefix = pathParts.slice(0, index + 1).join('/') + '/';
        setPrefix(newPrefix);
    };

    const filteredObjects = objects.filter(o => {
        const name = o.is_folder ? o.key.slice(0, -1).split('/').pop() : o.key.split('/').pop();
        return name?.toLowerCase().includes(search.toLowerCase());
    });

    if (!selectedBucket) {
        return (
            <div className="p-6 space-y-6 animate-in fade-in duration-500">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Database className="w-5 h-5 text-microtermix-neon" /> S3 Buckets
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">Selecciona un bucket para explorar sus archivos.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadBuckets} disabled={loading} className="gap-2">
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Refrescar
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {buckets.map(bucket => (
                        <div 
                            key={bucket.name}
                            onClick={() => setSelectedBucket(bucket.name)}
                            className="p-4 rounded-xl border border-white/5 bg-slate-900/40 hover:bg-slate-900/60 hover:border-microtermix-neon/30 transition-all cursor-pointer group"
                        >
                            <div className="flex items-start justify-between">
                                <div className="p-2 bg-microtermix-neon/10 rounded-lg group-hover:bg-microtermix-neon/20 transition-colors">
                                    <Database className="w-5 h-5 text-microtermix-neon" />
                                </div>
                                <Badge variant="outline" className="text-[10px] opacity-50">S3 Bucket</Badge>
                            </div>
                            <h3 className="text-sm font-bold text-white mt-4 truncate" title={bucket.name}>{bucket.name}</h3>
                            <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
                                <Calendar className="w-3 h-3" />
                                {formatDate(bucket.creation_date)}
                            </div>
                        </div>
                    ))}
                </div>

                {buckets.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500 italic">
                        <Database className="w-12 h-12 mb-4 opacity-20" />
                        No se encontraron buckets en esta región.
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500">
            {/* Toolbar */}
            <div className="p-4 border-b border-white/5 bg-slate-900/20 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon-sm" onClick={() => { setSelectedBucket(null); setPrefix(''); }} className="text-slate-400">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <div>
                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <Folder className="w-4 h-4 text-amber-400" /> {selectedBucket}
                            </h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <Input 
                                placeholder="Filtrar en esta vista..." 
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="h-8 pl-8 text-xs bg-black/20 border-white/5"
                            />
                        </div>
                        <Button variant="outline" size="sm" onClick={loadObjects} disabled={loading} className="h-8 gap-2 text-slate-400 hover:text-white">
                            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                        </Button>
                    </div>
                </div>

                {/* Breadcrumbs */}
                <div className="flex items-center gap-1 text-[11px] text-slate-400 bg-black/20 p-2 rounded-lg">
                    <button 
                        onClick={() => setPrefix('')}
                        className="hover:text-microtermix-neon transition-colors font-medium"
                    >
                        Root
                    </button>
                    {pathParts.map((part, i) => (
                        <React.Fragment key={i}>
                            <ChevronRight className="w-3 h-3 text-slate-600" />
                            <button 
                                onClick={() => navigateToPart(i)}
                                className="hover:text-microtermix-neon transition-colors font-medium"
                            >
                                {part}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Objects List */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-950 z-10 shadow-sm">
                        <tr className="border-b border-white/5 bg-slate-950">
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nombre</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tamaño</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-40">Modificado</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-32">Clase</th>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-20 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredObjects.map((obj, i) => {
                            const isFolder = obj.is_folder;
                            const displayName = isFolder 
                                ? obj.key.slice(0, -1).split('/').pop() 
                                : obj.key.split('/').pop();

                            const isDownloading = downloadingKey === obj.key;

                            return (
                                <tr 
                                    key={i} 
                                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group cursor-pointer"
                                    onClick={() => handleItemClick(obj)}
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            {isFolder ? (
                                                <Folder className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                                            ) : (
                                                <File className="w-4 h-4 text-slate-400" />
                                            )}
                                            <span className={cn("text-xs", isFolder ? "text-slate-200 font-semibold" : "text-slate-400")}>
                                                {displayName}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                                        {isFolder ? '-' : formatSize(obj.size)}
                                    </td>
                                    <td className="px-4 py-3 text-[11px] text-slate-500">
                                        {isFolder ? '-' : formatDate(obj.last_modified)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {!isFolder && (
                                            <Badge variant="outline" className="text-[9px] uppercase font-mono py-0 text-slate-500 border-white/10">
                                                {obj.storage_class}
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                        {!isFolder && (
                                            <Button 
                                                variant="ghost" 
                                                size="icon-xs" 
                                                disabled={isDownloading}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-microtermix-neon"
                                                onClick={() => handleDownload(obj)}
                                            >
                                                {isDownloading ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Download className="w-3 h-3" />
                                                )}
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {(loading && objects.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                        <RefreshCw className="w-8 h-8 animate-spin opacity-20" />
                        <p className="text-xs animate-pulse">Cargando archivos...</p>
                    </div>
                )}

                {filteredObjects.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500 italic">
                        <File className="w-12 h-12 mb-4 opacity-20" />
                        No hay archivos en esta ruta.
                    </div>
                )}
            </div>
        </div>
    );
}
