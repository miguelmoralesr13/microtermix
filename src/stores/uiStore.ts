import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface UIStore {
    selectedProjects: string[];
    multiScript: string;
    globalEnvName: string;
    vitePreviewOpen: boolean;
    
    // Actions
    setSelectedProjects: (projects: string[]) => void;
    setMultiScript: (script: string) => void;
    setGlobalEnvName: (env: string) => void;
    setVitePreviewOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>()(
    devtools(
        persist(
            (set) => ({
                selectedProjects: [],
                multiScript: localStorage.getItem('microtermix-multi-script') || '',
                globalEnvName: localStorage.getItem('microtermix-multi-env-name') || 'dev',
                vitePreviewOpen: localStorage.getItem('microtermix-vite-preview-open') === '1',

                setSelectedProjects: (selectedProjects) => set({ selectedProjects }),
                setMultiScript: (multiScript) => set({ multiScript }),
                setGlobalEnvName: (globalEnvName) => set({ globalEnvName }),
                setVitePreviewOpen: (vitePreviewOpen) => set({ vitePreviewOpen }),
            }),
            {
                name: 'microtermix-ui-store',
            }
        ),
        { name: 'UIStore' }
    )
);
