import React, { useState, useCallback, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
    Search, Link2, Link2Off, Star, Loader2, FolderCode,
    CheckCircle2, X, ChevronRight, GitBranch
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useJenkinsStore } from '@/stores/jenkinsStore';
import type { JobLink } from '@/hooks/useJenkinsProjectLinks';
import {
    jenkinsGlobalSearch,
    type JenkinsJobSummary,
    colorFromJobColor,
} from '@/services/jenkinsApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getProjectDisplayName(path: string): string {
    return path.split('/').filter(Boolean).pop() ?? path;
}

// ── Job Search Row ─────────────────────────────────────────────────────────────

function JobResultRow({
    job,
    onSelect,
    isSelected,
}: {
    job: JenkinsJobSummary;
    onSelect: () => void;
    isSelected: boolean;
}) {
    const lb = job.lastBuild;
    const dotColor = colorFromJobColor(job.color ?? 'grey');

    return (
        <button
            onClick={onSelect}
            className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all border',
                isSelected
                    ? 'bg-microtermix-neon/10 border-microtermix-neon/40 text-white'
                    : 'border-transparent hover:bg-slate-800/60 hover:border-slate-700 text-slate-300'
            )}
        >
            <span
                className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/10"
                style={{ background: dotColor }}
            />
            <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-medium truncate">
                    {job.displayName || job.name}
                </span>
                {job.fullName && job.fullName !== job.name && (
                    <span className="text-[10px] text-slate-500 font-mono truncate opacity-60">
                        {job.fullName}
                    </span>
                )}
            </div>
            {lb && (
                <span className="text-[9px] text-slate-500 shrink-0 font-mono">
                    #{lb.number}
                </span>
            )}
            {isSelected && <CheckCircle2 size={14} className="text-microtermix-neon shrink-0" />}
        </button>
    );
}

// ── Project Row ────────────────────────────────────────────────────────────────

function ProjectRow({
    projectPath,
    link,
    onLinkJob,
    onUnlink,
    onAddFavorite,
}: {
    projectPath: string;
    link?: JobLink;
    onLinkJob: (projectPath: string) => void;
    onUnlink: (projectPath: string) => void;
    onAddFavorite: (link: JobLink) => void;
}) {
    const name = getProjectDisplayName(projectPath);

    return (
        <div className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all',
            link
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
        )}>
            <FolderCode size={14} className={link ? 'text-emerald-400' : 'text-slate-500'} />

            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-200 truncate">{name}</p>
                {link ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: colorFromJobColor(link.color ?? 'grey') }}
                        />
                        <span className="text-[10px] text-emerald-400 font-mono truncate">
                            {link.jobDisplayName || link.jobName}
                        </span>
                    </div>
                ) : (
                    <p className="text-[10px] text-slate-600 mt-0.5">Sin vínculo</p>
                )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
                {link && (
                    <button
                        onClick={() => onAddFavorite(link)}
                        className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-md transition-colors"
                        title="Agregar a Favoritos Jenkins"
                    >
                        <Star size={12} />
                    </button>
                )}
                {link ? (
                    <button
                        onClick={() => onUnlink(projectPath)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                        title="Desvincular"
                    >
                        <Link2Off size={12} />
                    </button>
                ) : (
                    <button
                        onClick={() => onLinkJob(projectPath)}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-slate-400 hover:text-microtermix-neon hover:bg-microtermix-neon/10 rounded-md border border-slate-700 hover:border-microtermix-neon/40 transition-all"
                    >
                        <Link2 size={10} />
                        Vincular
                    </button>
                )}
            </div>
        </div>
    );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export interface LinkProjectsModalProps {
    open: boolean;
    onClose: () => void;
    /** Links del workspace actual — viene del estado del padre para reactvidad compartida */
    links: JobLink[];
    linksMap: Record<string, JobLink>;
    linkProject: (link: Omit<JobLink, 'linkedAt'>) => void;
    unlinkProject: (projectPath: string) => void;
}

