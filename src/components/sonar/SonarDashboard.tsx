import React from 'react';
import { 
    LayoutDashboard, CheckCircle2, XCircle, AlertCircle, 
    ChevronRight, Activity, ShieldCheck, Bug, ShieldAlert, FileSearch, RefreshCw
} from 'lucide-react';
import { useSonarStore } from '../../stores/sonarStore';
import { Badge } from '../ui/badge';
import { useSonarMetrics } from '../../hooks/queries/useSonarQueries';

interface SonarDashboardProps {
    projects: any[];
    onSelectProject: (path: string) => void;
}

const ProjectCard: React.FC<{ project: any; onSelect: (path: string) => void }> = ({ project, onSelect }) => {
    const { projectLinks } = useSonarStore();
    const link = projectLinks[project.path] || {};
    const projectKey = link.projectKey || project.name;
    
    const { data: metrics, isLoading } = useSonarMetrics(projectKey);

    return (
        <div 
            onClick={() => onSelect(project.path)}
            className="group relative bg-slate-900/40 border border-slate-800 rounded-2xl p-5 hover:border-blue-500/50 hover:bg-slate-900/60 transition-all cursor-pointer shadow-lg hover:shadow-blue-500/10"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-200 truncate group-hover:text-blue-400 transition-colors uppercase tracking-tight">{project.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono truncate">{projectKey}</p>
                </div>
                {isLoading ? (
                    <RefreshCw size={14} className="text-slate-700 animate-spin" />
                ) : metrics ? (
                    <div className={metrics.qualityGate === 'OK' ? 'text-microtermix-success' : 'text-microtermix-danger'}>
                        {metrics.qualityGate === 'OK' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    </div>
                ) : (
                    <AlertCircle size={18} className="text-slate-700" />
                )}
            </div>

            {metrics ? (
                <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-600 uppercase">Bugs</span>
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-slate-300">{metrics.bugs}</span>
                            <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${metrics.reliability === 'A' ? 'text-emerald-500 border-emerald-900/50' : 'text-amber-500 border-amber-900/50'}`}>{metrics.reliability}</Badge>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-600 uppercase">Vuln</span>
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-slate-300">{metrics.vulnerabilities}</span>
                            <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${metrics.security === 'A' ? 'text-emerald-500 border-emerald-900/50' : 'text-amber-500 border-amber-900/50'}`}>{metrics.security}</Badge>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-600 uppercase">Smells</span>
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-slate-300">{metrics.codeSmells}</span>
                            <Badge variant="outline" className={`text-[8px] h-3.5 px-1 ${metrics.maintainability === 'A' ? 'text-emerald-500 border-emerald-900/50' : 'text-amber-500 border-amber-900/50'}`}>{metrics.maintainability}</Badge>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-[34px] flex items-center justify-center border border-dashed border-slate-800 rounded-lg">
                    <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest italic">{isLoading ? 'Cargando...' : 'Sin Datos'}</span>
                </div>
            )}

            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={14} className="text-blue-500" />
            </div>
        </div>
    );
};

export const SonarDashboard: React.FC<SonarDashboardProps> = ({ projects, onSelectProject }) => {
    return (
        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar bg-slate-950/20">
            {/* Hero Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight uppercase flex items-center gap-3">
                        <LayoutDashboard className="text-blue-500" size={32} />
                        Sonar Overview
                    </h2>
                    <p className="text-slate-500 mt-1 font-medium italic">Estado de calidad de todo el workspace</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
                        <div className="flex items-center gap-2">
                            <Activity size={14} className="text-blue-400" />
                            <span className="text-xs font-black text-slate-300 uppercase tracking-widest">{projects.length} Proyectos Analizados</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Reliability" icon={Bug} color="text-red-400" value="Bugs" />
                <StatCard label="Security" icon={ShieldAlert} color="text-yellow-400" value="Vuln" />
                <StatCard label="Maintainability" icon={FileSearch} color="text-blue-400" value="Smells" />
                <StatCard label="Health" icon={ShieldCheck} color="text-emerald-400" value="Gate OK" />
            </div>

            {/* Projects Grid */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 text-slate-500">
                    <div className="h-px flex-1 bg-slate-800" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em]">Project Breakdown</span>
                    <div className="h-px flex-1 bg-slate-800" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                    {projects.map(p => (
                        <ProjectCard key={p.path} project={p} onSelect={onSelectProject} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const StatCard: React.FC<{ label: string; icon: React.ElementType; color: string; value: string }> = ({ label, icon: Icon, color, value }) => (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
        <div className={`p-2.5 rounded-xl bg-slate-950 border border-slate-800 ${color}`}>
            <Icon size={20} />
        </div>
        <div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
            <p className="text-sm font-black text-slate-200">{value}</p>
        </div>
    </div>
);
