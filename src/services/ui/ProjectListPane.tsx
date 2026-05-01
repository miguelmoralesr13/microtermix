import React, { useMemo } from 'react';
import { Project } from '../../context/WorkspaceContext';
import { useProcessStore } from '../../stores/processStore';
import { Button } from '../../components/ui/button';
import {
    ConfigurableSidebarList,
    type SidebarListConfig,
    type ContextMenuEntry,
} from '../../components/ui/configurable-sidebar-list';
import { ProjectRowContent } from '../../components/project/ProjectRowContent';
import {
    Play, Square, Terminal, RotateCcw,
    Package, Zap, Wand2, Download, MoreVertical,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInstallCommand(projectType: string, buildSystem?: string): string {
    const type = String(projectType || '').toLowerCase();
    if (type.includes('gradle') || buildSystem === 'gradle') return './gradlew build';
    if (type.includes('maven')  || buildSystem === 'maven')  return 'mvn clean install -DskipTests';
    if (type.includes('java'))                               return 'mvn clean install -DskipTests';
    if (type.includes('bun'))                                return 'bun install';
    if (type.includes('python'))                             return 'pip install -r requirements.txt';
    if (type.includes('rust') || type.includes('cargo'))     return 'cargo build';
    if (type.includes('go'))                                 return 'go mod download';
    return 'npm install';
}

function getTypePresets(projectType: string, buildSystem?: string): string[] {
    const type = String(projectType || '').toLowerCase();
    if (type === 'java') {
        return buildSystem === 'gradle'
            ? ['./gradlew build', './gradlew bootRun', './gradlew clean', './gradlew test', './gradlew dependencies', 'java -jar build/libs/*.jar']
            : ['mvn clean install -DskipTests', 'mvn spring-boot:run', 'mvn package', 'mvn test', 'mvn clean', 'java -jar target/*.jar'];
    }
    if (type === 'go')     return ['go run .', 'go build .', 'go test ./...', 'go mod tidy', 'go vet ./...', 'go mod download'];
    if (type === 'rust')   return ['cargo run', 'cargo build', 'cargo build --release', 'cargo test', 'cargo clean', 'cargo check'];
    if (type === 'python') return ['python main.py', 'python app.py', 'python -m pytest', 'pip install -r requirements.txt', 'uvicorn main:app --reload', 'python -m venv venv'];
    return [];
}

// ── Status dot (prev slot) ────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
    running: 'bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]',
    error:   'bg-red-400',
    stopped: 'bg-slate-500',
    idle:    'bg-slate-700',
};

function StatusDot({ projectPath }: { projectPath: string }) {
    const activeProcesses = useProcessStore(s => s.activeProcesses);
    const status = useMemo(() => {
        const entries = Object.entries(activeProcesses).filter(
            ([id, p]) => id.startsWith(projectPath + '::') && p.source === 'services'
        );
        if (entries.some(([, p]) => p.status === 'running')) return 'running';
        if (entries.some(([, p]) => p.status === 'error'))   return 'error';
        if (entries.some(([, p]) => p.status === 'stopped')) return 'stopped';
        return 'idle';
    }, [activeProcesses, projectPath]);

    return (
        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[status] ?? STATUS_DOT.idle)} />
    );
}

// ── Settings post-slot ────────────────────────────────────────────────────────

function SettingsPost({
    activeVarsCount,
    onOpenSettings,
}: {
    activeVarsCount: number;
    onOpenSettings: () => void;
}) {
    return (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
            <Button
                variant="ghost"
                size="icon-xs"
                onClick={e => { e.stopPropagation(); onOpenSettings(); }}
                className="text-slate-500 hover:text-microtermix-neon relative"
                title="Abrir panel de entorno"
            >
                <Zap size={13} />
                {activeVarsCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-microtermix-neon text-slate-950 text-[7px] font-black w-3 h-3 rounded-full flex items-center justify-center border border-slate-950">
                        {activeVarsCount}
                    </span>
                )}
            </Button>
            <Button
                variant="ghost"
                size="icon-xs"
                className="text-slate-600 hover:text-microtermix-neon hover:bg-microtermix-neon/10 transition-colors cursor-context-menu"
                onClick={e => {
                    e.stopPropagation();
                    const event = new MouseEvent('contextmenu', {
                        bubbles: true, cancelable: true,
                        clientX: e.clientX, clientY: e.clientY,
                    });
                    e.currentTarget.dispatchEvent(event);
                }}
            >
                <MoreVertical size={13} />
            </Button>
        </div>
    );
}

