import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

export interface JdkInfo {
    name: string;
    path: string;
    version: string;
}

interface ToolStore {
    jdks: JdkInfo[];
    downloading: boolean;
    error: string | null;

    // Actions
    fetchJdks: () => Promise<void>;
    downloadJdk: (version: number) => Promise<void>;
    // Map of projectPath -> jdkPath
    projectJdks: Record<string, string>;
    setProjectJdk: (projectPath: string, jdkPath: string | null) => void;
}

export const useToolStore = create<ToolStore>()(
    devtools(
        persist(
            (set, get) => ({
                jdks: [],
                downloading: false,
                error: null,
                projectJdks: {},

                fetchJdks: async () => {
                    try {
                        const jdks = await invoke<JdkInfo[]>('list_local_jdks');
                        set({ jdks });
                    } catch (e) {
                        console.error('Failed to fetch JDKs', e);
                    }
                },

                downloadJdk: async (version: number) => {
                    set({ downloading: true, error: null });
                    try {
                        await invoke('download_jdk', { version });
                        await get().fetchJdks();
                    } catch (e: any) {
                        set({ error: e.toString() });
                    } finally {
                        set({ downloading: false });
                    }
                },

                setProjectJdk: (projectPath, jdkPath) => {
                    set(state => {
                        const next = { ...state.projectJdks };
                        if (jdkPath) {
                            next[projectPath] = jdkPath;
                        } else {
                            delete next[projectPath];
                        }
                        return { projectJdks: next };
                    });
                }
            }),
            {
                name: 'microtermix-tools-store',
                partialize: (state) => ({ projectJdks: state.projectJdks }),
            }
        ),
        { name: 'ToolStore' }
    )
);
