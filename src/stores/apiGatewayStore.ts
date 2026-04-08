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

interface ApiGatewayState {
    selectedApi: SelectedApi;
    favoriteApis: string[];
    httpApis: HttpApiInfo[];
    selectedStage: Record<string, string>;
    jsonPresets: Record<string, string>;
    testerOpen: boolean;
    testerEndpoint: TesterEndpoint | null;
    testerResponse: InvokeResponse | null;
    loadingInvoke: boolean;
    error: string | null;
}

interface ApiGatewayActions {
    selectApi: (api: SelectedApi) => void;
    toggleFavorite: (id: string) => void;
    setHttpApis: (apis: HttpApiInfo[]) => void;
    setSelectedStage: (apiId: string, stage: string) => void;
    openTester: (endpoint: TesterEndpoint) => void;
    closeTester: () => void;
    invokeEndpoint: (req: FrontendInvokeRequest) => Promise<void>;
    savePreset: (key: string, json: string) => void;
    getPreset: (key: string) => string | null;
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
                selectedApi: null,
                favoriteApis: [],
                httpApis: [],
                selectedStage: {},
                jsonPresets: {},
                testerOpen: false,
                testerEndpoint: null,
                testerResponse: null,
                loadingInvoke: false,
                error: null,

                selectApi: (api) => {
                    set({ selectedApi: api });
                },

                toggleFavorite: (id) => {
                    const current = get().favoriteApis;
                    const updated = current.includes(id) ? current.filter(f => f !== id) : [...current, id];
                    set({ favoriteApis: updated });
                },

                setHttpApis: (httpApis) => set({ httpApis }),

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
                    if (!rustCreds) {
                        set({ error: "No se detectaron credenciales de AWS activas. Por favor, carga tus credenciales en el panel principal.", loadingInvoke: false });
                        return;
                    }

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
