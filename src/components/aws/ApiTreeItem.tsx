import React, { useState } from 'react';
import { useApiGatewayStore, RestMethodDetails, HttpRouteIntegrationDetails } from '../../stores/apiGatewayStore';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Loader2, ArrowRight, ChevronRight, ChevronDown, KeyRound, Lock, Link as LinkIcon, ExternalLink, FileCode2, X } from 'lucide-react';
import { useCwStore } from '../../stores/cwStore';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useMethodDetails } from '../../hooks/queries/useApiGatewayQueries';

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
        case 'GET': colorClass = "bg-blue-900/40 text-blue-300 border-blue-700 hover:bg-blue-800 hover:text-blue-100"; break;
        case 'POST': colorClass = "bg-green-900/40 text-green-300 border-green-700 hover:bg-green-800 hover:text-green-100"; break;
        case 'PUT': colorClass = "bg-orange-900/40 text-orange-300 border-orange-700 hover:bg-orange-800 hover:text-orange-100"; break;
        case 'DELETE': colorClass = "bg-red-900/40 text-red-300 border-red-700 hover:bg-red-800 hover:text-red-100"; break;
        case 'PATCH': colorClass = "bg-yellow-900/40 text-yellow-300 border-yellow-700 hover:bg-yellow-800 hover:text-yellow-100"; break;
        case 'ANY': colorClass = "bg-purple-900/40 text-purple-300 border-purple-700 hover:bg-purple-800 hover:text-purple-100"; break;
        case 'OPTIONS': colorClass = "bg-slate-800 text-slate-400 border-slate-600 hover:bg-slate-700 hover:text-slate-300"; break;
    }

    return (
        <Badge
            key={method}
            variant="outline"
            className={`font-mono text-[10px] px-2 py-0.5 h-6 cursor-pointer transition-all ${colorClass} ${isSelected ? 'ring-2 ring-microtermix-neon/40 border-microtermix-neon/50 bg-microtermix-neon/10' : ''}`}
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick();
            }}
        >
            {method}
        </Badge>
    );
};

