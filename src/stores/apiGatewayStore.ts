import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from './awsStore';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RestApiInfo {
    id: string;
    name: string;
    description: string | null;
    created_date: number | null;
}

export interface RestApiResource {
    id: string;
    parent_id: string | null;
    path: string;
    methods: string[];
}

export interface HttpApiInfo {
    api_id: string;
    name: string;
    protocol_type: string;
    description: string | null;
    created_date: number | null;
    api_endpoint: string | null;
}

export interface HttpApiRoute {
    route_id: string;
    route_key: string;
    target: string | null;
}

export interface RestMethodDetails {
    http_method: string;
    authorization_type: string | null;
    api_key_required: boolean;
    request_parameters: Record<string, boolean>;
    request_models: Record<string, string>;
    integration_type: string | null;
    integration_http_method: string | null;
    integration_uri: string | null;
    integration_timeout: number | null;
    integration_request_templates: Record<string, string>;
    method_responses: string[];
}

export interface HttpRouteIntegrationDetails {
    integration_id: string | null;
    integration_type: string | null;
    integration_uri: string | null;
    integration_method: string | null;
    connection_type: string | null;
    payload_format_version: string | null;
    timeout_in_millis: number | null;
    integration_request_templates: Record<string, string>;
}

export type SelectedApi =
    | { type: 'rest'; id: string; name: string }
    | { type: 'http'; id: string; name: string }
    | null;

export interface TesterEndpoint {
    apiId: string;
    method: string;
    path: string;
    resourceId: string;
    isRest: boolean;
    baseUrl: string;
    authType: string | null;
}

export interface InvokeResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
    duration_ms: number;
}

export interface FrontendInvokeRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;
    service: string;
    sign: boolean;
}

interface FetchAllResult {
    rest_apis: RestApiInfo[];
    http_apis: HttpApiInfo[];
}

interface ApiGatewayState {
    restApis: RestApiInfo[];
    httpApis: HttpApiInfo[];
    selectedApi: SelectedApi;
    restResources: Record<string, RestApiResource[]>;
    httpRoutes: Record<string, HttpApiRoute[]>;
    methodDetails: Record<string, RestMethodDetails | HttpRouteIntegrationDetails>;
    exportedSwagger: Record<string, string>;
    favoriteApis: string[];
    stages: Record<string, string[]>;
    selectedStage: Record<string, string>;
    jsonPresets: Record<string, string>;
    testerOpen: boolean;
    testerEndpoint: TesterEndpoint | null;
    testerResponse: InvokeResponse | null;
    loadingInvoke: boolean;
    loadingApis: boolean;
    loadingDetails: Record<string, boolean>;
    loadingMethodDetails: Record<string, boolean>;
    error: string | null;
}

interface ApiGatewayActions {
    fetchApis: () => Promise<void>;
    selectApi: (api: SelectedApi) => void;
    fetchApiDetails: (api: SelectedApi) => Promise<void>;
    fetchMethodDetails: (apiId: string, resourceId: string, method: string, isRest: boolean) => Promise<void>;
    exportSwagger: (apiId: string, stageName: string, isRest: boolean) => Promise<string | null>;
    toggleFavorite: (id: string) => void;
    fetchStages: (apiId: string, isRest: boolean) => Promise<void>;
    setSelectedStage: (apiId: string, stage: string) => void;
    openTester: (endpoint: TesterEndpoint) => void;
    closeTester: () => void;
    invokeEndpoint: (req: FrontendInvokeRequest) => Promise<void>;
    savePreset: (key: string, json: string) => void;
    getPreset: (key: string) => string | null;
    refreshApi: (api: SelectedApi) => Promise<void>;
}

const getRustCreds = () => {
    const c = useAwsStore.getState().credentials;
    if (!c) return null;
    return {
        access_key_id: c.accessKeyId,
        secret_access_key: c.secretAccessKey,
        region: c.region,
        session_token: c.sessionToken || null,
    };
};

