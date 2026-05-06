/**
 * Tauri adapter implementing SonarApiPort.
 * Bridges the application layer to Tauri's HTTP client.
 */
import { invoke } from '@tauri-apps/api/core';
import type { SonarApiPort } from '../application/ports/SonarPorts';
import type { SonarAccount } from '../domain/SonarAccount';
import type { SonarMetrics, SonarIssue, SonarLocalConfig } from '../domain/SonarMetrics';
import type { SonarRule } from '../domain/SonarRule';
import { normalizeSonarUrl, buildAuthHeader } from '../domain/SonarAccount';
import { numericToGrade } from '../domain/SonarMetrics';

interface TauriHttpResponse {
  is_error: boolean;
  error_msg?: string;
  status: number;
  body: string;
}

/**
 * Tauri-based implementation of the Sonar API port.
 * Uses `invoke('execute_http_request')` to bypass CORS.
 */
export class TauriSonarApiAdapter implements SonarApiPort {
  async fetchMetrics(
    projectKey: string,
    account: SonarAccount,
    token: string,
  ): Promise<SonarMetrics> {
    const baseUrl = normalizeSonarUrl(account.serverUrl);
    const metricKeys = 'alert_status,bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,reliability_rating,security_rating,sqale_rating';

    let url = `${baseUrl}/api/measures/component?component=${encodeURIComponent(projectKey.trim())}&metricKeys=${metricKeys}`;
    if (account.organization?.trim()) {
      url += `&organization=${encodeURIComponent(account.organization.trim())}`;
    }

    const response = await this.invokeGet<TauriHttpResponse>(url, account.authType, token);
    const data = JSON.parse(response.body);
    const measures = data.component?.measures || [];
    const getVal = (k: string) => measures.find((m: { metric: string }) => m.metric === k)?.value as string | undefined;

    return {
      qualityGate: (getVal('alert_status') as SonarMetrics['qualityGate']) || 'NONE',
      reliability: numericToGrade(getVal('reliability_rating')),
      security: numericToGrade(getVal('security_rating')),
      maintainability: numericToGrade(getVal('sqale_rating')),
      bugs: parseInt(getVal('bugs') || '0', 10),
      vulnerabilities: parseInt(getVal('vulnerabilities') || '0', 10),
      codeSmells: parseInt(getVal('code_smells') || '0', 10),
      coverage: parseFloat(getVal('coverage') || '0'),
      duplications: parseFloat(getVal('duplicated_lines_density') || '0'),
    };
  }

  async fetchIssues(
    projectKey: string,
    account: SonarAccount,
    token: string,
  ): Promise<SonarIssue[]> {
    const baseUrl = normalizeSonarUrl(account.serverUrl);
    let url = `${baseUrl}/api/issues/search?componentKeys=${encodeURIComponent(projectKey.trim())}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`;

    if (account.organization?.trim()) {
      url += `&organization=${encodeURIComponent(account.organization.trim())}`;
    }

    const response = await this.invokeGet<TauriHttpResponse>(url, account.authType, token);
    const data = JSON.parse(response.body);

    return (data.issues || []).map((i: Record<string, unknown>) => ({
      key: i.key as string,
      rule: i.rule as string,
      severity: i.severity as SonarIssue['severity'],
      type: (i.type as string) || 'CODE_SMELL',
      message: (i.message as string) || '',
      component: this.extractComponentPath(i.component as string),
      projectKey: this.extractProjectKey(i),
      line: i.line as number | undefined,
    }));
  }

  async fetchRules(
    account: SonarAccount,
    token: string,
    projectKey?: string,
    query?: string,
  ): Promise<SonarRule[]> {
    const baseUrl = normalizeSonarUrl(account.serverUrl);
    let url = `${baseUrl}/api/rules/search?ps=50`;
    if (projectKey) url += `&activation=true&projects=${encodeURIComponent(projectKey)}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    if (account.organization) url += `&organization=${account.organization}`;

    const response = await this.invokeGet<TauriHttpResponse>(url, account.authType, token);
    const data = JSON.parse(response.body);

    return (data.rules || []).map((r: Record<string, unknown>) => ({
      key: r.key as string,
      name: r.name as string,
      severity: r.severity as string,
      type: r.type as string,
      status: r.status as string,
      langName: r.langName as string | undefined,
      htmlDesc: r.htmlDesc as string | undefined,
    }));
  }

  async searchProjects(
    query: string,
    account: SonarAccount,
  ): Promise<Array<{ key: string; name: string }>> {
    const baseUrl = normalizeSonarUrl(account.serverUrl);
    let url = `${baseUrl}/api/projects/search?q=${encodeURIComponent(query)}&ps=5`;
    if (account.organization) url += `&organization=${account.organization}`;

    const response = await this.invokeGet<TauriHttpResponse>(url, account.authType, account.token);
    const data = JSON.parse(response.body);

    return (data.components || []).map((c: Record<string, unknown>) => ({
      key: c.key as string,
      name: c.name as string,
    }));
  }

  private async invokeGet<T>(
    url: string,
    authType: SonarAccount['authType'],
    token: string,
  ): Promise<T> {
    const response = await invoke('execute_http_request', {
      request: {
        url,
        method: 'GET',
        headers: { Authorization: buildAuthHeader(authType, token) },
        body: null,
      },
    }) as TauriHttpResponse;

    if (response.is_error) throw new Error(response.error_msg);
    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);

    return response as unknown as T;
  }

  private extractComponentPath(component: string): string {
    if (!component) return '';
    return component.includes(':') ? component.split(':').slice(1).join(':') : component;
  }

  private extractProjectKey(issue: Record<string, unknown>): string {
    if (issue.projectKey) return issue.projectKey as string;
    if (issue.project) return issue.project as string;
    if (issue.component && typeof issue.component === 'string' && issue.component.includes(':')) {
      return issue.component.split(':')[0];
    }
    return '';
  }
}

/**
 * Tauri adapter for reading local project configuration files.
 */
export class TauriSonarConfigAdapter {
  async readTextFile(path: string): Promise<string> {
    return invoke('read_text_file', { path }) as Promise<string>;
  }

  async readProjectSonarConfig(
    projectPath: string,
    propertiesFileName = 'sonar-project.properties',
  ): Promise<SonarLocalConfig> {
    try {
      const filePath = `${projectPath}/${propertiesFileName}`;
      const content = await this.readTextFile(filePath);
      const config = this.parseSonarProperties(content);
      return { isLocal: !!(config.serverUrl || config.token || config.projectKey), ...config };
    } catch {
      return { isLocal: false };
    }
  }

  private parseSonarProperties(content: string): { serverUrl?: string; token?: string; projectKey?: string } {
    const config: { serverUrl?: string; token?: string; projectKey?: string } = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;

      const [key, ...valParts] = trimmed.split('=');
      const value = valParts.join('=').trim();

      switch (key.trim()) {
        case 'sonar.host.url':
          config.serverUrl = value;
          break;
        case 'sonar.token':
        case 'sonar.login':
          config.token = value;
          break;
        case 'sonar.projectKey':
          config.projectKey = value;
          break;
      }
    }

    return config;
  }
}
