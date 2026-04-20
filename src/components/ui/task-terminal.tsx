import React, { useEffect, useRef } from 'react';
import { Terminal, ITheme } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { Button } from '@/components//ui/button';
import { useUIStore } from '@/stores/uiStore';
import { getTerminalTheme } from '@/lib/terminalThemes';
import 'xterm/css/xterm.css';

interface TaskTerminalProps {
    taskId: string;
    /** Override the global terminal theme for this instance. */
    theme?: ITheme;
    fontSize?: number;
    className?: string;
    onClear?: () => void;
}

export const TaskTerminal: React.FC<TaskTerminalProps> = ({
    taskId,
    theme,
    fontSize = 13,
    className = "",
    onClear
}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const terminalThemeId = useUIStore(s => s.terminalThemeId);

    useEffect(() => {
        if (!terminalRef.current) return;

        // Use explicit override if provided, otherwise read from store at init time
        const initTheme = theme ?? getTerminalTheme(useUIStore.getState().terminalThemeId).theme;

        const term = new Terminal({
            theme: initTheme,
            fontSize,
            fontFamily: 'Consolas, "Courier New", monospace',
            convertEol: true,
            scrollback: 10000,
            allowProposedApi: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        const fit = () => {
            if (terminalRef.current?.offsetWidth) {
                try { fitAddon.fit(); } catch (_) { }
            }
        };

        const t1 = setTimeout(fit, 50);
        const resizeObserver = new ResizeObserver(fit);
        resizeObserver.observe(terminalRef.current);

        xtermRef.current = term;

        // Suscripción directa a logs de la tarea
        let unlistenLogs: (() => void) | null = null;
        listen<string>(`task-log:${taskId}`, (event) => {
            term.write(event.payload);
            term.scrollToBottom();
        }).then(u => unlistenLogs = u);

        return () => {
            clearTimeout(t1);
            resizeObserver.disconnect();
            if (unlistenLogs) unlistenLogs();
            term.dispose();
            xtermRef.current = null;
        };
        // theme is intentionally excluded: hot-swap is handled by the effect below
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId, fontSize]);

    // Hot-swap del tema sin recrear la instancia
    useEffect(() => {
        const term = xtermRef.current;
        if (!term) return;
        term.options.theme = theme ?? getTerminalTheme(terminalThemeId).theme;
    }, [terminalThemeId, theme]);

    return (
        <div className={`relative group w-full h-full min-h-[200px] bg-[#020617] rounded-lg overflow-hidden border border-slate-800 ${className}`}>
            {/* Toolbar Flotante */}
            <div className="absolute top-3 right-4 z-20 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Button size="icon-xs" variant="ghost" onClick={() => xtermRef.current?.scrollToTop()} className="bg-slate-900/80 border border-slate-700 text-slate-400 hover:text-microtermix-neon shadow-lg">
                    <ArrowUp size={14} />
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => xtermRef.current?.scrollToBottom()} className="bg-slate-900/80 border border-slate-700 text-slate-400 hover:text-microtermix-neon shadow-lg">
                    <ArrowDown size={14} />
                </Button>
                <div className="w-px h-4 bg-slate-700 mx-0.5" />
                <Button size="icon-xs" variant="ghost" onClick={() => { xtermRef.current?.clear(); onClear?.(); }} className="bg-slate-900/80 border border-slate-700 text-slate-400 hover:text-red-400 shadow-lg">
                    <Trash2 size={14} />
                </Button>
            </div>

            <div className="absolute inset-0 p-2">
                <div ref={terminalRef} className="w-full h-full" />
            </div>
        </div>
    );
};
