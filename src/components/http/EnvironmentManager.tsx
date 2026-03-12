import React, { useState } from 'react';
import { Settings, Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { HttpEnvironment, KeyValuePair, HttpCollectionFolder } from './HttpClientState';
import { VariableInput } from './VariableInput';

// A simple KV table exactly like RequestConfigPanel but tailored for Variables.
// Since we have a similar layout, let's keep it simple.
interface EnvManagerProps {
    isOpen: boolean;
    onClose: () => void;
    environments: HttpEnvironment[];
    setEnvironments: (envs: HttpEnvironment[]) => void;
    collections: HttpCollectionFolder[];
    availableVariables: string[];
    onUpdateCollectionVars: (colId: string, vars: Record<string, string>) => void;
}

export const EnvironmentManager: React.FC<EnvManagerProps> = ({
    isOpen, onClose, environments, setEnvironments, collections, availableVariables, onUpdateCollectionVars
}) => {
    const [viewMode, setViewMode] = useState<'global' | 'collections'>('global');
    const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
    const [selectedColId, setSelectedColId] = useState<string | null>(null);

    // Initialize selection once when available
    React.useEffect(() => {
        if (!selectedEnvId && environments?.length > 0) setSelectedEnvId(environments[0].id);
        if (!selectedColId && collections?.length > 0) setSelectedColId(collections[0].id);
    }, [environments, collections]);

    // Local state for editing to avoid ID regeneration loops
    const [localKV, setLocalKV] = useState<KeyValuePair[]>([]);

    if (!isOpen) return null;

    // Convert Record<string, string> to KeyValuePair array
    const objToKV = (obj?: Record<string, string>): KeyValuePair[] => {
        const entries = obj ? Object.entries(obj).map(([k, v]) => ({ id: uuidv4(), key: k, value: v, isActive: true })) : [];
        return [...entries, { id: uuidv4(), key: '', value: '', isActive: true }];
    };

    const kvToObj = (kvs: KeyValuePair[]): Record<string, string> => {
        const obj: Record<string, string> = {};
        for (const kv of kvs) {
            if (kv.key && kv.isActive) {
                obj[kv.key] = kv.value;
            }
        }
        return obj;
    };

    // Sync local state when selection changes
    React.useEffect(() => {
        if (viewMode === 'global') {
            const env = environments.find(e => e.id === selectedEnvId);
            setLocalKV(objToKV(env?.variables));
        } else {
            const col = collections.find(c => c.id === selectedColId);
            setLocalKV(objToKV(col?.variables));
        }
    }, [selectedEnvId, selectedColId, viewMode, isOpen]);

    // Handlers
    const handleAddEnv = () => {
        const newEnv: HttpEnvironment = {
            id: uuidv4(),
            name: 'New Environment',
            variables: {},
            isActive: false
        };
        setEnvironments([...environments, newEnv]);
        setSelectedEnvId(newEnv.id);
    };

    const handleUpdateStore = (kvs: KeyValuePair[]) => {
        const newVars = kvToObj(kvs);
        if (viewMode === 'global' && selectedEnvId) {
            const next = environments.map(e => e.id === selectedEnvId ? { ...e, variables: newVars } : e);
            setEnvironments(next);
        } else if (viewMode === 'collections' && selectedColId) {
            onUpdateCollectionVars(selectedColId, newVars);
        }
    };

    const handleRowChange = (index: number, field: keyof KeyValuePair, value: any) => {
        const copy = [...localKV];
        copy[index] = { ...copy[index], [field]: value };

        // Add new row if we're typing in the last one
        if (index === copy.length - 1 && (field === 'key' || field === 'value') && value) {
            copy.push({ id: uuidv4(), key: '', value: '', isActive: true });
        }

        setLocalKV(copy);
        handleUpdateStore(copy);
    };

    const handleRowRemove = (index: number) => {
        if (localKV.length <= 1 && index === 0) {
            const reset = [{ id: uuidv4(), key: '', value: '', isActive: true }];
            setLocalKV(reset);
            handleUpdateStore(reset);
            return;
        }
        const copy = localKV.filter((_, i) => i !== index);
        setLocalKV(copy);
        handleUpdateStore(copy);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-xl w-full max-w-4xl h-[600px] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Settings size={18} className="text-nexus-accent" />
                        <h3 className="font-semibold text-slate-200">Variables Manager</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left Sidebar */}
                    <div className="w-64 border-r border-slate-800 flex flex-col bg-slate-950/50">
                        <div className="flex flex-col gap-1 p-2 border-b border-slate-800">
                            <button
                                onClick={() => setViewMode('global')}
                                className={`px-3 py-1.5 text-sm text-left rounded font-medium ${viewMode === 'global' ? 'bg-nexus-neon text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Global Environments
                            </button>
                            <button
                                onClick={() => setViewMode('collections')}
                                className={`px-3 py-1.5 text-sm text-left rounded font-medium ${viewMode === 'collections' ? 'bg-nexus-neon text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Collection Variables
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {viewMode === 'global' && (
                                <div className="flex flex-col gap-1">
                                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest p-1 flex justify-between">
                                        <span>Environments</span>
                                        <button onClick={handleAddEnv} className="hover:text-nexus-neon"><Plus size={14} /></button>
                                    </div>
                                    {(environments || []).map(env => (
                                        <div key={env.id} className="flex items-center gap-2 group">
                                            <button
                                                onClick={() => setSelectedEnvId(env.id)}
                                                className={`flex-1 text-left px-2 py-1.5 text-sm rounded transition-colors ${selectedEnvId === env.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
                                            >
                                                {env.name}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {viewMode === 'collections' && (
                                <div className="flex flex-col gap-1">
                                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest p-1">
                                        Root Collections
                                    </div>
                                    {collections.length === 0 && <span className="text-xs text-slate-600 p-2 text-center w-full">No collections</span>}
                                    {(collections || []).map(col => (
                                        <button
                                            key={col.id}
                                            onClick={() => setSelectedColId(col.id)}
                                            className={`text-left px-2 py-1.5 text-sm rounded transition-colors ${selectedColId === col.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
                                        >
                                            {col.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Editor */}
                    <div className="flex-1 p-4 bg-slate-900 flex flex-col gap-4 overflow-y-auto">
                        {viewMode === 'global' && selectedEnvId && (
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-slate-400 font-semibold tracking-wide">Environment Name</label>
                                <input
                                    type="text"
                                    value={environments.find(e => e.id === selectedEnvId)?.name || ''}
                                    onChange={(e) => {
                                        const nx = environments.map(en => en.id === selectedEnvId ? { ...en, name: e.target.value } : en);
                                        setEnvironments(nx);
                                    }}
                                    className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-200 outline-none focus:border-nexus-neon max-w-sm"
                                />
                            </div>
                        )}
                        {viewMode === 'collections' && selectedColId && (
                            <h4 className="text-sm font-semibold text-slate-300">Variables for Collection: {collections.find(c => c.id === selectedColId)?.name}</h4>
                        )}

                        <div className="w-full border border-slate-700 rounded-md overflow-hidden mt-2">
                            {localKV.map((item, idx) => (
                                <div key={item.id} className="flex border-b border-slate-700/50 last:border-0 bg-slate-900/50 hover:bg-slate-800 transition-colors">
                                    <div className="flex items-center justify-center p-2 border-r border-slate-700/50">
                                        <input
                                            type="checkbox"
                                            checked={item.isActive}
                                            onChange={(e) => handleRowChange(idx, 'isActive', e.target.checked)}
                                            className="accent-nexus-neon cursor-pointer"
                                            disabled={!item.key && !item.value}
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Variable Name (e.g. host)"
                                        className="flex-1 bg-transparent border-r border-slate-700/50 p-2 text-sm text-slate-200 focus:outline-none focus:bg-slate-800 font-mono"
                                        value={item.key}
                                        onChange={(e) => handleRowChange(idx, 'key', e.target.value)}
                                    />
                                    <VariableInput
                                        value={item.value}
                                        onChange={(val) => handleRowChange(idx, 'value', val)}
                                        placeholder="Value"
                                        availableVariables={availableVariables}
                                        className="bg-transparent border-none"
                                        containerClassName="flex-[2]"
                                    />
                                    <button
                                        onClick={() => handleRowRemove(idx)}
                                        className="p-2 text-slate-500 hover:text-red-400 border-l border-slate-700/50"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="text-xs text-slate-500 mt-2 italic">
                            Use variables in URLs, headers, and body with the {'{{variableName}}'} syntax. <br />
                            Global variables normally override Collection variables if they share the same name.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