export const LinkProjectsModal: React.FC<LinkProjectsModalProps> = ({
    open,
    onClose,
    links,
    linksMap,
    linkProject,
    unlinkProject,
}) => {
    const { state: workspace } = useWorkspace();
    const accounts = useJenkinsStore(s => s.accounts);
    const activeAccountId = useJenkinsStore(s => s.activeAccountId);
    const config = accounts.find(a => a.id === activeAccountId);
    const toggleFavorite = useJenkinsStore(s => s.toggleFavorite);

    // NO instanciamos useJenkinsProjectLinks aquí — el padre provee el estado

    // Proyecto que está siendo vinculado (side panel)
    const [linkingProject, setLinkingProject] = useState<string | null>(null);
    // Input de búsqueda de jobs
    const [jobQuery, setJobQuery] = useState('');
    // Resultados de búsqueda
    const [searchResults, setSearchResults] = useState<JenkinsJobSummary[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    // Job seleccionado para vincular
    const [selectedJob, setSelectedJob] = useState<JenkinsJobSummary | null>(null);

    // Búsqueda manual — solo al presionar Enter o el botón de búsqueda
    const handleSearch = async () => {
        const q = jobQuery.trim();
        if (!q || !config) { setSearchResults([]); return; }
        setIsSearching(true);
        try {
            const results = await jenkinsGlobalSearch(config, q);
            setSearchResults(results.slice(0, 30));
        } catch {
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleStartLinking = (projectPath: string) => {
        setLinkingProject(projectPath);
        setSelectedJob(null);
        setJobQuery('');
        setSearchResults([]);
    };

    const handleConfirmLink = () => {
        if (!linkingProject || !selectedJob || !config) return;

        linkProject({
            projectPath: linkingProject,
            projectName: getProjectDisplayName(linkingProject),
            jobUrl: selectedJob.url,
            jobName: selectedJob.name,
            jobDisplayName: selectedJob.displayName,
            jobFullName: selectedJob.fullName,
            accountId: config.id!,
            color: selectedJob.color,
            lastBuildNumber: selectedJob.lastBuild?.number,
            lastBuildTimestamp: selectedJob.lastBuild?.timestamp,
            lastBuildResult: selectedJob.lastBuild?.result,
            lastBuildBuilding: selectedJob.lastBuild?.building,
        });

        toast.success(`${getProjectDisplayName(linkingProject)} vinculado a ${selectedJob.displayName || selectedJob.name}`);
        setLinkingProject(null);
        setSelectedJob(null);
    };

    const handleAddFavorite = (link: JobLink) => {
        // Construimos un JenkinsFavorite mínimo desde el JobLink
        toggleFavorite({
            url: link.jobUrl,
            name: link.jobName,
            displayName: link.jobDisplayName,
            fullName: link.jobFullName,
            fullDisplayName: link.jobDisplayName || link.jobName,
            color: link.color ?? 'grey',
            _class: 'org.jenkinsci.plugins.workflow.job.WorkflowJob',
            lastBuild: link.lastBuildNumber ? {
                number: link.lastBuildNumber,
                url: link.jobUrl,
                result: (link.lastBuildResult ?? null) as any,
                duration: 0,
                timestamp: link.lastBuildTimestamp ?? 0,
                building: link.lastBuildBuilding ?? false,
                displayName: `#${link.lastBuildNumber}`,
                estimatedDuration: 0,
            } : null,
            lastSuccessfulBuild: null,
            lastFailedBuild: null,
        });
        toast.success(`${link.jobDisplayName || link.jobName} agregado a Favoritos`);
    };

    const projects = workspace.projects ?? [];

    return (
        <Dialog open={open} onOpenChange={o => !o && onClose()}>
            <DialogContent showCloseButton={false} className="max-w-[92vw] sm:max-w-4xl max-h-[88vh] flex flex-col gap-0 p-0 overflow-hidden bg-slate-950 border-slate-800">
                <DialogHeader className="px-6 py-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                                <GitBranch size={16} className="text-orange-400" />
                            </div>
                            <div>
                                <DialogTitle className="text-base font-semibold text-slate-100">
                                    Proyectos locales
                                </DialogTitle>
                                <DialogDescription className="text-[11px] text-slate-500 mt-0.5">
                                    Vinculá proyectos del workspace con Jobs de Jenkins
                                </DialogDescription>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 text-slate-600 hover:text-slate-300 rounded-md hover:bg-slate-800 transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                </DialogHeader>

                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* ── Left: Project List ────────────────────────────────── */}
                    <div className="w-[45%] shrink-0 flex flex-col border-r border-slate-800 min-h-0">
                        <div className="px-4 py-2.5 border-b border-slate-800 shrink-0">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                Proyectos del workspace
                            </p>
                            <p className="text-[10px] text-slate-600 mt-0.5">
                                {links.length} de {projects.length} vinculados
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                            {projects.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-2">
                                    <FolderCode size={32} className="opacity-40" />
                                    <p className="text-xs">No hay proyectos en el workspace</p>
                                </div>
                            ) : (
                                projects.map(p => (
                                    <ProjectRow
                                        key={p.path}
                                        projectPath={p.path}
                                        link={linksMap[p.path]}
                                        onLinkJob={handleStartLinking}
                                        onUnlink={(path) => {
                                            unlinkProject(path);
                                            if (linkingProject === path) setLinkingProject(null);
                                            toast.success(`Vínculo eliminado`);
                                        }}
                                        onAddFavorite={handleAddFavorite}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* ── Right: Job Search ─────────────────────────────────── */}
                    <div className="flex-1 flex flex-col min-h-0 min-w-0">
                        {!linkingProject ? (
                            <div className="flex flex-col items-center justify-center flex-1 text-slate-600 gap-3 p-8 text-center">
                                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                                    <Link2 size={20} className="opacity-40" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-400">Seleccioná un proyecto</p>
                                    <p className="text-[11px] text-slate-600 mt-1 max-w-[220px] mx-auto">
                                        Hacé clic en "Vincular" en cualquier proyecto de la izquierda para buscar su Job en Jenkins
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Search header */}
                                <div className="px-4 py-2.5 border-b border-slate-800 shrink-0">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <ChevronRight size={10} />
                                            Vincular: <span className="text-slate-300 normal-case font-medium">
                                                {getProjectDisplayName(linkingProject)}
                                            </span>
                                        </p>
                                        <button
                                            onClick={() => setLinkingProject(null)}
                                            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>

                                    <div className="relative">
                                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            autoFocus
                                            value={jobQuery}
                                            onChange={e => setJobQuery(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                            placeholder="Buscar job y presionar Enter..."
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-7 pr-16 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-microtermix-neon/50 transition-colors"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                            {isSearching && (
                                                <Loader2 size={11} className="text-microtermix-neon animate-spin" />
                                            )}
                                            <button
                                                onClick={handleSearch}
                                                disabled={isSearching || !jobQuery.trim()}
                                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors"
                                                title="Buscar (Enter)"
                                            >
                                                <Search size={10} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Results */}
                                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                                    {!config && (
                                        <p className="text-xs text-red-400 text-center py-8">
                                            Sin cuenta Jenkins activa
                                        </p>
                                    )}
                                    {config && !jobQuery.trim() && !isSearching && searchResults.length === 0 && (
                                        <p className="text-[11px] text-slate-600 text-center py-8">
                                            Escribí para buscar en Jenkins
                                        </p>
                                    )}
                                    {searchResults.map(job => (
                                        <JobResultRow
                                            key={job.url}
                                            job={job}
                                            isSelected={selectedJob?.url === job.url}
                                            onSelect={() => setSelectedJob(prev => prev?.url === job.url ? null : job)}
                                        />
                                    ))}
                                    {config && jobQuery.trim() && !isSearching && searchResults.length === 0 && (
                                        <div className="text-center py-12 space-y-2">
                                            <Search size={24} className="mx-auto text-slate-800" />
                                            <p className="text-xs text-slate-500">Sin resultados para "{jobQuery}"</p>
                                        </div>
                                    )}
                                </div>

                                {/* Confirm */}
                                <div className="px-4 py-3 border-t border-slate-800 shrink-0 flex items-center justify-between gap-3 bg-slate-900/50">
                                    {selectedJob ? (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className="w-2 h-2 rounded-full shrink-0"
                                                style={{ background: colorFromJobColor(selectedJob.color ?? 'grey') }}
                                            />
                                            <span className="text-[11px] text-slate-300 truncate">
                                                {selectedJob.displayName || selectedJob.name}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-[11px] text-slate-600">Seleccioná un job de arriba</span>
                                    )}
                                    <Button
                                        size="sm"
                                        disabled={!selectedJob}
                                        onClick={handleConfirmLink}
                                        className="shrink-0 gap-1.5 bg-microtermix-neon text-slate-900 hover:bg-microtermix-neon/90 disabled:opacity-40"
                                    >
                                        <Link2 size={12} />
                                        Vincular
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/50 flex justify-end shrink-0">
                    <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white text-xs">
                        Cerrar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
