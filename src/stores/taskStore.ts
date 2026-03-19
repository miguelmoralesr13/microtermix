import { create } from 'zustand';

export type TaskStatus = 'idle' | 'running' | 'success' | 'error' | 'canceled';

interface TaskState {
    id: string;
    status: TaskStatus;
    exitCode?: number;
}

interface TaskStore {
    activeTasks: Record<string, TaskState>;
    setTaskStatus: (id: string, status: TaskStatus, exitCode?: number) => void;
    removeTask: (id: string) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
    activeTasks: {},
    setTaskStatus: (id, status, exitCode) => set((state) => ({
        activeTasks: {
            ...state.activeTasks,
            [id]: { id, status, exitCode }
        }
    })),
    removeTask: (id) => set((state) => {
        const next = { ...state.activeTasks };
        delete next[id];
        return { activeTasks: next };
    }),
}));
