import { create } from 'zustand';

export type DockerTab = 'containers' | 'images' | 'volumes' | 'networks';
export type DockerViewMode = 'list' | 'terminal' | 'logs';

interface DockerState {
    selectedContainerId: string | null;
    setSelectedContainerId: (id: string | null) => void;
    activeTab: DockerTab;
    setActiveTab: (tab: DockerTab) => void;
    fileExplorerOpen: boolean;
    setFileExplorerOpen: (open: boolean) => void;
    
    // Integrated view state
    viewMode: DockerViewMode;
    setViewMode: (mode: DockerViewMode) => void;
    activeServiceId: string | null;
    setActiveServiceId: (id: string | null) => void;
    bottomPanelHeight: number;
    setBottomPanelHeight: (height: number) => void;

    // File viewer state
    openedFile: { name: string; path: string; content: string } | null;
    setOpenedFile: (file: { name: string; path: string; content: string } | null) => void;

    // Inspect state
    inspectResourceId: string | null;
    setInspectResourceId: (id: string | null) => void;
}

export const useDockerStore = create<DockerState>((set) => ({
    selectedContainerId: null,
    setSelectedContainerId: (id) => set({ selectedContainerId: id }),
    activeTab: 'containers',
    setActiveTab: (tab) => set({ activeTab: tab }),
    fileExplorerOpen: false,
    setFileExplorerOpen: (open) => set({ fileExplorerOpen: open }),
    
    viewMode: 'list',
    setViewMode: (mode) => set({ viewMode: mode }),
    activeServiceId: null,
    setActiveServiceId: (id) => set({ activeServiceId: id }),
    bottomPanelHeight: 300,
    setBottomPanelHeight: (height) => set({ bottomPanelHeight: height }),

    openedFile: null,
    setOpenedFile: (file) => set({ openedFile: file }),

    inspectResourceId: null,
    setInspectResourceId: (id) => set({ inspectResourceId: id })
}));
