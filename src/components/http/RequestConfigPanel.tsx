import React from 'react';
import { Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { KeyValuePair, HttpRequest } from './HttpClientState';
import { VariableInput } from './VariableInput';
import Editor from '@monaco-editor/react';

// Helper for empty row
function makeEmptyKV(): KeyValuePair {
    return { id: uuidv4(), key: '', value: '', isActive: true };
}

interface KVTableProps {
    items: KeyValuePair[];
    availableVariables: string[];
    onChange: (items: KeyValuePair[]) => void;
    placeholderKey?: string;
    placeholderValue?: string;
}

const KVTable: React.FC<KVTableProps> = ({ items, availableVariables, onChange, placeholderKey = 'Key', placeholderValue = 'Value' }) => {
    const currentItems = items.length === 0 ? [makeEmptyKV()] : items;

    const updateItem = (index: number, field: keyof KeyValuePair, value: any) => {
        const newItems = [...currentItems];
        newItems[index] = { ...newItems[index], [field]: value };
        if (index === newItems.length - 1 && (newItems[index].key || newItems[index].value)) {
            newItems.push(makeEmptyKV());
        }
        onChange(newItems);
    };

    const removeItem = (index: number) => {
        const newItems = currentItems.filter((_, i) => i !== index);
        onChange(newItems.length === 0 ? [makeEmptyKV()] : newItems);
    };

    return (
        <div className="w-full border border-slate-700 rounded-md overflow-hidden bg-slate-950/20">
            {currentItems.map((item, idx) => (
                <div key={item.id} className="flex border-b border-slate-700/50 last:border-0 bg-slate-900/50 hover:bg-slate-800 transition-colors">
                    <div className="flex items-center justify-center px-2 py-1 border-r border-slate-700/50">
                        <input
                            type="checkbox"
                            checked={item.isActive}
                            onChange={(e) => updateItem(idx, 'isActive', e.target.checked)}
                            className="accent-microtermix-neon cursor-pointer w-3 h-3"
                            disabled={!item.key && !item.value}
                        />
                    </div>
                    <input
                        type="text"
                        placeholder={placeholderKey}
                        className="flex-1 bg-transparent border-r border-slate-700/50 px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:bg-slate-800 placeholder:text-slate-600"
                        value={item.key}
                        onChange={(e) => updateItem(idx, 'key', e.target.value)}
                    />
                    <VariableInput
                        value={item.value}
                        onChange={(val) => updateItem(idx, 'value', val)}
                        placeholder={placeholderValue}
                        availableVariables={availableVariables}
                        className="bg-transparent border-none py-1"
                        containerClassName="flex-[2] border-r-0 text-[11px] font-mono"
                    />
                    <button
                        onClick={() => removeItem(idx)}
                        className="px-2 text-slate-500 hover:text-red-400 border-l border-slate-700/50 transition-colors"
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            ))}
        </div>
    );
};

interface RequestConfigPanelProps {
    request: HttpRequest;
    availableVariables: string[];
    activeTab: 'params' | 'headers' | 'body';
    setActiveTab: (tab: 'params' | 'headers' | 'body') => void;
    onChange: (req: HttpRequest) => void;
}

export const RequestConfigPanel: React.FC<RequestConfigPanelProps> = ({ request, availableVariables, activeTab, setActiveTab, onChange }) => {
    return (
        <div className="flex-1 flex flex-col min-h-0 bg-microtermix-dark" style={{ minHeight: '150px' }}>
            <div className="flex border-b border-slate-800 bg-slate-950/50">
                {(['params', 'headers', 'body'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-1.5 text-xs font-bold border-b-2 transition-colors capitalize tracking-wide ${activeTab === tab
                            ? 'border-microtermix-neon text-microtermix-neon bg-slate-900/50'
                            : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900/30'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex-1 p-3 overflow-y-auto bg-slate-900/20">
                {activeTab === 'params' && (
                    <KVTable
                        items={request.queryParams}
                        availableVariables={availableVariables}
                        onChange={(items) => onChange({ ...request, queryParams: items })}
                        placeholderKey="Query Param"
                    />
                )}

                {activeTab === 'headers' && (
                    <KVTable
                        items={request.headers}
                        availableVariables={availableVariables}
                        onChange={(items) => onChange({ ...request, headers: items })}
                        placeholderKey="Header Key"
                    />
                )}

                {activeTab === 'body' && (
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-4 mb-2">
                            {(['none', 'raw', 'form-data', 'x-www-form-urlencoded'] as const).map((t) => (
                                <label key={t} className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-300">
                                    <input
                                        type="radio"
                                        className="accent-microtermix-neon w-3 h-3"
                                        checked={request.body.type === t}
                                        onChange={() => onChange({ ...request, body: { type: t } })}
                                    />
                                    <span className="capitalize">{t}</span>
                                </label>
                            ))}
                        </div>

                        {request.body.type === 'raw' && (
                            <div className="flex flex-col flex-1 h-full min-h-[200px] border border-slate-800/80 rounded overflow-hidden shadow-inner">
                                <div className="flex items-center gap-2 border-b border-slate-800/80 bg-slate-950/80 px-3 py-1.5">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mr-1">Payload</span>
                                    {(['json', 'text', 'xml', 'html'] as const).map((lang) => (
                                        <button
                                            key={lang}
                                            onClick={() =>
                                                onChange({
                                                    ...request,
                                                    body: { ...request.body, rawLanguage: lang },
                                                })
                                            }
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${request.body.rawLanguage === lang
                                                ? 'bg-slate-700 text-microtermix-neon'
                                                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                                }`}
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex-1 relative bg-slate-950">
                                    <Editor
                                        height="100%"
                                        language={request.body.rawLanguage || 'json'}
                                        theme="vs-dark"
                                        value={request.body.raw || ''}
                                        onChange={(val) =>
                                            onChange({
                                                ...request,
                                                body: { ...request.body, raw: val || '' },
                                            })
                                        }
                                        options={{
                                            minimap: { enabled: false },
                                            wordWrap: 'on',
                                            fontSize: 12,
                                            fontFamily: 'monospace',
                                            scrollBeyondLastLine: false,
                                            padding: { top: 8, bottom: 8 },
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {request.body.type === 'form-data' && (
                            <KVTable
                                items={request.body.formData || []}
                                availableVariables={availableVariables}
                                onChange={(items) => onChange({ ...request, body: { ...request.body, formData: items } })}
                            />
                        )}

                        {request.body.type === 'x-www-form-urlencoded' && (
                            <KVTable
                                items={request.body.urlencoded || []}
                                availableVariables={availableVariables}
                                onChange={(items) => onChange({ ...request, body: { ...request.body, urlencoded: items } })}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
