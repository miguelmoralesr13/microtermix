import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useProcessStore } from '../../stores/processStore';
import { useUIStore } from '../../stores/uiStore';
import { getTerminalTheme } from '../../lib/terminalThemes';
import { Search, X, ChevronUp, ChevronDown, Lightbulb, Zap, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useLogActions, LogAction } from '../../hooks/useLogActions';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
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
        navigator.clipboard?.writeText(text).catch(() => { });
    }
}

interface TerminalViewProps {
    serviceId: string;
}

// Constante para evitar re-renders infinitos por nuevas referencias de array
const EMPTY_LOGS: string[] = [];

export const TerminalView: React.FC<TerminalViewProps> = ({ serviceId }) => {
    const logs = useProcessStore(s => s.activeProcesses[serviceId]?.logs || EMPTY_LOGS);
    const terminalThemeId = useUIStore(s => s.terminalThemeId);
    const { parseLogLine } = useLogActions();

    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const lastWrittenLogCountRef = useRef(0);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [actions, setActions] = useState<LogAction[]>([]);

    useEffect(() => {
        const lastLines = logs.slice(-10);
        const allActions: LogAction[] = [];
        lastLines.forEach(line => {
            allActions.push(...parseLogLine(line));
        });
        const uniqueActions = allActions.filter((a, i) =>
            allActions.findIndex(x => x.label === a.label) === i
        );
        setActions(uniqueActions);
    }, [logs, parseLogLine]);

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            theme: getTerminalTheme(useUIStore.getState().terminalThemeId).theme,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            scrollback: 5000,
            allowProposedApi: true,
            convertEol: true,
            cursorBlink: true,
            cursorStyle: 'underline',
        });

        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        const webLinksAddon = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        term.loadAddon(webLinksAddon);

        const pathRegex = /((\/|[A-Z]:\\)[\w\d\s\.\-\/]+\.(ts|js|rs|py|go|json|html|css|md|txt))(:(\d+))?(:(\d+))?/gi;

        term.registerLinkProvider({
            provideLinks(bufferLineNumber, callback) {
                const line = term.buffer.active.getLine(bufferLineNumber - 1);
                if (!line) return callback(undefined);
                const text = line.translateToString(true);
                const links: any[] = [];
                let match;
                pathRegex.lastIndex = 0;
                while ((match = pathRegex.exec(text)) !== null) {
                    const path = match[1];
                    const lineNum = match[5] ? parseInt(match[5], 10) : undefined;
                    const colNum = match[7] ? parseInt(match[7], 10) : undefined;
                    const startIndex = match.index;
                    const length = match[0].length;
                    links.push({
                        range: {
                            start: { x: startIndex + 1, y: bufferLineNumber },
                            end: { x: startIndex + length, y: bufferLineNumber }
                        },
                        text: match[0],
                        activate: () => {
                            invoke('open_in_editor', { path, line: lineNum, column: colNum }).catch(console.error);
                        }
                    });
                }
                callback(links);
            }
        });

        let isDisposed = false;

        searchAddon.activate(term as Parameters<SearchAddon['activate']>[0]);
        searchAddonRef.current = searchAddon;
        term.open(terminalRef.current);
        
        // Use requestAnimationFrame for the initial fit to ensure renderer is ready
        requestAnimationFrame(() => {
            if (!isDisposed && terminalRef.current && terminalRef.current.offsetWidth > 0) {
                try { fitAddon.fit(); } catch (_) { }
            }
        });

        xtermRef.current = term;

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
                    if (text) {
                        term.write(text);
                        invoke('write_stdin_line', { serviceId, line: text }).catch(console.error);
                    }
                }).catch(() => { });
                return false;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                setSearchOpen(open => !open);
                return false;
            }
            return true;
        });

        // Interactive Input: captured by xterm and sent to PTY in the backend
        term.onData(data => {
            invoke('write_stdin_line', { serviceId, line: data }).catch(console.error);
        });

        term.onResize(({ rows, cols }) => {
            invoke('resize_pty', { serviceId, rows, cols }).catch(console.error);
        });

        // Solo pedimos el historial si el proceso NO está corriendo o si no hay logs en absoluto.
        // Si el proceso está corriendo, confiamos en el stream de tiempo real para evitar duplicidad visual (CMD duplicado).
        const procState = useProcessStore.getState().activeProcesses[serviceId];
        const isRunning = procState?.status === 'running';

        if (logs.length === 0 && !isRunning) {
            invoke<string[]>('get_service_logs', { serviceId, limit: 1000 })
                .then(initialLogs => {
                    if (initialLogs && initialLogs.length > 0) {
                        useProcessStore.getState().setLogs(serviceId, initialLogs);
                    }
                })
                .catch(console.error);
        } else if (logs.length > 0) {
            // Escribir logs existentes (que ya pueden incluir el CMD del stream)
            logs.forEach(line => term.writeln(line));
            lastWrittenLogCountRef.current = logs.length;
        }

        const resizeObserver = new ResizeObserver(() => {
            // Only fit if the element is visible and we haven't disposed yet
            if (!isDisposed && terminalRef.current && terminalRef.current.offsetParent !== null) {
                try { 
                    fitAddon.fit();
                    // Sync backend PTY after fit
                    invoke('resize_pty', { 
                        serviceId, 
                        rows: term.rows, 
                        cols: term.cols 
                    }).catch(() => {});
                } catch (_) { }
            }
        });
        resizeObserver.observe(terminalRef.current);

        const ptyUnlistenPromise = serviceId.includes('docker-pty') 
            ? listen('pty-output', (event: any) => {
                const { serviceId: incomingId, data } = event.payload;
                if (incomingId === serviceId && term) {
                    term.write(data);
                }
            })
            : Promise.resolve(() => {});

        // Auto-focus terminal
        setTimeout(() => term.focus(), 100);

        return () => {
            isDisposed = true;
            resizeObserver.disconnect();
            searchAddonRef.current = null;
            xtermRef.current = null;
            ptyUnlistenPromise.then(unlisten => unlisten());
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

    const handleClear = useCallback(() => {
        useProcessStore.getState().setLogs(serviceId, []);
    }, [serviceId]);

    // Hot-swap del tema sin recrear la instancia
    useEffect(() => {
        const term = xtermRef.current;
        if (!term) return;
        term.options.theme = getTerminalTheme(terminalThemeId).theme;
    }, [terminalThemeId]);

    useEffect(() => {
        const term = xtermRef.current;
        if (!term) return;
        if (logs.length === 0) {
            term.clear();
            lastWrittenLogCountRef.current = 0;
            return;
        }
        if (logs.length > lastWrittenLogCountRef.current) {
            // Only write to terminal if it's NOT a PTY session (PTY uses pty-output event instead)
            if (!serviceId.includes('docker-pty')) {
                for (let i = lastWrittenLogCountRef.current; i < logs.length; i++) {
                    term.writeln(logs[i]);
                }
            }
            lastWrittenLogCountRef.current = logs.length;
        }
    }, [logs]);

    return (
        <div className="w-full h-full rounded-lg overflow-hidden border border-slate-800 bg-[#020617] p-2 flex flex-col relative group">
            {/* Floating Clear Button */}
            <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={handleClear}
                    className="bg-slate-900/80 border border-slate-700 text-slate-400 hover:text-microtermix-danger hover:bg-slate-800 shadow-xl"
                    title="Limpiar terminal"
                >
                    <Trash2 size={14} />
                </Button>
            </div>

            {actions.length > 0 && (
                <div className="absolute bottom-6 right-6 z-20">
                    <Popover>
                        <PopoverTrigger render={
                            <Button size="sm" variant="outline" className="bg-microtermix-dark/90 border-microtermix-neon text-microtermix-neon hover:bg-microtermix-neon hover:text-black shadow-lg shadow-microtermix-neon/20 gap-2">
                                <Lightbulb size={14} className="animate-pulse" />
                                <span>Soluciones Sugeridas ({actions.length})</span>
                            </Button>
                        } />
                        <PopoverContent side="top" align="end" className="w-64 p-3 bg-slate-900 border-slate-700 shadow-xl">
                            <div className="flex flex-col gap-2">
                                <h4 className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                                    <Zap size={12} className="text-microtermix-neon" />
                                    Acciones Detectadas
                                </h4>
                                {actions.map((action, i) => (
                                    <Button
                                        key={i}
                                        size="xs"
                                        variant="secondary"
                                        className="justify-start text-left h-auto py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border-none"
                                        onClick={() => {
                                            action.action();
                                            setActions(prev => prev.filter(a => a.label !== action.label));
                                        }}
                                    >
                                        {action.label}
                                    </Button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            )}
            {searchOpen && (
                <div className="flex items-center gap-2 shrink-0 py-1.5 px-2 bg-slate-900/95 border-b border-slate-700 rounded-t">
                    <Search size={14} className="text-slate-400 shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar en logs..."
                        className="bg-transparent border-none outline-none text-xs text-slate-200 w-full"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleFindNext();
                            if (e.key === 'Escape') setSearchOpen(false);
                        }}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={handleFindPrev} className="p-1 hover:bg-slate-800 rounded text-slate-400"><ChevronUp size={14} /></button>
                        <button onClick={handleFindNext} className="p-1 hover:bg-slate-800 rounded text-slate-400"><ChevronDown size={14} /></button>
                        <div className="w-px h-3 bg-slate-700 mx-1" />
                        <button onClick={() => setSearchOpen(false)} className="p-1 hover:bg-slate-800 rounded text-slate-400"><X size={14} /></button>
                    </div>
                </div>
            )}
            <div 
                className="flex-1 w-full min-h-0 relative"
                onClick={() => xtermRef.current?.focus()}
            >
                <div ref={terminalRef} className="w-full h-full flex-1 min-h-0" />
            </div>
        </div>
    );
};
