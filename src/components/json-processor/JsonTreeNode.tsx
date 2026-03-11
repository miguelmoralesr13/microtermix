import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

type JsonVal = unknown;

function valueColor(val: JsonVal): string {
    if (val === null)             return 'text-slate-500';
    if (typeof val === 'string')  return 'text-emerald-400';
    if (typeof val === 'number')  return 'text-blue-400';
    if (typeof val === 'boolean') return 'text-amber-400';
    return 'text-slate-300';
}

function renderLeaf(val: JsonVal): string {
    if (val === null)            return 'null';
    if (typeof val === 'string') return `"${val}"`;
    return String(val);
}

interface Props {
    nodeKey: string | null;
    value:   JsonVal;
    depth?:  number;
}

export const JsonTreeNode: React.FC<Props> = ({ nodeKey, value, depth = 0 }) => {
    const isObj  = value !== null && typeof value === 'object';
    const isArr  = Array.isArray(value);
    const [open, setOpen] = useState(depth < 3);

    const children: [string, JsonVal][] = isObj
        ? isArr
            ? (value as JsonVal[]).map((v, i) => [String(i), v])
            : Object.entries(value as Record<string, JsonVal>)
        : [];

    return (
        <div>
            <div
                className="flex items-center gap-1 py-[2px] hover:bg-slate-800/40 rounded cursor-pointer select-none"
                style={{ paddingLeft: `${depth * 16 + 4}px` }}
                onClick={() => isObj && setOpen(o => !o)}
            >
                <span className="w-4 text-slate-500 shrink-0">
                    {isObj ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
                </span>
                {nodeKey !== null && (
                    <span className="text-violet-300 text-xs font-mono">{nodeKey}:</span>
                )}
                {isObj ? (
                    <span className="text-slate-400 text-xs font-mono">
                        {isArr ? '[' : '{'}
                        {!open && <span className="text-slate-600 mx-1">{children.length} items</span>}
                        {!open && (isArr ? ']' : '}')}
                    </span>
                ) : (
                    <span className={`text-xs font-mono ${valueColor(value)}`}>{renderLeaf(value)}</span>
                )}
            </div>
            {isObj && open && (
                <>
                    {children.map(([k, v]) => (
                        <JsonTreeNode key={k} nodeKey={isArr ? null : k} value={v} depth={depth + 1} />
                    ))}
                    <div className="text-slate-400 text-xs font-mono py-[2px]" style={{ paddingLeft: `${depth * 16 + 4}px` }}>
                        <span className="w-4 inline-block" />{isArr ? ']' : '}'}
                    </div>
                </>
            )}
        </div>
    );
};
