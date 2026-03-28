import { create } from 'zustand';

type CwTab = 'settings' | 'logs' | 'metrics' | 'ec2' | 'api-gateway' | 'step-functions' | 'ecs' | 'lambda';

interface CwState {
    activeTab: CwTab;
    preloadedMetric: {
        namespace: string;
        metricName: string;
        dimensions: { name: string; value: string }[];
    } | null;
    preloadedLogGroup: string | null;
}

interface CwActions {
    setActiveTab: (tab: CwTab) => void;
    goToEcs: (clusterArn: string, serviceArn?: string) => void;
    goToMetrics: (namespace: string, metricName: string, dimensions: { name: string; value: string }[]) => void;
    clearPreloadedMetric: () => void;
    goToLogs: (logGroup: string) => void;
    clearPreloadedLogGroup: () => void;
}

export const useCwStore = create<CwState & CwActions>((set) => ({
    activeTab: 'settings',
    preloadedMetric: null,
    preloadedLogGroup: null,

    setActiveTab: (tab) => set({ activeTab: tab }),
    
    goToEcs: (_clusterArn, _serviceArn) => {
        set({ activeTab: 'ecs' });
        // Handled by ecsStore later if needed, prefixing with _ to satisfy lint
    },
    
    goToMetrics: (namespace, metricName, dimensions) => set({ 
        activeTab: 'metrics', 
        preloadedMetric: { namespace, metricName, dimensions } 
    }),
    
    clearPreloadedMetric: () => set({ preloadedMetric: null }),

    goToLogs: (logGroup) => set({ activeTab: 'logs', preloadedLogGroup: logGroup }),
    
    clearPreloadedLogGroup: () => set({ preloadedLogGroup: null }),
}));
