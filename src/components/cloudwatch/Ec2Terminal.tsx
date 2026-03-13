import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal, CheckCircle, Circle } from 'lucide-react';
import { SshSession, LogLine } from './ec2Types';
import { SsmTerminal } from '../SsmTerminal';

interface Ec2TerminalProps {
    session: SshSession;
    onDisconnect: () => void;
}

export function Ec2Terminal({ session, onDisconnect }: Ec2TerminalProps) {
    const isSsm = session.sshCmd.startsWith('SSM →');
    const [logs, setLogs] = useState<LogLine[]>([]);
    const [input, setInput] = useState('');
    const [alive, setAlive] = useState(true);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const displayName = session.inst.name ?? session.inst.instance_id;

    // Listen to service-logs and service-stopped (used for SSH mode only)
    useEffect(() => {
        const unlistenLogs = listen<{ service_id: string; line: string; is_error: boolean }>(
            'service-logs',
            ({ payload }) => {
                if (payload.service_id !== session.serviceId) return;
                setLogs(prev => [...prev, { text: payload.line, isError: payload.is_error }]);
            }
        );
        const unlistenStopped = listen<string>('service-stopped', ({ payload }) => {
            if (payload !== session.serviceId) return;
            setAlive(false);
            setLogs(prev => [...prev, { text: '[Conexión cerrada]', isError: false }]);
        });
        return () => {
            unlistenLogs.then(fn => fn());
            unlistenStopped.then(fn => fn());
        };
    }, [session.serviceId]);

    // Auto-scroll
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    useEffect(() => { inputRef.current?.focus(); }, []);

    async function sendLine(line: string) {
        if (!alive) return;
        setInput('');
        setLogs(prev => [...prev, { text: `$ ${line}`, isError: false }]);
        try {
            await invoke('write_stdin_line', { serviceId: session.serviceId, line });
        } catch (e) {
            setLogs(prev => [...prev, { text: `[Error enviando: ${e}]`, isError: true }]);
        }
    }

    async function handleDisconnect() {
        try { await invoke('kill_service', { serviceId: session.serviceId }); } catch { /* ignore */ }
        onDisconnect();
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Terminal header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 bg-slate-900 shrink-0">
                <Terminal size={14} className="text-nexus-neon" />
                <span className="text-sm font-medium text-slate-200">{displayName}</span>
                <span className="text-xs text-slate-500 font-mono">{session.inst.public_ip ?? session.inst.private_ip}</span>
                {alive
                    ? <span className="flex items-center gap-1 text-xs text-green-400 ml-1"><CheckCircle size={11} /> Conectado</span>
                    : <span className="flex items-center gap-1 text-xs text-slate-500 ml-1"><Circle size={11} /> Desconectado</span>
                }
                <div className="ml-auto flex items-center gap-2">
                    {!isSsm && (
                        <button
                            onClick={() => sendLine('')}
                            disabled={!alive}
                            className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 disabled:opacity-40"
                            title="Enviar Enter"
                        >↵</button>
                    )}
                    <button
                        onClick={handleDisconnect}
                        className="px-2.5 py-1 rounded text-xs text-red-400 hover:bg-red-400/10 border border-red-900/40"
                    >Desconectar</button>
                    <button
                        onClick={onDisconnect}
                        className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200 border border-slate-700"
                    >← Volver</button>
                </div>
            </div>

            {/* Body */}
            {isSsm ? (
                /* xterm.js real terminal for SSM */
                <div className="flex-1 min-h-0 p-2 bg-[#020617]">
                    <SsmTerminal serviceId={session.serviceId} onClose={() => setAlive(false)} />
                </div>
            ) : (
                /* Simple log viewer for SSH */
                <>
                    <div
                        className="flex-1 overflow-y-auto bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed"
                        onClick={() => inputRef.current?.focus()}
                    >
                        {logs.map((l, i) => (
                            <div key={i} className={l.isError ? 'text-red-400' : l.text.startsWith('$') ? 'text-nexus-neon' : l.text.startsWith('[') ? 'text-slate-500' : 'text-slate-200'}>
                                {l.text}
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-800 bg-slate-900 shrink-0">
                        <span className="text-nexus-neon font-mono text-xs select-none">$</span>
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); sendLine(input); }
                                if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); sendLine('\x03'); }
                            }}
                            disabled={!alive}
                            placeholder={alive ? 'Escribe un comando y presiona Enter…' : 'Sesión terminada'}
                            className="flex-1 bg-transparent text-slate-100 font-mono text-xs focus:outline-none placeholder-slate-600 disabled:opacity-40"
                        />
                    </div>
                </>
            )}
        </div>
    );
}
