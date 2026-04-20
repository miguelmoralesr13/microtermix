import React, { useMemo } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { Project } from '../../context/WorkspaceContext';
import { useTaskStore } from '../../stores/taskStore';
import { useCoverageStore } from '../../stores/coverageStore';
import { Badge } from '../ui/badge';
import {
    ConfigurableSidebarList,
    type SidebarListConfig,
} from '../ui/configurable-sidebar-list';
import { cn } from '../../lib/utils';
import { pct, pctColor } from '../../utils/testUtils';

// ── Item type ─────────────────────────────────────────────────────────────────

type TestSidebarItem =
    | { kind: 'dashboard' }
    | { kind: 'project'; path: string; name: string };

// ── Sub-components (need hooks — can't be plain render fns) ───────────────────

function TestProjectContent({ path, name }: { path: string; name: string }) {
    const activeTasks = useTaskStore(s => s.activeTasks);
    const taskId = `tests-${path.replace(/[/\\:]/g, '_')}`;
    const running = activeTasks[taskId]?.status === 'running';

    return (
        <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate text-slate-300">{name}</p>
            {running && (
                <span className="text-[9px] text-microtermix-success flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-microtermix-success animate-pulse inline-block" />
                    running
                </span>
            )}
        </div>
    );
}

function TestCoverageBadge({ path }: { path: string }) {
    const coverageMap = useCoverageStore(s => s.coverageMap);
    const cov = coverageMap[path];
    const linesP = cov ? pct(cov.lines) : null;
    if (linesP === null) return null;
    return (
        <Badge className={cn(
            'ml-2 shrink-0 text-[10px] font-bold border-0 rounded',
            pctColor(linesP).text,
            'bg-slate-800',
        )}>
            {linesP}%
        </Badge>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TestsSidebarListProps {
    projects: Project[];
    selectedPath: string;
    onSelectPath: (path: string) => void;
}

export const TestsSidebarList: React.FC<TestsSidebarListProps> = ({
    projects,
    selectedPath,
    onSelectPath,
}) => {
    const items = useMemo<TestSidebarItem[]>(() => [
        { kind: 'dashboard' },
        ...projects.map(p => ({
            kind: 'project' as const,
            path:  p.path as string,
            name:  p.name as string,
        })),
    ], [projects]);

    const config = useMemo<SidebarListConfig<TestSidebarItem>>(() => ({
        getKey: item => item.kind === 'dashboard' ? 'dashboard' : item.path,

        getText: item => item.kind === 'dashboard'
            ? (
                <span className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <LayoutDashboard size={13} className="shrink-0 text-microtermix-neon" />
                    Dashboard General
                </span>
            )
            : <TestProjectContent path={item.path} name={item.name} />,

        getPost: item => item.kind === 'project'
            ? <TestCoverageBadge path={item.path} />
            : null,

        filterFn: (item, q) => item.kind === 'dashboard'
            ? 'dashboard general'.includes(q)
            : item.name.toLowerCase().includes(q),

        filterEnabled:    true,
        filterPlaceholder: 'Buscar proyecto...',

        selectionMode: 'single',

        title: 'Vistas & Proyectos',

        classNames: {
            root:         'w-56 border-r border-slate-800 bg-slate-950/30',
            header:       'px-3 py-2 border-b border-slate-800 bg-slate-900/80',
            title:        'text-[10px] font-bold text-slate-500 uppercase tracking-wider',
            filterInput:  'h-7',
            item:         'border-l-2 border-transparent px-3 py-2 select-none',
            itemSelected: 'bg-microtermix-neon/10 border-microtermix-neon',
            itemText:     'flex-1 min-w-0',
        },

        emptyState: <p className="text-xs text-slate-600 text-center">Sin proyectos</p>,
    }), []);

    return (
        <ConfigurableSidebarList<TestSidebarItem>
            items={items}
            config={config}
            selected={[selectedPath]}
            onSelectionChange={keys => { if (keys[0]) onSelectPath(keys[0]); }}
        />
    );
};
