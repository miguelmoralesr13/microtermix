import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface AwsCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    sessionToken?: string | null;
}

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
}

export type SelectedApi =
    | { type: 'rest'; id: string; name: string }
    | { type: 'http'; id: string; name: string }
    | null;

interface ApiGatewayState {
    restApis: RestApiInfo[];
    httpApis: HttpApiInfo[];
    selectedApi: SelectedApi;
    restResources: Record<string, RestApiResource[]>; // Keys are rest_api_id
    httpRoutes: Record<string, HttpApiRoute[]>; // Keys are api_id
    methodDetails: Record<string, RestMethodDetails | HttpRouteIntegrationDetails>; // Key: `<api_id>|<resource_id/route_id>|<method>`
    loadingApis: boolean;
    loadingDetails: Record<string, boolean>;
    loadingMethodDetails: Record<string, boolean>;
    exportedSwagger: Record<string, string>;
    error: string | null;

    fetchApis: (creds: AwsCredentials) => Promise<void>;
    selectApi: (api: SelectedApi, creds: AwsCredentials) => void;
    fetchApiDetails: (api: SelectedApi, creds: AwsCredentials) => Promise<void>;
    fetchMethodDetails: (creds: AwsCredentials, apiId: string, resourceId: string, method: string, isRest: boolean) => Promise<void>;
    exportSwagger: (creds: AwsCredentials, apiId: string, stageName: string, isRest: boolean) => Promise<string | null>;
}

export const useApiGatewayStore = create<ApiGatewayState>((set, get) => ({
    restApis: [],
    httpApis: [],
    selectedApi: null,
    restResources: {},
    httpRoutes: {},
    methodDetails: {},
    loadingApis: false,
    loadingDetails: {},
    loadingMethodDetails: {},
    exportedSwagger: {},
    error: null,

    fetchApis: async (creds: AwsCredentials) => {
        set({ loadingApis: true, error: null });
        try {
            const rustCreds = {
                access_key_id: creds.accessKeyId,
                secret_access_key: creds.secretAccessKey,
                region: creds.region,
                session_token: creds.sessionToken || null
            };
            const [rest, http] = await Promise.all([
                invoke<RestApiInfo[]>('apigw_get_rest_apis', { credentials: rustCreds }),
                invoke<HttpApiInfo[]>('apigw_get_http_apis', { credentials: rustCreds }),
            ]);
            set({ restApis: rest, httpApis: http, loadingApis: false });
        } catch (err: any) {
            console.error('Failed to fetch APIs', err);
            set({
                error: typeof err === 'string' ? err : err?.message || 'Unknown error',
                loadingApis: false,
            });
        }
    },

    selectApi: (api, creds) => {
        set({ selectedApi: api });
        if (api) {
            get().fetchApiDetails(api, creds);
        }
    },

    fetchApiDetails: async (api, creds) => {
        if (!api) return;

        set((state) => ({
            loadingDetails: { ...state.loadingDetails, [api.id]: true },
            error: null,
        }));

        const rustCreds = {
            access_key_id: creds.accessKeyId,
            secret_access_key: creds.secretAccessKey,
            region: creds.region,
            session_token: creds.sessionToken || null
        };

        try {
            if (api.type === 'rest') {
                const resources = await invoke<RestApiResource[]>('apigw_get_rest_api_resources', { credentials: rustCreds, restApiId: api.id });
                set((state) => ({
                    restResources: { ...state.restResources, [api.id]: resources },
                    loadingDetails: { ...state.loadingDetails, [api.id]: false },
                }));
            } else if (api.type === 'http') {
                const routes = await invoke<HttpApiRoute[]>('apigw_get_http_api_routes', { credentials: rustCreds, apiId: api.id });
                set((state) => ({
                    httpRoutes: { ...state.httpRoutes, [api.id]: routes },
                    loadingDetails: { ...state.loadingDetails, [api.id]: false },
                }));
            }
        } catch (err: any) {
            console.error(`Failed to fetch details for ${api.id}`, err);
            set((state) => ({
                error: typeof err === 'string' ? err : err?.message || 'Unknown error',
                loadingDetails: { ...state.loadingDetails, [api.id]: false },
            }));
        }
    },

    fetchMethodDetails: async (creds, apiId, resourceId, method, isRest) => {
        const cacheKey = `${apiId}|${resourceId}|${method}`;
        if (get().methodDetails[cacheKey]) return; // already fetched

        set((state) => ({
            loadingMethodDetails: { ...state.loadingMethodDetails, [cacheKey]: true },
            error: null,
        }));

        const rustCreds = {
            access_key_id: creds.accessKeyId,
            secret_access_key: creds.secretAccessKey,
            region: creds.region,
            session_token: creds.sessionToken || null
        };

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
            console.error(`Failed to fetch method details for ${cacheKey}`, err);
            set((state) => ({
                error: typeof err === 'string' ? err : err?.message || 'Unknown error',
                loadingMethodDetails: { ...state.loadingMethodDetails, [cacheKey]: false },
            }));
        }
    },

    exportSwagger: async (creds, apiId, stageName, isRest) => {
        const cacheKey = `${apiId}|${stageName}`;
        if (get().exportedSwagger[cacheKey]) {
            return get().exportedSwagger[cacheKey];
        }

        set({ error: null });
        const rustCreds = {
            access_key_id: creds.accessKeyId,
            secret_access_key: creds.secretAccessKey,
            region: creds.region,
            session_token: creds.sessionToken || null
        };

        try {
            let spec = "";
            if (isRest) {
                spec = await invoke<string>('apigw_export_api_swagger_rest', { 
                    credentials: rustCreds, 
                    restApiId: apiId,
                    stageName 
                });
            } else {
                spec = await invoke<string>('apigw_export_api_swagger_http', { 
                    credentials: rustCreds, 
                    apiId: apiId,
                    stageName 
                });
            }

            set((state) => ({
                exportedSwagger: { ...state.exportedSwagger, [cacheKey]: spec }
            }));
            
            return spec;
        } catch (err: any) {
            console.error(`Failed to export swagger for ${apiId}`, err);
            set({ error: typeof err === 'string' ? err : err?.message || 'Unknown export error' });
            return null;
        }
    },
}));
