import React, { useMemo, useState } from 'react';
import { HttpResponse } from './HttpClientState';
import Editor from '@monaco-editor/react';
import { Copy, FileText, List } from 'lucide-react';
import { Button } from '@/components//ui/button';

interface ResponsePanelProps {
    response: HttpResponse | null;
    loading: boolean;
}

export const ResponsePanel: React.FC<ResponsePanelProps> = ({ response, loading }) => {
    const [activeTab, setActiveTab] = useState<'body' | 'headers'>('body');

    const statusColor = (status: number) => {
        if (status >= 200 && status < 300) return 'text-microtermix-success';
        if (status >= 300 && status < 400) return 'text-yellow-400';
        if (status >= 400) return 'text-microtermix-danger';
        return 'text-slate-400';
    };

    const { formattedBody, language, sizeKb } = useMemo(() => {
        if (!response) return { formattedBody: '', language: 'plaintext', sizeKb: '0' };
        
        const contentType = Object.keys(response.headers).find(k => k.toLowerCase() === 'content-type');
        const ctValue = contentType ? response.headers[contentType].toLowerCase() : '';
        
        let language = 'plaintext';
        let formattedBody = response.body;

        try {
            if (ctValue.includes('application/json')) {
                language = 'json';
                const parsed = JSON.parse(response.body);
                // Auto-format JSON
                formattedBody = JSON.stringify(parsed, null, 2);
            } else if (ctValue.includes('xml')) {
                language = 'xml';
            } else if (ctValue.includes('html')) {
                language = 'html';
            }
        } catch (_) {
            // parsing failed, keep original string
        }

        const bytes = new Blob([formattedBody]).size;
        const sizeKb = (bytes / 1024).toFixed(1);

        return { formattedBody, language, sizeKb };
    }, [response]);

    const handleCopy = () => {
        navigator.clipboard.writeText(formattedBody);
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 h-full bg-slate-900 overflow-hidden border-l border-slate-800">
            {!response && !loading && (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic opacity-70">
                    Send a request to see the response
                </div>
            )}

            {loading && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400">
                    <div className="w-8 h-8 rounded-full border-2 border-microtermix-neon border-t-transparent animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500 animate-pulse">Waiting for response...</span>
                </div>
            )}

            {response && !loading && (
                <>
                    {/* Response Metadata Bar */}
                    <div className="flex-none flex items-center justify-between px-4 py-2 bg-slate-950/80 border-b border-slate-800 text-xs">
                        <div className="flex items-center gap-4 border border-slate-800 px-3 py-1 rounded bg-slate-900 shadow-inner">
                            <span className={`font-black text-sm tracking-tighter ${statusColor(response.status)}`}>
                                {response.status} <span className="text-xs ml-1 opacity-80 uppercase tracking-widest">{response.statusText}</span>
                            </span>
                            <span className="text-slate-400 border-l border-slate-800 pl-4 py-0.5 font-mono">{response.timeMs} ms</span>
                            <span className="text-slate-400 border-l border-slate-800 pl-4 py-0.5 font-mono">{sizeKb} KB</span>
                        </div>
                        {response.isError && (
                            <span className="text-microtermix-danger font-bold text-[10px] uppercase bg-microtermix-danger/10 px-2 py-0.5 rounded border border-microtermix-danger/20">
                                {response.errorMsg}
                            </span>
                        )}
                    </div>

                    {/* Content Tabs */}
                    <div className="flex-none flex items-center justify-between border-b border-slate-800 bg-slate-900/50 pr-2">
                        <div className="flex">
                            <button
                                onClick={() => setActiveTab('body')}
                                className={`flex items-center gap-1.5 px-6 py-2.5 text-xs font-bold border-b-2 transition-colors uppercase tracking-wider ${activeTab === 'body'
                                    ? 'border-microtermix-neon text-microtermix-neon bg-slate-900'
                                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                                }`}
                            >
                                <FileText size={13} /> Body
                            </button>
                            <button
                                onClick={() => setActiveTab('headers')}
                                className={`flex items-center gap-1.5 px-6 py-2.5 text-xs font-bold border-b-2 transition-colors uppercase tracking-wider ${activeTab === 'headers'
                                    ? 'border-microtermix-neon text-microtermix-neon bg-slate-900'
                                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                                }`}
                            >
                                <List size={13} /> Headers <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px] leading-none mb-px">{Object.keys(response.headers).length}</span>
                            </button>
                        </div>
                        {activeTab === 'body' && (
                            <Button size="icon-sm" variant="ghost" onClick={handleCopy} className="text-slate-400 hover:text-white" title="Copy payload">
                                <Copy size={13} />
                            </Button>
                        )}
                    </div>

                    {/* Viewport */}
                    <div className="flex-1 overflow-hidden relative">
                        {activeTab === 'body' && (
                            <div className="absolute inset-0">
                                <Editor
                                    height="100%"
                                    language={language}
                                    theme="vs-dark"
                                    value={formattedBody}
                                    options={{
                                        readOnly: true,
                                        minimap: { enabled: false },
                                        wordWrap: 'on',
                                        fontSize: 12,
                                        fontFamily: 'monospace',
                                        scrollBeyondLastLine: false,
                                        padding: { top: 12, bottom: 12 },
                                    }}
                                />
                            </div>
                        )}

                        {activeTab === 'headers' && (
                            <div className="h-full overflow-y-auto p-4 bg-slate-950 font-mono text-xs">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-800 text-slate-500">
                                            <th className="py-2 px-3 font-medium">Header</th>
                                            <th className="py-2 px-3 font-medium">Value</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                        {Object.entries(response.headers).map(([key, value]) => (
                                            <tr key={key} className="hover:bg-slate-900/50 transition-colors">
                                                <td className="py-2 px-3 text-slate-300 font-bold max-w-[200px] break-all border-r border-slate-800/50">{key}</td>
                                                <td className="py-2 px-3 text-sky-200 break-all">{value}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {Object.keys(response.headers).length === 0 && (
                                    <p className="text-slate-500 italic text-center mt-6">No headers provided</p>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
