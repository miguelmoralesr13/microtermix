import React from 'react';
import { Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { KeyValuePair, HttpRequest } from './HttpClientState';
import { VariableInput } from './VariableInput';

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
        <div className="w-full border border-slate-700 rounded-md overflow-hidden">
            {currentItems.map((item, idx) => (
                <div key={item.id} className="flex border-b border-slate-700/50 last:border-0 bg-slate-900/50 hover:bg-slate-800 transition-colors">
                    <div className="flex items-center justify-center p-2 border-r border-slate-700/50">
                        <input
                            type="checkbox"
                            checked={item.isActive}
                            onChange={(e) => updateItem(idx, 'isActive', e.target.checked)}
                            className="accent-microtermix-neon cursor-pointer"
                            disabled={!item.key && !item.value}
                        />
                    </div>
                    <input
                        type="text"
                        placeholder={placeholderKey}
                        className="flex-1 bg-transparent border-r border-slate-700/50 p-2 text-sm text-slate-200 focus:outline-none focus:bg-slate-800"
                        value={item.key}
                        onChange={(e) => updateItem(idx, 'key', e.target.value)}
                    />
                    <VariableInput
                        value={item.value}
                        onChange={(val) => updateItem(idx, 'value', val)}
                        placeholder={placeholderValue}
                        availableVariables={availableVariables}
                        className="bg-transparent border-none"
                        containerClassName="flex-[2] border-r-0"
                    />
                    <button
                        onClick={() => removeItem(idx)}
                        className="p-2 text-slate-500 hover:text-red-400 border-l border-slate-700/50"
                    >
                        <Trash2 size={16} />
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
                        className={`px-6 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === tab
                            ? 'border-microtermix-neon text-microtermix-neon bg-slate-900/50'
                            : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className="flex-1 p-4 overflow-y-auto bg-slate-900/20">
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
                        <div className="flex gap-4">
                            {(['none', 'raw', 'form-data', 'x-www-form-urlencoded'] as const).map((t) => (
                                <label key={t} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                    <input
                                        type="radio"
                                        className="accent-microtermix-neon"
                                        checked={request.body.type === t}
                                        onChange={() => onChange({ ...request, body: { type: t } })}
                                    />
                                    <span className="capitalize">{t}</span>
                                </label>
                            ))}
                        </div>

                        {request.body.type === 'raw' && (
                            <div className="flex flex-col gap-2 flex-1 h-full min-h-[200px]">
                                <div className="flex gap-2">
                                    {(['json', 'text', 'xml', 'html'] as const).map((lang) => (
                                        <button
                                            key={lang}
                                            onClick={() =>
                                                onChange({
                                                    ...request,
                                                    body: { ...request.body, rawLanguage: lang },
                                                })
                                            }
                                            className={`px-3 py-1 rounded text-xs font-mono transition-colors ${request.body.rawLanguage === lang
                                                ? 'bg-microtermix-neon text-slate-900'
                                                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                                                }`}
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    className="flex-1 w-full h-full bg-slate-950 border border-slate-700 rounded p-4 font-mono text-sm text-slate-200 outline-none focus:border-microtermix-neon resize-none focus:shadow-[0_0_15px_rgba(56,189,248,0.2)] transition-all"
                                    placeholder='{ "key": "value" }'
                                    value={request.body.raw || ''}
                                    onChange={(e) =>
                                        onChange({
                                            ...request,
                                            body: { ...request.body, raw: e.target.value },
                                        })
                                    }
                                />
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
