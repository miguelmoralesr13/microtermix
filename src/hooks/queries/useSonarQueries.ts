import { useQuery } from '@tanstack/react-query';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { useSonarStore } from '../../stores/sonarStore';
import { fetchProjectMetrics, getSonarAuthHeader, normalizeSonarUrl } from '../../utils/sonarUtils';

export const sonarKeys = {
    all: ['sonar'] as const,
    metrics: (projectKey: string) => [...sonarKeys.all, 'metrics', projectKey] as const,
    issues: (projectKey: string) => [...sonarKeys.all, 'issues', projectKey] as const,
    search: (query: string) => [...sonarKeys.all, 'search', query] as const,
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

export function useSonarMetrics(projectKey: string | undefined) {
    const { config } = useSonarStore();
    
    return useQuery({
        queryKey: sonarKeys.metrics(projectKey || ''),
        queryFn: () => fetchProjectMetrics(projectKey!, config, config.token),
        enabled: !!projectKey && !!config.token && !!config.serverUrl,
        staleTime: 5 * 60 * 1000,
    });
}

export function useSonarIssues(projectKey: string | undefined) {
    const { config } = useSonarStore();
    const baseUrl = normalizeSonarUrl(config.serverUrl);

    return useQuery({
        queryKey: sonarKeys.issues(projectKey || ''),
        queryFn: async () => {
            const url = `${baseUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey!)}&resolved=false&ps=100`;
            const resp = await tauriFetch(url, { headers: { Authorization: getSonarAuthHeader(config.authType, config.token) } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json() as any;
            return (data.issues || []).map((i: any) => ({
                key: i.key,
                rule: i.rule,
                severity: i.severity as SonarIssue['severity'],
                type: i.type || 'CODE_SMELL',
                message: i.message || '',
                component: (i.component || '').split(':').slice(1).join(':') || i.component || '',
                line: i.line,
            })) as SonarIssue[];
        },
        enabled: !!projectKey && !!config.token && !!config.serverUrl,
        staleTime: 5 * 60 * 1000,
    });
}

export function useSonarProjectSearch(query: string, enabled: boolean = false) {
    const { config } = useSonarStore();
    const baseUrl = normalizeSonarUrl(config.serverUrl);

    return useQuery({
        queryKey: sonarKeys.search(query),
        queryFn: async () => {
            const url = `${baseUrl}/api/projects/search?q=${encodeURIComponent(query)}&ps=5`;
            const resp = await tauriFetch(url, { headers: { Authorization: getSonarAuthHeader(config.authType, config.token) } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json() as any;
            return (data.components || []).map((c: any) => ({ key: c.key, name: c.name }));
        },
        enabled: enabled && !!query && !!config.token && !!config.serverUrl,
    });
}
