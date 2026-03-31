import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { SonarMetrics, SonarConfig } from '../stores/sonarStore';

export function normalizeSonarUrl(url: string): string {
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

export async function fetchProjectMetrics(projectKey: string, config: SonarConfig, effectiveToken: string): Promise<SonarMetrics> {
    const baseUrl = normalizeSonarUrl(config.serverUrl);
    const metricKeys = 'alert_status,bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,reliability_rating,security_rating,sqale_rating';
    const url = `${baseUrl}/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=${metricKeys}`;

    const resp = await tauriFetch(url, { headers: { Authorization: getSonarAuthHeader(config.authType, effectiveToken) } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json() as any;
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
