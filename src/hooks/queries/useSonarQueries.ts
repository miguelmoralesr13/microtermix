import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useSonarStore } from '../../stores/sonarStore';
import { fetchProjectMetrics, fetchProjectIssues, fetchSonarRules, getSonarAuthHeader, normalizeSonarUrl } from '../../utils/sonarUtils';

export const sonarKeys = {
    all: ['sonar'] as const,
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

export function useSonarMetrics(projectPath: string | undefined, projectKey: string | undefined) {
    const { getProjectAccount } = useSonarStore();
    const account = projectPath ? getProjectAccount(projectPath) : undefined;

    return useQuery({
        queryKey: sonarKeys.metrics(account?.id || 'none', projectKey || ''),
        queryFn: () => fetchProjectMetrics(projectKey!, account!, account!.token),
        enabled: !!projectKey && !!account?.token && !!account?.serverUrl,
        staleTime: 5 * 60 * 1000,
    });
}

export function useSonarIssues(projectPath: string | undefined, projectKey: string | undefined) {
    const { getProjectAccount } = useSonarStore();
    const account = projectPath ? getProjectAccount(projectPath) : undefined;

    return useQuery({
        queryKey: sonarKeys.issues(account?.id || 'none', projectKey || ''),
        queryFn: async () => {
            const rawIssues = await fetchProjectIssues(projectKey!, account!, account!.token);
            return rawIssues.map((i: any) => ({
                key: i.key,
                rule: i.rule,
                severity: i.severity as SonarIssue['severity'],
                type: i.type || 'CODE_SMELL',
                message: i.message || '',
                component: (i.component || '').split(':').slice(1).join(':') || i.component || '',
                line: i.line,
            })) as SonarIssue[];
        },
        enabled: !!projectKey && !!account?.token && !!account?.serverUrl && !!projectPath,
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
    const account = projectPath ? getProjectAccount(projectPath) : getActiveAccount();

    return useQuery({
        queryKey: sonarKeys.rules(account?.id || 'none', projectKey || 'global', query),
        queryFn: () => fetchSonarRules(account!, account!.token, projectKey, query),
        enabled: !!account?.token && !!account?.serverUrl,
        staleTime: 15 * 60 * 1000,
    });
}
