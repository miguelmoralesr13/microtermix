import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from '../../stores/awsStore';
import { Ec2Instance } from '../../components//aws/ec2Types';
import { cwGetLogGroups } from '../../services/cloudwatchApi';
import { toast } from 'sonner';

const getRustCreds = () => {
    const c = useAwsStore.getState().credentials;
    if (!c) return null;
    return {
        access_key_id: c.accessKeyId,
        secret_access_key: c.secretAccessKey,
        region: c.region,
        session_token: c.sessionToken || null,
    };
};

export const awsKeys = {
    all: ['aws'] as const,
    ec2: () => [...awsKeys.all, 'ec2'] as const,
    instances: () => [...awsKeys.ec2(), 'instances'] as const,
    cloudwatch: () => [...awsKeys.all, 'cloudwatch'] as const,
    logGroups: (pattern?: string) => [...awsKeys.cloudwatch(), 'log-groups', pattern || 'all'] as const,
};

export function useEc2Instances() {
    const credentials = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...awsKeys.instances(), credentials?.accessKeyId],
        queryFn: () => invoke<Ec2Instance[]>('ec2_list_instances', { credentials: getRustCreds() }),
        enabled: !!credentials,
        staleTime: 5 * 60 * 1000,
        refetchInterval: 60_000,
    });
}

export function useEc2Actions() {
    const queryClient = useQueryClient();

    const startMutation = useMutation({
        mutationFn: (instanceId: string) => invoke('ec2_start_instance', { credentials: getRustCreds(), instanceId }),
        onSuccess: () => {
            toast.success('Starting instance...');
            queryClient.invalidateQueries({ queryKey: awsKeys.instances() });
        },
        onError: (e) => toast.error(`Failed to start instance: ${e}`),
    });

    const stopMutation = useMutation({
        mutationFn: (instanceId: string) => invoke('ec2_stop_instance', { credentials: getRustCreds(), instanceId }),
        onSuccess: () => {
            toast.success('Stopping instance...');
            queryClient.invalidateQueries({ queryKey: awsKeys.instances() });
        },
        onError: (e) => toast.error(`Failed to stop instance: ${e}`),
    });

    return {
        startInstance: startMutation.mutate,
        stopInstance: stopMutation.mutate,
        isStarting: startMutation.isPending,
        isStopping: stopMutation.isPending,
    };
}

export function useLogGroups(pattern?: string) {
    const credentials = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...awsKeys.logGroups(pattern), credentials?.accessKeyId],
        queryFn: () => cwGetLogGroups(credentials!, pattern),
        enabled: !!credentials,
        staleTime: 10 * 60 * 1000,
    });
}
