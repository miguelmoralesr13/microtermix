import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { JdkInfo } from '../../stores/toolStore';
import { toast } from 'sonner';

export const toolKeys = {
    all: ['tools'] as const,
    jdks: () => [...toolKeys.all, 'jdks'] as const,
};

export function useJdks() {
    return useQuery({
        queryKey: toolKeys.jdks(),
        queryFn: () => invoke<JdkInfo[]>('list_local_jdks'),
        staleTime: 10 * 60 * 1000,
    });
}

export function useDownloadJdk() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (version: number) => invoke('download_jdk', { version }),
        onSuccess: () => {
            toast.success('JDK descargado con éxito');
            queryClient.invalidateQueries({ queryKey: toolKeys.jdks() });
        },
        onError: (e: any) => {
            toast.error(`Error al descargar JDK: ${e}`);
        }
    });
}
