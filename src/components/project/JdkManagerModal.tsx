import React, { useState } from 'react';
import { useToolStore } from '../../stores/toolStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Download, Loader2, Cpu, HardDrive, Check } from 'lucide-react';
import { Badge } from '../ui/badge';
import { useJdks, useDownloadJdk } from '../../hooks/queries/useToolQueries';

interface JdkManagerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectPath?: string;
}

const AVAILABLE_VERSIONS = [8, 11, 17, 21];

export const JdkManagerModal: React.FC<JdkManagerModalProps> = ({ open, onOpenChange, projectPath }) => {
    const { projectJdks, setProjectJdk } = useToolStore();
    const { data: jdks = [], isLoading: loadingJdks } = useJdks();
    const downloadMutation = useDownloadJdk();
    
    const [selectedVersion, setSelectedVersion] = useState<number>(17);

    const handleDownload = async () => {
        await downloadMutation.mutateAsync(selectedVersion);
    };

    const currentJdkPath = projectPath ? projectJdks[projectPath] : null;
    const downloading = downloadMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-slate-900 border-slate-700 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-slate-100 flex items-center gap-2 font-black uppercase tracking-tight">
                        <Cpu size={18} className="text-microtermix-neon" />
                        Gestor de Java (JDK)
                    </DialogTitle>
                    <p className="text-xs text-slate-500 mt-1">Descarga y gestiona versiones locales de Java para tus proyectos.</p>
                </DialogHeader>

                <div className="space-y-6 my-4">
                    {/* Installed JDKs */}
                    <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <HardDrive size={12} /> Instalados Localmente
                        </h4>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                            {(loadingJdks && jdks.length === 0) ? (
                                <div className="flex items-center justify-center py-8 gap-2 text-slate-600">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span className="text-xs">Buscando JDKs locales...</span>
                                </div>
                            ) : jdks.length === 0 && !downloading ? (
                                <p className="text-[11px] text-slate-600 italic py-2">No hay JDKs descargados aún.</p>
                            ) : (
                                <>
                                    {jdks.map(jdk => {
                                        const isSelected = currentJdkPath === jdk.path;
                                        return (
                                            <div key={jdk.path} className={`flex items-center justify-between p-2 rounded-lg bg-slate-950 border transition-all ${isSelected ? 'border-microtermix-neon/50 bg-microtermix-neon/5' : 'border-slate-800 hover:border-slate-700'}`}>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-xs font-bold text-slate-200 truncate">{jdk.name}</span>
                                                    <span className="text-[9px] text-slate-500 font-mono truncate">{jdk.version}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {projectPath && (
                                                        <Button
                                                            size="sm"
                                                            variant={isSelected ? "default" : "outline"}
                                                            className={`h-7 px-3 text-[10px] gap-1 font-bold ${isSelected ? 'bg-microtermix-neon text-slate-950 hover:bg-microtermix-neon' : 'text-slate-400 border-slate-700 hover:border-microtermix-neon hover:text-microtermix-neon'}`}
                                                            onClick={() => setProjectJdk(projectPath, isSelected ? null : jdk.path)}
                                                        >
                                                            {isSelected ? <><Check size={10} /> Seleccionado</> : 'Seleccionar'}
                                                        </Button>
                                                    )}
                                                    {!projectPath && (
                                                        <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
                                                            Listo
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {downloading && (
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/50 border border-microtermix-neon/30 animate-pulse">
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-bold text-microtermix-neon uppercase">JDK {selectedVersion}</span>
                                                <span className="text-[9px] text-slate-500 font-mono">Descargando y extrayendo...</span>
                                            </div>
                                            <Loader2 size={14} className="text-microtermix-neon animate-spin" />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Download Section */}
                    <div className="space-y-3 p-5 rounded-[2rem] bg-slate-950 border border-slate-800 shadow-inner">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Descargar Nueva Versión</h4>
                        <div className="flex justify-center gap-2">
                            {AVAILABLE_VERSIONS.map(v => (
                                <button
                                    key={v}
                                    onClick={() => setSelectedVersion(v)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${selectedVersion === v
                                            ? 'bg-microtermix-neon/20 border-microtermix-neon text-microtermix-neon shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                                            : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                                        }`}
                                >
                                    JDK {v}
                                </button>
                            ))}
                        </div>

                        {downloadMutation.error && (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono leading-snug">
                                <span className="font-bold">ERROR:</span> {String(downloadMutation.error)}
                            </div>
                        )}

                        <Button
                            className="w-full bg-microtermix-neon text-slate-950 hover:bg-microtermix-neon/90 font-black uppercase tracking-widest gap-2 mt-2 h-11 rounded-2xl shadow-lg shadow-microtermix-neon/10"
                            disabled={downloading}
                            onClick={handleDownload}
                        >
                            {downloading ? (
                                <><Loader2 size={16} className="animate-spin" /> Descargando...</>
                            ) : (
                                <><Download size={16} /> Descargar Java {selectedVersion}</>
                            )}
                        </Button>
                        <p className="text-[9px] text-center text-slate-600 font-bold uppercase tracking-tighter">Adoptium (Eclipse Temurin) Binaries</p>
                    </div>
                </div>

                <DialogFooter className="p-0 sm:justify-center border-t border-slate-800/50 pt-4">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-500 hover:text-white font-bold uppercase text-[10px] tracking-widest">
                        Cerrar panel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
