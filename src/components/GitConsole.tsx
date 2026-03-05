import React, { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { TerminalSquare, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { ResizableDivider } from './ResizableDivider';

const CONSOLE_HEIGHT_MIN = 120;
const CONSOLE_HEIGHT_MAX = 600;
const CONSOLE_HEIGHT_DEFAULT = 220;

interface GitLogPayload {
    project_path: string;
    command: string;
    stdout: string;
    stderr: string;
}

interface GitLogEntry {
    id: number;
    timestamp: Date;
    payload: GitLogPayload;
}

export const GitConsole: React.FC = () => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [consoleHeight, setConsoleHeight] = useState(CONSOLE_HEIGHT_DEFAULT);
    const [logs, setLogs] = useState<GitLogEntry[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const prevExpandedRef = useRef(false);

    useEffect(() => {
        const unlisten = listen<GitLogPayload>('git-log', (event) => {
            const stdout = event.payload.stdout || '';
            const stderr = event.payload.stderr || '';

            const MAX_LEN = 1000;
            const truncatedStdout = stdout.length > MAX_LEN
                ? stdout.substring(0, MAX_LEN) + `\n... [Recortado: ${stdout.length - MAX_LEN} caracteres adicionales]`
                : stdout;

            const truncatedStderr = stderr.length > MAX_LEN
                ? stderr.substring(0, MAX_LEN) + `\n... [Recortado: ${stderr.length - MAX_LEN} caracteres adicionales]`
                : stderr;

            setLogs(prev => [...prev, {
                id: Date.now() + Math.random(),
                timestamp: new Date(),
                payload: {
                    ...event.payload,
                    stdout: truncatedStdout,
                    stderr: truncatedStderr
                }
            }].slice(-100)); // Mantener solo los últimos 100 logs para evitar lag
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const resizeHeight = useCallback((delta: number) => {
        setConsoleHeight(h => Math.min(CONSOLE_HEIGHT_MAX, Math.max(CONSOLE_HEIGHT_MIN, h - delta)));
    }, []);

    useEffect(() => {
        if (!logsEndRef.current || !isExpanded) {
            prevExpandedRef.current = isExpanded;
            return;
        }
        // Use instant scroll when opening (avoids slow animation through full history)
        // Use smooth scroll only when new logs arrive while already expanded
        const justOpened = !prevExpandedRef.current;
        prevExpandedRef.current = isExpanded;
        logsEndRef.current.scrollIntoView({ behavior: justOpened ? 'instant' : 'smooth' });
    }, [logs, isExpanded]);

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        setLogs([]);
    };

    if (!isExpanded) {
        return (
            <div
                onClick={() => setIsExpanded(true)}
                className="h-10 border-t border-slate-800 bg-slate-900/90 hover:bg-slate-800/90 text-slate-400 hover:text-white flex items-center justify-between px-4 cursor-pointer transition-colors shadow-[0_-4px_15px_rgba(0,0,0,0.5)] z-30 shrink-0"
            >
                <div className="flex items-center text-xs font-mono">
                    <TerminalSquare size={14} className="mr-2 text-nexus-neon" />
                    Git Operations Console ({logs.length} logs)
                </div>
                <ChevronUp size={16} />
            </div>
        );
    }

    return (
        <div
            style={{ height: consoleHeight }}
            className="border-t border-slate-800 bg-slate-950 flex flex-col shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-30 shrink-0 animate-in slide-in-from-bottom-5 duration-200 min-h-0"
        >
            {/* Header */}
            <div
                onClick={() => setIsExpanded(false)}
                className="h-8 shrink-0 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 cursor-pointer select-none"
            >
                <div className="flex items-center text-xs font-bold text-slate-300">
                    <TerminalSquare size={14} className="mr-2 text-nexus-neon" />
                    Git Console
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={(e) => { e.stopPropagation(); handleClear(e); }} className="p-1 text-slate-500 hover:text-nexus-danger rounded transition-colors" title="Clear Console">
                        <Trash2 size={14} />
                    </button>
                    <div className="p-1 text-slate-500 hover:text-white">
                        <ChevronDown size={16} />
                    </div>
                </div>
            </div>

            {/* Resize handle: drag to change height */}
            <div className="py-1.5 shrink-0 flex items-center justify-center bg-slate-900 cursor-row-resize">
                <ResizableDivider direction="vertical" onResize={resizeHeight} className="bg-slate-900" />
            </div>

            {/* Logs Auto-scroll Area */}
            <div className="flex-1 min-h-0 overflow-auto p-3 font-mono text-xs bg-[#050505]">
                {logs.length === 0 ? (
                    <div className="text-slate-600 italic">No Git commands executed in this session yet.</div>
                ) : (
                    logs.map(log => (
                        <div key={log.id} className="mb-4 border-l-2 border-slate-700 pl-3 py-1">
                            <div className="flex items-center text-slate-500 mb-1 opacity-70">
                                <span className="mr-3">[{log.timestamp.toLocaleTimeString()}]</span>
                                <span className="truncate">{log.payload.project_path}</span>
                            </div>
                            <div className="text-nexus-accent font-bold mb-1">
                                $ {log.payload.command}
                            </div>
                            {log.payload.stdout && (
                                <div className="text-slate-300 whitespace-pre-wrap break-all mt-1">
                                    {log.payload.stdout}
                                </div>
                            )}
                            {log.payload.stderr && (
                                <div className="text-nexus-danger whitespace-pre-wrap break-all mt-1 bg-nexus-danger/10 p-2 rounded">
                                    {log.payload.stderr}
                                </div>
                            )}
                        </div>
                    ))
                )}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
};
