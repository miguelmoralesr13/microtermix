import React, { useMemo, useState } from 'react';
import { useApiGatewayStore } from '../stores/useApiGatewayStore';
import { Badge } from './ui/badge';
import { Loader2, ArrowRight, ChevronRight, ChevronDown, KeyRound, Lock, Link as LinkIcon, Database, FileJson, X } from 'lucide-react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import { Button } from './ui/button';
import type { RestApiResource, HttpApiRoute, RestMethodDetails, HttpRouteIntegrationDetails } from '../stores/useApiGatewayStore';

interface ApiTreeNode {
    segment: string;
    fullPath: string;
    methods: string[];
    children: Record<string, ApiTreeNode>;
    resourceId?: string;
    target?: string | null;
}

const renderMethodBadge = (method: string, onClick?: () => void, isSelected?: boolean) => {
    let colorClass = "bg-slate-700 text-white border-slate-600";
    switch (method.toUpperCase()) {
        case 'GET': colorClass = "bg-blue-900/40 text-blue-300 border-blue-700 hover:bg-blue-900/80 hover:text-blue-200"; break;
        case 'POST': colorClass = "bg-green-900/40 text-green-300 border-green-700 hover:bg-green-900/80 hover:text-green-200"; break;
        case 'PUT': colorClass = "bg-orange-900/40 text-orange-300 border-orange-700 hover:bg-orange-900/80 hover:text-orange-200"; break;
        case 'DELETE': colorClass = "bg-red-900/40 text-red-300 border-red-700 hover:bg-red-900/80 hover:text-red-200"; break;
        case 'PATCH': colorClass = "bg-yellow-900/40 text-yellow-300 border-yellow-700 hover:bg-yellow-900/80 hover:text-yellow-200"; break;
        case 'ANY': colorClass = "bg-purple-900/40 text-purple-300 border-purple-700 hover:bg-purple-900/80 hover:text-purple-200"; break;
        case 'OPTIONS': colorClass = "bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700 hover:text-slate-300"; break;
    }

    return (
        <Badge 
            key={method} 
            variant="outline" 
            className={`font-mono text-[10px] px-2 py-0.5 h-6 mt-0.5 cursor-pointer transition-all ${colorClass} ${isSelected ? 'ring-2 ring-white/20 scale-105' : ''}`}
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
            }}
        >
            {method}
        </Badge>
    );
};

