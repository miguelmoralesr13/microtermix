import React, { useState, useMemo } from 'react';
import { useCoverageStore } from '../../stores/coverageStore';
import { useTaskStore } from '../../stores/taskStore';
import { Project } from '../../context/WorkspaceContext';
import { pct, pctColor, loadConfig, parseCoverageXml } from '../../utils/testUtils';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, LayoutDashboard, PlayCircle, BarChart3, AlertCircle, FileCode2 } from 'lucide-react';
import { Button } from '@/components//ui/button';
import { cn } from '@/lib/utils';

interface TestsDashboardProps {
    projects: Project[];
    onSelectProject: (path: string) => void;
}

export const TestsDashboard: React.FC<TestsDashboardProps> = ({ projects, onSelectProject }) => {
    const { coverageMap, setCoverage } = useCoverageStore();
    const { activeTasks } = useTaskStore();
    const [isScanning, setIsScanning] = useState(false);

    // Calculate aggregated metrics
    const { avgLines, avgBranches, totalCovered, totalStatements, projectsWithCov } = useMemo(() => {
        let sc = 0, st = 0;
        let bc = 0, bt = 0;
        let projCount = 0;

        projects.forEach(p => {
            const cov = coverageMap[p.path as string];
            if (cov && cov.lines.total > 0) {
                projCount++;
                sc += cov.lines.covered;
                st += cov.lines.total;
                bc += cov.branches.covered;
                bt += cov.branches.total;
            }
        });

        const avgL = st > 0 ? Math.round((sc / st) * 100) : 0;
        const avgB = bt > 0 ? Math.round((bc / bt) * 100) : 0;

        return {
            avgLines: avgL,
            avgBranches: avgB,
            totalCovered: sc,
            totalStatements: st,
            projectsWithCov: projCount
        };
    }, [projects, coverageMap]);

    const handleScanAll = async () => {
        setIsScanning(true);
        for (const p of projects) {
            const path = p.path as string;
            const config = loadConfig(path);
            if (!config.coverageXmlPath) continue;

            const xmlPath = `${path}/${config.coverageXmlPath}`.replace(/\\/g, '/');
            try {
                const content = await invoke<string>('read_file_at_path', { path: xmlPath });
                const summary = parseCoverageXml(content);
                if (summary) {
                    setCoverage(path, summary);
                }
            } catch (_) {
                // Silently skip if coverage file doesn't exist
            }
        }
        setIsScanning(false);
    };

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900 overflow-y-auto">
            <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
                {/* Header Sequence */}
                <div className="flex items-end justify-between">
                    <div>
                        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-microtermix-neon via-white to-microtermix-accent mb-2">
                            Dashboard de Cobertura
                        </h1>
                        <p className="text-slate-400 text-sm">Resumen global de los resultados de testing y métricas de código en el workspace.</p>
                    </div>
                    <Button 
                        onClick={handleScanAll} 
                        disabled={isScanning}
                        className={cn("bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700 font-semibold gap-2 border")}
                    >
                        <RefreshCw size={14} className={isScanning ? "animate-spin" : ""} /> 
                        {isScanning ? 'Escaneando XMLs...' : 'Escanear Reportes Locales'}
                    </Button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <BarChart3 size={48} />
                        </div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Coverage (Líneas)</p>
                        <div className="flex items-end gap-2">
                            <h2 className={cn("text-5xl font-black tracking-tighter", pctColor(avgLines).text)}>{avgLines}%</h2>
                        </div>
                        <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className={cn('h-full transition-all duration-1000', pctColor(avgLines).bar)} style={{ width: `${avgLines}%` }} />
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <BarChart3 size={48} />
                        </div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Coverage (Ramas)</p>
                        <div className="flex items-end gap-2">
                            <h2 className={cn("text-5xl font-black tracking-tighter", pctColor(avgBranches).text)}>{avgBranches}%</h2>
                        </div>
                        <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div className={cn('h-full transition-all duration-1000', pctColor(avgBranches).bar)} style={{ width: `${avgBranches}%` }} />
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <FileCode2 size={48} />
                        </div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Statements</p>
                        <h2 className="text-4xl font-black text-slate-100 tracking-tighter mt-1">{totalCovered} / {totalStatements}</h2>
                        <p className="text-xs font-medium text-slate-500 mt-2">Cubiertas / Totales</p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <LayoutDashboard size={48} />
                        </div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Participación</p>
                        <h2 className="text-4xl font-black text-slate-100 tracking-tighter mt-1">{projectsWithCov} <span className="text-xl text-slate-500 font-bold">/ {projects.length}</span></h2>
                        <p className="text-xs font-medium text-slate-500 mt-2">Proyectos con reportes</p>
                    </div>
                </div>

                {/* Project List */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg ring-1 ring-white/5 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                        <h3 className="font-bold text-slate-200">Desglose por Proyecto</h3>
                    </div>
                    
                    <div className="divide-y divide-slate-800/60">
                        {projects.map(p => {
                            const path = p.path as string;
                            const cov = coverageMap[path];
                            const linesP = pct(cov?.lines);
                            const tid = `tests-${path.replace(/[/\\:]/g, '_')}`;
                            const isRunning = activeTasks[tid]?.status === 'running';

                            return (
                                <div key={path} className="flex items-center gap-6 px-6 py-4 hover:bg-slate-800/30 transition-colors">
                                    <div className="w-1/3 min-w-0 flex flex-col items-start gap-1">
                                        <p className="text-sm font-bold text-slate-200 truncate w-full" title={p.name as string}>{p.name as string}</p>
                                        <span className="text-[10px] font-mono text-slate-500 px-1.5 py-0.5 rounded-sm bg-slate-800 border border-slate-700 uppercase">{loadConfig(path).language}</span>
                                    </div>
                                    
                                    <div className="flex-1 grid grid-cols-3 gap-8">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Líneas</span>
                                                <span className={cn('text-xs font-bold', cov ? pctColor(linesP).text : 'text-slate-600')}>{cov ? `${linesP}%` : '-'}</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden shrink-0 border border-slate-800">
                                                {cov && <div className={cn('h-full rounded-full', pctColor(linesP).bar)} style={{ width: `${linesP}%` }} />}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ramas</span>
                                                <span className={cn('text-xs font-bold', cov ? pctColor(pct(cov.branches)).text : 'text-slate-600')}>{cov ? `${pct(cov.branches)}%` : '-'}</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden shrink-0 border border-slate-800">
                                                {cov && <div className={cn('h-full rounded-full', pctColor(pct(cov.branches)).bar)} style={{ width: `${pct(cov.branches)}%` }} />}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Funciones</span>
                                                <span className={cn('text-xs font-bold', cov ? pctColor(pct(cov.functions)).text : 'text-slate-600')}>{cov ? `${pct(cov.functions)}%` : '-'}</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden shrink-0 border border-slate-800">
                                                {cov && <div className={cn('h-full rounded-full', pctColor(pct(cov.functions)).bar)} style={{ width: `${pct(cov.functions)}%` }} />}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-32 shrink-0 flex justify-end gap-2">
                                        {isRunning ? (
                                            <Button size="sm" variant="outline" className="h-7 text-xs bg-microtermix-success/10 text-microtermix-success border-microtermix-success/30 px-3 cursor-default hover:bg-microtermix-success/10">
                                                <span className="w-1.5 h-1.5 rounded-full bg-microtermix-success animate-pulse mr-1.5 inline-block" /> corriendo
                                            </Button>
                                        ) : (
                                            <Button size="icon-sm" variant="ghost" onClick={() => onSelectProject(path)} className="text-microtermix-neon hover:text-white hover:bg-microtermix-neon" title="Ir a detalles y ejecutar">
                                                <PlayCircle size={15} />
                                            </Button>
                                        )}
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
