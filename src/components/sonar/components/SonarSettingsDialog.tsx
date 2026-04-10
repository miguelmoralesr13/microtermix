import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Plus, Trash2, Save, FileInput, AlertCircle, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Checkbox } from '../../ui/Checkbox';
import { parseProperties, stringifyProperties, SonarProperties } from '../../../utils/propertiesUtils';
import { cn } from '../../../lib/utils';

interface SonarSettingsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    link: any;
    onLinkChange: (patch: any) => void;
    projectPath: string;
    projectName: string;
}

export const SonarSettingsDialog: React.FC<SonarSettingsDialogProps> = ({ 
    isOpen, 
    onOpenChange, 
    link, 
    onLinkChange,
    projectPath,
    projectName
}) => {
    const [properties, setProperties] = useState<SonarProperties>({});
    const [isLoading, setIsLoading] = useState(false);
    const [fileName, setFileName] = useState(link.propertiesFileName || 'sonar-project.properties');
    const [fileStatus, setFileStatus] = useState<'none' | 'loaded' | 'error'>('none');
    
    // Use ref to avoid reload loops
    const lastLoadedPath = useRef<string | null>(null);

    const loadProperties = useCallback(async (forcedName?: string) => {
        if (!projectPath || !isOpen) return;
        
        const targetFile = forcedName || fileName;
        const fullPath = `${projectPath}/${targetFile}`;
        
        setIsLoading(true);
        try {
            const content = await invoke('read_text_file', { path: fullPath }) as string;
            const parsed = parseProperties(content);
            
            setProperties(parsed);
            setFileStatus('loaded');
            lastLoadedPath.current = fullPath;
            
            // Sync key fields to store if they are in the file
            const patch: any = { propertiesFileName: targetFile };
            if (parsed['sonar.projectKey']) patch.projectKey = parsed['sonar.projectKey'];
            if (parsed['sonar.sources']) patch.sources = parsed['sonar.sources'];
            onLinkChange(patch);
            
        } catch (error) {
            console.warn("Sonar properties load failed:", error);
            setFileStatus('error');
            
            // If file missing, initialize with defaults but don't clear everything if we have some state
            setProperties(prev => ({
                'sonar.projectKey': link.projectKey || projectName || '',
                'sonar.projectName': projectName || '',
                'sonar.projectVersion': '1.0',
                'sonar.sources': link.sources || 'src',
                'sonar.sourceEncoding': 'UTF-8',
                ...prev,
                ...Object.keys(prev).length === 0 ? {} : prev
            }));
        } finally {
            setIsLoading(false);
        }
    }, [projectPath, fileName, isOpen, projectName, link.projectKey, link.sources, onLinkChange]);

    // Initial load when dialog opens or project changes
    useEffect(() => {
        if (isOpen && projectPath) {
            const currentFileName = link.propertiesFileName || 'sonar-project.properties';
            setFileName(currentFileName);
            loadProperties(currentFileName);
        }
    }, [isOpen, projectPath, link.propertiesFileName]); // Removed loadProperties from deps to avoid loops

    const saveProperties = async () => {
        if (!projectPath) return;

        setIsLoading(true);
        try {
            const fullPath = `${projectPath}/${fileName}`;
            const content = stringifyProperties(properties);
            await invoke('write_file', { path: fullPath, content });
            
            onLinkChange({ 
                propertiesFileName: fileName,
                projectKey: properties['sonar.projectKey'] || link.projectKey,
                sources: properties['sonar.sources'] || link.sources
            });
            
            setFileStatus('loaded');
            toast.success("Propiedades guardadas y sincronizadas.");
        } catch (error) {
            toast.error(`Error al guardar: ${error}`);
        } finally {
            setIsLoading(false);
        }
    };

    const updateProperty = (key: string, value: string) => {
        setProperties(prev => ({ ...prev, [key]: value }));
    };

    const removeProperty = (key: string) => {
        setProperties(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const addProperty = () => {
        const key = `sonar.custom.${Math.random().toString(36).substring(7)}`;
        updateProperty(key, '');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-slate-950 border-white/10 p-0 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b border-white/5 bg-slate-900/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
                                <Settings size={20} />
                            </div>
                            <div className="text-left">
                                <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">Sonar Properties Configuration</DialogTitle>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Project: {projectName}</p>
                            </div>
                        </div>
                        <div className={cn(
                            "px-3 py-1 rounded-full border text-[8px] font-black uppercase tracking-tighter flex items-center gap-1.5",
                            fileStatus === 'loaded' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                            fileStatus === 'error' ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                            "bg-slate-500/10 border-white/5 text-slate-500"
                        )}>
                            {fileStatus === 'loaded' ? 'File Linked' : fileStatus === 'error' ? 'No File Found' : 'Not Sync'}
                        </div>
                    </div>
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-[#020617]">
                    {/* File Settings */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Properties File Setup</Label>
                            <div className="flex items-center gap-3 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-white/5">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Auto-Sync</span>
                                <Checkbox 
                                    checked={link.autoSync || false} 
                                    onChange={e => onLinkChange({ autoSync: e.target.checked })} 
                                />
                            </div>
                        </div>
                        
                        <div className="flex gap-3">
                            <div className="flex-1 relative">
                                <Input 
                                    value={fileName} 
                                    onChange={e => setFileName(e.target.value)} 
                                    placeholder="sonar-project.properties"
                                    className="h-10 bg-black/40 border-slate-800 rounded-xl text-xs font-mono pl-4" 
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-mono text-slate-700 pointer-events-none uppercase">.properties</div>
                            </div>
                            <Button 
                                variant="outline" 
                                onClick={() => loadProperties()} 
                                disabled={isLoading}
                                className="h-10 border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold gap-2 px-4 rounded-xl transition-all"
                            >
                                <RefreshCw size={14} className={cn(isLoading && "animate-spin")} />
                                Reload
                            </Button>
                        </div>
                        {fileStatus === 'error' && (
                            <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl flex items-start gap-3">
                                <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-amber-500/80 leading-relaxed italic">
                                    No se encontró el archivo "{fileName}" en la raíz del proyecto. Se usarán valores predeterminados. Se creará al guardar.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Form Sections */}
                    <div className="space-y-6 pt-2">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2 text-left">
                                <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Project Key</Label>
                                <Input 
                                    value={properties['sonar.projectKey'] || ''} 
                                    onChange={e => updateProperty('sonar.projectKey', e.target.value)} 
                                    className="h-10 bg-black/60 border-slate-800 rounded-xl text-xs font-mono focus:ring-1 focus:ring-blue-500/50" 
                                />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Project Name</Label>
                                <Input 
                                    value={properties['sonar.projectName'] || ''} 
                                    onChange={e => updateProperty('sonar.projectName', e.target.value)} 
                                    className="h-10 bg-black/60 border-slate-800 rounded-xl text-xs font-mono" 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2 text-left">
                                <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Sources</Label>
                                <Input 
                                    value={properties['sonar.sources'] || ''} 
                                    onChange={e => updateProperty('sonar.sources', e.target.value)} 
                                    className="h-10 bg-black/60 border-slate-800 rounded-xl text-xs font-mono" 
                                />
                            </div>
                            <div className="space-y-2 text-left">
                                <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Encoding</Label>
                                <Input 
                                    value={properties['sonar.sourceEncoding'] || 'UTF-8'} 
                                    onChange={e => updateProperty('sonar.sourceEncoding', e.target.value)} 
                                    className="h-10 bg-black/60 border-slate-800 rounded-xl text-xs font-mono" 
                                />
                            </div>
                        </div>

                        <div className="space-y-2 text-left">
                            <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Exclusions (Comma Separated)</Label>
                            <Input 
                                value={properties['sonar.exclusions'] || ''} 
                                onChange={e => updateProperty('sonar.exclusions', e.target.value)} 
                                placeholder="src/main.ts, node_modules/**"
                                className="h-10 bg-black/60 border-slate-800 rounded-xl text-xs font-mono" 
                            />
                        </div>

                        {/* Host & Token Special Fields (Often defined in file for CI) */}
                        <div className="grid grid-cols-1 gap-4 pt-2">
                             <div className="space-y-2 text-left">
                                <Label className="text-[9px] text-slate-500 uppercase font-black tracking-widest ml-1">Host URL (Optional override)</Label>
                                <Input 
                                    value={properties['sonar.host.url'] || ''} 
                                    onChange={e => updateProperty('sonar.host.url', e.target.value)} 
                                    placeholder="http://sonar.mycompany.com"
                                    className="h-10 bg-black/60 border-slate-800 rounded-xl text-xs font-mono" 
                                />
                            </div>
                        </div>
                    </div>

                    {/* Custom Properties */}
                    <div className="space-y-4 pt-4">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Custom Scan Properties</h4>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={addProperty} 
                                className="h-7 text-[8px] font-black uppercase tracking-widest gap-1.5 hover:bg-blue-500/10 hover:text-blue-400 text-slate-500 border border-transparent hover:border-blue-500/20 rounded-lg"
                            >
                                <Plus size={12} /> Add Property
                            </Button>
                        </div>
                        
                        <div className="space-y-3">
                            {Object.entries(properties)
                                .filter(([k]) => !['sonar.projectKey', 'sonar.projectName', 'sonar.sources', 'sonar.sourceEncoding', 'sonar.exclusions', 'sonar.host.url'].includes(k))
                                .map(([k, v]) => (
                                    <div key={k} className="flex gap-3 items-end group animate-in slide-in-from-left-2 duration-200">
                                        <div className="flex-1 space-y-1.5 text-left">
                                            <Input 
                                                value={k} 
                                                onChange={e => {
                                                    const nextProps = { ...properties };
                                                    delete nextProps[k];
                                                    nextProps[e.target.value] = v;
                                                    setProperties(nextProps);
                                                }}
                                                className="h-8 bg-transparent border-transparent hover:border-white/10 rounded-lg text-[10px] font-mono text-slate-500 focus:text-blue-400 transition-colors" 
                                            />
                                        </div>
                                        <div className="flex-[1.5] space-y-1.5 text-left">
                                            <Input 
                                                value={v} 
                                                onChange={e => updateProperty(k, e.target.value)} 
                                                className="h-8 bg-black/40 border-slate-800/50 rounded-lg text-[10px] font-mono text-slate-300" 
                                            />
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => removeProperty(k)} 
                                            className="h-8 w-8 text-slate-700 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>
                                ))}
                            
                            {Object.entries(properties).filter(([k]) => !['sonar.projectKey', 'sonar.projectName', 'sonar.sources', 'sonar.sourceEncoding', 'sonar.exclusions', 'sonar.host.url'].includes(k)).length === 0 && (
                                <div className="text-center py-10 border border-dashed border-white/5 rounded-2xl">
                                    <p className="text-[9px] text-slate-700 uppercase font-black tracking-[0.2em]">No extra properties defined</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-6 border-t border-white/5 bg-slate-900/50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[8px] font-mono text-slate-600 uppercase tracking-widest italic">
                        <FileInput size={12} className="opacity-50" />
                        Path: {fileName}
                    </div>
                    <div className="flex gap-3">
                        <Button 
                            variant="ghost" 
                            onClick={() => onOpenChange(false)} 
                            className="text-[9px] font-black uppercase tracking-widest text-slate-500 h-10 px-6 rounded-xl hover:bg-white/5"
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={saveProperties}
                            disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-black px-8 h-10 rounded-xl uppercase tracking-widest text-[10px] shadow-lg shadow-blue-500/20 ring-1 ring-white/10 gap-3"
                        >
                            <Save size={16} className={cn(isLoading && "animate-spin")} />
                            Save Configuration
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
