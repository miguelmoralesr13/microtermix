import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from './awsStore';
import { EcsTaskDefinition } from '../components/cloudwatch/ecsTypes';

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
    
    fetchTaskDefinition: (taskDefinitionArn: string) => Promise<EcsTaskDefinition | null>;
    resolveSecret: (valueFrom: string) => Promise<string | null>;
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

            fetchTaskDefinition: async (taskDefinitionArn) => {
                const credentials = useAwsStore.getState().credentials;
                if (!credentials) return null;
                try {
                    const rustCreds = {
                        access_key_id: credentials.accessKeyId,
                        secret_access_key: credentials.secretAccessKey,
                        region: credentials.region,
                        session_token: credentials.sessionToken || null,
                    };
                    return await invoke<EcsTaskDefinition>('ecs_get_task_definition', { credentials: rustCreds, taskDefinitionArn });
                } catch (e) {
                    console.error('Error fetching task definition:', e);
                    return null;
                }
            },

            resolveSecret: async (valueFrom) => {
                const credentials = useAwsStore.getState().credentials;
                if (!credentials) return null;
                try {
                    const rustCreds = {
                        access_key_id: credentials.accessKeyId,
                        secret_access_key: credentials.secretAccessKey,
                        region: credentials.region,
                        session_token: credentials.sessionToken || null,
                    };
                    return await invoke<string>('ecs_resolve_secret', { credentials: rustCreds, valueFrom });
                } catch (e) {
                    console.error('Error resolving secret:', e);
                    return null;
                }
            },
        }),
        {
            name: 'microtermix-ecs',
            partialize: (state) => ({ resourcePrefixes: state.resourcePrefixes }),
        }
    )
);
