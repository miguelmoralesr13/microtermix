import { useQuery } from '@tanstack/react-query';
import { useZeplinStore } from '../../stores/zeplinStore';
import { 
    fetchZeplinProjects, fetchZeplinProjectDetails, fetchZeplinScreens, 
    fetchZeplinFlows, fetchZeplinFlowDetails, fetchZeplinScreenDetails, 
    fetchZeplinSections 
} from '../../services/zeplinApi';

export const zeplinKeys = {
    all: ['zeplin'] as const,
    projects: (accountId: string) => [...zeplinKeys.all, 'projects', accountId] as const,
    projectDetails: (accountId: string, projectId: string) => [...zeplinKeys.all, 'project-details', accountId, projectId] as const,
    screens: (accountId: string, projectId: string) => [...zeplinKeys.all, 'screens', accountId, projectId] as const,
    flows: (accountId: string, projectId: string) => [...zeplinKeys.all, 'flows', accountId, projectId] as const,
    sections: (accountId: string, projectId: string) => [...zeplinKeys.all, 'sections', accountId, projectId] as const,
    screenDetails: (accountId: string, projectId: string, screenId: string) => [...zeplinKeys.all, 'screen-details', accountId, projectId, screenId] as const,
    flowDetails: (accountId: string, projectId: string, flowId: string) => [...zeplinKeys.all, 'flow-details', accountId, projectId, flowId] as const,
};

export function useZeplinProjects() {
    const { activeAccountId, accounts } = useZeplinStore();
    const account = accounts.find(a => a.id === activeAccountId) || accounts[0];
    
    return useQuery({
        queryKey: zeplinKeys.projects(account?.id || 'none'),
        queryFn: () => fetchZeplinProjects(account!.token),
        enabled: !!account?.token,
        staleTime: 5 * 60 * 1000,
    });
}

export function useZeplinProjectData(projectId: string | undefined) {
    const { activeAccountId, accounts } = useZeplinStore();
    const account = accounts.find(a => a.id === activeAccountId) || accounts[0];
    const token = account?.token;

    const screensQuery = useQuery({
        queryKey: zeplinKeys.screens(account?.id || 'none', projectId || ''),
        queryFn: () => fetchZeplinScreens(token!, projectId!),
        enabled: !!token && !!projectId,
        staleTime: 5 * 60 * 1000,
    });

    const flowsQuery = useQuery({
        queryKey: zeplinKeys.flows(account?.id || 'none', projectId || ''),
        queryFn: () => fetchZeplinFlows(token!, projectId!),
        enabled: !!token && !!projectId,
        staleTime: 5 * 60 * 1000,
    });

    const sectionsQuery = useQuery({
        queryKey: zeplinKeys.sections(account?.id || 'none', projectId || ''),
        queryFn: async () => {
            const [basicSections, projectDetails] = await Promise.all([
                fetchZeplinSections(token!, projectId!, false),
                fetchZeplinProjectDetails(token!, projectId!)
            ]);
            
            const allSections = [...(basicSections || [])];
            const detailSections = projectDetails?.sections || projectDetails?.screen_sections || [];
            if (Array.isArray(detailSections)) {
                detailSections.forEach((s: any) => {
                    if (!allSections.some(as => as.id === s.id)) allSections.push(s);
                });
            }
            return allSections;
        },
        enabled: !!token && !!projectId,
        staleTime: 5 * 60 * 1000,
    });

    return {
        screens: screensQuery.data || [],
        flows: flowsQuery.data || [],
        sections: sectionsQuery.data || [],
        isLoading: screensQuery.isLoading || flowsQuery.isLoading || sectionsQuery.isLoading,
        isError: screensQuery.isError || flowsQuery.isError || sectionsQuery.isError,
    };
}

export function useZeplinScreenDetails(projectId: string | undefined, screenId: string | null) {
    const { activeAccountId, accounts } = useZeplinStore();
    const account = accounts.find(a => a.id === activeAccountId) || accounts[0];
    const token = account?.token;

    return useQuery({
        queryKey: zeplinKeys.screenDetails(account?.id || 'none', projectId || '', screenId || ''),
        queryFn: () => fetchZeplinScreenDetails(token!, projectId!, screenId!),
        enabled: !!token && !!projectId && !!screenId,
        staleTime: 10 * 60 * 1000,
    });
}

export function useZeplinFlowDetails(projectId: string | undefined, flowId: string | null) {
    const { activeAccountId, accounts } = useZeplinStore();
    const account = accounts.find(a => a.id === activeAccountId) || accounts[0];
    const token = account?.token;

    return useQuery({
        queryKey: zeplinKeys.flowDetails(account?.id || 'none', projectId || '', flowId || ''),
        queryFn: () => fetchZeplinFlowDetails(token!, projectId!, flowId!),
        enabled: !!token && !!projectId && !!flowId && !flowId.startsWith('section-'),
        staleTime: 10 * 60 * 1000,
    });
}
