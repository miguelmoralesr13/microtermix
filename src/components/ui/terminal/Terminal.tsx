import React, { useState, useCallback, useRef, useEffect, useImperativeHandle } from 'react';
import { Search, X, ChevronUp, ChevronDown, Trash2, TerminalSquare, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTerminalEngine } from './useTerminalEngine';
import type { TerminalProps, TerminalRef } from './types';
import 'xterm/css/xterm.css';
import { ResizableDivider } from '@/components/layout/ResizableDivider';

// ─── Sub-componente: Línea de comandos ───────────────────────────────────────

interface CommandLineProps {
    onExecute: (cmd: string) => void;
    placeholder?: string;
    isFocused?: boolean;
    prompt?: string;
}

const CommandLine: React.FC<CommandLineProps> = ({ onExecute, placeholder, isFocused, prompt }) => {
    const [value, setValue] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isFocused) inputRef.current?.focus();
    }, [isFocused]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && value.trim()) {
            onExecute(value.trim());
            setHistory(prev => [value.trim(), ...prev].slice(0, 50));
            setHistoryIndex(-1);
            setValue('');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex < history.length - 1) {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setValue(history[newIndex]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setValue(history[newIndex]);
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setValue('');
            }
        } else if (e.key === 'Escape') {
            setValue('');
            setHistoryIndex(-1);
        }
    };

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border-t border-slate-800 shrink-0 group-focus-within:bg-slate-900/80 transition-colors">
            {prompt ? (
                <div className="flex items-center gap-1.5 shrink-0 select-none">
                    <span className="text-[11px] font-bold text-microtermix-neon/80 font-mono tracking-tight uppercase">{prompt}</span>
                    <span className="text-slate-600 text-[10px]">➜</span>
                </div>
            ) : (
                <Command size={12} className="text-microtermix-neon/50 group-focus-within:text-microtermix-neon shrink-0 transition-colors" />
            )}
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder ?? "Escribe un comando..."}
                className="flex-1 bg-transparent border-none outline-none text-[13px] font-mono text-slate-200 placeholder:text-slate-600 h-5"
            />
        </div>
    );
};

// ─── Sub-componente: barra de búsqueda ────────────────────────────────────────

interface SearchBarProps {
    query: string;
    onQueryChange: (q: string) => void;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ query, onQueryChange, onNext, onPrev, onClose }) => (
    <div className="flex items-center gap-2 shrink-0 py-1.5 px-3 bg-slate-900/95 border-b border-slate-700/50">
        <Search size={12} className="text-slate-500 shrink-0" />
        <input
            type="text"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Buscar en terminal..."
            className="bg-transparent border-none outline-none text-xs text-slate-200 w-full placeholder:text-slate-600"
            autoFocus
            onKeyDown={e => {
                if (e.key === 'Enter') onNext();
                if (e.key === 'Escape') onClose();
            }}
        />
        <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={onPrev} className="p-1 hover:bg-slate-700/50 rounded text-slate-500 hover:text-slate-300 transition-colors">
                <ChevronUp size={12} />
            </button>
            <button onClick={onNext} className="p-1 hover:bg-slate-700/50 rounded text-slate-500 hover:text-slate-300 transition-colors">
                <ChevronDown size={12} />
            </button>
            <div className="w-px h-3 bg-slate-700 mx-1" />
            <button onClick={onClose} className="p-1 hover:bg-slate-700/50 rounded text-slate-500 hover:text-slate-300 transition-colors">
                <X size={12} />
            </button>
        </div>
    </div>
);

// ─── Sub-componente: contenido xterm ──────────────────────────────────────────

interface TerminalCanvasProps {
    containerRef: React.RefObject<HTMLDivElement | null>;
    showSearch: boolean;
    showClear: boolean;
    onClear: () => void;
    onToggleSearch: () => void;
    searchOpen: boolean;
    searchQuery: string;
    onSearchQueryChange: (q: string) => void;
    onFindNext: () => void;
    onFindPrev: () => void;
    onSearchClose: () => void;
    onCommand?: (cmd: string) => void | boolean | Promise<void | boolean>;
    commandPrompt?: string;
    isReady: boolean;
}

