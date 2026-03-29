import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface JdkInfo {
    name: string;
    path: string;
    version: string;
}

export interface ToolStore {
    // Map of projectPath -> jdkPath
    projectJdks: Record<string, string>;
    setProjectJdk: (projectPath: string, jdkPath: string | null) => void;
}

export const useToolStore = create<ToolStore>()(
    devtools(
        persist(
            (set) => ({
                projectJdks: {},

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