export const ApiTreeItem: React.FC<{ node: ApiTreeNode; level?: number; simple?: boolean }> = ({ node, level = 0, simple = false }) => {
    const [expanded, setExpanded] = useState(true);
    const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
    const [templatesModal, setTemplatesModal] = useState<Record<string, string> | null>(null);

    const { selectedApi, openTester, httpApis } = useApiGatewayStore();
    const { state: { projects } } = useWorkspace();
    const { goToLogs } = useCwStore();
    const { setActiveView } = useWorkspace();

    const { data: details, isLoading } = useMethodDetails(
        selectedApi?.id || '', 
        node.resourceId || '', 
        selectedMethod || '', 
        selectedApi?.type === 'rest'
    );

    const childNodes = Object.values(node.children).sort((a, b) => {
        const aIsParam = a.segment.startsWith('{');
        const bIsParam = b.segment.startsWith('{');
        if (aIsParam && !bIsParam) return 1;
        if (!aIsParam && bIsParam) return -1;
        return a.segment.localeCompare(b.segment);
    });
    const hasChildren = childNodes.length > 0;

    const handleMethodClick = (method: string) => {
        setSelectedMethod(method);
        // Trigger test directly if in simple mode
        if (simple) {
            handleTest();
        }
    };

    const extractLambdaName = (uri: string) => {
        // Matches ...:function:FUNCTION_NAME/...
        const match = uri.match(/:function:([^/:]+)/);
        return match ? match[1] : null;
    };

    const handleViewLogs = (lambdaName: string) => {
        goToLogs(`/aws/lambda/${lambdaName}`);
        setActiveView('cloudwatch');
    };

    const handleTest = (testDetails?: RestMethodDetails | HttpRouteIntegrationDetails) => {
        if (!selectedApi || !selectedMethod) return;

        let authType: string | null = null;
        let baseUrl = "";

        const currentDetails = testDetails || details;

        if (selectedApi.type === 'rest') {
            authType = currentDetails ? (currentDetails as RestMethodDetails).authorization_type : null;
            baseUrl = `https://${selectedApi.id}.execute-api.AWS_REGION.amazonaws.com/STAGE`;
        } else {
            const apiInfo = httpApis.find(a => a.api_id === selectedApi.id);
            baseUrl = apiInfo?.api_endpoint || "";
        }

        openTester({
            apiId: selectedApi.id,
            method: selectedMethod,
            path: node.fullPath,
            resourceId: node.resourceId!,
            isRest: selectedApi.type === 'rest',
            baseUrl,
            authType
        });
    };

    const renderDetailsPanel = () => {
        if (simple || !selectedMethod || !selectedApi || !node.resourceId) return null;

        if (isLoading) {
            return (
                <div className="ml-6 mt-2 p-4 bg-slate-900/60 border border-slate-800 rounded-md flex items-center justify-center text-slate-500 text-xs">
                    <Loader2 size={14} className="animate-spin mr-2" /> Fetching details...
                </div>
            );
        }

        const isRest = selectedApi.type === 'rest';

        // Local Match check
        const getLambdaName = () => {
            if (isRest) {
                const restDetails = details as RestMethodDetails;
                return restDetails.integration_uri ? extractLambdaName(restDetails.integration_uri) : null;
            } else {
                const httpDetails = details as HttpRouteIntegrationDetails;
                return httpDetails.integration_uri ? extractLambdaName(httpDetails.integration_uri) : null;
            }
        };

        const lambdaName = getLambdaName();
        const localMatch = lambdaName ? projects.find(p => p.name.toLowerCase() === lambdaName.toLowerCase()) : null;

        if (isRest) {
            const restDetails = details as RestMethodDetails;
            const lambdaName = restDetails.integration_uri ? extractLambdaName(restDetails.integration_uri) : null;
            const hasRequestParams = Object.keys(restDetails.request_parameters ?? {}).length > 0;
            const hasRequestModels = Object.keys(restDetails.request_models ?? {}).length > 0;
            const hasIntegrationTemplates = Object.keys(restDetails.integration_request_templates ?? {}).length > 0;

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

                    {/* Request Parameters */}
                    {hasRequestParams && (
                        <div className="border-t border-slate-800 pt-2 space-y-1">
                            <div className="text-slate-500 font-bold uppercase tracking-wider text-[9px] mb-1">Request Parameters</div>
                            {Object.entries(restDetails.request_parameters).map(([param, required]) => (
                                <div key={param} className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-slate-300">{param}</span>
                                    <Badge variant="outline" className={`text-[9px] h-4 px-1 ${required ? 'text-amber-400 border-amber-900/50' : 'text-slate-500 border-slate-700'}`}>
                                        {required ? 'required' : 'optional'}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Request Models */}
                    {hasRequestModels && (
                        <div className="border-t border-slate-800 pt-2 space-y-1">
                            <div className="text-slate-500 font-bold uppercase tracking-wider text-[9px] mb-1">Request Models</div>
                            {Object.entries(restDetails.request_models).map(([contentType, model]) => (
                                <div key={contentType} className="flex items-center gap-2 font-mono text-[10px]">
                                    <span className="text-slate-500">{contentType}</span>
                                    <span className="text-sky-400">{model}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Integration */}
                    {restDetails.integration_type && (
                        <div className="border-t border-slate-800 pt-2 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="text-slate-500 font-bold uppercase tracking-wider text-[9px]">Integration</div>
                                {lambdaName && (
                                    <button
                                        onClick={() => handleViewLogs(lambdaName)}
                                        className="flex items-center gap-1 text-microtermix-neon hover:underline text-[9px] font-bold uppercase tracking-tighter"
                                    >
                                        <ExternalLink size={10} /> Ver Logs Lambda
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="border-indigo-900 text-indigo-300 text-[9px] px-1 h-4">{restDetails.integration_type}</Badge>
                                {restDetails.integration_http_method && (
                                    <span className="font-mono text-[10px] text-slate-400">{restDetails.integration_http_method}</span>
                                )}
                                {restDetails.integration_timeout && (
                                    <span className="text-[10px] text-slate-500">timeout: {restDetails.integration_timeout}ms</span>
                                )}
                            </div>
                            {restDetails.integration_uri && (
                                <div className="flex items-start gap-1.5 text-[10px] bg-slate-950 p-1.5 rounded border border-slate-800">
                                    <LinkIcon size={10} className="text-slate-500 shrink-0 mt-0.5" />
                                    <span className="font-mono text-slate-400 break-all">{restDetails.integration_uri}</span>
                                </div>
                            )}
                            {hasIntegrationTemplates && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setTemplatesModal(restDetails.integration_request_templates)}
                                    className="h-6 text-[9px] font-bold uppercase tracking-tighter bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 gap-1 px-2"
                                >
                                    <FileCode2 size={11} /> Ver Integration Templates
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Method Responses */}
                    {(restDetails.method_responses ?? []).length > 0 && (
                        <div className="border-t border-slate-800 pt-2">
                            <div className="text-slate-500 font-bold uppercase tracking-wider text-[9px] mb-1">Method Responses</div>
                            <div className="flex flex-wrap gap-1">
                                {restDetails.method_responses.map(code => (
                                    <Badge key={code} variant="outline" className={`text-[9px] px-1.5 h-4 font-mono ${
                                        code.startsWith('2') ? 'text-emerald-400 border-emerald-900/50' :
                                        code.startsWith('4') ? 'text-amber-400 border-amber-900/50' :
                                        code.startsWith('5') ? 'text-red-400 border-red-900/50' :
                                        'text-slate-400 border-slate-700'
                                    }`}>{code}</Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    {localMatch && (
                        <div className="border-t border-slate-800 pt-2 flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-microtermix-neon text-slate-950 text-[9px] font-bold h-4">LOCAL</Badge>
                                <span className="text-[10px] text-slate-400">Vinculado a: </span>
                                <span className="text-[10px] text-microtermix-neon font-mono">{localMatch.name}</span>
                             </div>
                        </div>
                    )}
                </div>
            );
        } else {
            const httpDetails = details as HttpRouteIntegrationDetails;
            const lambdaName = httpDetails.integration_uri ? extractLambdaName(httpDetails.integration_uri) : null;
            const hasIntegrationTemplates = Object.keys(httpDetails.integration_request_templates ?? {}).length > 0;

            return (
                <div className="ml-6 mt-2 p-3 bg-slate-900/80 border border-slate-700/50 rounded-md shadow-inner text-xs space-y-3">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-300">
                            <span className="text-slate-500">Integration ID:</span>
                            <span className="font-mono text-sky-400">{httpDetails.integration_id || 'None'}</span>
                        </div>
                        {lambdaName && (
                            <button
                                onClick={() => handleViewLogs(lambdaName)}
                                className="flex items-center gap-1 text-microtermix-neon hover:underline text-[9px] font-bold uppercase tracking-tighter"
                            >
                                <ExternalLink size={10} /> Ver Logs Lambda
                              </button>
                        )}
                    </div>

                    {httpDetails.integration_type && (
                        <div className="border-t border-slate-800 pt-2 space-y-2">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                                <div><span className="text-slate-500">Type:</span> <span className="text-slate-300">{httpDetails.integration_type}</span></div>
                                {httpDetails.connection_type && <div><span className="text-slate-500">Connection:</span> <span className="text-slate-300">{httpDetails.connection_type}</span></div>}
                                {httpDetails.integration_method && <div><span className="text-slate-500">Method:</span> <span className="text-slate-300">{httpDetails.integration_method}</span></div>}
                                {httpDetails.payload_format_version && <div><span className="text-slate-500">Payload:</span> <span className="text-slate-300">{httpDetails.payload_format_version}</span></div>}
                                {httpDetails.timeout_in_millis && <div><span className="text-slate-500">Timeout:</span> <span className="text-slate-300">{httpDetails.timeout_in_millis}ms</span></div>}
                            </div>

                            {httpDetails.integration_uri && (
                                <div className="flex items-start gap-1.5 text-[10px] bg-slate-950 p-1.5 rounded border border-slate-800">
                                    <LinkIcon size={10} className="text-slate-500 shrink-0 mt-0.5" />
                                    <span className="font-mono text-slate-400 break-all">{httpDetails.integration_uri}</span>
                                </div>
                            )}

                            {hasIntegrationTemplates && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setTemplatesModal(httpDetails.integration_request_templates)}
                                    className="h-6 text-[9px] font-bold uppercase tracking-tighter bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 gap-1 px-2"
                                >
                                    <FileCode2 size={11} /> Ver Integration Templates
                                </Button>
                            )}
                        </div>
                    )}
                    {localMatch && (
                        <div className="border-t border-slate-800 pt-2 flex items-center justify-between">
                             <div className="flex items-center gap-2">
                                <Badge className="bg-microtermix-neon text-slate-950 text-[9px] font-bold h-4">LOCAL</Badge>
                                <span className="text-[10px] text-slate-400">Vinculado a: </span>
                                <span className="text-[10px] text-microtermix-neon font-mono">{localMatch.name}</span>
                             </div>
                        </div>
                    )}
                </div>
            );
        }
    };

    return (
        <>
        <Dialog open={!!templatesModal} onOpenChange={(open) => !open && setTemplatesModal(null)}>
            <DialogContent className="bg-slate-900 border-slate-700 w-[90vw] max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0" showCloseButton={false}>
                <DialogHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <FileCode2 size={16} className="text-microtermix-neon" />
                        <DialogTitle className="text-sm font-bold text-white uppercase tracking-widest">Integration Request Templates</DialogTitle>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setTemplatesModal(null)} className="text-slate-500 hover:text-white h-7 w-7">
                        <X size={16} />
                    </Button>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {templatesModal && Object.entries(templatesModal).map(([contentType, template]) => (
                        <div key={contentType} className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-[10px] text-sky-400 border-sky-900/50">{contentType}</Badge>
                            </div>
                            <pre className="text-[11px] text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto whitespace-pre font-mono leading-relaxed">{template}</pre>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
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
                            {node.methods.filter(m => m !== 'OPTIONS').map(m =>
                                renderMethodBadge(
                                    m,
                                    () => handleMethodClick(m),
                                    selectedMethod === m
                                )
                            )}
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
                        <ApiTreeItem key={child.fullPath} node={child} level={level + 1} simple={simple} />
                    ))}
                </div>
            )}
        </div>
        </>
    );
};
