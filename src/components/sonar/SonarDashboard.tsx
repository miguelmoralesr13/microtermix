import React, { useState, useMemo } from 'react';
import { useSonarStore } from '../../stores/sonarStore';
import { Project } from '../../context/WorkspaceContext';
import { fetchProjectMetrics } from '../../utils/sonarUtils';
import { RefreshCw, LayoutDashboard, Bug, ShieldAlert, ShieldCheck, AlertCircle, FileSearch, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SonarDashboardProps {
    projects: Project[];
    onSelectProject: (path: string) => void;
}

export const SonarDashboard: React.FC<SonarDashboardProps> = ({ projects, onSelectProject }) => {
    const { config: sonarConfig, projectLinks, metricsCache, setMetrics } = useSonarStore();
    const [isScanning, setIsScanning] = useState(false);
    const [scanErrors, setScanErrors] = useState<string[]>([]);

    const linkedProjectsSum = Object.keys(projectLinks).filter(p => !!projectLinks[p].projectKey).length;

    // Calculate aggregated metrics
    const { 
        totalBugs, totalVulnerabilities, totalSmells,
        avgCoverage, 
        qgOk, qgError, 
        projectsWithMetrics 
    } = useMemo(() => {
        let bugs = 0, vulns = 0, smells = 0;
        let covSum = 0, dupSum = 0;
        let ok = 0, err = 0;
        let count = 0;

        projects.forEach(p => {
            const path = p.path as string;
            const m = metricsCache[path];
            if (m) {
                count++;
                bugs += m.bugs;
                vulns += m.vulnerabilities;
                smells += m.codeSmells;
                covSum += m.coverage;
                dupSum += m.duplications;
                if (m.qualityGate === 'OK') ok++;
                else if (m.qualityGate === 'ERROR') err++;
            }
        });

        return {
            totalBugs: bugs,
            totalVulnerabilities: vulns,
            totalSmells: smells,
            avgCoverage: count > 0 ? (covSum / count).toFixed(1) : '0.0',
            avgDuplications: count > 0 ? (dupSum / count).toFixed(1) : '0.0',
            qgOk: ok,
            qgError: err,
            projectsWithMetrics: count
        };
    }, [projects, metricsCache]);

    const handleRefreshAll = async () => {
        setIsScanning(true);
        setScanErrors([]);
        const errors: string[] = [];

        for (const p of projects) {
            const path = p.path as string;
            const link = projectLinks[path];
            if (!link || !link.projectKey) continue;

            const effectiveToken = link.token || sonarConfig.token;
            if (!effectiveToken || !sonarConfig.serverUrl) continue;

            try {
                const newMetrics = await fetchProjectMetrics(link.projectKey, sonarConfig, effectiveToken);
                setMetrics(path, newMetrics);
            } catch (e: any) {
                errors.push(`Falló ${p.name}: ${e.message || e}`);
            }
        }
        
        if (errors.length > 0) setScanErrors(errors);
        setIsScanning(false);
    };

    const RatingBadge = ({ rating, type }: { rating: string, type: 'sec' | 'rel' | 'maint' }) => {
        if (!rating || rating === 'N/A') return <span className="text-[10px] text-slate-600 font-bold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">-</span>;
        
        let colorClass = 'bg-microtermix-danger/10 text-microtermix-danger border-microtermix-danger/30';
        if (rating === 'A') colorClass = 'bg-microtermix-success/10 text-microtermix-success border-microtermix-success/30';
        else if (rating === 'B') colorClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
        else if (rating === 'C') colorClass = 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
        else if (rating === 'D') colorClass = 'bg-orange-500/10 text-orange-400 border-orange-500/30';

        return <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded border', colorClass)} title={`${type === 'sec' ? 'Security' : type === 'rel' ? 'Reliability' : 'Maintainability'} Rating`}>{rating}</span>;
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900 overflow-y-auto">
            <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
                {/* Header Sequence */}
                <div className="flex items-end justify-between">
                    <div>
                        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 mb-2">
                            Métricas Globales de SonarQube
                        </h1>
                        <p className="text-slate-400 text-sm">Visión consolidada de calidad, seguridad y fiabilidad del workspace.</p>
                    </div>
                    <Button 
                        onClick={handleRefreshAll} 
                        disabled={isScanning || linkedProjectsSum === 0}
                        className={cn("bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700 font-semibold gap-2 border")}
                    >
                        <RefreshCw size={14} className={isScanning ? "animate-spin" : ""} /> 
                        {isScanning ? 'Actualizando Servidor...' : 'Refrescar Todo el Workspace'}
                    </Button>
                </div>

                {scanErrors.length > 0 && (
                    <div className="bg-microtermix-danger/10 border border-microtermix-danger/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertCircle size={16} className="text-microtermix-danger" />
                            <h4 className="text-xs font-bold text-microtermix-danger">Atención: Hubo errores al sincronizar</h4>
                        </div>
                        <ul className="text-[10px] space-y-1 text-slate-400 list-disc ml-6">
                            {scanErrors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                    </div>
                )}

                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Target size={48} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Quality Gate</p>
                        <div className="flex items-end gap-3 mt-2">
                            <div className="flex flex-col">
                                <span className="text-3xl font-black tracking-tighter text-microtermix-success">{qgOk}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Passed</span>
                            </div>
                            <div className="h-8 w-px bg-slate-800 mx-1"></div>
                            <div className="flex flex-col">
                                <span className="text-3xl font-black tracking-tighter text-microtermix-danger">{qgError}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Failed</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Bug size={48} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Deuda Técnica</p>
                        <h2 className="text-4xl font-black text-slate-100 tracking-tighter">{totalBugs + totalVulnerabilities + totalSmells} <span className="text-lg text-slate-500 font-bold">Issues</span></h2>
                        <div className="flex items-center gap-3 mt-2 text-[10px] font-bold">
                            <span className="text-red-400 flex items-center gap-1"><Bug size={10} /> {totalBugs}</span>
                            <span className="text-yellow-400 flex items-center gap-1"><ShieldAlert size={10} /> {totalVulnerabilities}</span>
                            <span className="text-blue-400 flex items-center gap-1"><FileSearch size={10} /> {totalSmells}</span>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <LayoutDashboard size={48} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cobertura Global</p>
                        <h2 className="text-4xl font-black text-slate-100 tracking-tighter mt-1">{avgCoverage}%</h2>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full mt-3 overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all rounded-full" style={{ width: `${Math.min(parseFloat(avgCoverage), 100)}%` }}></div>
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <LayoutDashboard size={48} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Proyectos Integrados</p>
                        <h2 className="text-4xl font-black text-slate-100 tracking-tighter mt-1">{projectsWithMetrics} <span className="text-xl text-slate-500 font-bold">/ {projects.length}</span></h2>
                        <p className="text-xs font-medium text-slate-500 mt-2">{linkedProjectsSum} vinculados al server</p>
                    </div>
                </div>

                {/* Project List */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg ring-1 ring-white/5 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                        <h3 className="font-bold text-slate-200">Desglose de Componentes</h3>
                    </div>
                    
                    <div className="divide-y divide-slate-800/60">
                        {projects.map(p => {
                            const path = p.path as string;
                            const link = projectLinks[path];
                            const m = metricsCache[path];
                            
                            return (
                                <div key={path} className="flex items-center gap-6 px-6 py-4 hover:bg-slate-800/30 transition-colors group">
                                    <div className="w-[30%] min-w-0 flex flex-col items-start gap-1">
                                        <div className="flex items-center gap-2 max-w-full">
                                            {m ? (
                                                m.qualityGate === 'OK' 
                                                ? <ShieldCheck size={14} className="text-microtermix-success shrink-0" /> 
                                                : <AlertCircle size={14} className="text-microtermix-danger shrink-0" />
                                            ) : (
                                                <div className="w-2.5 h-2.5 rounded-full border border-slate-600 bg-slate-800 shrink-0"></div>
                                            )}
                                            <p className="text-sm font-bold text-slate-200 truncate w-full" title={p.name as string}>{p.name as string}</p>
                                        </div>
                                        {link?.projectKey ? (
                                            <p className="text-[9px] font-mono text-slate-500 truncate w-full border border-slate-800 rounded px-1 max-w-fit">{link.projectKey}</p>
                                        ) : (
                                            <span className="text-[9px] font-medium text-slate-600 italic">No vinculado a Sonar</span>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 flex items-center gap-6">
                                        <div className="grid grid-cols-3 gap-6 flex-1 opacity-90 group-hover:opacity-100 transition-opacity">
                                            <div className="flex flex-col gap-1 items-center">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><ShieldAlert size={10} /> Seguridad</span>
                                                <RatingBadge rating={m?.security || 'N/A'} type="sec" />
                                            </div>
                                            <div className="flex flex-col gap-1 items-center">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Bug size={10} /> Fiabilidad</span>
                                                <RatingBadge rating={m?.reliability || 'N/A'} type="rel" />
                                            </div>
                                            <div className="flex flex-col gap-1 items-center">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><FileSearch size={10} /> Mantenib.</span>
                                                <RatingBadge rating={m?.maintainability || 'N/A'} type="maint" />
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-1 shrink-0 w-24">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Cobertura</span>
                                            <div className="flex items-center gap-2 w-full justify-end">
                                                <span className={cn("text-xs font-black", (m?.coverage || 0) < 60 ? 'text-microtermix-danger' : (m?.coverage || 0) < 80 ? 'text-yellow-400' : 'text-microtermix-success')}>
                                                    {m ? `${m.coverage}%` : '-'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-16 shrink-0 flex justify-end">
                                        <Button size="icon-sm" variant="ghost" onClick={() => onSelectProject(path)} className="text-blue-400 hover:text-white hover:bg-blue-600/30" title="Ver análisis detallado">
                                            <LayoutDashboard size={15} />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                        {projects.length === 0 && (
                            <div className="px-6 py-10 flex flex-col items-center justify-center text-slate-500 gap-3">
                                <AlertCircle size={32} className="text-slate-700" />
                                <p className="text-sm font-medium">No hay proyectos en el workspace.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
