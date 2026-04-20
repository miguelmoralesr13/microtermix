import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { DEFAULT_TERMINAL_THEME_ID } from '../lib/terminalThemes';

export interface UIStore {
    selectedProjects: string[];
    multiScript: string;
    globalEnvName: string;
    vitePreviewOpen: boolean;
    visibleUtilities: Record<string, boolean>;
    themeMode: 'dark' | 'light';
    accentColor: string;
    terminalThemeId: string;

    // Actions
    setSelectedProjects: (projects: string[] | ((prev: string[]) => string[])) => void;
    setMultiScript: (script: string) => void;
    setGlobalEnvName: (env: string) => void;
    setVitePreviewOpen: (open: boolean) => void;
    setVisibleUtilities: (visible: Record<string, boolean>) => void;
    toggleUtility: (key: string) => void;
    setThemeMode: (mode: 'dark' | 'light') => void;
    setAccentColor: (color: string) => void;
    setTerminalThemeId: (id: string) => void;
}

export const useUIStore = create<UIStore>()(
    devtools(
        persist(
            (set) => ({
                selectedProjects: [],
                multiScript: localStorage.getItem('microtermix-multi-script') || '',
                globalEnvName: localStorage.getItem('microtermix-multi-env-name') || 'dev',
                vitePreviewOpen: localStorage.getItem('microtermix-vite-preview-open') === '1',
                visibleUtilities: {},
                themeMode: 'dark' as const,
                accentColor: '#38bdf8',
                terminalThemeId: DEFAULT_TERMINAL_THEME_ID,

                setSelectedProjects: (projects) => set(s => ({
                    selectedProjects: typeof projects === 'function' ? projects(s.selectedProjects) : projects,
                })),
                setMultiScript: (multiScript) => set({ multiScript }),
                setGlobalEnvName: (globalEnvName) => set({ globalEnvName }),
                setVitePreviewOpen: (vitePreviewOpen) => set({ vitePreviewOpen }),
                setVisibleUtilities: (visibleUtilities) => set({ visibleUtilities }),
                toggleUtility: (key) => set((s) => ({
                    visibleUtilities: {
                        ...s.visibleUtilities,
                        [key]: s.visibleUtilities[key] === false ? true : false,
                    }
                })),
                setThemeMode: (themeMode) => set({ themeMode }),
                setAccentColor: (accentColor) => set({ accentColor }),
                setTerminalThemeId: (terminalThemeId) => set({ terminalThemeId }),
            }),
            {
                name: 'microtermix-ui-store',
            }
        ),
        { name: 'UIStore' }
    )
);
