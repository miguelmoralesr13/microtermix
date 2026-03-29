import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useAwsStore } from '../../stores/awsStore';
import { 
    RestApiInfo, HttpApiInfo, RestApiResource, 
    HttpApiRoute, RestMethodDetails, HttpRouteIntegrationDetails 
} from '../../stores/apiGatewayStore';

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

export const apigwKeys = {
    all: ['api-gateway'] as const,
    lists: () => [...apigwKeys.all, 'list'] as const,
    details: (apiId: string) => [...apigwKeys.all, 'details', apiId] as const,
    methods: (apiId: string, resourceId: string, method: string) => [...apigwKeys.all, 'method', apiId, resourceId, method] as const,
    stages: (apiId: string) => [...apigwKeys.all, 'stages', apiId] as const,
    swagger: (apiId: string, stage: string) => [...apigwKeys.all, 'swagger', apiId, stage] as const,
};

export function useApiGatewayList() {
    const credentials = useAwsStore(s => s.credentials);
    
    return useQuery({
        queryKey: [...apigwKeys.lists(), credentials?.accessKeyId],
        queryFn: async () => {
            const rustCreds = getRustCreds();
            if (!rustCreds) throw new Error('No credentials');
            return await invoke<{ rest_apis: RestApiInfo[], http_apis: HttpApiInfo[] }>('apigw_fetch_all', { credentials: rustCreds });
        },
        enabled: !!credentials,
    });
}

export function useApiResources(apiId: string | undefined, type: 'rest' | 'http' | undefined) {
    const credentials = useAwsStore(s => s.credentials);

    return useQuery({
        queryKey: [...apigwKeys.details(apiId || ''), type, credentials?.accessKeyId],
        queryFn: async () => {
            const rustCreds = getRustCreds();
            if (!rustCreds || !apiId) throw new Error('Invalid params');
            
            if (type === 'rest') {
                return await invoke<RestApiResource[]>('apigw_get_rest_api_resources', { credentials: rustCreds, restApiId: apiId });
            } else {
                return await invoke<HttpApiRoute[]>('apigw_get_http_api_routes', { credentials: rustCreds, apiId });
            }
        },
        enabled: !!credentials && !!apiId && !!type,
    });
}

export function useMethodDetails(apiId: string, resourceId: string, method: string, isRest: boolean) {
    const credentials = useAwsStore(s => s.credentials);

    return useQuery({
        queryKey: [...apigwKeys.methods(apiId, resourceId, method), credentials?.accessKeyId],
        queryFn: async () => {
            const rustCreds = getRustCreds();
            if (!rustCreds) throw new Error('No credentials');

            if (isRest) {
                return await invoke<RestMethodDetails>('apigw_get_rest_method_details', { 
                    credentials: rustCreds, 
                    restApiId: apiId,
                    resourceId: resourceId,
                    httpMethod: method
                });
            } else {
                return await invoke<HttpRouteIntegrationDetails>('apigw_get_http_route_integration', { 
                    credentials: rustCreds, 
                    apiId: apiId,
                    routeId: resourceId
                });
            }
        },
        enabled: !!credentials && !!apiId && !!resourceId,
    });
}

export function useApiStages(apiId: string | undefined, isRest: boolean) {
    const credentials = useAwsStore(s => s.credentials);

    return useQuery({
        queryKey: [...apigwKeys.stages(apiId || ''), credentials?.accessKeyId],
        queryFn: async () => {
            const rustCreds = getRustCreds();
            if (!rustCreds || !apiId) throw new Error('Invalid params');
            return await invoke<string[]>('apigw_get_stages', { credentials: rustCreds, apiId, isRest });
        },
        enabled: !!credentials && !!apiId,
    });
}

export function useSwaggerExport(apiId: string, stageName: string, isRest: boolean) {
    const credentials = useAwsStore(s => s.credentials);

    return useQuery({
        queryKey: [...apigwKeys.swagger(apiId, stageName), credentials?.accessKeyId],
        queryFn: async () => {
            const rustCreds = getRustCreds();
            if (!rustCreds) throw new Error('No credentials');
            const cmd = isRest ? 'apigw_export_api_swagger_rest' : 'apigw_export_api_swagger_http';
            const args = isRest ? { credentials: rustCreds, restApiId: apiId, stageName } : { credentials: rustCreds, apiId, stageName };
            return await invoke<string>(cmd, args);
        },
        enabled: !!credentials && !!apiId && !!stageName,
        staleTime: Infinity, // Swagger specs are quite static
    });
}
