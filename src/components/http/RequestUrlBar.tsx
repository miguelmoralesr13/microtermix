import React from 'react';
import { Play } from 'lucide-react';
import { HttpRequest, HttpMethod } from './HttpClientState';
import { VariableInput } from './VariableInput';

interface RequestUrlBarProps {
    request: HttpRequest;
    loading: boolean;
    availableVariables: string[];
    onChange: (req: HttpRequest) => void;
    onSend: () => void;
}

export const RequestUrlBar: React.FC<RequestUrlBarProps> = ({
    request,
    loading,
    availableVariables,
    onChange,
    onSend,
}) => {
    return (
        <div className="p-4 flex flex-col gap-3 border-b border-slate-800 bg-slate-900/50">
            {/* Request name */}
            <input
                type="text"
                className="bg-transparent border-none text-white font-semibold outline-none focus:ring-1 focus:ring-nexus-neon rounded px-1 w-full"
                value={request.name}
                onChange={(e) => onChange({ ...request, name: e.target.value })}
                placeholder="Request Name"
            />

            {/* Method + URL + Send */}
            <div className="flex gap-2">
                <select
                    className="bg-slate-950 border border-slate-700 text-nexus-neon font-bold rounded px-4 py-2 outline-none focus:border-nexus-neon appearance-none w-28 text-center"
                    value={request.method}
                    onChange={(e) => onChange({ ...request, method: e.target.value as HttpMethod })}
                >
                    {(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as HttpMethod[]).map((m) => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>

                <VariableInput
                    value={request.url}
                    onChange={(val) => onChange({ ...request, url: val })}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onSend();
                    }}
                    placeholder="https://api.example.com/v1/endpoint"
                    availableVariables={availableVariables}
                />

                <button
                    onClick={onSend}
                    disabled={loading || !request.url}
                    className={`flex items-center gap-2 px-6 py-2 rounded font-bold transition-all ${loading || !request.url
                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                        : 'bg-nexus-neon text-slate-900 hover:bg-sky-400 hover:shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                        }`}
                >
                    {loading ? (
                        <span className="animate-pulse">Sending…</span>
                    ) : (
                        <>
                            <Play size={16} fill="currentColor" /> Send
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
