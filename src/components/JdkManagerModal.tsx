import React, { useState, useEffect } from 'react';
import { useToolStore } from '../stores/toolStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Download, Loader2, Cpu, HardDrive, Check } from 'lucide-react';
import { Badge } from './ui/badge';

interface JdkManagerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectPath?: string;
}

const AVAILABLE_VERSIONS = [8, 11, 17, 21];

export const JdkManagerModal: React.FC<JdkManagerModalProps> = ({ open, onOpenChange, projectPath }) => {
    const {
        jdks, downloading, error, fetchJdks, downloadJdk,
        projectJdks, setProjectJdk
    } = useToolStore();
    const [selectedVersion, setSelectedVersion] = useState<number>(17);

    useEffect(() => {
        if (open) fetchJdks();
    }, [open, fetchJdks]);

    const handleDownload = async () => {
        await downloadJdk(selectedVersion);
    };

    const currentJdkPath = projectPath ? projectJdks[projectPath] : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-slate-900 border-slate-700">
                <DialogHeader>
                    <DialogTitle className="text-slate-100 flex items-center gap-2">
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
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {jdks.length === 0 && !downloading ? (
                                <p className="text-[11px] text-slate-600 italic py-2">No hay JDKs descargados aún.</p>
                            ) : (
                                <>
                                    {jdks.map(jdk => {
                                        const isSelected = currentJdkPath === jdk.path;
                                        return (
                                            <div key={jdk.path} className={`flex items-center justify-between p-2 rounded-lg bg-slate-950 border transition-colors ${isSelected ? 'border-microtermix-neon/50 bg-microtermix-neon/5' : 'border-slate-800'}`}>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-xs font-bold text-slate-200 truncate">{jdk.name}</span>
                                                    <span className="text-[9px] text-slate-500 font-mono truncate">{jdk.version}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {projectPath && (
                                                        <Button
                                                            size="sm"
                                                            variant={isSelected ? "default" : "outline"}
                                                            className={`h-7 px-2 text-[10px] gap-1 ${isSelected ? 'bg-microtermix-neon text-slate-950 hover:bg-microtermix-neon' : 'text-slate-400 border-slate-700 hover:border-microtermix-neon hover:text-microtermix-neon'}`}
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
                                                <span className="text-xs font-bold text-microtermix-neon">JDK {selectedVersion}</span>
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
                    <div className="space-y-3 p-4 rounded-xl bg-slate-950 border border-slate-800/50 shadow-inner">
                        <h4 className="text-xs font-bold text-slate-300">Descargar Nueva Versión</h4>
                        <div className="flex flex-wrap gap-2">
                            {AVAILABLE_VERSIONS.map(v => (
                                <button
                                    key={v}
                                    onClick={() => setSelectedVersion(v)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${selectedVersion === v
                                            ? 'bg-microtermix-neon/20 border-microtermix-neon text-microtermix-neon shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                                            : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'
                                        }`}
                                >
                                    JDK {v}
                                </button>
                            ))}
                        </div>

                        {error && <p className="text-[10px] text-red-400 bg-red-400/10 p-2 rounded border border-red-400/20">{error}</p>}

                        <Button
                            className="w-full bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/80 font-bold gap-2 mt-2 h-9"
                            disabled={downloading}
                            onClick={handleDownload}
                        >
                            {downloading ? (
                                <><Loader2 size={14} className="animate-spin" /> Descargando...</>
                            ) : (
                                <><Download size={14} /> Descargar Java {selectedVersion}</>
                            )}
                        </Button>
                        <p className="text-[9px] text-center text-slate-600">Binarios proporcionados por Adoptium (Eclipse Temurin).</p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-white">
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