const TerminalCanvas: React.FC<TerminalCanvasProps> = ({
    containerRef,
    showSearch,
    showClear,
    onClear,
    onToggleSearch,
    searchOpen,
    searchQuery,
    onSearchQueryChange,
    onFindNext,
    onFindPrev,
    onSearchClose,
    onCommand,
    commandPrompt,
    isReady,
}) => {
    const [commandInputFocused, setCommandInputFocused] = useState(false);

    return (
        <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Floating action buttons */}
            <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {showClear && (
                    <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={onClear}
                        className="h-6 w-6 bg-slate-900/80 border border-slate-700/50 text-slate-500 hover:text-red-400 hover:bg-slate-800 shadow-xl"
                        title="Limpiar terminal"
                    >
                        <Trash2 size={12} />
                    </Button>
                )}
                {showSearch && (
                    <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={onToggleSearch}
                        className="h-6 w-6 bg-slate-900/80 border border-slate-700/50 text-slate-500 hover:text-microtermix-neon hover:bg-slate-800 shadow-xl"
                        title="Buscar (Ctrl+F)"
                    >
                        <Search size={12} />
                    </Button>
                )}
            </div>

            {/* Search bar */}
            {searchOpen && (
                <SearchBar
                    query={searchQuery}
                    onQueryChange={onSearchQueryChange}
                    onNext={onFindNext}
                    onPrev={onFindPrev}
                    onClose={onSearchClose}
                />
            )}

            {/* xterm canvas */}
            <div
                className="flex-1 min-h-0 overflow-hidden"
                onClick={() => {
                    if (onCommand) {
                        setCommandInputFocused(true);
                        // Breve delay para que el input exista si acaba de montarse
                        setTimeout(() => setCommandInputFocused(false), 50);
                    } else {
                        (containerRef.current?.querySelector('.xterm-helper-textarea') as HTMLElement)?.focus();
                    }
                }}
            >
                <div ref={containerRef} className="w-full h-full" />
            </div>

            {/* Command line */}
            {onCommand && isReady && (
                <CommandLine 
                    onExecute={onCommand} 
                    isFocused={commandInputFocused}
                    prompt={commandPrompt}
                />
            )}
        </div>
    );
};

// ─── Componente principal: Terminal ───────────────────────────────────────────

