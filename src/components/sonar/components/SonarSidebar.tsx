import React from 'react';
import { LayoutDashboard, Settings } from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../../lib/utils';

interface SonarSidebarProps {
    projects: any[];
    selectedPath: string;
    onSelectPath: (path: string) => void;
    onOpenSettings: () => void;
}

export const SonarSidebar: React.FC<SonarSidebarProps> = ({ 
    projects, 
    selectedPath, 
    onSelectPath, 
    onOpenSettings 
}) => {
    return (
        <div className="w-56 shrink-0 border-r border-white/5 flex flex-col bg-[#05070a]/50">
            <div className="p-4 border-b border-white/5">
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] text-left">Navegación</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {['dashboard', 'config'].map(id => (
                    <div key={id} onClick={() => onSelectPath(id)} className={cn(
                        "group px-4 py-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 border",
                        selectedPath === id ? "bg-blue-600/10 border-blue-500/30 text-blue-400 shadow-sm" : "border-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300"
                    )}>
                        <div className="flex items-center gap-3">
                            {id === 'dashboard' ? <LayoutDashboard size={14} /> : <Settings size={14} />}
                            <span className="text-[10px] font-black uppercase tracking-widest leading-none">{id === 'dashboard' ? 'General' : 'Cuentas'}</span>
                        </div>
                    </div>
                ))}
                <div className="h-px bg-white/5 my-3 mx-2" />
                <p className="text-[9px] font-black text-slate-700 uppercase tracking-[0.2em] px-4 mb-2 text-left">Proyectos Locales</p>
                {projects.map((p) => (
                    <div key={p.path} onClick={() => onSelectPath(p.path)} className={cn(
                        "group flex items-center justify-between px-4 py-2 rounded-lg cursor-pointer transition-all border",
                        selectedPath === p.path ? "bg-blue-600/5 border-blue-500/20 text-blue-400" : "border-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300"
                    )}>
                        <span className="text-[10px] font-bold truncate flex-1 text-left uppercase tracking-tight">{p.name}</span>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={e => { e.stopPropagation(); onOpenSettings(); }} 
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-all active:scale-90"
                        >
                            <Settings size={12} />
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
};
