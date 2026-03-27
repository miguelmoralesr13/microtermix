import React, { useMemo, useCallback } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useProcessStore } from '../stores/processStore';
import { useUIStore } from '../stores/uiStore';

const ACTIVE_TERMINAL_STORAGE_KEY = 'microtermix-active-terminal-tab';

function activeTerminalKey(workspacePath: string): string {
    return `${ACTIVE_TERMINAL_STORAGE_KEY}-${(workspacePath || '').replace(/[/\\:]/g, '_')}`;
}

const SELECTED_PROJECTS_STORAGE_KEY = 'microtermix-selected-projects';

function selectedProjectsKey(workspacePath: string): string {
    return `${SELECTED_PROJECTS_STORAGE_KEY}-${(workspacePath || '').replace(/[/\\:]/g, '_')}`;
}

/**
 * Encapsulates the global state synchronization logic that needs to run
 * regardless of whether the app is in the main window (ServiceManager) 
 * or a standalone utility window (UtilityRenderer).
 */
export function useServiceManagerState() {
    const { state, setTargetTerminalTab } = useWorkspace();

    const {
        selectedProjects, setSelectedProjects
    } = useUIStore();

    const activeProcesses = useProcessStore(s => s.activeProcesses);
    const activeTerminalTab = useProcessStore(s => s.activeTerminalTab);
    const setActiveTerminalTabStore = useProcessStore(s => s.setActiveTerminalTab);

    const processIds = useMemo(() => Object.keys(activeProcesses), [activeProcesses]);

    const setActiveTerminalTab = useCallback((id: string | null) => {
        setActiveTerminalTabStore(id);
        if (id) {
            try {
                localStorage.setItem(activeTerminalKey(state.currentPath || ''), id);
            } catch (_) { }
        }
    }, [state.currentPath, setActiveTerminalTabStore]);

    const restoredSelectedRef = React.useRef(false);

    // Releer desde localStorage cuando se aplica una config cargada
    React.useEffect(() => {
        const path = state.currentPath || '';
        try {
            const raw = localStorage.getItem(selectedProjectsKey(path));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setSelectedProjects(parsed);
            }
        } catch (_) { }
    }, [state.configAppliedTrigger, state.currentPath, setSelectedProjects]);

    const projectPaths = useMemo(() => new Set(state.projects.map(p => p.path as string)), [state.projects]);

    React.useEffect(() => {
        restoredSelectedRef.current = false;
    }, [state.currentPath]);

    React.useEffect(() => {
        if (state.projects.length === 0 || restoredSelectedRef.current) return;
        try {
            const raw = localStorage.getItem(selectedProjectsKey(state.currentPath || ''));
            if (!raw) return;
            const saved: string[] = JSON.parse(raw);
            if (!Array.isArray(saved)) return;
            const valid = saved.filter(p => projectPaths.has(p));
            if (valid.length > 0) {
                setSelectedProjects(valid);
                restoredSelectedRef.current = true;
            }
        } catch (_) { }
    }, [state.projects.length, state.currentPath, projectPaths, setSelectedProjects]);

    React.useEffect(() => {
        if (selectedProjects.length === 0) return;
        try {
            localStorage.setItem(selectedProjectsKey(state.currentPath || ''), JSON.stringify(selectedProjects));
        } catch (_) { }
    }, [selectedProjects, state.currentPath]);

    // ─── Terminal Tab Management ─────────────────────────────────────────────
    React.useEffect(() => {
        if (state.targetTerminalTab) {
            setActiveTerminalTabStore(state.targetTerminalTab);
            setTargetTerminalTab(null);
        }
    }, [state.targetTerminalTab, setTargetTerminalTab, setActiveTerminalTabStore]);

    React.useEffect(() => {
        if (processIds.length === 0) return;
        const isValid = activeTerminalTab && processIds.includes(activeTerminalTab);
        if (isValid) return;
        try {
            const saved = localStorage.getItem(activeTerminalKey(state.currentPath || ''));
            if (saved && processIds.includes(saved)) {
                setActiveTerminalTabStore(saved);
                return;
            }
        } catch (_) { }
        setActiveTerminalTab(processIds[0]);
    }, [processIds, state.currentPath, activeTerminalTab, setActiveTerminalTab, setActiveTerminalTabStore]);
}
