import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal as TerminalIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import 'xterm/css/xterm.css';

interface GitConsoleProps {
    projectPath: string;
}

export const GitConsole: React.FC<GitConsoleProps> = ({ projectPath }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [serviceId, setServiceId] = useState<string | null>(null);
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const lastPathRef = useRef<string>(projectPath);

    // Initialize terminal backend (Solo una vez)
    const initTerminal = async () => {
        try {
            const sid = await invoke<string>('spawn_local_git_terminal', { projectPath });
            setServiceId(sid);
            setIsOpen(true);
        } catch (e) {
            console.error('Failed to spawn git terminal', e);
        }
    };

    // Sincronizar directorio cuando cambia el proyecto activo
    useEffect(() => {
        if (serviceId && projectPath && projectPath !== lastPathRef.current) {
            lastPathRef.current = projectPath;
            // Enviar comando CD silencioso
            const cdCmd = window.navigator.platform.includes('Win') 
                ? `cd "${projectPath}"\r` 
                : `cd '${projectPath}'\n`;
            
            invoke('write_stdin_line', { serviceId, line: cdCmd }).catch(console.error);
            
            // Opcional: Mostrar un mensaje informativo en la terminal
            if (xtermRef.current) {
                xtermRef.current.write(`\r\n\x1b[33m--- Switched to: ${projectPath} ---\x1b[0m\r\n`);
            }
        }
    }, [projectPath, serviceId]);

    useEffect(() => {
        if (!isOpen || !terminalRef.current || !serviceId) return;

        // Pequeño delay para asegurar que el contenedor tiene sus dimensiones finales
        const timer = setTimeout(() => {
            if (!terminalRef.current) return;

            const term = new Terminal({
                theme: {
                    background: '#020617',
                    foreground: '#f8fafc',
                    cursor: '#38bdf8',
                },
                fontFamily: 'Consolas, monospace',
                fontSize: 12,
                scrollback: 1000,
                convertEol: true, // Crucial para Windows
            });

            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term.open(terminalRef.current);
            
            // Forzar reflow antes de fit
            setTimeout(() => {
                fitAddon.fit();
                const { cols, rows } = term;
                invoke('resize_pty', { serviceId, cols, rows }).catch(console.error);
            }, 50);

            xtermRef.current = term;
            fitAddonRef.current = fitAddon;

            // Input handler - ENVIAR raw strings, no lineas completas
            term.onData(data => {
                invoke('write_stdin_line', { serviceId, line: data }).catch(console.error);
            });

            // Output handler
            const unlistenOutputPromise = listen('pty-output', (event: any) => {
                if (event.payload.serviceId === serviceId) {
                    term.write(event.payload.data);
                }
            });

            // Git Log handler - MOSTRAR lo que hace la app automáticamente
            const unlistenLogPromise = listen('git-log', (event: any) => {
                const { command, stdout, stderr } = event.payload;
                
                // Solo si es para el mismo proyecto (o si queremos ver todo)
                // Usamos colores ANSI: 33=Yellow, 0=Reset, 32=Green, 31=Red
                term.write(`\r\n\x1b[33m⚡ App Executing:\x1b[0m ${command}\x1b[0m\r\n`);
                
                if (stdout) {
                    // Normalizar saltos de línea para xterm
                    const formattedStdout = stdout.replace(/\n/g, '\r\n');
                    term.write(`\x1b[38;5;244m${formattedStdout}\x1b[0m\r\n`);
                }
                
                if (stderr) {
                    const formattedStderr = stderr.replace(/\n/g, '\r\n');
                    term.write(`\x1b[31m${formattedStderr}\x1b[0m\r\n`);
                }
                
                term.write(`\r\n`);
            });

            const handleResize = () => fitAddon.fit();
            window.addEventListener('resize', handleResize);

            // Cleanup
            (term as any)._unlisten = Promise.all([unlistenOutputPromise, unlistenLogPromise]);
        }, 100);

        return () => {
            clearTimeout(timer);
            if (xtermRef.current) {
                const term = xtermRef.current;
                (term as any)._unlisten?.then((unlisten: any) => unlisten());
                term.dispose();
                xtermRef.current = null;
            }
        };
    }, [isOpen, serviceId]);

    return (
        <div className={cn(
            "border-t border-slate-800 bg-slate-950 transition-all duration-300 flex flex-col",
            isOpen ? "h-64" : "h-9"
        )}>
            {/* Header / Trigger */}
            <div 
                className="flex items-center justify-between px-3 h-9 cursor-pointer hover:bg-slate-900/50 select-none"
                onClick={() => isOpen ? setIsOpen(false) : initTerminal()}
            >
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <TerminalIcon size={14} className={isOpen ? "text-microtermix-neon" : ""} />
                    Git Terminal
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon-xs" className="h-6 w-6 text-slate-500 hover:text-white">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </Button>
                </div>
            </div>

            {/* Terminal Container */}
            <div 
                ref={terminalRef} 
                className={cn(
                    "flex-1 w-full overflow-hidden px-2 pb-2",
                    !isOpen && "hidden"
                )}
            />
        </div>
    );
};
