import {
    LayoutDashboard, CheckCircle2, XCircle, AlertCircle,
    ChevronRight, ShieldCheck, Bug, ShieldAlert, FileSearch, RefreshCw
} from 'lucide-react';
import { useSonarStore } from '@/stores/sonarStore';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useSonarMetrics } from '@/hooks/queries/useSonarQueries';
import { cn } from '@/lib/utils';

interface ProjectItem {
    path: string;
    name: string;
}

interface SonarDashboardProps {
    projects: ProjectItem[];
    onSelectProject: (path: string) => void;
}

const ProjectCard: React.FC<{ project: ProjectItem; onSelect: (path: string) => void }> = ({ project, onSelect }) => {
    const { projectLinks } = useSonarStore();
    const link = projectLinks[project.path] || {};
    const projectKey = link.projectKey || project.name;

    // Pass both path and key to resolve the correct account
    const { data: metrics, isLoading } = useSonarMetrics(project.path, projectKey);

    return (
        <Card
            onClick={() => onSelect(project.path)}
            className="group relative bg-card border-border hover:border-blue-500/50 hover:bg-card/80 transition-all cursor-pointer shadow-none overflow-hidden"
        >
            <CardHeader className="p-5 pb-3 flex flex-row items-start justify-between space-y-0">
                <div className="min-w-0">
                    <CardTitle className="text-xs font-black text-foreground truncate group-hover:text-blue-400 transition-colors uppercase tracking-tight">
                        {project.name}
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{projectKey}</p>
                </div>
                {isLoading ? (
                    <RefreshCw size={14} className="text-muted-foreground animate-spin" />
                ) : metrics ? (
                    <div className={metrics.qualityGate === 'OK' ? 'text-microtermix-success' : 'text-microtermix-danger'}>
                        {metrics.qualityGate === 'OK' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    </div>
                ) : (
                    <AlertCircle size={18} className="text-muted-foreground" />
                )}
            </CardHeader>

            <CardContent className="p-5 pt-0">
                {metrics ? (
                    <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                            <span className="text-[8px] font-black text-slate-600 uppercase">Bugs</span>
                            <div className="flex items-center gap-1.5">
                                <span className={cn("text-sm font-bold", metrics.bugs > 0 ? "text-red-400" : "text-foreground")}>{metrics.bugs}</span>
                                <Badge variant="outline" className={cn(
                                    "text-[9px] h-4 px-1 font-black",
                                    metrics.reliability === 'A' ? "text-emerald-500 border-emerald-900/50" : "text-red-400 border-red-900/50"
                                )}>{metrics.reliability}</Badge>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[8px] font-black text-slate-600 uppercase">Vuln</span>
                            <div className="flex items-center gap-1.5">
                                <span className={cn("text-sm font-bold", metrics.vulnerabilities > 0 ? "text-yellow-400" : "text-foreground")}>{metrics.vulnerabilities}</span>
                                <Badge variant="outline" className={cn(
                                    "text-[9px] h-4 px-1 font-black",
                                    metrics.security === 'A' ? "text-emerald-500 border-emerald-900/50" : "text-yellow-400 border-yellow-900/50"
                                )}>{metrics.security}</Badge>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[8px] font-black text-slate-600 uppercase">Smells</span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-foreground">{metrics.codeSmells}</span>
                                <Badge variant="outline" className={cn(
                                    "text-[9px] h-4 px-1 font-black",
                                    metrics.maintainability === 'A' ? "text-emerald-500 border-emerald-900/50" : "text-blue-400 border-blue-900/50"
                                )}>{metrics.maintainability}</Badge>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-[38px] flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/20">
                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest italic">{isLoading ? 'Cargando...' : 'Sin Datos'}</span>
                    </div>
                )}
            </CardContent>

            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronRight size={14} className="text-blue-500" />
            </div>
        </Card>
    );
};

export const SonarDashboard: React.FC<SonarDashboardProps> = ({ projects, onSelectProject }) => {
    return (
        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar bg-background">
            {/* Hero Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-black text-foreground tracking-tight uppercase flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                            <LayoutDashboard className="text-blue-500" size={32} />
                        </div>
                        Sonar Overview
                    </h2>
                    <p className="text-muted-foreground mt-2 font-medium italic text-sm">Estado de calidad y seguridad de todo el workspace</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="px-5 py-2.5 bg-card border border-border rounded-2xl shadow-2xl flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-xs font-black text-foreground uppercase tracking-widest">{projects.length} Proyectos Activos</span>
                    </div>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <StatCard label="Reliability" icon={Bug} color="text-red-400" value="Health Check" />
                <StatCard label="Security" icon={ShieldAlert} color="text-yellow-400" value="Risk Level" />
                <StatCard label="Maintainability" icon={FileSearch} color="text-blue-400" value="Debt Ratio" />
                <StatCard label="Protection" icon={ShieldCheck} color="text-emerald-400" value="Quality Gates" />
            </div>

            {/* Projects Grid */}
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.3em] whitespace-nowrap">Project Breakdown</h3>
                    <div className="h-px w-full bg-border" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {projects.map(p => (
                        <ProjectCard key={p.path} project={p} onSelect={onSelectProject} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const StatCard: React.FC<{ label: string; icon: React.ElementType; color: string; value: string }> = ({ label, icon: Icon, color, value }) => (
    <Card className="bg-card border-border p-5 flex items-center gap-4 shadow-none">
        <div className={cn("p-3 rounded-2xl bg-background border border-border shadow-inner", color)}>
            <Icon size={24} />
        </div>
        <div>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-0.5">{label}</p>
            <p className="text-sm font-black text-foreground tracking-tight">{value}</p>
        </div>
    </Card>
);
