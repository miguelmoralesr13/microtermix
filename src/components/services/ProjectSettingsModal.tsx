import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { PackageExplorer } from './PackageExplorer';
import { Project } from '../../context/WorkspaceContext';
import { Settings, Package, Zap, X, Layers } from 'lucide-react';
import { Button } from '../ui/button';
import { ViteWrapperTab } from './ViteWrapperTab';
import { EnvManager } from '../project/EnvManager';

interface ProjectSettingsModalProps {
    project: Project | null;
    open: boolean;
    defaultTab?: string;
    onOpenChange: (open: boolean) => void;
    onPlayScript: (script: string) => void; // usado por PackageExplorer para instalar deps
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
    project,
    open,
    defaultTab = 'envs',
    onOpenChange,
    onPlayScript
}) => {
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [hasViteConfig, setHasViteConfig] = useState(false);
    const lastCheckedPath = useRef<string | null>(null);

    useEffect(() => {
        if (open) setActiveTab(defaultTab);
    }, [open, defaultTab]);

    useEffect(() => {
        if (!open || !project?.path) {
            setHasViteConfig(false);
            lastCheckedPath.current = null;
            return;
        }
        const path = String(project.path);
        if (lastCheckedPath.current === path) return; // ya chequeado, no rellamar
        lastCheckedPath.current = path;
        invoke<boolean>('has_vite_config', { projectPath: path })
            .then(has => setHasViteConfig(!!has))
            .catch(() => setHasViteConfig(false));
    }, [open, project?.path]);

    if (!project) return null;

    const projectPath = String(project.path || '');
    const rawType = String(project.project_type || '').toLowerCase().trim();
    
    // Normalización para el PackageExplorer
    const isJava = rawType.includes('java') || rawType.includes('maven') || rawType.includes('gradle');
    const isNode = rawType.includes('node') || rawType.includes('bun') || rawType.includes('javascript') || rawType.includes('typescript');
    const isPython = rawType.includes('python');
    const isRust = rawType.includes('rust') || rawType.includes('cargo');
    const isGo = rawType.includes('go');
    
    const isBun = rawType.includes('bun');
    const isGradle = rawType.includes('gradle');
    const isMaven = rawType.includes('maven');

    const projectType = isJava ? 'java' : isNode ? (isBun ? 'bun' : 'node') : isPython ? 'python' : isRust ? 'rust' : isGo ? 'go' : rawType || 'node';
    const packageManager = isBun ? 'bun' : isGradle ? 'gradle' : isMaven ? 'maven' : isPython ? 'pip' : isRust ? 'cargo' : isGo ? 'go' : 'npm';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[90vw] max-w-[90vw] sm:max-w-[90vw] h-[85vh] flex flex-col p-0 bg-slate-900/95 backdrop-blur-md border-slate-800 shadow-2xl overflow-hidden rounded-2xl" showCloseButton={false}>
                {/* Header con diseño más integrado */}
                <DialogHeader className="p-5 border-b border-slate-800/50 flex flex-row items-center justify-between bg-white/5 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-microtermix-neon/15 rounded-xl shadow-[0_0_15px_rgba(74,222,128,0.1)]">
                            <Settings className="text-microtermix-neon" size={20} />
                        </div>
                        <div>
                            <DialogTitle className="text-slate-100 text-base font-black uppercase tracking-widest leading-none">
                                Ajustes de Proyecto
                            </DialogTitle>
                            <p className="text-[10px] text-slate-400 font-mono mt-1.5 flex items-center gap-2">
                                <span className="text-microtermix-neon font-bold">{project.name}</span> 
                                <span className="opacity-30">|</span> 
                                <span className="opacity-60">{projectPath}</span>
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} className="text-slate-500 hover:text-white hover:bg-white/10 transition-colors rounded-full">
                        <X size={20} />
                    </Button>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 gap-0!">
                    {/* Barra de Pestañas con estilo Shadcn Line */}
                    <div className="px-6 bg-black/20 border-b border-slate-800/50">
                        <TabsList variant="line" className="bg-transparent border-none gap-10 h-14 p-0">
                            <TabsTrigger
                                value="envs"
                                className="data-active:text-microtermix-neon data-active:after:bg-microtermix-neon border-none rounded-none h-14 px-1 text-[11px] font-black uppercase tracking-[0.15em] transition-all bg-transparent shadow-none!"
                            >
                                <Zap size={14} className="mr-2" /> Environments
                            </TabsTrigger>
                            <TabsTrigger
                                value="deps"
                                className="data-active:text-microtermix-neon data-active:after:bg-microtermix-neon border-none rounded-none h-14 px-1 text-[11px] font-black uppercase tracking-[0.15em] transition-all bg-transparent shadow-none!"
                            >
                                <Package size={14} className="mr-2" /> Dependencies
                            </TabsTrigger>
                            {hasViteConfig && (
                                <TabsTrigger
                                    value="vite"
                                    className="data-active:text-microtermix-neon data-active:after:bg-microtermix-neon border-none rounded-none h-14 px-1 text-[11px] font-black uppercase tracking-[0.15em] transition-all bg-transparent shadow-none!"
                                >
                                    <Layers size={14} className="mr-2" /> Vite Wrapper
                                </TabsTrigger>
                            )}
                        </TabsList>
                    </div>

                    {/* Contenido Dinámico */}
                    <div className="flex-1 overflow-hidden relative bg-slate-950/20">
                        <TabsContent value="envs" className="m-0 h-full overflow-hidden outline-none">
                            <EnvManager projectPath={projectPath} onClose={() => onOpenChange(false)} embedded />
                        </TabsContent>

                        <TabsContent value="vite" className="m-0 h-full overflow-hidden outline-none">
                            <ViteWrapperTab projectPath={projectPath} />
                        </TabsContent>

                        <TabsContent value="deps" className="m-0 h-full overflow-hidden outline-none">
                            <PackageExplorer
                                projectPath={projectPath}
                                projectType={projectType}
                                packageManager={packageManager}
                                onInstall={(pkg, isDev, version) => {
                                    let manager = 'npm install';
                                    let flag = isDev ? '--save-dev' : '';
                                    if (isBun) { manager = 'bun add'; flag = isDev ? '-d' : ''; }
                                    else if (isRust) { manager = 'cargo add'; flag = ''; }
                                    else if (isPython) { manager = 'pip install'; flag = ''; }
                                    else if (isGo) { manager = 'go get'; flag = ''; }
                                    onPlayScript(`${manager} ${pkg}${version ? `@${version}` : ''} ${flag}`.trim());
                                    onOpenChange(false);
                                }}
                            />
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
