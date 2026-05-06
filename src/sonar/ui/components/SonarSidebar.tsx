import React, { useMemo } from 'react';
import { LayoutDashboard, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    ConfigurableSidebarList,
    type SidebarListConfig,
} from '@/components/ui/configurable-sidebar-list';

// ── Nav items (fixed, not part of the generic list) ───────────────────────────

const NAV_ITEMS = [
    { id: 'dashboard', label: 'General',  icon: <LayoutDashboard size={14} /> },
    { id: 'config',    label: 'Cuentas',  icon: <Settings size={14} /> },
] as const;

// ── Settings post-slot (needs to be a component for group-hover) ──────────────

function SonarProjectSettingsPost({ onOpenSettings }: { onOpenSettings: () => void }) {
    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={e => { e.stopPropagation(); onOpenSettings(); }}
            className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-all active:scale-90"
        >
            <Settings size={12} />
        </Button>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SonarSidebarProps {
    projects: Array<{ path: string; name: string }>;
    selectedPath: string;
    onSelectPath: (path: string) => void;
    onOpenSettings: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const SonarSidebar: React.FC<SonarSidebarProps> = ({
    projects,
    selectedPath,
    onSelectPath,
    onOpenSettings,
}) => {
    const projectConfig = useMemo<SidebarListConfig<typeof projects[number]>>(() => ({
        getKey:  p => p.path,
        getText: p => (
            <span className="text-[10px] font-bold truncate uppercase tracking-tight">
                {p.name}
            </span>
        ),
        filterFn: (p, q) => p.name.toLowerCase().includes(q),

        getPost: _p => <SonarProjectSettingsPost onOpenSettings={onOpenSettings} />,

        filterEnabled:    projects.length > 4,
        filterPlaceholder: 'Buscar proyecto...',

        selectionMode: 'single',

        classNames: {
            root:         'flex-1 overflow-hidden border-0 bg-transparent',
            filterInput:  'h-7',
            item:         'group border-l-2 border-transparent px-3 py-2 select-none',
            itemSelected: 'bg-blue-600/10 border-blue-500/30',
            itemText:     'flex-1 min-w-0 text-muted-foreground',
        },

        emptyState: (
            <p className="text-[11px] text-muted-foreground text-center px-2">Sin proyectos locales</p>
        ),
    }), [projects.length, onOpenSettings]);

    return (
        <div className="w-56 shrink-0 border-r border-border flex flex-col bg-card/50">
            {/* ── Header ── */}
            <div className="p-4 border-b border-border">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] text-left">
                    Navegación
                </p>
            </div>

            {/* ── Fixed nav items (dashboard + config) ── */}
            <div className="p-2 space-y-1 border-b border-border">
                {NAV_ITEMS.map(item => (
                    <div
                        key={item.id}
                        onClick={() => onSelectPath(item.id)}
                        className={cn(
                            'group px-4 py-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-3 border',
                            selectedPath === item.id
                                ? 'bg-blue-600/10 border-blue-500/30 text-blue-400 shadow-sm'
                                : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        )}
                    >
                        {item.icon}
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>

            {/* ── Projects label ── */}
            <div className="px-4 pt-3 pb-1">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                    Proyectos Locales
                </p>
            </div>

            {/* ── Projects list ── */}
            <ConfigurableSidebarList
                items={projects}
                config={projectConfig}
                selected={[selectedPath]}
                onSelectionChange={keys => { if (keys[0]) onSelectPath(keys[0]); }}
            />
        </div>
    );
};
