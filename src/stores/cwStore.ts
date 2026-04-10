import { create } from 'zustand';

export type CwTab = 'settings' | 'logs' | 'metrics' | 'ec2' | 'api-gateway' | 'step-functions' | 'ecs' | 'lambda' | 's3' | 'env-vars' | 'invoke-tester';

interface CwState {
    activeTab: CwTab;
    preloadedMetric: {
        namespace: string;
        metricName: string;
        dimensions: { name: string; value: string }[];
    } | null;
    preloadedLogGroup: string | null;
    preloadedSfnName: string | null;
    preloadedLambdaName: string | null;
    preloadedEcsServiceName: string | null;
    preloadedInvokerType: 'lambda' | 'sfn' | null;
    preloadedInvokerName: string | null;
}

interface CwActions {
    setActiveTab: (tab: CwTab) => void;
    goToEcs: (clusterArn: string, serviceArn?: string, serviceName?: string) => void;
    goToMetrics: (namespace: string, metricName: string, dimensions: { name: string; value: string }[]) => void;
    clearPreloadedMetric: () => void;
    goToLogs: (logGroup: string) => void;
    clearPreloadedLogGroup: () => void;
    goToSfn: (machineName: string) => void;
    clearPreloadedSfnName: () => void;
    goToLambda: (functionName: string) => void;
    clearPreloadedLambdaName: () => void;
    clearPreloadedEcsServiceName: () => void;
    goToInvokeLambda: (functionName: string) => void;
    goToInvokeSfn: (machineName: string) => void;
    clearPreloadedInvoker: () => void;
}

export const useCwStore = create<CwState & CwActions>((set) => ({
    activeTab: 'settings',
    preloadedMetric: null,
    preloadedLogGroup: null,
    preloadedSfnName: null,
    preloadedLambdaName: null,
    preloadedEcsServiceName: null,
    preloadedInvokerType: null,
    preloadedInvokerName: null,

    setActiveTab: (tab) => set({ activeTab: tab }),

    goToEcs: (_clusterArn, _serviceArn, serviceName) => {
        set({ activeTab: 'ecs', preloadedEcsServiceName: serviceName ?? null });
    },

    goToMetrics: (namespace, metricName, dimensions) => set({
        activeTab: 'metrics',
        preloadedMetric: { namespace, metricName, dimensions }
    }),

    clearPreloadedMetric: () => set({ preloadedMetric: null }),

    goToLogs: (logGroup) => set({ activeTab: 'logs', preloadedLogGroup: logGroup }),

    clearPreloadedLogGroup: () => set({ preloadedLogGroup: null }),

    goToSfn: (machineName) => set({ activeTab: 'step-functions', preloadedSfnName: machineName }),

    clearPreloadedSfnName: () => set({ preloadedSfnName: null }),

    goToLambda: (functionName) => set({ activeTab: 'lambda', preloadedLambdaName: functionName }),

    clearPreloadedLambdaName: () => set({ preloadedLambdaName: null }),

    clearPreloadedEcsServiceName: () => set({ preloadedEcsServiceName: null }),

    goToInvokeLambda: (functionName) => set({
        activeTab: 'invoke-tester',
        preloadedInvokerType: 'lambda',
        preloadedInvokerName: functionName,
    }),

    goToInvokeSfn: (machineName) => set({
        activeTab: 'invoke-tester',
        preloadedInvokerType: 'sfn',
        preloadedInvokerName: machineName,
    }),

    clearPreloadedInvoker: () => set({ preloadedInvokerType: null, preloadedInvokerName: null }),
}));