// ── EnvCount helper (needed for SettingsPost) ─────────────────────────────────

function useActiveVarsCount(projectPath: string): number {
    return useMemo(() => {
        try {
            const raw = localStorage.getItem(`microtermix-envs-${projectPath.replace(/[/\\:]/g, '_')}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                const activeEnv = parsed.activeEnv || 'dev';
                return Object.keys(parsed.envs?.[activeEnv] || {}).length;
            }
        } catch { }
        return 0;
    }, [projectPath]);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProjectListPaneProps {
    projects: Project[];
    selectedProjects: string[];
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onToggleSelect: (path: string) => void;
    onPlayScript: (path: string, script: string) => void;
    onOpenSettings: (path: string, tab?: string) => void;
    onQuickAction: (path: string, action: 'start' | 'stop' | 'logs' | 'restart') => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const ProjectListPane: React.FC<ProjectListPaneProps> = ({
    projects,
    selectedProjects,
    onToggleSelect,
    onPlayScript,
    onOpenSettings,
    onQuickAction,
}) => {
    const config = useMemo<SidebarListConfig<Project>>(() => {
        // ── Context menu entries ──────────────────────────────────────────────
        const contextMenu: ContextMenuEntry<Project>[] = [
            {
                key: 'label-actions',
                type: 'group-label',
                label: 'Acciones Rápidas',
            },
            {
                key: 'start',
                label: 'Ejecutar Principal',
                icon: <Play size={14} />,
                className: 'text-emerald-400 hover:bg-emerald-500/10',
                onClick: p => onQuickAction(p.path, 'start'),
            },
            {
                key: 'stop',
                label: 'Detener Procesos',
                icon: <Square size={14} />,
                className: 'text-rose-400 hover:bg-rose-500/10',
                onClick: p => onQuickAction(p.path, 'stop'),
            },
            {
                key: 'restart',
                label: 'Reiniciar',
                icon: <RotateCcw size={14} />,
                className: 'text-blue-400 hover:bg-blue-500/10',
                onClick: p => onQuickAction(p.path, 'restart'),
            },
            { key: 'sep-1', type: 'separator' },
            {
                key: 'logs',
                label: 'Ver Logs',
                icon: <Terminal size={14} />,
                onClick: p => onQuickAction(p.path, 'logs'),
            },
            {
                key: 'install',
                label: 'Install',
                icon: <Download size={14} />,
                className: 'text-amber-400 hover:bg-amber-500/10',
                onClick: p => onPlayScript(p.path, getInstallCommand(String(p.project_type || ''), p.build_system)),
            },
            // ── Scripts (show only when project has scripts) ──────────────────
            {
                key: 'label-scripts',
                type: 'group-label',
                label: 'Scripts',
                show: p => !!(p.scripts && p.scripts.length > 0),
            },
            ...Array.from({ length: 8 }, (_, i) => ({
                key: `script-${i}`,
                label: (p: Project) => p.scripts?.[i] ?? '',
                icon: <Play size={11} className="shrink-0 opacity-60" />,
                className: 'hover:bg-microtermix-neon/10 hover:text-microtermix-neon',
                show: (p: Project) => !!(p.scripts && p.scripts.length > i),
                onClick: (p: Project) => onPlayScript(p.path, p.scripts![i]),
            })),
            // ── Presets (show only when type has presets not already in scripts) ─
            { key: 'sep-presets', type: 'separator' as const, show: (p: Project) => {
                const presets = getTypePresets(String(p.project_type || ''), p.build_system);
                const existing = p.scripts || [];
                return presets.some(pr => !existing.includes(pr));
            }},
            {
                key: 'label-presets',
                type: 'group-label',
                label: 'Presets',
                show: (p: Project) => {
                    const presets = getTypePresets(String(p.project_type || ''), p.build_system);
                    const existing = p.scripts || [];
                    return presets.some(pr => !existing.includes(pr));
                },
            },
            ...Array.from({ length: 6 }, (_, i) => ({
                key: `preset-${i}`,
                label: (p: Project) => {
                    const presets = getTypePresets(String(p.project_type || ''), p.build_system).filter(pr => !(p.scripts || []).includes(pr));
                    return presets[i] ?? '';
                },
                icon: <Wand2 size={11} className="shrink-0 opacity-60" />,
                className: 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
                show: (p: Project) => {
                    const presets = getTypePresets(String(p.project_type || ''), p.build_system).filter(pr => !(p.scripts || []).includes(pr));
                    return presets.length > i;
                },
                onClick: (p: Project) => {
                    const presets = getTypePresets(String(p.project_type || ''), p.build_system).filter(pr => !(p.scripts || []).includes(pr));
                    if (presets[i]) onPlayScript(p.path, presets[i]);
                },
            })),
            { key: 'sep-2', type: 'separator' },
            {
                key: 'envs',
                label: 'Environments',
                icon: <Zap size={14} />,
                onClick: p => onOpenSettings(p.path, 'envs'),
            },
            {
                key: 'deps',
                label: 'Dependencies',
                icon: <Package size={14} />,
                onClick: p => onOpenSettings(p.path, 'deps'),
            },
            {
                key: 'vite',
                label: 'Vite MFE',
                icon: <Zap size={14} className="text-purple-400" />,
                className: 'text-slate-400',
                onClick: p => onOpenSettings(p.path, 'vite'),
            },
        ];

        return {
            getKey:  p => p.path,
            getText: p => <ProjectRowContent project={p} />,
            filterFn: (p, q) => (p.name as string).toLowerCase().includes(q),

            getPrev: p => <StatusDot projectPath={p.path} />,

            getPost: p => {
                // This is a render function so we can use a component here
                return (
                    <SettingsPostWrapper
                        projectPath={p.path}
                        onOpenSettings={() => onOpenSettings(p.path, 'envs')}
                    />
                );
            },

            filterEnabled:    true,
            filterPlaceholder: 'Buscar proyecto...',

            selectionMode: 'multi',
            showCheckbox:  true,
            showSelectAll: true,

            title: `Proyectos (${projects.length})`,

            contextMenu,

            resizable:    true,
            storageKey:   'microtermix-project-pane-width',
            defaultWidth: 352,
            minWidth:     220,
            maxWidth:     800,

            classNames: {
                item:         'group border-l-2 border-transparent px-3 py-2 select-none',
                itemSelected: 'bg-microtermix-neon/10 border-microtermix-neon',
                itemText:     'flex-1 min-w-0',
                filterInput:  'h-7',
            },
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projects.length, onPlayScript, onOpenSettings, onQuickAction]);

    return (
        <ConfigurableSidebarList<Project>
            items={projects}
            config={config}
            selected={selectedProjects}
            onSelectionChange={keys => {
                const added   = keys.filter(k => !selectedProjects.includes(k));
                const removed = selectedProjects.filter(k => !keys.includes(k));
                if (added.length)   added.forEach(k => onToggleSelect(k));
                if (removed.length) removed.forEach(k => onToggleSelect(k));
            }}
        />
    );
};

// ── Wrapper component for post slot (so hooks can run) ────────────────────────

function SettingsPostWrapper({
    projectPath,
    onOpenSettings,
}: {
    projectPath: string;
    onOpenSettings: () => void;
}) {
    const count = useActiveVarsCount(projectPath);
    return (
        <SettingsPost
            activeVarsCount={count}
            onOpenSettings={onOpenSettings}
        />
    );
}
