import React, { useState } from 'react';
import { Button } from '@/components//ui/button';
import { Input } from '@/components//ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components//ui/select';
import { Plus, Trash2, Copy, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type FieldType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

interface Field {
    id:    string;
    key:   string;
    type:  FieldType;
    value: string;
}

let _id = 0;
const uid = () => String(++_id);

function coerce(f: Field): unknown {
    switch (f.type) {
        case 'string':  return f.value;
        case 'number':  return Number(f.value) || 0;
        case 'boolean': return f.value === 'true';
        case 'null':    return null;
        case 'object':  try { return JSON.parse(f.value || '{}'); } catch { return {}; }
        case 'array':   try { return JSON.parse(f.value || '[]'); } catch { return []; }
    }
}

const FIELD_TYPES: FieldType[] = ['string', 'number', 'boolean', 'null', 'object', 'array'];

const TYPE_PLACEHOLDER: Record<FieldType, string> = {
    string:  'valor',
    number:  '0',
    boolean: 'true / false',
    null:    '',
    object:  '{"a":1}',
    array:   '[1,2,3]',
};

export const JsonNodeEditorTab: React.FC = () => {
    const [fields, setFields] = useState<Field[]>([
        { id: uid(), key: '', type: 'string', value: '' },
    ]);

    const add    = ()           => setFields(p => [...p, { id: uid(), key: '', type: 'string', value: '' }]);
    const remove = (id: string) => setFields(p => p.filter(f => f.id !== id));
    const update = (id: string, patch: Partial<Field>) =>
        setFields(p => p.map(f => f.id === id ? { ...f, ...patch } : f));

    const buildJson = () => {
        const obj: Record<string, unknown> = {};
        fields.forEach(f => { if (f.key) obj[f.key] = coerce(f); });
        return JSON.stringify(obj, null, 2);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Procesado localmente.
            </div>
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950">
                <Button size="sm" onClick={add} className="h-7 text-xs gap-1">
                    <Plus size={13} /> Añadir campo
                </Button>
                <Button size="sm" variant="outline"
                    onClick={() => { navigator.clipboard.writeText(buildJson()); toast.success('JSON copiado'); }}
                    className="h-7 text-xs gap-1">
                    <Copy size={13} /> Copiar JSON
                </Button>
            </div>
            <div className="flex-1 min-h-0 flex">
                {/* Form */}
                <div className="w-1/2 overflow-auto p-4 space-y-2 border-r border-slate-800">
                    {fields.length === 0 && (
                        <div className="text-center text-slate-600 text-sm py-8">
                            Sin campos. Presiona "Añadir campo".
                        </div>
                    )}
                    {fields.map((f, i) => (
                        <div key={f.id} className="flex items-center gap-2 p-2 bg-slate-800/40 rounded border border-slate-700/50">
                            <span className="text-xs text-slate-600 w-5 shrink-0">{i + 1}</span>
                            <Input
                                value={f.key}
                                onChange={e => update(f.id, { key: e.target.value })}
                                placeholder="clave"
                                className="h-7 w-28 text-xs font-mono"
                            />
                            <Select value={f.type} onValueChange={v => update(f.id, { type: v as FieldType, value: '' })}>
                                <SelectTrigger className="h-7 w-24 text-xs shrink-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {FIELD_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            {f.type !== 'null' && (
                                <Input
                                    value={f.value}
                                    onChange={e => update(f.id, { value: e.target.value })}
                                    placeholder={TYPE_PLACEHOLDER[f.type]}
                                    className="h-7 flex-1 text-xs font-mono"
                                />
                            )}
                            <Button size="icon-xs" variant="ghost" onClick={() => remove(f.id)}
                                className="h-7 w-7 shrink-0 text-red-500 hover:text-red-400">
                                <Trash2 size={13} />
                            </Button>
                        </div>
                    ))}
                </div>
                {/* Preview */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="shrink-0 px-3 py-1 text-[11px] text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950">
                        Preview JSON
                    </div>
                    <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-300 bg-slate-950">
                        {buildJson()}
                    </pre>
                </div>
            </div>
        </div>
    );
};
