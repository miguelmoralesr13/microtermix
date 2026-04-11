import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useSonarStore } from '../../stores/sonarStore';
import { 
    fetchProjectMetrics, fetchProjectIssues, fetchSonarRules, 
    getSonarAuthHeader, normalizeSonarUrl, readProjectSonarConfig 
} from '../../utils/sonarUtils';

export const sonarKeys = {
    all: ['sonar'] as const,
    config: (path: string) => [...sonarKeys.all, 'config', path] as const,
    metrics: (accountId: string, projectKey: string) => [...sonarKeys.all, 'metrics', accountId, projectKey] as const,
    issues: (accountId: string, projectKey: string) => [...sonarKeys.all, 'issues', accountId, projectKey] as const,
    search: (accountId: string, query: string) => [...sonarKeys.all, 'search', accountId, query] as const,
    rules: (accountId: string, projectKey: string, query: string) => [...sonarKeys.all, 'rules', accountId, projectKey, query] as const,
};

export interface SonarIssue {
    key: string;
    rule: string;
    severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
    type: string;
    message: string;
    component: string;
    projectKey: string;
    line?: number;
}

export interface SonarRule {
    key: string;
    name: string;
    severity: string;
    type: string;
    status: string;
    langName?: string;
    htmlDesc?: string;
}

export function useSonarLocalConfig(projectPath: string | undefined, propertiesFileName?: string) {
    return useQuery({
        queryKey: sonarKeys.config(projectPath || 'none'),
        queryFn: () => readProjectSonarConfig(projectPath!, propertiesFileName),
        enabled: !!projectPath,
        staleTime: 60 * 1000,
    });
}

export function useSonarMetrics(projectPath: string | undefined, projectKey: string | undefined) {
    const { getProjectAccount } = useSonarStore();
    const { data: localConfig } = useSonarLocalConfig(projectPath);
    
    const account = projectPath ? getProjectAccount(projectPath) : undefined;
    const effectiveKey = localConfig?.projectKey || projectKey;
    const effectiveToken = localConfig?.token || account?.token;
    const effectiveAccount = localConfig?.isLocal ? { ...account, ...localConfig } : account;

    return useQuery({
        queryKey: sonarKeys.metrics(effectiveAccount?.id || 'none', effectiveKey || ''),
        queryFn: () => fetchProjectMetrics(effectiveKey!, effectiveAccount as any, effectiveToken!),
        enabled: !!effectiveKey && !!effectiveToken && !!effectiveAccount?.serverUrl,
        staleTime: 5 * 60 * 1000,
    });
}

export function useSonarIssues(projectPath: string | undefined, projectKey: string | undefined) {
    const { getProjectAccount } = useSonarStore();
    const { data: localConfig } = useSonarLocalConfig(projectPath);

    const account = projectPath ? getProjectAccount(projectPath) : undefined;
    const effectiveKey = localConfig?.projectKey || projectKey;
    const effectiveToken = localConfig?.token || account?.token;
    const effectiveAccount = localConfig?.isLocal ? { ...account, ...localConfig } : account;

    return useQuery({
        queryKey: sonarKeys.issues(effectiveAccount?.id || 'none', effectiveKey || ''),
        queryFn: async () => {
            const rawIssues = await fetchProjectIssues(effectiveKey!, effectiveAccount as any, effectiveToken!);
            return rawIssues.map((i: any) => ({
                key: i.key,
                rule: i.rule,
                severity: i.severity as SonarIssue['severity'],
                type: i.type || 'CODE_SMELL',
                message: i.message || '',
                component: (i.component || '').split(':').slice(1).join(':') || i.component || '',
                projectKey: i.projectKey || i.project || '',
                line: i.line,
            })) as SonarIssue[];
        },
        enabled: !!effectiveKey && !!effectiveToken && !!effectiveAccount?.serverUrl && !!projectPath,
        staleTime: 5 * 60 * 1000,
    });
}

export function useSonarProjectSearch(query: string, enabled: boolean = false) {
    const { getActiveAccount } = useSonarStore();
    const account = getActiveAccount();
    const baseUrl = normalizeSonarUrl(account?.serverUrl);

    return useQuery({
        queryKey: sonarKeys.search(account?.id || 'none', query),
        queryFn: async () => {
            const url = `${baseUrl}/api/projects/search?q=${encodeURIComponent(query)}${account?.organization ? `&organization=${account.organization}` : ''}&ps=5`;
            
            const response = await invoke('execute_http_request', {
                request: {
                    url,
                    method: 'GET',
                    headers: { Authorization: getSonarAuthHeader(account!.authType, account!.token) },
                    body: null
                }
            }) as any;

            if (response.is_error) throw new Error(response.error_msg);
            if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
            
            const data = JSON.parse(response.body);
            return (data.components || []).map((c: any) => ({ key: c.key, name: c.name }));
        },
        enabled: enabled && !!query && !!account?.token && !!account?.serverUrl,
    });
}

export function useSonarRules(projectPath?: string, projectKey?: string, query: string = '') {
    const { getProjectAccount, getActiveAccount } = useSonarStore();
    const { data: localConfig } = useSonarLocalConfig(projectPath);

    const account = projectPath ? getProjectAccount(projectPath) : getActiveAccount();
    const effectiveKey = localConfig?.projectKey || projectKey;
    const effectiveToken = localConfig?.token || account?.token;
    const effectiveAccount = localConfig?.isLocal ? { ...account, ...localConfig } : account;

    return useQuery({
        queryKey: sonarKeys.rules(effectiveAccount?.id || 'none', effectiveKey || 'global', query),
        queryFn: () => fetchSonarRules(effectiveAccount as any, effectiveToken!, effectiveKey, query),
        enabled: !!effectiveToken && !!effectiveAccount?.serverUrl,
        staleTime: 15 * 60 * 1000,
    });
}