export const Terminal = React.forwardRef<TerminalRef, TerminalProps>(({
    title,
    icon,
    mode,
    serviceId,
    events,
    ptyServiceId,
    projectPath,
    readOnly = false,
    maxScrollback = 5000,
    showSearch = true,
    showClear = true,
    autoClearOnRestart = false,
    variant = 'full',
    defaultIsOpen,
    resizable = false,
    height,
    onHeightChange,
    onOpenChange,
    className,
    themeOverride,
    onCommand,
    commandPrompt,
    onLineClick,
    initialLogs,
}, ref) => {
    // Búsqueda
    const [searchOpen, setSearchOpen]   = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Estado del panel colapsable (solo variant='panel' | 'drawer')
    const [isOpen, setIsOpen] = useState(defaultIsOpen ?? (variant === 'full'));

    // Engine xterm
    const { containerRef, findNext, findPrev, clear, isReady, write, writeLine } = useTerminalEngine({
        mode,
        serviceId,
        events,
        ptyServiceId,
        projectPath,
        readOnly,
        maxScrollback,
        themeOverride,
        onCommand,
        autoClearOnRestart,
        onLineClick,
        initialLogs,
    });

    // Exponer API imperativa para inyectores externos (e.g. Jenkins progressive fetch)
    useImperativeHandle(ref, () => ({
        write: (text) => write(text),
        writeln: (text) => writeLine(text),
        clear: () => clear(),
    }), [write, writeLine, clear]);

    // Keyboard: Ctrl+F abre la búsqueda
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            setSearchOpen(prev => !prev);
        }
    }, []);

    // Wrapper para manejar el cambio de estado y disparar el callback
    const toggleOpen = useCallback(() => {
        setIsOpen(prev => {
            const next = !prev;
            onOpenChange?.(next);
            return next;
        });
    }, [onOpenChange]);

    const handleFindNext = useCallback(() => findNext(searchQuery), [findNext, searchQuery]);
    const handleFindPrev = useCallback(() => findPrev(searchQuery), [findPrev, searchQuery]);

    // ── Variante: full ─────────────────────────────────────────────────────
    if (variant === 'full') {
        return (
            <div
                className={cn(
                    'group w-full h-full flex flex-col overflow-hidden rounded-lg',
                    'border border-slate-800 bg-[#020617]',
                    className
                )}
                onKeyDown={handleKeyDown}
            >
                <TerminalCanvas
                    containerRef={containerRef}
                    showSearch={showSearch}
                    showClear={showClear}
                    onClear={clear}
                    onToggleSearch={() => setSearchOpen(p => !p)}
                    searchOpen={searchOpen}
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    onFindNext={handleFindNext}
                    onFindPrev={handleFindPrev}
                    onSearchClose={() => setSearchOpen(false)}
                    onCommand={onCommand}
                    commandPrompt={commandPrompt}
                    isReady={isReady}
                />
            </div>
        );
    }

    // ── Variante: panel (header colapsable) ────────────────────────────────
    if (variant === 'panel') {
        return (
            <div
                className={cn(
                    'border-t border-slate-800 bg-slate-950 flex flex-col relative',
                    !isOpen && 'transition-all duration-300',
                    className
                )}
                style={{ height: isOpen ? `${height || 256}px` : '36px' }}
                onKeyDown={handleKeyDown}
            >
                {/* Drag Handle if resizable */}
                {resizable && isOpen && (
                    <ResizableDivider
                        direction="vertical"
                        onResize={(delta) => {
                            if (onHeightChange) {
                                onHeightChange(Math.max(100, (height || 256) - delta));
                            }
                        }}
                        className="absolute top-0 left-0 right-0 z-20 h-1"
                    />
                )}

                {/* Header / Trigger */}
                <div
                    className="flex items-center justify-between px-3 h-9 cursor-pointer hover:bg-slate-900/50 select-none shrink-0 relative"
                    onClick={toggleOpen}
                >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {icon ?? <TerminalSquare size={14} className={isOpen ? 'text-microtermix-neon' : ''} />}
                        <span className={isOpen ? 'text-slate-200' : ''}>{title ?? 'Terminal'}</span>
                    </div>
                    <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-slate-500 hover:text-white pointer-events-none">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </Button>
                </div>

                {/* Canvas — montado siempre para preservar el buffer, solo oculto */}
                <div className={cn('flex-1 flex flex-col min-h-0 group', !isOpen && 'invisible h-0 overflow-hidden')}>
                    <TerminalCanvas
                        containerRef={containerRef}
                        showSearch={showSearch}
                        showClear={showClear}
                        onClear={clear}
                        onToggleSearch={() => setSearchOpen(p => !p)}
                        searchOpen={searchOpen}
                        searchQuery={searchQuery}
                        onSearchQueryChange={setSearchQuery}
                        onFindNext={handleFindNext}
                        onFindPrev={handleFindPrev}
                        onSearchClose={() => setSearchOpen(false)}
                        onCommand={onCommand}
                        commandPrompt={commandPrompt}
                        isReady={isReady}
                    />
                </div>
            </div>
        );
    }

    // ── Variante: drawer (flotante bottom) ─────────────────────────────────
    return (
        <div
            className={cn(
                'fixed bottom-0 left-10 right-0 z-50 flex flex-col',
                'bg-slate-950 border-t border-slate-700/50 shadow-2xl shadow-black/50',
                'transition-all duration-300 ease-in-out',
                isOpen ? 'h-80' : 'h-9',
                className
            )}
            onKeyDown={handleKeyDown}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 h-9 cursor-pointer hover:bg-slate-900/50 select-none shrink-0 border-b border-slate-800/50"
                onClick={() => setIsOpen(p => !p)}
            >
                <div className="flex items-center gap-2">
                    {icon ?? <TerminalSquare size={13} className={cn('transition-colors', isOpen ? 'text-microtermix-neon' : 'text-slate-500')} />}
                    <span className={cn('text-[11px] font-bold uppercase tracking-wider transition-colors', isOpen ? 'text-slate-200' : 'text-slate-500')}>
                        {title ?? 'Terminal'}
                    </span>
                    {ptyServiceId && (
                        <span className="text-[9px] font-mono text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                            {projectPath?.split('/').pop() ?? '~'}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {isOpen && showClear && (
                        <Button size="icon-xs" variant="ghost" onClick={e => { e.stopPropagation(); clear(); }}
                            className="h-5 w-5 text-slate-600 hover:text-red-400">
                            <Trash2 size={11} />
                        </Button>
                    )}
                    <Button variant="ghost" size="icon-xs" className="h-5 w-5 text-slate-500 pointer-events-none">
                        {isOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                    </Button>
                </div>
            </div>

            {/* Canvas */}
            <div className={cn('flex-1 flex flex-col min-h-0 group p-1', !isOpen && 'invisible h-0 overflow-hidden')}>
                <TerminalCanvas
                    containerRef={containerRef}
                    showSearch={showSearch}
                    showClear={false /* ya está en el header */}
                    onClear={clear}
                    onToggleSearch={() => setSearchOpen(p => !p)}
                    searchOpen={searchOpen}
                    searchQuery={searchQuery}
                    onSearchQueryChange={setSearchQuery}
                    onFindNext={handleFindNext}
                    onFindPrev={handleFindPrev}
                    onSearchClose={() => setSearchOpen(false)}
                    onCommand={onCommand}
                    commandPrompt={commandPrompt}
                    isReady={isReady}
                />
            </div>
        </div>
    );
});
Terminal.displayName = 'Terminal';
