import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { useWorkspace } from '../context/WorkspaceContext';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import 'xterm/css/xterm.css';

/** Copies text to clipboard using execCommand (reliable on Linux WebKitGTK) with async API fallback. */
function writeToClipboard(text: string) {
    try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
        document.body.appendChild(el);
        el.focus();
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        if (!ok) throw new Error('execCommand failed');
    } catch {
        navigator.clipboard?.writeText(text).catch(() => {});
    }
}

interface TerminalViewProps {
    serviceId: string;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ serviceId }) => {
    const { state } = useWorkspace();
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const lastWrittenLogCountRef = useRef(0);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            theme: {
                background: '#020617',
                foreground: '#f8fafc',
                cursor: '#38bdf8',
            },
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        searchAddon.activate(term as Parameters<SearchAddon['activate']>[0]);
        searchAddonRef.current = searchAddon;
        term.open(terminalRef.current);
        fitAddon.fit();

        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
            if (e.type !== 'keydown') return true;
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const sel = term.getSelection();
                if (sel) {
                    writeToClipboard(sel);
                    return false;
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                navigator.clipboard?.readText().then(text => {
                    if (text) term.write(text);
                }).catch(() => {});
                return false;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setSearchOpen(open => !open);
                return false;
            }
            return true;
        });

        xtermRef.current = term;

        // Repoblar logs al montar/remontar (p. ej. al volver de Git): así no se pierde el contenido
        const initialLogs = state.activeProcesses[serviceId]?.logs ?? [];
        initialLogs.forEach(line => term.writeln(line));
        lastWrittenLogCountRef.current = initialLogs.length;

        const resizeObserver = new ResizeObserver(() => fitAddon.fit());
        resizeObserver.observe(terminalRef.current);

        return () => {
            resizeObserver.disconnect();
            searchAddonRef.current = null;
            xtermRef.current = null;
            term.dispose();
        };
    }, [serviceId]);

    const searchOptions = { caseSensitive: false, wholeWord: false, regex: false };

    const handleFindNext = useCallback(() => {
        const addon = searchAddonRef.current;
        if (!addon || !searchQuery.trim()) return;
        addon.findNext(searchQuery, searchOptions);
    }, [searchQuery]);

    const handleFindPrev = useCallback(() => {
        const addon = searchAddonRef.current;
        if (!addon || !searchQuery.trim()) return;
        addon.findPrevious(searchQuery, searchOptions);
    }, [searchQuery]);

    // Sincronizar logs desde el estado (única fuente): así [ENV]/[CMD] se muestran
    // aunque lleguen antes de montar (Run Selected, Restart, etc.)
    const logs = state.activeProcesses[serviceId]?.logs ?? [];
    useEffect(() => {
        const term = xtermRef.current;
        if (!term) return;
        if (logs.length === 0) {
            lastWrittenLogCountRef.current = 0;
            return;
        }
        if (logs.length <= lastWrittenLogCountRef.current) return;
        for (let i = lastWrittenLogCountRef.current; i < logs.length; i++) {
            term.writeln(logs[i]);
        }
        lastWrittenLogCountRef.current = logs.length;
    }, [serviceId, logs]);

    return (
        <div className="w-full h-full min-h-[300px] rounded-lg overflow-hidden border border-slate-800 bg-[#020617] p-2 flex flex-col">
            {searchOpen && (
                <div className="flex items-center gap-2 shrink-0 py-1.5 px-2 bg-slate-900/95 border-b border-slate-700 rounded-t">
                    <Search size={14} className="text-slate-400 shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleFindNext();
                            if (e.key === 'Escape') setSearchOpen(false);
                        }}
                        placeholder="Buscar en terminal..."
                        className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-nexus-neon focus:outline-none"
                        autoFocus
                    />
                    <button
                        type="button"
                        onClick={handleFindPrev}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                        title="Anterior (Enter)"
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={handleFindNext}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                        title="Siguiente (Enter)"
                    >
                        <ChevronDown size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setSearchOpen(false)}
                        className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                        title="Cerrar (Esc)"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
            <div className="flex-1 min-h-0 flex flex-col relative">
                {!searchOpen && (
                    <button
                        type="button"
                        onClick={() => setSearchOpen(true)}
                        className="absolute top-1 right-1 z-10 p-1.5 text-slate-500 hover:text-nexus-neon hover:bg-slate-800/80 rounded transition-colors"
                        title="Buscar (Ctrl+F)"
                    >
                        <Search size={14} />
                    </button>
                )}
                <div ref={terminalRef} className="w-full h-full flex-1 min-h-0" />
            </div>
        </div>
    );
};
