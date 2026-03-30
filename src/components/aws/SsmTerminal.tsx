import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import 'xterm/css/xterm.css';

interface SsmTerminalProps {
    serviceId: string;
    onClose?: () => void;
}

/**
 * A real interactive terminal backed by xterm.js.
 * Receives raw bytes from the `session-manager-plugin` via the `pty-output`
 * Tauri event and sends keystrokes back via `write_stdin_line`.
 *
 * Click on the terminal area if it doesn't respond to keyboard input.
 */
export const SsmTerminal: React.FC<SsmTerminalProps> = ({ serviceId, onClose }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const term = new Terminal({
            theme: {
                background: '#020617',
                foreground: '#f8fafc',
                cursor: '#38bdf8',
                cursorAccent: '#020617',
                selectionBackground: 'rgba(56, 189, 248, 0.3)',
            },
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14,
            scrollback: 5000,
            cursorBlink: true,
            cursorStyle: 'block',
            convertEol: false,
        });

        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current);

        termRef.current = term;
        fitRef.current = fit;

        const syncSize = () => {
            fit.fit();
            invoke('resize_pty', { serviceId, rows: term.rows, cols: term.cols }).catch(() => {});
        };

        // Use requestAnimationFrame so layout is committed before fit+focus
        requestAnimationFrame(() => {
            syncSize();
            term.focus();
            term.writeln('\x1b[32m[Sesión SSM lista — escribe tu primer comando]\x1b[0m\r');
        });

        // Send every keystroke directly to the backend as raw data.
        // xterm.js sends \r for Enter, which is correct for raw terminal mode.
        term.onData((data: string) => {
            invoke('write_stdin_line', { serviceId, line: data })
                .catch((err: unknown) => {
                    term.writeln(`\r\n\x1b[31m[stdin error: ${err}]\x1b[0m`);
                });
        });

        // Handle Ctrl+C: copy selection if any, otherwise send SIGINT
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && e.type === 'keydown') {
                const sel = term.getSelection();
                if (sel) {
                    navigator.clipboard?.writeText(sel).catch(() => { });
                    return false; // swallow — don't send \x03
                }
            }
            return true;
        });

        // Resize observer — refit and sync PTY size on every container resize
        const resizeObs = new ResizeObserver(() => syncSize());
        resizeObs.observe(containerRef.current!);

        // Subscribe to raw output from the process
        let unlisten: (() => void) | null = null;
        listen<{ serviceId: string; data: string }>('pty-output', ev => {
            if (ev.payload.serviceId !== serviceId) return;
            term.write(ev.payload.data);
        }).then(fn => { unlisten = fn; });

        // Subscribe to process-stopped to notify parent
        let unlistenStopped: (() => void) | null = null;
        listen<string>('service-stopped', ev => {
            if (ev.payload !== serviceId) return;
            term.writeln('\r\n\x1b[33m[Sesión terminada]\x1b[0m');
            onClose?.();
        }).then(fn => { unlistenStopped = fn; });

        return () => {
            resizeObs.disconnect();
            unlisten?.();
            unlistenStopped?.();
            termRef.current = null;
            fitRef.current = null;
            term.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceId]);

    return (
        <div
            ref={containerRef}
            tabIndex={-1}
            style={{ width: '100%', height: '100%', minHeight: 320 }}
            onClick={() => termRef.current?.focus()}
            onFocus={() => termRef.current?.focus()}
        />
    );
};
