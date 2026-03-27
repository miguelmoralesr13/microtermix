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
        <div className="flex flex-col border-b border-slate-800 bg-slate-900/50">
            {/* Top compact bar for Request Name */}
            <div className="flex items-center px-4 py-1.5 bg-slate-950/40 border-b border-slate-800/50">
                <input
                    type="text"
                    className="bg-transparent border-none text-slate-300 font-bold text-xs outline-none focus:text-white placeholder:text-slate-600 w-full"
                    value={request.name}
                    onChange={(e) => onChange({ ...request, name: e.target.value })}
                    placeholder="Request Name"
                />
            </div>

            {/* Main Action Bar */}
            <div className="flex items-center gap-2 px-4 py-2">
                <select
                    className="bg-slate-950 border border-slate-700 text-microtermix-neon text-xs font-bold rounded px-2 py-1.5 outline-none focus:border-microtermix-neon cursor-pointer appearance-none w-24 text-center shrink-0"
                    value={request.method}
                    onChange={(e) => onChange({ ...request, method: e.target.value as HttpMethod })}
                >
                    {(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as HttpMethod[]).map((m) => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>

                <div className="flex-1 min-w-0">
                    <VariableInput
                        value={request.url}
                        onChange={(val) => onChange({ ...request, url: val })}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onSend();
                        }}
                        placeholder="https://api.example.com/v1/endpoint"
                        availableVariables={availableVariables}
                    />
                </div>

                <button
                    onClick={onSend}
                    disabled={loading || !request.url}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold transition-all shrink-0 ${loading || !request.url
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-inner'
                        : 'bg-microtermix-neon text-slate-900 hover:bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.2)]'
                        }`}
                >
                    {loading ? (
                        <span className="animate-pulse">Sending…</span>
                    ) : (
                        <>
                            <Play size={13} fill="currentColor" /> Send
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};
