import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export interface DockerContainer {
    id: string;
    name: string;
    image: string;
    state: string; // e.g. "running", "exited"
    status: string; // e.g. "Up 2 hours", "Exited (0) 2 hours ago"
    ports: string;
}

export interface DockerFileItem {
    name: string;
    size: string;
    isDir: boolean;
    permissions: string;
    date: string;
}

export interface DockerImageItem {
    id: string;
    repository: string;
    tag: string;
    size: string;
    createdSince: string;
}

export interface DockerVolumeItem {
    name: string;
    driver: string;
}

export interface DockerNetworkItem {
    id: string;
    name: string;
    driver: string;
    scope: string;
}

export const useDockerContainers = () => {
    return useQuery<DockerContainer[]>({
        queryKey: ['docker-containers'],
        queryFn: async () => {
            return await invoke<DockerContainer[]>('docker_ps');
        },
        refetchInterval: (query) => (query.state.error ? false : 3000), // Stop polling if Docker is not running
        retry: (failureCount, error) => {
            // No need to retry 3 times if the daemon is simply not running (very common developer state)
            const errMsg = String(error).toLowerCase();
            if (errMsg.includes('daemon') || errMsg.includes('connection') || errMsg.includes('not found')) {
                return false;
            }
            return failureCount < 2;
        }
    });
};

export const useDockerAction = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ action, containerId }: { action: 'start' | 'stop' | 'restart' | 'rm', containerId: string }) => {
            return await invoke('docker_action', { action, containerId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['docker-containers'] });
        }
    });
};

export const useStartDocker = () => {
    return useMutation({
        mutationFn: async () => invoke('start_docker')
    });
};

export const useDockerFiles = (containerId: string, path: string) => {
    return useQuery<DockerFileItem[]>({
        queryKey: ['docker-files', containerId, path],
        queryFn: async () => {
            return await invoke<DockerFileItem[]>('docker_list_files', { containerId, path });
        },
        enabled: !!containerId && !!path
    });
};

export const useDockerImages = () => {
    return useQuery<DockerImageItem[]>({
        queryKey: ['docker-images'],
        queryFn: async () => invoke<DockerImageItem[]>('docker_images'),
        refetchInterval: (query) => (query.state.error ? false : 5000),
        retry: false,
    });
};

export const useDockerVolumes = () => {
    return useQuery<DockerVolumeItem[]>({
        queryKey: ['docker-volumes'],
        queryFn: async () => invoke<DockerVolumeItem[]>('docker_volumes'),
        refetchInterval: (query) => (query.state.error ? false : 5000),
        retry: false,
    });
};

export const useDockerNetworks = () => {
    return useQuery<DockerNetworkItem[]>({
        queryKey: ['docker-networks'],
        queryFn: async () => invoke<DockerNetworkItem[]>('docker_networks'),
        refetchInterval: (query) => (query.state.error ? false : 5000),
        retry: false,
    });
};
