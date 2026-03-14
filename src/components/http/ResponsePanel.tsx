import React from 'react';
import { HttpResponse } from './HttpClientState';

interface ResponsePanelProps {
    response: HttpResponse | null;
    loading: boolean;
}

export const ResponsePanel: React.FC<ResponsePanelProps> = ({ response, loading }) => {
    const statusColor = (status: number) => {
        if (status >= 200 && status < 300) return 'text-green-400';
        if (status >= 300 && status < 400) return 'text-yellow-400';
        if (status >= 400) return 'text-red-400';
        return 'text-slate-400';
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-microtermix-dark" style={{ minHeight: '150px' }}>
            {!response && !loading && (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-sm italic">
                    Send a request to see the response
                </div>
            )}

            {loading && (
                <div className="flex-1 flex items-center justify-center gap-3 text-slate-400">
                    <div className="w-5 h-5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                    Sending request…
                </div>
            )}

            {response && !loading && (
                <div className="flex-1 flex flex-col h-full min-h-0">
                    {/* Response meta bar */}
                    <div className="flex-none flex items-center gap-6 px-4 py-2 bg-slate-950/80 border-b border-slate-800 text-xs">
                        <span className={`font-bold text-sm ${statusColor(response.status)}`}>
                            {response.status} {response.statusText}
                        </span>
                        <span className="text-slate-400">{response.timeMs} ms</span>
                        {response.isError && (
                            <span className="text-red-400">{response.errorMsg}</span>
                        )}
                    </div>
                    {/* Body */}
                    <div className="flex-1 overflow-auto bg-slate-950 p-4">
                        <textarea
                            className="w-full h-full bg-transparent border-0 font-mono text-xs text-sky-100 outline-none resize-none"
                            readOnly
                            value={response.body}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
