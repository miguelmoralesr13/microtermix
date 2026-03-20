import { invoke } from '@tauri-apps/api/core';
import type { ZeplinProject, ZeplinScreen, ZeplinFlow, ZeplinSection } from '../types/zeplin';
import { useZeplinStore } from '../stores/zeplinStore';

const ZEPLIN_API_BASE = 'https://api.zeplin.dev/v1';

interface HttpResponse {
    status: number;
    body: string;
    is_error: boolean;
    error_msg?: string;
}

function generateCurl(url: string, method: string, headers: Record<string, string>, body?: any): string {
    let curl = `curl -X ${method} "${url}"`;
    Object.entries(headers).forEach(([k, v]) => {
        curl += ` -H "${k}: ${v}"`;
    });
    if (body) curl += ` -d '${JSON.stringify(body)}'`;
    return curl;
}

async function zeplinFetch(endpoint: string, token: string, options: any = {}) {
    const url = `${ZEPLIN_API_BASE}${endpoint}`;
    const method = options.method || 'GET';
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
    };

    const startTime = Date.now();
    const curl = generateCurl(url, method, headers, options.body);

    let response: HttpResponse;
    try {
        response = await invoke<HttpResponse>('execute_http_request', {
            request: { url, method, headers, body: options.body ? JSON.stringify(options.body) : null }
        });
    } catch (e: any) {
        useZeplinStore.getState().addLog({ id: crypto.randomUUID(), timestamp: Date.now(), method, url, headers, body: options.body, responseStatus: 0, responseBody: e.message, duration: Date.now() - startTime, curl });
        throw e;
    }

    const duration = Date.now() - startTime;
    let parsedBody: any;
    try { parsedBody = JSON.parse(response.body); } catch (e) { parsedBody = response.body; }

    useZeplinStore.getState().addLog({ id: crypto.randomUUID(), timestamp: Date.now(), method, url, headers, body: options.body, responseStatus: response.status, responseBody: parsedBody, duration, curl });

    if (response.is_error || response.status >= 400) {
        if (response.status === 404) return null; // IMPORTANTE: Devolvemos null para manejar el 404
        throw new Error(response.error_msg || `Zeplin API Error: ${response.status}`);
    }

    return parsedBody;
}

export async function verifyZeplinToken(token: string): Promise<any> {
    return zeplinFetch('/projects?limit=1', token);
}

export async function fetchZeplinProjects(token: string): Promise<ZeplinProject[]> {
    const res = await zeplinFetch('/projects', token);
    return res || [];
}

export async function fetchZeplinProjectDetails(token: string, projectId: string): Promise<any> {
    return zeplinFetch(`/projects/${projectId}`, token);
}

export async function fetchZeplinScreens(token: string, projectId: string): Promise<ZeplinScreen[]> {
    const res = await zeplinFetch(`/projects/${projectId}/screens?limit=100`, token);
    return res || [];
}

export async function fetchZeplinScreenDetails(token: string, projectId: string, screenId: string): Promise<any> {
    return zeplinFetch(`/projects/${projectId}/screens/${screenId}`, token);
}

// ENDPOINT ACTUALIZADO PARA FLOW BOARDS
export async function fetchZeplinFlows(token: string, projectId: string): Promise<ZeplinFlow[]> {
    // Intentamos flow_boards primero (arquitectura nueva)
    let res = await zeplinFetch(`/projects/${projectId}/flow_boards`, token);
    
    // Si falla o está vacío, probamos el endpoint clásico
    if (!res || (Array.isArray(res) && res.length === 0)) {
        res = await zeplinFetch(`/projects/${projectId}/flows`, token);
    }
    
    return Array.isArray(res) ? res : (res?.flow_boards || []);
}

export async function fetchZeplinFlowDetails(token: string, projectId: string, flowId: string): Promise<ZeplinFlow> {
    // Intentamos ambos endpoints para detalles
    let res = await zeplinFetch(`/projects/${projectId}/flow_boards/${flowId}`, token);
    if (!res) res = await zeplinFetch(`/projects/${projectId}/flows/${flowId}`, token);
    return res;
}

export async function fetchZeplinSections(token: string, projectId: string, isStyleguide = false): Promise<ZeplinSection[]> {
    const base = isStyleguide ? 'styleguides' : 'projects';
    // Intentamos /sections
    let res = await zeplinFetch(`/${base}/${projectId}/sections`, token);
    
    // Si falla, intentamos /screen_sections
    if (!res) res = await zeplinFetch(`/${base}/${projectId}/screen_sections`, token);
    
    if (!res) return [];
    if (Array.isArray(res)) return res;
    return res.sections || res.screen_sections || [];
}
