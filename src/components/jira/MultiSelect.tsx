import { useState, useEffect, useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';

export function MultiSelect({ label, options, selected, onChange }: {
    label: string;
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (v: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    useEffect(() => {
        if (open) { setSearch(''); setTimeout(() => searchRef.current?.focus(), 0); }
    }, [open]);

    const toggle = (v: string) =>
        onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

    const filtered = search.trim()
        ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
        : options;

    const display = selected.length === 0 ? 'Todos'
        : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
            : `${selected.length} sel.`;

    const active = selected.length > 0;

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] rounded border transition-colors ${active
                    ? 'bg-microtermix-accent/10 border-microtermix-accent/40 text-microtermix-accent'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'}`}
            >
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</span>
                <span className="font-medium">{display}</span>
                {active && (
                    <span onClick={e => { e.stopPropagation(); onChange([]); }} className="opacity-60 hover:opacity-100">
                        <X size={9} />
                    </span>
                )}
                <ChevronDown size={9} className={`opacity-40 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute top-full mt-1 left-0 z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl min-w-[180px] flex flex-col max-h-64">
                    <div className="p-1.5 border-b border-slate-800 shrink-0">
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            placeholder="Buscar..."
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-microtermix-neon"
                        />
                    </div>
                    <div className="overflow-y-auto py-1">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-600 italic">Sin resultados</p>
                        ) : filtered.map(opt => (
                            <label key={opt.value} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-800 cursor-pointer text-xs text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(opt.value)}
                                    onChange={() => toggle(opt.value)}
                                    className="accent-microtermix-accent w-3 h-3"
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
