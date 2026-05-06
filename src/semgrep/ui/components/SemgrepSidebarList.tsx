import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
    ConfigurableSidebarList,
    type SidebarListConfig,
} from '@/components/ui/configurable-sidebar-list';
import { useSemgrepStore } from '@/stores/semgrepStore';

// ── Sub-components (need hooks) ───────────────────────────────────────────────

function SemgrepProjectContent({ path, name }: { path: string; name: string }) {
    const findingsCache = useSemgrepStore(s => s.findings);
    const issueCount = findingsCache[path]?.length || 0;

    return (
        <div className="min-w-0">
            <p className="text-xs font-bold truncate">{name}</p>
            <p className="text-[9px] text-slate-600 font-mono">{issueCount} issues</p>
        </div>
    );
}

function SemgrepFindingsDot({ path }: { path: string }) {
    const findingsCache = useSemgrepStore(s => s.findings);
    const hasFindings = (findingsCache[path]?.length || 0) > 0;
    if (!hasFindings) return null;
    return (
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm shadow-red-900/50 shrink-0" />
    );
}

function ProjectCountBadge({ count }: { count: number }) {
    return (
        <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-500 ml-auto">
            {count}
        </Badge>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SemgrepSidebarListProps {
    projects: Array<{ path: string; name: string }>;
    selectedPath: string;
    onSelectPath: (path: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SemgrepSidebarList: React.FC<SemgrepSidebarListProps> = ({
    projects,
    selectedPath,
    onSelectPath,
}) => {
    const config = useMemo<SidebarListConfig<typeof projects[number]>>(() => ({
        getKey:  p => p.path,
        getText: p => <SemgrepProjectContent path={p.path} name={p.name} />,
        getPost: p => <SemgrepFindingsDot path={p.path} />,

        filterFn:      (p, q) => p.name.toLowerCase().includes(q),
        filterEnabled:     true,
        filterPlaceholder: 'Buscar proyecto...',

        selectionMode: 'single',

        title:       'Workspace',
        headerExtra: <ProjectCountBadge count={projects.length} />,

        classNames: {
            root:         'w-64 border-r border-slate-800 bg-slate-950/30',
            header:       'px-3 py-2 border-b border-slate-800 bg-slate-900/80',
            title:        'text-[10px] font-bold text-slate-500 uppercase tracking-wider',
            filterInput:  'h-7',
            item:         'border-l-2 border-transparent px-3 py-2 select-none',
            itemSelected: 'bg-emerald-500/10 border-emerald-500',
            itemText:     'flex-1 min-w-0 text-slate-400',
        },

        emptyState: (
            <p className="text-xs text-slate-600 text-center px-2 py-4">Sin proyectos</p>
        ),
    }), [projects.length]);

    return (
        <ConfigurableSidebarList<typeof projects[number]>
            items={projects}
            config={config}
            selected={[selectedPath]}
            onSelectionChange={keys => { if (keys[0]) onSelectPath(keys[0]); }}
        />
    );
};