const ApiTreeItem: React.FC<{ node: ApiTreeNode; level?: number; credentials?: any }> = ({ node, level = 0, credentials }) => {
    const [expanded, setExpanded] = useState(true);
    const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
    
    const selectedApi = useApiGatewayStore(state => state.selectedApi);
    const fetchMethodDetails = useApiGatewayStore(state => state.fetchMethodDetails);
    const methodDetails = useApiGatewayStore(state => state.methodDetails);
    const loadingMethodDetails = useApiGatewayStore(state => state.loadingMethodDetails);

    const childNodes = Object.values(node.children).sort((a, b) => {
        const aIsParam = a.segment.startsWith('{');
        const bIsParam = b.segment.startsWith('{');
        if (aIsParam && !bIsParam) return 1;
        if (!aIsParam && bIsParam) return -1;
        return a.segment.localeCompare(b.segment);
    });
    const hasChildren = childNodes.length > 0;

    const handleMethodClick = (method: string) => {
        if (selectedMethod === method) {
            setSelectedMethod(null);
            return;
        }
        setSelectedMethod(method);
        
        if (selectedApi && node.resourceId && credentials) {
            const isRest = selectedApi.type === 'rest';
            fetchMethodDetails(credentials, selectedApi.id, node.resourceId, method, isRest);
        }
    };

    const renderDetailsPanel = () => {
        if (!selectedMethod || !selectedApi || !node.resourceId) return null;
        
        const cacheKey = `${selectedApi.id}|${node.resourceId}|${selectedMethod}`;
        const isLoading = loadingMethodDetails[cacheKey];
        const details = methodDetails[cacheKey];

        if (isLoading) {
            return (
                <div className="ml-6 mt-2 p-4 bg-slate-900/60 border border-slate-800 rounded-md flex items-center justify-center text-slate-500 text-xs">
                    <Loader2 size={14} className="animate-spin mr-2" /> Fetching details...
                </div>
            );
        }

        if (!details) return null;

        const isRest = selectedApi.type === 'rest';

        if (isRest) {
            const restDetails = details as RestMethodDetails;
            return (
                <div className="ml-6 mt-2 p-3 bg-slate-900/80 border border-slate-700/50 rounded-md shadow-inner text-xs space-y-3">
                    
                    {/* Auth & Security */}
                    <div className="flex items-center gap-4 text-slate-300">
                        <div className="flex items-center gap-1.5" title="Authorization">
                            <Lock size={12} className={restDetails.authorization_type && restDetails.authorization_type !== 'NONE' ? 'text-amber-400' : 'text-slate-500'} />
                            <span className="font-mono">{restDetails.authorization_type || 'NONE'}</span>
                        </div>
                        <div className="flex items-center gap-1.5" title="API Key Required">
                            <KeyRound size={12} className={restDetails.api_key_required ? 'text-emerald-400' : 'text-slate-500'} />
                            <span>API Key: {restDetails.api_key_required ? 'Yes' : 'No'}</span>
                        </div>
                    </div>

                    {/* Request / Response */}
                    <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-2">
                        <div>
                            <div className="text-slate-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">Request</div>
                            {Object.keys(restDetails.request_parameters).length > 0 ? (
                                <ul className="space-y-1">
                                    {Object.entries(restDetails.request_parameters).map(([key, required]) => (
                                        <li key={key} className="flex items-center gap-2">
                                            <span className="text-sky-300 font-mono text-[10px] break-all">{key}</span>
                                            {required && <span className="text-red-400 text-[9px] uppercase">Req</span>}
                                        </li>
                                    ))}
                                </ul>
                            ) : <div className="text-slate-600 italic">No parameters</div>}
                            
                            {Object.keys(restDetails.request_models).length > 0 && (
                                <div className="mt-2 text-slate-400 flex items-center gap-1.5 border border-slate-800 px-1.5 py-0.5 rounded w-fit">
                                    <Database size={10} />
                                    <span className="font-mono text-[10px]">{Object.values(restDetails.request_models)[0]}</span>
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="text-slate-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">Responses</div>
                            {restDetails.method_responses.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                    {restDetails.method_responses.map(status => (
                                        <Badge key={status} variant="secondary" className="bg-slate-800 text-slate-300 px-1.5 py-0 h-4 text-[10px] font-mono">
                                            {status}
                                        </Badge>
                                    ))}
                                </div>
                            ) : <div className="text-slate-600 italic">No responses mapped</div>}
                        </div>
                    </div>

                    {/* Integration */}
                    {restDetails.integration_type && (
                        <div className="border-t border-slate-800 pt-2">
                            <div className="text-slate-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">Integration</div>
                            <div className="flex flex-col gap-1 text-slate-300">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="border-indigo-900 text-indigo-300 text-[9px] px-1 h-4">{restDetails.integration_type}</Badge>
                                    {restDetails.integration_http_method && (
                                        <span className="font-mono text-[10px] text-slate-400">{restDetails.integration_http_method}</span>
                                    )}
                                </div>
                                {restDetails.integration_uri && (
                                    <div className="flex items-start gap-1.5 text-[10px] bg-slate-950 p-1.5 rounded border border-slate-800 mt-1">
                                        <LinkIcon size={10} className="text-slate-500 shrink-0 mt-0.5" />
                                        <span className="font-mono text-slate-400 break-all">{restDetails.integration_uri}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            );
        } else {
            const httpDetails = details as HttpRouteIntegrationDetails;
            return (
                <div className="ml-6 mt-2 p-3 bg-slate-900/80 border border-slate-700/50 rounded-md shadow-inner text-xs space-y-3">
                    <div className="flex items-center gap-2 text-slate-300">
                        <span className="text-slate-500">Integration ID:</span>
                        <span className="font-mono text-sky-400">{httpDetails.integration_id || 'None'}</span>
                    </div>

                    {httpDetails.integration_type && (
                        <div className="border-t border-slate-800 pt-2">
                            <div className="text-slate-500 font-semibold mb-1 uppercase tracking-wider text-[10px]">Integration Details</div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] mb-2">
                                <div><span className="text-slate-500">Type:</span> <span className="text-slate-300">{httpDetails.integration_type}</span></div>
                                {httpDetails.connection_type && <div><span className="text-slate-500">Connection:</span> <span className="text-slate-300">{httpDetails.connection_type}</span></div>}
                                {httpDetails.integration_method && <div><span className="text-slate-500">Method:</span> <span className="text-slate-300">{httpDetails.integration_method}</span></div>}
                                {httpDetails.payload_format_version && <div><span className="text-slate-500">Payload v:</span> <span className="text-slate-300">{httpDetails.payload_format_version}</span></div>}
                            </div>
                            
                            {httpDetails.integration_uri && (
                                <div className="flex items-start gap-1.5 text-[10px] bg-slate-950 p-1.5 rounded border border-slate-800">
                                    <LinkIcon size={10} className="text-slate-500 shrink-0 mt-0.5" />
                                    <span className="font-mono text-slate-400 break-all">{httpDetails.integration_uri}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            );
        }
    };

    return (
        <div className="flex flex-col w-full">
            <div 
                className={`flex items-start py-1.5 px-2 hover:bg-slate-800/80 rounded-md transition-colors w-full border border-transparent hover:border-slate-800 ${level > 0 ? 'mt-0.5' : ''}`}
                style={{ paddingLeft: `${(level * 16) + 8}px` }}
            >
                <div 
                    className="flex mt-1.5 items-center justify-center w-4 h-4 mr-1 shrink-0 cursor-pointer"
                    onClick={() => hasChildren && setExpanded(!expanded)}
                >
                    {hasChildren ? (
                        expanded ? <ChevronDown size={14} className="text-slate-400 hover:text-white" /> : <ChevronRight size={14} className="text-slate-400 hover:text-white" />
                    ) : <span className="w-4 h-4" />}
                </div>

                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={`font-mono text-[13px] ${node.segment.startsWith('{') ? 'text-amber-400 font-medium' : 'text-sky-200'}`}>
                            {node.segment === '/' ? '/' : `/${node.segment}`}
                        </span>
                        
                        {node.resourceId && (
                            <span className="text-[10px] text-slate-600 font-mono ml-2">ID: {node.resourceId}</span>
                        )}
                    </div>
                    
                    {node.methods.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1.5 mt-1">
                            {node.methods.filter(m => m !== 'OPTIONS').map(m => renderMethodBadge(m, () => handleMethodClick(m), selectedMethod === m))}
                        </div>
                    )}
                    
                    {node.target && !selectedMethod && (
                        <div className="flex items-start gap-1.5 mt-2 pt-1 border-t border-slate-800/60 w-full pb-0.5 opacity-60">
                            <ArrowRight size={12} className="text-slate-500 mt-0.5 shrink-0" />
                            <div className="text-[11px] text-slate-400 font-mono break-all" title={node.target}>
                                {node.target}
                            </div>
                        </div>
                    )}

                    {/* Inline Details Panel */}
                    {renderDetailsPanel()}
                </div>
            </div>

            {hasChildren && expanded && (
                <div className="flex flex-col w-full border-l border-slate-800/30 ml-[15px]">
                    {childNodes.map(child => (
                        <ApiTreeItem key={child.fullPath} node={child} level={level + 1} credentials={credentials} />
                    ))}
                </div>
            )}
        </div>
    );
};

const buildRestTree = (resources: RestApiResource[]): ApiTreeNode => {
    const root: ApiTreeNode = { segment: '/', fullPath: '/', methods: [], children: {} };
    resources.forEach(res => {
        if (res.path === '/') {
            root.resourceId = res.id;
            root.methods = res.methods;
            return;
        }
        const segments = res.path.split('/').filter(Boolean);
        let current = root;
        let currentPath = '';
        segments.forEach((seg, i) => {
            currentPath += '/' + seg;
            if (!current.children[seg]) {
                current.children[seg] = { segment: seg, fullPath: currentPath, methods: [], children: {} };
            }
            current = current.children[seg];
            if (i === segments.length - 1) {
                current.resourceId = res.id;
                current.methods = res.methods;
            }
        });
    });
    return root;
};

const buildHttpTree = (routes: HttpApiRoute[]): ApiTreeNode => {
    const root: ApiTreeNode = { segment: '/', fullPath: '/', methods: [], children: {} };
    routes.forEach(route => {
        let method = "ANY";
        let pathStr = route.route_key;
        
        if (route.route_key.includes(' ')) {
            const parts = route.route_key.split(' ');
            method = parts[0];
            pathStr = parts.slice(1).join(' ');
        } else if (route.route_key === '$default') {
            method = "ANY";
            pathStr = "$default";
        }

        if (pathStr === '/' || pathStr === '$default') {
            if (pathStr === '$default') {
                if (!root.children['$default']) {
                    root.children['$default'] = { segment: '$default', fullPath: '$default', methods: [], children: {} };
                }
                root.children['$default'].methods.push(method);
                root.children['$default'].resourceId = route.route_id;
                root.children['$default'].target = route.target;
            } else {
                root.methods.push(method);
                root.resourceId = route.route_id;
                root.target = route.target;
            }
            return;
        }

        const segments = pathStr.split('/').filter(Boolean);
        let current = root;
        let currentPath = '';
        segments.forEach((seg, i) => {
            currentPath += '/' + seg;
            if (!current.children[seg]) {
                current.children[seg] = { segment: seg, fullPath: currentPath, methods: [], children: {} };
            }
            current = current.children[seg];
            if (i === segments.length - 1) {
                if (!current.methods.includes(method)) {
                    current.methods.push(method);
                }
                current.resourceId = route.route_id;
                current.target = route.target;
            }
        });
    });
    return root;
};

export const ApiGatewayDetails: React.FC<{ credentials?: any }> = ({ credentials }) => {
    const selectedApi = useApiGatewayStore(state => state.selectedApi);
    const loadingDetails = useApiGatewayStore(state => state.loadingDetails);
    const restResources = useApiGatewayStore(state => state.restResources);
    const httpRoutes = useApiGatewayStore(state => state.httpRoutes);
    const exportSwagger = useApiGatewayStore(state => state.exportSwagger);

    const [showSwagger, setShowSwagger] = useState(false);
    const [swaggerSpec, setSwaggerSpec] = useState<string | null>(null);
    const [loadingSwagger, setLoadingSwagger] = useState(false);
    const errorStore = useApiGatewayStore(state => state.error);

    const handlePreviewSwagger = async () => {
        if (!selectedApi || !credentials) return;
        setLoadingSwagger(true);
        setShowSwagger(true);
        const isRest = selectedApi.type === 'rest';
        
        // Use a generic stage name for export "prod" or "$default", though AWS can export without it sometimes, it's safer to provide it.
        const stageName = isRest ? 'prod' : '$default'; 
        
        const spec = await exportSwagger(credentials, selectedApi.id, stageName, isRest);
        setSwaggerSpec(spec);
        setLoadingSwagger(false);
    };

    const tree = useMemo(() => {
        if (!selectedApi) return null;
        if (selectedApi.type === 'rest') {
            const resources = restResources[selectedApi.id] || [];
            if (resources.length === 0) return null;
            return buildRestTree(resources);
        } else {
            const routes = httpRoutes[selectedApi.id] || [];
            if (routes.length === 0) return null;
            return buildHttpTree(routes);
        }
    }, [selectedApi, restResources, httpRoutes]);

    if (!selectedApi) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-900/10">
                <div className="text-4xl mb-4 opacity-20">☁️</div>
                <h3 className="text-lg font-medium text-slate-300">No API Selected</h3>
                <p className="text-sm mt-2 max-w-sm text-center">
                    Select an API from the list on the left to view its endpoints, routes, and integration details.
                </p>
            </div>
        );
    }

    const isLoading = loadingDetails[selectedApi.id];

    return (
        <div className="flex flex-col h-full w-full overflow-hidden bg-slate-950/30">
            {/* Header / Title Area */}
            <div className="p-6 bg-slate-900 border-b border-slate-800 shrink-0 flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <Badge variant="outline" className={`font-mono h-6 px-2 ${selectedApi.type === 'rest' ? 'text-emerald-400 border-emerald-900/50' : 'text-amber-400 border-amber-900/50'}`}>
                            {selectedApi.type === 'rest' ? 'v1 (REST)' : 'v2 (HTTP/WS)'}
                        </Badge>
                        <h2 className="text-xl font-bold text-white tracking-tight">{selectedApi.name}</h2>
                    </div>
                    <p className="text-sm text-slate-400 font-mono mt-2">API ID: {selectedApi.id}</p>
                </div>
                
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300"
                    onClick={handlePreviewSwagger}
                    disabled={loadingSwagger}
                >
                    {loadingSwagger ? <Loader2 size={14} className="animate-spin mr-2" /> : <FileJson size={14} className="mr-2 text-sky-400" />}
                    Preview Contract
                </Button>
            </div>

            {/* Swagger Modal Overlay */}
            {showSwagger && (
                <div className="absolute inset-0 z-50 bg-white flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between p-4 bg-slate-950 border-b border-slate-800 shrink-0">
                        <h3 className="text-white font-semibold flex items-center gap-2">
                            <span className="text-sky-400">Swagger UI</span> - {selectedApi.name}
                        </h3>
                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white" onClick={() => setShowSwagger(false)}>
                            <X size={20} />
                        </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-white swagger-container p-4">
                        {loadingSwagger ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                                <Loader2 className="animate-spin" size={32} />
                                <p>Fetching OpenAPI Specification from AWS...</p>
                            </div>
                        ) : swaggerSpec ? (
                            <div className="max-w-7xl mx-auto">
                                <SwaggerUI spec={swaggerSpec} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 max-w-lg mx-auto text-center">
                                <FileJson size={48} className="text-slate-700 mb-2" />
                                <h4 className="text-white text-lg font-medium">Preview Unavailable</h4>
                                <p className="text-slate-400">Failed to load OpenAPI / Swagger specification.</p>
                                {errorStore && (
                                    <div className="bg-red-950/40 border border-red-900/50 text-red-300 p-3 rounded-md text-xs mt-2 text-left font-mono break-all w-full overflow-y-auto max-h-40">
                                        {errorStore}
                                    </div>
                                )}
                                <Button variant="outline" className="mt-4" onClick={() => setShowSwagger(false)}>Close Preview</Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Content Area (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-6">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <Loader2 className="animate-spin mb-4" size={32} />
                        <p>Loading API tree...</p>
                    </div>
                ) : !tree ? (
                    <div className="flex flex-col items-center justify-center p-8 text-slate-500">
                        No endpoints or routes found for this API.
                    </div>
                ) : (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 font-semibold text-sm text-slate-300 tracking-wider">
                            HTTP Endpoints & Integrations
                        </div>
                        <div className="p-2">
                            <ApiTreeItem node={tree} credentials={credentials} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
