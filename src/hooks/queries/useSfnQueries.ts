import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from '../../stores/awsStore';
import { SfnMachine, SfnExecution, SfnStep } from '../../stores/sfnStore';
import { toast } from 'sonner';

const getRustCreds = () => {
    const credentials = useAwsStore.getState().credentials;
    if (!credentials) return null;
    return {
        access_key_id: credentials.accessKeyId,
        secret_access_key: credentials.secretAccessKey,
        region: credentials.region,
        session_token: credentials.sessionToken || null,
    };
};

export const sfnKeys = {
    all: ['sfn'] as const,
    machines: () => [...sfnKeys.all, 'machines'] as const,
    definition: (machineArn: string) => [...sfnKeys.all, 'definition', machineArn] as const,
    executions: (machineArn: string) => [...sfnKeys.all, 'executions', machineArn] as const,
    history: (executionArn: string) => [...sfnKeys.all, 'history', executionArn] as const,
};

export function useSfnMachines() {
    const credentials = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...sfnKeys.machines(), credentials?.accessKeyId],
        queryFn: () => invoke<SfnMachine[]>('sfn_list_state_machines', { credentials: getRustCreds() }),
        enabled: !!credentials,
        staleTime: 5 * 60 * 1000,
    });
}

export function useSfnDefinition(machineArn: string | null) {
    const credentials = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...sfnKeys.definition(machineArn || ''), credentials?.accessKeyId],
        queryFn: () => invoke<{ definition: string, logGroupName: string | null }>('sfn_describe_state_machine', {
            credentials: getRustCreds(),
            machineArn
        }),
        enabled: !!credentials && !!machineArn,
        staleTime: 10 * 60 * 1000,
    });
}

export function useSfnExecutions(machineArn: string | null, machineType?: string, logGroupName?: string | null) {
    const credentials = useAwsStore(s => s.credentials);

    return useQuery({
        queryKey: [...sfnKeys.executions(machineArn || ''), credentials?.accessKeyId, logGroupName],
        queryFn: async () => {
            const creds = getRustCreds();
            const isExpress = machineType?.includes('EXPRESS');

            if (isExpress && logGroupName) {
                try {
                    return await invoke<SfnExecution[]>('sfn_list_express_executions_from_logs', {
                        credentials: creds,
                        logGroup: logGroupName
                    });
                } catch (e) {
                    console.warn("Failed express logs fetch, falling back", e);
                }
            }

            return await invoke<SfnExecution[]>('sfn_list_executions', {
                credentials: creds,
                machineArn
            });
        },
        enabled: !!credentials && !!machineArn,
        refetchInterval: 30_000, // Auto refresh executions
    });
}

export function useSfnHistory(executionArn: string | null, machineType?: string, logGroupName?: string | null) {
    const credentials = useAwsStore(s => s.credentials);
    return useQuery({
        queryKey: [...sfnKeys.history(executionArn || ''), credentials?.accessKeyId],
        queryFn: async () => {
            const creds = getRustCreds();
            const isExpress = machineType?.includes('EXPRESS');

            if (isExpress && logGroupName) {
                return await invoke<SfnStep[]>('sfn_get_express_execution_history_from_logs', {
                    credentials: creds,
                    logGroup: logGroupName,
                    executionArn
                });
            }

            return await invoke<SfnStep[]>('sfn_get_execution_history', {
                credentials: creds,
                executionArn
            });
        },
        enabled: !!credentials && !!executionArn,
    });
}

export function useStartSfnExecution() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ machineArn, input }: { machineArn: string, input: string }) => {
            return await invoke('sfn_start_execution', {
                credentials: getRustCreds(),
                machineArn,
                input
            });
        },
        onSuccess: (_, variables) => {
            toast.success('Execution started successfully');
            queryClient.invalidateQueries({ queryKey: sfnKeys.executions(variables.machineArn) });
        },
        onError: (e) => {
            toast.error(`Failed to start execution: ${e}`);
        }
    });
}
