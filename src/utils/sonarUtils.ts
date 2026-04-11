import { invoke } from '@tauri-apps/api/core';
import type { SonarMetrics, SonarAccount } from '../stores/sonarStore';

export function normalizeSonarUrl(url: string | undefined): string {
    if (!url) return '';
    let normalized = url.trim().replace(/\/+$/, '');
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        // Por defecto usamos http si no se especifica, común en IPs locales/privadas
        normalized = `http://${normalized}`;
    }
    return normalized;
}

export function getSonarAuthHeader(authType: 'basic' | 'bearer', token: string): string {
    return authType === 'bearer'
        ? `Bearer ${token}`
        : `Basic ${btoa(token + ':')}`;
}

export async function fetchProjectMetrics(projectKey: string, account: SonarAccount, effectiveToken: string): Promise<SonarMetrics> {
    const baseUrl = normalizeSonarUrl(account.serverUrl);
    const metricKeys = 'alert_status,bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,reliability_rating,security_rating,sqale_rating';
    
    let url = `${baseUrl}/api/measures/component?component=${encodeURIComponent(projectKey.trim())}&metricKeys=${metricKeys}`;
    if (account.organization && account.organization.trim() !== '') {
        url += `&organization=${encodeURIComponent(account.organization.trim())}`;
    }

    console.log(`[Sonar] Fetching metrics: ${url}`);

    const response = await invoke('execute_http_request', {
        request: {
            url,
            method: 'GET',
            headers: { Authorization: getSonarAuthHeader(account.authType, effectiveToken) },
            body: null
        }
    }) as any;

    if (response.is_error) throw new Error(response.error_msg);
    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);

    const data = JSON.parse(response.body);
    const measures = data.component?.measures || [];
    const getVal = (k: string) => measures.find((m: any) => m.metric === k)?.value;
    const grade = (v?: string) => {
        if (!v) return 'N/A';
        const n = parseFloat(v);
        return n <= 1 ? 'A' : n <= 2 ? 'B' : n <= 3 ? 'C' : n <= 4 ? 'D' : 'E';
    };

    return {
        qualityGate: (getVal('alert_status') as any) || 'NONE',
        reliability: grade(getVal('reliability_rating')),
        security: grade(getVal('security_rating')),
        maintainability: grade(getVal('sqale_rating')),
        bugs: parseInt(getVal('bugs') || '0'),
        vulnerabilities: parseInt(getVal('vulnerabilities') || '0'),
        codeSmells: parseInt(getVal('code_smells') || '0'),
        coverage: parseFloat(getVal('coverage') || '0'),
        duplications: parseFloat(getVal('duplicated_lines_density') || '0'),
    };
}

export async function fetchProjectIssues(projectKey: string, account: SonarAccount, effectiveToken: string): Promise<any[]> {
    const baseUrl = normalizeSonarUrl(account.serverUrl);
    
    // Usamos statuses en lugar de resolved=false para mayor compatibilidad con versiones viejas de Sonar.
    // También probamos con la key tal cual llega.
    const trimmedKey = projectKey.trim();
    let url = `${baseUrl}/api/issues/search?componentKeys=${encodeURIComponent(trimmedKey)}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`;
    
    if (account.organization && account.organization.trim() !== '') {
        url += `&organization=${encodeURIComponent(account.organization.trim())}`;
    }

    console.log(`[Sonar API] Fetching: ${url}`);

    const response = await invoke('execute_http_request', {
        request: {
            url,
            method: 'GET',
            headers: { Authorization: getSonarAuthHeader(account.authType, effectiveToken) },
            body: null
        }
    }) as any;

    if (response.is_error) throw new Error(response.error_msg);
    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);

    const data = JSON.parse(response.body);
    // Mapeo robusto: intentamos sacar la projectKey de varios campos posibles.
    return (data.issues || []).map((i: any) => ({ 
        ...i, 
        projectKey: i.project || i.projectKey || (i.component?.includes(':') ? i.component.split(':')[0] : '')
    }));
}

export async function fetchSonarRules(account: SonarAccount, effectiveToken: string, projectKey?: string, query?: string): Promise<any[]> {
    const baseUrl = normalizeSonarUrl(account.serverUrl);
    let url = `${baseUrl}/api/rules/search?ps=50`;
    if (projectKey) url += `&activation=true&projects=${encodeURIComponent(projectKey)}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    if (account.organization) url += `&organization=${account.organization}`;

    const response = await invoke('execute_http_request', {
        request: {
            url,
            method: 'GET',
            headers: { Authorization: getSonarAuthHeader(account.authType, effectiveToken) },
            body: null
        }
    }) as any;

    if (response.is_error) throw new Error(response.error_msg);
    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);

    const data = JSON.parse(response.body);
    return (data.rules || []).map((r: any) => ({
        key: r.key,
        name: r.name,
        severity: r.severity,
        type: r.type,
        status: r.status,
        lang: r.lang,
        langName: r.langName,
        htmlDesc: r.htmlDesc
    }));
}

export async function parseSonarProperties(content: string): Promise<{serverUrl?: string, token?: string, projectKey?: string}> {
    const config: {serverUrl?: string, token?: string, projectKey?: string} = {};
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...valParts] = trimmed.split('=');
        const value = valParts.join('=').trim();
        
        switch (key.trim()) {
            case 'sonar.host.url': config.serverUrl = value; break;
            case 'sonar.token': 
            case 'sonar.login': config.token = value; break;
            case 'sonar.projectKey': config.projectKey = value; break;
        }
    }
    return config;
}

export async function readProjectSonarConfig(projectPath: string, propertiesFileName: string = 'sonar-project.properties'): Promise<{isLocal: boolean, serverUrl?: string, token?: string, projectKey?: string}> {
    try {
        const filePath = `${projectPath}/${propertiesFileName}`;
        console.log(`[Sonar] Reading config from ${filePath}`);
        const content = await invoke('read_text_file', { path: filePath }) as string;
        const config = await parseSonarProperties(content);
        return { isLocal: !!(config.serverUrl || config.token || config.projectKey), ...config };
    } catch (e) {
        console.log(`[Sonar] No local config found at ${projectPath}`);
        return { isLocal: false };
    }
}
