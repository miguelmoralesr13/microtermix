import React, { useEffect, useRef } from 'react';
import { Terminal, ITheme } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import 'xterm/css/xterm.css';

interface TaskTerminalProps {
    taskId: string;
    theme?: ITheme;
    fontSize?: number;
    className?: string;
    onClear?: () => void;
}

const DEFAULT_THEME: ITheme = {
    background: '#020617',
    foreground: '#f8fafc',
    cursor: '#38bdf8',
    black: '#020617',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8fafc',
};

export const TaskTerminal: React.FC<TaskTerminalProps> = ({ 
    taskId, 
    theme = DEFAULT_THEME, 
    fontSize = 13,
    className = "",
    onClear
}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            theme,
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
    }, [taskId, theme, fontSize]);

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
