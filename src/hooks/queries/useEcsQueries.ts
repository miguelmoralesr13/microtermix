import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from '../../stores/awsStore';
import { EcsCluster, EcsService, EcsTask, EcsTaskDefinition } from '../../components/cloudwatch/ecsTypes';

const toEcsRust = (cfg: any) => ({
    access_key_id: cfg.accessKeyId,
    secret_access_key: cfg.secretAccessKey,
    region: cfg.region,
    session_token: cfg.sessionToken || null,
});

export const ecsKeys = {
    all: ['ecs'] as const,
    clusters: () => [...ecsKeys.all, 'clusters'] as const,
    services: (clusterArn: string | null) => [...ecsKeys.all, 'services', clusterArn] as const,
    tasks: (clusterArn: string | null, serviceName: string | undefined) => [...ecsKeys.all, 'tasks', clusterArn, serviceName] as const,
    taskDefinition: (taskDefArn: string) => [...ecsKeys.all, 'task-definition', taskDefArn] as const,
    secret: (valueFrom: string) => [...ecsKeys.all, 'secret', valueFrom] as const,
};

export function useEcsClusters() {
    const cfg = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...ecsKeys.clusters(), cfg?.accessKeyId, cfg?.region],
        queryFn: () => invoke<EcsCluster[]>('ecs_list_clusters', { credentials: toEcsRust(cfg) }),
        staleTime: 5 * 60 * 1000,
        refetchInterval: 60_000,
        enabled: !!cfg?.accessKeyId && !!cfg?.region,
    });
}

export function useEcsServices(clusterArn: string | null) {
    const cfg = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...ecsKeys.services(clusterArn), cfg?.accessKeyId],
        queryFn: () => invoke<EcsService[]>('ecs_list_services', { credentials: toEcsRust(cfg), clusterArn }),
        staleTime: 5 * 60 * 1000,
        enabled: !!clusterArn && !!cfg?.accessKeyId,
    });
}

export function useEcsTasks(clusterArn: string | null, serviceName: string | undefined) {
    const cfg = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...ecsKeys.tasks(clusterArn, serviceName), cfg?.accessKeyId],
        queryFn: () => invoke<EcsTask[]>('ecs_list_tasks', { 
            credentials: toEcsRust(cfg), 
            clusterArn, 
            serviceName 
        }),
        staleTime: 2 * 60 * 1000,
        refetchInterval: 30_000,
        enabled: !!clusterArn && !!serviceName && !!cfg?.accessKeyId,
    });
}

export function useEcsTaskDefinition(taskDefArn: string | undefined) {
    const cfg = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...ecsKeys.taskDefinition(taskDefArn || ''), cfg?.accessKeyId],
        queryFn: () => invoke<EcsTaskDefinition>('ecs_get_task_definition', { credentials: toEcsRust(cfg), taskDefinitionArn: taskDefArn }),
        staleTime: 10 * 60 * 1000,
        enabled: !!taskDefArn && !!cfg?.accessKeyId,
    });
}

export function useEcsSecret(valueFrom: string | undefined) {
    const cfg = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...ecsKeys.secret(valueFrom || ''), cfg?.accessKeyId],
        queryFn: () => invoke<string>('ecs_resolve_secret', { credentials: toEcsRust(cfg), valueFrom }),
        staleTime: Infinity, // Secrets don't change often
        enabled: !!valueFrom && !!cfg?.accessKeyId,
    });
}
