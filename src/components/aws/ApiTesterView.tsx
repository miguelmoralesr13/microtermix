import React, { useState, useEffect } from 'react';
import { useApiGatewayStore, FrontendInvokeRequest, TesterEndpoint } from '../../stores/apiGatewayStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Loader2, Globe, Clock, FileJson, Copy, CheckCircle2, Send, Braces, X } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '../../hooks/useMonacoTheme';
import { useWorkspace } from '../../context/WorkspaceContext';
import { formatAwsError, cn } from '@/lib/utils';
import { ApiHistory, ApiHistoryItem } from './apiGatewayTypes';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { generateExampleFromSchema, findSchemaInContract, findHeadersInContract } from '../../lib/apiGatewayUtils';
import { useAwsStore } from '../../stores/awsStore';
import { Sparkles } from 'lucide-react';

interface ApiTesterViewProps {
    endpoint: TesterEndpoint;
    onClose?: () => void;
    showClose?: boolean;
}

export const ApiTesterView: React.FC<ApiTesterViewProps> = ({ endpoint, showClose = false }) => {
    const { 
        invokeEndpoint, 
        testerResponse, 
        loadingInvoke,
        selectedStage,
        getPreset,
        testerOpen,
        error: invokeError
    } = useApiGatewayStore();
    
    const monacoTheme = useMonacoTheme();
    
    const [method, setMethod] = useState('');
    const [url, setUrl] = useState('');
    const [headersJson, setHeadersJson] = useState('{\n  "Content-Type": "application/json"\n}');
    const [body, setBody] = useState('');
    const [sign, setSign] = useState(true);
    const [activeTab, setActiveTab] = useState('request');
    const [copied, setCopied] = useState(false);
    const [history, setHistory] = useState<ApiHistoryItem[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    const { state: { currentPath: workspacePath } } = useWorkspace();

    const loadApiHistory = async (apiId: string, resourceId: string, method: string) => {
        if (!workspacePath) return;
        const baseDir = `.microtermix/test/api_${apiId}_${resourceId}_${method}/jsons`;
        const historyPath = `${workspacePath}/${baseDir}/history.json`;

        try {
            const content = await tauriInvoke<string>('read_text_file', { path: historyPath });
            const data: ApiHistory = JSON.parse(content);
            setHistory(data.executions || []);
        } catch {
            setHistory([]);
        }
    };

    const saveApiHistory = async (item: ApiHistoryItem) => {
        if (!workspacePath || !endpoint) return;
        const { apiId, resourceId, method: endpointMethod } = endpoint;
        const baseDir = `.microtermix/test/api_${apiId}_${resourceId}_${endpointMethod}/jsons`;
        
        try {
            await tauriInvoke('ensure_directory', { base: workspacePath, path: baseDir });
            await tauriInvoke('write_file', {
                path: `${workspacePath}/${baseDir}/request.json`,
                content: JSON.stringify({ url: item.url, method: item.method, headers: item.headers, body: item.body }, null, 2)
            });

            const updatedHistory = [item, ...history].slice(0, 50);
            await tauriInvoke('write_file', {
                path: `${workspacePath}/${baseDir}/history.json`,
                content: JSON.stringify({ executions: updatedHistory }, null, 2)
            });

            setHistory(updatedHistory);
        } catch (e) {
            console.error("[ApiTesterView] Failed to save history:", e);
        }
    };

    const restoreHistoryItem = (item: ApiHistoryItem) => {
        setMethod(item.method);
        setUrl(item.url);
        setBody(item.body || '');
        setSign(item.sign);
        setHeadersJson(JSON.stringify(item.headers, null, 2));
        setActiveTab('request');
        toast.info("Restaurado del historial");
    };

    const generateFromContract = async (apiId: string, type: 'rest' | 'http', path: string, method: string) => {
        const stage = selectedStage[apiId] || 'prod';
        const userRegion = useAwsStore.getState().credentials?.region || 'us-east-1';
        setIsGenerating(true);
        try {
            const cmd = type === 'rest' ? 'apigw_export_api_swagger_rest' : 'apigw_export_api_swagger_http';
            const c = useAwsStore.getState().credentials;
            const rustCreds = {
                access_key_id: c?.accessKeyId,
                secret_access_key: c?.secretAccessKey,
                region: userRegion,
                session_token: c?.sessionToken || null,
            };
            const args = type === 'rest' 
                ? { credentials: rustCreds, restApiId: apiId, stageName: stage } 
                : { credentials: rustCreds, apiId, stageName: stage };
            
            const specStr = await tauriInvoke<string>(cmd, args);
            const spec = JSON.parse(specStr);
            
            // 1. Manejar Body
            const schema = findSchemaInContract(spec, path, method);
            if (schema) {
                const example = generateExampleFromSchema(schema, spec);
                setBody(JSON.stringify(example, null, 2));
            } else {
                setBody('');
            }

            // 2. Manejar Headers
            const contractHeaders = findHeadersInContract(spec, path, method);
            const finalHeaders = {
                "Content-Type": "application/json",
                ...contractHeaders
            };
            setHeadersJson(JSON.stringify(finalHeaders, null, 2));

            if (schema || Object.keys(contractHeaders).length > 0) {
                toast.success("Campos generados desde el contrato");
            }
        } catch (e) {
            console.error("[ApiTesterView] Error generating from contract:", e);
            toast.error("Error al obtener contrato de AWS");
        } finally {
            setIsGenerating(false);
        }
    };

    useEffect(() => {
        if (endpoint) {
            setMethod(endpoint.method);
            const userRegion = useAwsStore.getState().credentials?.region || 'us-east-1';

            let finalUrl = endpoint.baseUrl;
            if (endpoint.isRest) {
                const stage = selectedStage[endpoint.apiId] || 'prod';
                // REPLACING WITHOUT LEADING SLASH
                finalUrl = finalUrl.replace('STAGE', stage).replace('AWS_REGION', userRegion); 
            }
            if (!finalUrl.endsWith('/') && !endpoint.path.startsWith('/')) finalUrl += '/';
            finalUrl += endpoint.path.startsWith('/') ? endpoint.path.substring(1) : endpoint.path;
            
            setUrl(finalUrl);
            setSign(endpoint.authType === 'AWS_IAM' || !endpoint.isRest);
            
            const preset = getPreset(`${endpoint.apiId}|${endpoint.method}|${endpoint.path}`);
            if (preset) {
                setBody(preset);
            } else {
                setBody('');
            }
            
            setHeadersJson(JSON.stringify({ "Content-Type": "application/json" }, null, 2));
            setActiveTab('request');
            if (workspacePath) loadApiHistory(endpoint.apiId, endpoint.resourceId, endpoint.method);
            
            // Trigger automatic generation from contract
            if (endpoint.method !== 'GET' && endpoint.method !== 'HEAD') {
                 generateFromContract(endpoint.apiId, endpoint.isRest ? 'rest' : 'http', endpoint.path, endpoint.method);
            }
        }
    }, [endpoint, selectedStage, getPreset, workspacePath]);

    const handleSend = async () => {
        if (!url) return;
        
        let headerMap: Record<string, string> = {};
        try {
            headerMap = JSON.parse(headersJson);
        } catch (e) {
            toast.error("Error en formato JSON de Headers");
            return;
        }

        const request: FrontendInvokeRequest = {
            url, method, headers: headerMap,
            body: (method !== 'GET' && method !== 'HEAD' && body) ? body : null,
            service: 'execute-api', sign
        };

        console.log("[ApiTesterView] Sending Request:", {
            ...request,
            headersCount: Object.keys(headerMap).length
        });

        try { 
            await invokeEndpoint(request); 
        } catch (e) { 
            console.error("[ApiTesterView] Invoke failed:", e);
            toast.error(formatAwsError(e)); 
        }
        setActiveTab('response');
    };

    useEffect(() => {
        if (testerResponse && endpoint && (testerOpen || !showClose)) {
            let headerMap: Record<string, string> = {};
            try { headerMap = JSON.parse(headersJson); } catch {}

            const newItem: ApiHistoryItem = {
                id: crypto.randomUUID(), timestamp: new Date().toISOString(),
                method, path: endpoint.path, url,
                headers: headerMap,
                body, sign,
                response: { status: testerResponse.status, body: testerResponse.body, duration_ms: testerResponse.duration_ms, headers: testerResponse.headers }
            };
            if (history.length === 0 || history[0].timestamp !== newItem.timestamp) saveApiHistory(newItem);
        }
    }, [testerResponse]);

    const getStatusColor = (status: number) => {
        if (status >= 200 && status < 300) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        if (status >= 400 && status < 500) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        return 'text-red-400 bg-red-500/10 border-red-500/20';
    };

    return (
        <div className="flex-1 overflow-hidden flex min-h-0 bg-slate-950">
            {/* Sidebar Historial */}
            <div className="w-[220px] shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/10">
                <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-2">
                        <Clock size={12} className="text-amber-500" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Recientes</span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 custom-scrollbar">
                    {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-800 opacity-10 gap-2">
                             <Clock size={24} /> <span className="text-[8px] font-bold uppercase tracking-widest">Sin historial</span>
                        </div>
                    ) : history.map(h => (
                        <button key={h.id} onClick={() => restoreHistoryItem(h)} className="group text-left p-2 rounded border border-slate-800 bg-slate-950/40 hover:border-microtermix-neon/30 hover:bg-slate-900/50 transition-all">
                            <div className="flex items-center justify-between mb-1 text-[8px] font-mono text-slate-600">
                                {new Date(h.timestamp).toLocaleTimeString()}
                                <Badge className={cn("text-[7px] h-3.5 px-1 border-none", h.response?.status && h.response.status < 300 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')}>
                                    {h.response?.status || '???'}
                                </Badge>
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono truncate opacity-70">{h.method} {h.url.split('/').pop() || '/'}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-900/20">
                <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex flex-col gap-3">
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <Input value={url} onChange={e => setUrl(e.target.value)} className="pl-9 bg-slate-950 border-slate-700 text-xs font-mono text-sky-300" placeholder="https://..." />
                        </div>
                        <Button onClick={handleSend} disabled={loadingInvoke || !url} className="bg-microtermix-neon text-slate-950 font-bold hover:bg-microtermix-neon/80 px-6 gap-2">
                            {loadingInvoke ? <Loader2 size={16} className="animate-spin" /> : <><Send size={16} /> SEND</>}
                        </Button>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                        <TabsList className="bg-transparent border-none h-10 gap-4 p-0">
                            <TabsTrigger value="request" className="rounded-none border-b-2 border-transparent data-[state=active]:border-microtermix-neon text-[11px] font-bold uppercase tracking-widest px-0">Request</TabsTrigger>
                            <TabsTrigger value="response" className="rounded-none border-b-2 border-transparent data-[state=active]:border-microtermix-neon text-[11px] font-bold uppercase tracking-widest px-0">Response</TabsTrigger>
                        </TabsList>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="h-5 text-[9px] border-slate-800 text-slate-500 font-mono uppercase">{method}</Badge>
                        </div>
                    </div>

                    <TabsContent value="request" className="flex-1 m-0 overflow-hidden flex flex-col bg-slate-950">
                        {/* Headers Editor */}
                        <div className="h-1/3 min-h-[150px] border-b border-slate-800 flex flex-col">
                            <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <Braces size={12} className="text-sky-400" />
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Headers (JSON)</span>
                                </div>
                            </div>
                            <div className="flex-1 bg-[#1e1e1e]">
                                <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={headersJson} onChange={val => setHeadersJson(val || '{}')} options={{ fontSize: 11, minimap: { enabled: false }, lineNumbers: 'off', foldStrategy: 'indentation' }} />
                            </div>
                        </div>

                        {/* Body Editor */}
                        <div className="flex-1 flex flex-col">
                            <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <FileJson size={12} className="text-amber-400" />
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Body (JSON)</span>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 text-[9px] gap-1.5 text-slate-500 hover:text-amber-400"
                                    onClick={() => endpoint && generateFromContract(endpoint.apiId, endpoint.isRest ? 'rest' : 'http', endpoint.path, endpoint.method)}
                                    disabled={isGenerating}
                                >
                                    {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                                    Generate from Contract
                                </Button>
                            </div>
                            <div className="flex-1 bg-[#1e1e1e]">
                                <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={body} onChange={val => setBody(val || '')} options={{ fontSize: 12, minimap: { enabled: false }, lineNumbers: 'on' }} />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="response" className="flex-1 m-0 flex flex-col min-h-0 bg-slate-950">
                        {invokeError ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-rose-500/5">
                                <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center mb-4">
                                    <X size={24} className="text-rose-400" />
                                </div>
                                <h4 className="text-rose-400 font-bold mb-2 uppercase tracking-widest text-xs">Error de Ejecución</h4>
                                <div className="max-w-md bg-slate-900 border border-rose-500/30 p-4 rounded-lg text-rose-300 font-mono text-[11px] break-all">
                                    {invokeError}
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="mt-6 border-slate-700 text-slate-400 hover:bg-slate-800"
                                    onClick={() => handleSend()}
                                >
                                    Reintentar Petición
                                </Button>
                            </div>
                        ) : testerResponse ? (
                            <>
                                <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/30 shrink-0">
                                    <div className="flex items-center gap-4">
                                        <div className={cn("px-2 py-0.5 rounded border text-[11px] font-bold font-mono", getStatusColor(testerResponse.status))}>
                                            {testerResponse.status}
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-500">{testerResponse.duration_ms}ms</span>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(testerResponse.body); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="h-7 text-[10px] text-slate-400">
                                        {copied ? <CheckCircle2 size={12} className="mr-1 text-emerald-400" /> : <Copy size={12} className="mr-1" />}
                                        {copied ? 'Copied' : 'Copy'}
                                    </Button>
                                </div>
                                <div className="flex-1 bg-[#1e1e1e]">
                                    <Editor height="100%" defaultLanguage="json" theme={monacoTheme} value={testerResponse.body} options={{ readOnly: true, fontSize: 12, minimap: { enabled: false } }} />
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-700 gap-3 opacity-20">
                                <FileJson size={48} strokeWidth={1} />
                                <p className="text-[10px] font-black uppercase tracking-widest">Esperando respuesta...</p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};