export const useApiGatewayStore = create<ApiGatewayState & ApiGatewayActions>()(
    devtools(
        persist(
            (set, get) => ({
                restApis: [],
                httpApis: [],
                selectedApi: null,
                restResources: {},
                httpRoutes: {},
                methodDetails: {},
                exportedSwagger: {},
                favoriteApis: [],
                stages: {},
                selectedStage: {},
                jsonPresets: {},
                testerOpen: false,
                testerEndpoint: null,
                testerResponse: null,
                loadingInvoke: false,
                loadingApis: false,
                loadingDetails: {},
                loadingMethodDetails: {},
                error: null,

                fetchApis: async () => {
                    const rustCreds = getRustCreds();
                    if (!rustCreds) { set({ error: 'No credentials configured' }); return; }

                    set({ loadingApis: true, error: null });
                    try {
                        const res = await invoke<FetchAllResult>('apigw_fetch_all', { credentials: rustCreds });
                        set({ restApis: res.rest_apis, httpApis: res.http_apis, loadingApis: false });
                    } catch (err: any) {
                        set({ error: String(err), loadingApis: false });
                    }
                },

                selectApi: (api) => {
                    set({ selectedApi: api });
                    if (api) {
                        get().fetchApiDetails(api);
                        get().fetchStages(api.id, api.type === 'rest');
                    }
                },

                fetchApiDetails: async (api) => {
                    if (!api) return;
                    // Cache hit: skip if already loaded
                    const s = get();
                    if (api.type === 'rest' && (s.restResources[api.id]?.length ?? 0) > 0) return;
                    if (api.type === 'http' && (s.httpRoutes[api.id]?.length ?? 0) > 0) return;

                    const rustCreds = getRustCreds();
                    if (!rustCreds) return;

                    set((state) => ({
                        loadingDetails: { ...state.loadingDetails, [api.id]: true },
                        error: null,
                    }));

                    try {
                        if (api.type === 'rest') {
                            const resources = await invoke<RestApiResource[]>('apigw_get_rest_api_resources', { credentials: rustCreds, restApiId: api.id });
                            set((state) => ({
                                restResources: { ...state.restResources, [api.id]: resources },
                                loadingDetails: { ...state.loadingDetails, [api.id]: false },
                            }));
                            // Prefetch all method details in parallel (background, non-blocking)
                            const pairs: [string, string][] = resources.flatMap(r =>
                                r.methods.map(m => [r.id, m] as [string, string])
                            );
                            Promise.all(pairs.map(([resourceId, method]) =>
                                get().fetchMethodDetails(api.id, resourceId, method, true)
                            )).catch(() => {/* silent — best-effort prefetch */});
                        } else {
                            const routes = await invoke<HttpApiRoute[]>('apigw_get_http_api_routes', { credentials: rustCreds, apiId: api.id });
                            set((state) => ({
                                httpRoutes: { ...state.httpRoutes, [api.id]: routes },
                                loadingDetails: { ...state.loadingDetails, [api.id]: false },
                            }));
                            // Prefetch all route integrations in parallel (background, non-blocking)
                            Promise.all(routes.map(r =>
                                get().fetchMethodDetails(api.id, r.route_id, r.route_key.split(' ')[0] || 'ANY', false)
                            )).catch(() => {/* silent — best-effort prefetch */});
                        }
                    } catch (err: any) {
                        set((state) => ({
                            error: String(err),
                            loadingDetails: { ...state.loadingDetails, [api.id]: false },
                        }));
                    }
                },

                fetchMethodDetails: async (apiId, resourceId, method, isRest) => {
                    const cacheKey = `${apiId}|${resourceId}|${method}`;
                    if (get().methodDetails[cacheKey]) return;

                    const rustCreds = getRustCreds();
                    if (!rustCreds) return;

                    set((state) => ({
                        loadingMethodDetails: { ...state.loadingMethodDetails, [cacheKey]: true },
                        error: null,
                    }));

                    try {
                        if (isRest) {
                            const details = await invoke<RestMethodDetails>('apigw_get_rest_method_details', { 
                                credentials: rustCreds, 
                                restApiId: apiId,
                                resourceId: resourceId,
                                httpMethod: method
                            });
                            set((state) => ({
                                methodDetails: { ...state.methodDetails, [cacheKey]: details },
                                loadingMethodDetails: { ...state.loadingMethodDetails, [cacheKey]: false },
                            }));
                        } else {
                            const details = await invoke<HttpRouteIntegrationDetails>('apigw_get_http_route_integration', { 
                                credentials: rustCreds, 
                                apiId: apiId,
                                routeId: resourceId
                            });
                            set((state) => ({
                                methodDetails: { ...state.methodDetails, [cacheKey]: details },
                                loadingMethodDetails: { ...state.loadingMethodDetails, [cacheKey]: false },
                            }));
                        }
                    } catch (err: any) {
                        set((state) => ({
                            error: String(err),
                            loadingMethodDetails: { ...state.loadingMethodDetails, [cacheKey]: false },
                        }));
                    }
                },

                exportSwagger: async (apiId, stageName, isRest) => {
                    const cacheKey = `${apiId}|${stageName}`;
                    if (get().exportedSwagger[cacheKey]) return get().exportedSwagger[cacheKey];

                    const rustCreds = getRustCreds();
                    if (!rustCreds) return null;

                    set({ error: null });
                    try {
                        const cmd = isRest ? 'apigw_export_api_swagger_rest' : 'apigw_export_api_swagger_http';
                        const args = isRest ? { credentials: rustCreds, restApiId: apiId, stageName } : { credentials: rustCreds, apiId, stageName };
                        const spec = await invoke<string>(cmd, args);
                        set((state) => ({ exportedSwagger: { ...state.exportedSwagger, [cacheKey]: spec } }));
                        return spec;
                    } catch (err: any) {
                        set({ error: String(err) });
                        return null;
                    }
                },

                toggleFavorite: (id) => {
                    const current = get().favoriteApis;
                    const updated = current.includes(id) ? current.filter(f => f !== id) : [...current, id];
                    set({ favoriteApis: updated });
                },

                fetchStages: async (apiId, isRest) => {
                    // Cache hit: skip if already loaded
                    if ((get().stages[apiId]?.length ?? 0) > 0) return;

                    const rustCreds = getRustCreds();
                    if (!rustCreds) return;
                    try {
                        const stages = await invoke<string[]>('apigw_get_stages', { credentials: rustCreds, apiId, isRest });
                        set(s => ({ stages: { ...s.stages, [apiId]: stages } }));
                        // Auto-select first stage if none selected
                        if (!get().selectedStage[apiId] && stages.length > 0) {
                            get().setSelectedStage(apiId, stages[0]);
                        }
                    } catch (err) {
                        console.error('Failed to fetch stages', err);
                    }
                },

                setSelectedStage: (apiId, stage) => {
                    set(s => ({ selectedStage: { ...s.selectedStage, [apiId]: stage } }));
                },

                openTester: (endpoint) => {
                    set({ testerEndpoint: endpoint, testerOpen: true, testerResponse: null });
                },

                closeTester: () => {
                    set({ testerOpen: false, testerResponse: null });
                },

                invokeEndpoint: async (req) => {
                    const rustCreds = getRustCreds();
                    if (!rustCreds) return;

                    set({ loadingInvoke: true, error: null });
                    try {
                        const response = await invoke<InvokeResponse>('apigw_invoke_endpoint', {
                            credentials: rustCreds,
                            request: req
                        });
                        set({ testerResponse: response, loadingInvoke: false });
                        
                        if (response.status >= 200 && response.status < 300) {
                            const endpoint = get().testerEndpoint;
                            if (endpoint) {
                                get().savePreset(`${endpoint.apiId}|${endpoint.method}|${endpoint.path}`, req.body || '');
                            }
                        }
                    } catch (err: any) {
                        set({ error: String(err), loadingInvoke: false });
                    }
                },

                refreshApi: async (api) => {
                    if (!api) return;
                    // Evict all cached data for this API so the guards let the fetches through
                    set(s => {
                        const restResources = { ...s.restResources };
                        const httpRoutes = { ...s.httpRoutes };
                        const stages = { ...s.stages };
                        const methodDetails = { ...s.methodDetails };
                        delete restResources[api.id];
                        delete httpRoutes[api.id];
                        delete stages[api.id];
                        // Drop all method detail entries for this api
                        Object.keys(methodDetails).forEach(k => {
                            if (k.startsWith(`${api.id}|`)) delete methodDetails[k];
                        });
                        return { restResources, httpRoutes, stages, methodDetails };
                    });
                    await get().fetchApiDetails(api);
                    await get().fetchStages(api.id, api.type === 'rest');
                },

                savePreset: (key, json) => {
                    set(s => ({ jsonPresets: { ...s.jsonPresets, [key]: json } }));
                },

                getPreset: (key) => {
                    return get().jsonPresets[key] || null;
                },
            }),
            {
                name: 'microtermix-apigw-store',
                partialize: (s) => ({
                    favoriteApis: s.favoriteApis,
                    selectedStage: s.selectedStage,
                    jsonPresets: s.jsonPresets,
                }),
            }
        ),
        { name: 'ApiGatewayStore' }
    )
);
