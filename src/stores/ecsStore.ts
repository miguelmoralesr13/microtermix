import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ResourcePrefixes {
    ms: string[];
    ts: string[];
    mfe: string[];
}

interface EcsState {
    selectedClusterArn: string | null;
    selectedServiceArn: string | null;
    resourcePrefixes: ResourcePrefixes;
    
    setSelectedClusterArn: (arn: string | null) => void;
    setSelectedServiceArn: (arn: string | null) => void;
    setResourcePrefixes: (prefixes: ResourcePrefixes) => void;
}

export const useEcsStore = create<EcsState>()(
    persist(
        (set) => ({
            selectedClusterArn: null,
            selectedServiceArn: null,
            resourcePrefixes: {
                ms: ['ms-'],
                ts: ['ts-'],
                mfe: ['mfe-'],
            },

            setSelectedClusterArn: (arn) => set({ selectedClusterArn: arn, selectedServiceArn: null }),
            setSelectedServiceArn: (arn) => set({ selectedServiceArn: arn }),
            setResourcePrefixes: (prefixes) => set({ resourcePrefixes: prefixes }),
        }),
        {
            name: 'microtermix-ecs',
            partialize: (state) => ({ resourcePrefixes: state.resourcePrefixes }),
        }
    )
);
