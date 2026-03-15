import React, { useState, useEffect } from 'react';
import { useApiGatewayStore, FrontendInvokeRequest } from '../stores/apiGatewayStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { X, Plus, Play, Loader2, Globe, ShieldCheck, Clock, FileJson, Copy, CheckCircle2 } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { useMonacoTheme } from '../hooks/useMonacoTheme';

export const ApiGatewayTester: React.FC = () => {
    const { 
        testerOpen, 
        closeTester, 
        testerEndpoint, 
        invokeEndpoint, 
        testerResponse, 
        loadingInvoke,
        selectedStage,
        getPreset
    } = useApiGatewayStore();
    
    const monacoTheme = useMonacoTheme();
    
    const [method, setMethod] = useState('');
    const [url, setUrl] = useState('');
    const [headers, setHeaders] = useState<{ key: string; value: string; id: string }[]>([]);
    const [body, setBody] = useState('');
    const [sign, setSign] = useState(true);
    const [activeTab, setActiveTab] = useState('request');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (testerEndpoint) {
            setMethod(testerEndpoint.method);
            
            // Build real URL
            let finalUrl = testerEndpoint.baseUrl;
            if (testerEndpoint.isRest) {
                const stage = selectedStage[testerEndpoint.apiId] || 'prod';
                // Replace placeholder or just append if not present
                if (finalUrl.includes('AWS_REGION')) {
                    // This is a placeholder we set in ApiTreeItem, let's just use it if we can't find a better way
                    // Actually, for REST, we don't have api_endpoint in the metadata usually, we have to construct it.
                    // But if it's already a full URL (from a previous improvement?), use it.
                }
                
                // For this version, let's assume we can prompt for region if missing or use store
                // A better way is to use the endpoint provided by AWS if available.
                finalUrl = finalUrl.replace('/STAGE', `/${stage}`).replace('/AWS_REGION', 'us-east-1'); // Defaulting for safety
            }
            
            // Append path
            if (!finalUrl.endsWith('/') && !testerEndpoint.path.startsWith('/')) {
                finalUrl += '/';
            }
            finalUrl += testerEndpoint.path.startsWith('/') ? testerEndpoint.path.substring(1) : testerEndpoint.path;
            
            setUrl(finalUrl);
            setSign(testerEndpoint.authType === 'AWS_IAM' || !testerEndpoint.isRest); // HTTP APIs often use SigV4 for IAM too
            
            // Load preset if exists
            const presetKey = `${testerEndpoint.apiId}|${testerEndpoint.method}|${testerEndpoint.path}`;
            const preset = getPreset(presetKey);
            setBody(preset || '');
            
            // Default headers
            setHeaders([
                { key: 'Content-Type', value: 'application/json', id: crypto.randomUUID() }
            ]);
            
            setActiveTab('request');
        }
    }, [testerEndpoint, selectedStage, getPreset]);

    const addHeader = () => {
        setHeaders([...headers, { key: '', value: '', id: crypto.randomUUID() }]);
    };

    const removeHeader = (id: string) => {
        setHeaders(headers.filter(h => h.id !== id));
    };

    const updateHeader = (id: string, field: 'key' | 'value', val: string) => {
        setHeaders(headers.map(h => h.id === id ? { ...h, [field]: val } : h));
    };

    const handleSend = async () => {
        if (!url) return;
        
        const headerMap: Record<string, string> = {};
        headers.forEach(h => {
            if (h.key.trim()) headerMap[h.key.trim()] = h.value;
        });

        const request: FrontendInvokeRequest = {
            url,
            method,
            headers: headerMap,
            body: method !== 'GET' && method !== 'HEAD' ? body : null,
            service: 'execute-api',
            sign
        };

        await invokeEndpoint(request);
        setActiveTab('response');
    };

    const handleCopyResponse = () => {
        if (!testerResponse) return;
        navigator.clipboard.writeText(testerResponse.body);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getStatusColor = (status: number) => {
        if (status >= 200 && status < 300) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        if (status >= 400 && status < 500) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        if (status >= 500) return 'text-red-400 bg-red-500/10 border-red-500/20';
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    };

    return (
        <Dialog open={testerOpen} onOpenChange={(open) => !open && closeTester()}>
            <DialogContent className="p-0 flex flex-col gap-0 bg-slate-900 border-slate-700 shadow-2xl w-[90vw] max-w-4xl h-[85vh] max-h-[85vh] overflow-hidden" showCloseButton={false}>
                <DialogHeader className="p-4 border-b border-slate-800 bg-slate-950/50 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-microtermix-neon/10 border border-microtermix-neon/20">
                                <Play size={18} className="text-microtermix-neon" fill="currentColor" />
                            </div>
                            <div>
                                <DialogTitle className="text-sm font-bold uppercase tracking-widest text-white">API Tester</DialogTitle>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="font-mono text-[10px] h-5 bg-slate-900">{method}</Badge>
                                    <span className="text-[11px] text-slate-500 font-mono truncate max-w-[300px]">{testerEndpoint?.path}</span>
                                </div>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={closeTester} className="text-slate-500 hover:text-white">
                            <X size={20} />
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex flex-col gap-3">
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <Input 
                                    value={url} 
                                    onChange={e => setUrl(e.target.value)}
                                    className="pl-9 bg-slate-950 border-slate-700 text-xs font-mono text-sky-300 focus:border-microtermix-neon/50"
                                    placeholder="https://..."
                                />
                            </div>
                            <Button 
                                onClick={handleSend} 
                                disabled={loadingInvoke || !url}
                                className="bg-microtermix-neon text-slate-950 font-bold hover:bg-microtermix-neon/80 px-6"
                            >
                                {loadingInvoke ? <Loader2 size={16} className="animate-spin" /> : 'SEND'}
                            </Button>
                        </div>
                        
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div 
                                    onClick={() => setSign(!sign)}
                                    className={`w-8 h-4 rounded-full transition-colors relative border ${sign ? 'bg-microtermix-neon/20 border-microtermix-neon/50' : 'bg-slate-800 border-slate-700'}`}
                                >
                                    <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${sign ? 'right-0.5 bg-microtermix-neon' : 'left-0.5 bg-slate-500'}`} />
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${sign ? 'text-microtermix-neon' : 'text-slate-500'}`}>AWS SigV4 Signing</span>
                                <ShieldCheck size={12} className={sign ? 'text-microtermix-neon' : 'text-slate-600'} />
                            </label>
                        </div>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                        <div className="px-4 bg-slate-900 border-b border-slate-800">
                            <TabsList className="bg-transparent border-none h-10 gap-4 p-0">
                                <TabsTrigger value="request" className="rounded-none border-b-2 border-transparent data-[state=active]:border-microtermix-neon data-[state=active]:bg-transparent text-[11px] font-bold uppercase tracking-widest px-0">Request</TabsTrigger>
                                <TabsTrigger value="response" className="rounded-none border-b-2 border-transparent data-[state=active]:border-microtermix-neon data-[state=active]:bg-transparent text-[11px] font-bold uppercase tracking-widest px-0 relative">
                                    Response
                                    {testerResponse && <div className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-microtermix-neon" />}
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="request" className="flex-1 m-0 overflow-y-auto p-0 bg-slate-950/30">
                            <div className="p-4 space-y-6">
                                {/* Headers Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Headers</h4>
                                        <Button variant="ghost" size="sm" onClick={addHeader} className="h-6 text-[10px] text-microtermix-neon hover:bg-microtermix-neon/10">
                                            <Plus size={12} className="mr-1" /> Add Header
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        {headers.map(h => (
                                            <div key={h.id} className="flex gap-2">
                                                <Input 
                                                    value={h.key} 
                                                    onChange={e => updateHeader(h.id, 'key', e.target.value)}
                                                    placeholder="Key" 
                                                    className="h-8 bg-slate-900 border-slate-800 text-xs font-mono"
                                                />
                                                <Input 
                                                    value={h.value} 
                                                    onChange={e => updateHeader(h.id, 'value', e.target.value)}
                                                    placeholder="Value" 
                                                    className="h-8 bg-slate-900 border-slate-800 text-xs font-mono"
                                                />
                                                <Button variant="ghost" size="icon" onClick={() => removeHeader(h.id)} className="h-8 w-8 text-slate-600 hover:text-red-400">
                                                    <X size={14} />
                                                </Button>
                                            </div>
                                        ))}
                                        {headers.length === 0 && <div className="text-[10px] text-slate-600 italic py-2 text-center border border-dashed border-slate-800 rounded">No custom headers</div>}
                                    </div>
                                </div>

                                {/* Body Section */}
                                {method !== 'GET' && method !== 'HEAD' && (
                                    <div className="space-y-3 h-[300px] flex flex-col">
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Request Body (JSON)</h4>
                                        <div className="flex-1 rounded-lg border border-slate-800 overflow-hidden bg-[#1e1e1e]">
                                            <Editor
                                                height="100%"
                                                defaultLanguage="json"
                                                theme={monacoTheme}
                                                value={body}
                                                onChange={val => setBody(val || '')}
                                                options={{
                                                    minimap: { enabled: false },
                                                    fontSize: 12,
                                                    lineNumbers: 'on',
                                                    scrollBeyondLastLine: false,
                                                    automaticLayout: true,
                                                    padding: { top: 8, bottom: 8 }
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="response" className="flex-1 m-0 flex flex-col min-h-0 bg-slate-950">
                            {testerResponse ? (
                                <>
                                    <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/30">
                                        <div className="flex items-center gap-4">
                                            <div className={`px-2 py-0.5 rounded border text-[11px] font-bold font-mono ${getStatusColor(testerResponse.status)}`}>
                                                {testerResponse.status} {testerResponse.status === 200 ? 'OK' : ''}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-500">
                                                <Clock size={12} />
                                                <span className="text-[10px] font-mono">{testerResponse.duration_ms}ms</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="sm" onClick={handleCopyResponse} className="h-7 text-[10px] text-slate-400 hover:text-slate-200">
                                                {copied ? <><CheckCircle2 size={12} className="mr-1 text-emerald-400" /> Copied</> : <><Copy size={12} className="mr-1" /> Copy Body</>}
                                            </Button>
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 min-h-0">
                                        <Editor
                                            height="100%"
                                            defaultLanguage="json"
                                            theme={monacoTheme}
                                            value={testerResponse.body}
                                            options={{
                                                readOnly: true,
                                                minimap: { enabled: true },
                                                fontSize: 12,
                                                lineNumbers: 'on',
                                                scrollBeyondLastLine: false,
                                                automaticLayout: true,
                                                wordWrap: 'on'
                                            }}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-3">
                                    <FileJson size={48} className="opacity-10" />
                                    <p className="text-sm font-medium">No response yet</p>
                                    <p className="text-[11px] max-w-[200px] text-center opacity-60">Configure your request and hit SEND to see the results here.</p>
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
};
