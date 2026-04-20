/**
 * @file useTerminalEngine.ts
 * @description Hook central del componente <Terminal>.
 *
 * Principio: Single Responsibility — este hook SOLO gestiona el ciclo de vida
 * de xterm.js y los listeners de eventos Tauri. No sabe nada de layout ni UI.
 *
 * Principio: Dependency Inversion — recibe su configuración por parámetros
 * (`TerminalEngineConfig`), no depende directamente de ningún store ni contexto.
 *
 * Principio: Open/Closed — agregar nuevos comportamientos vía `events[]` sin
 * modificar el hook.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

import { useProcessStore } from '@/stores/processStore';
import { useUIStore } from '@/stores/uiStore';
import { getTerminalTheme } from '@/lib/terminalThemes';
import {
    TERMINAL_OPTIONS_BASE,
    FILE_PATH_REGEX,
} from './terminal.constants';
import type { TerminalEngineConfig, TerminalEngineResult } from './types';
import { formatAnsiOutput } from '../../../lib/ansiFormatters';

// ─── Helper: clipboard cross-platform ─────────────────────────────────────────

/**
 * Copia texto al portapapeles. Usa `execCommand` como fallback para WebKitGTK
 * en Linux, que no soporta la Clipboard API de forma confiable.
 */
function writeToClipboard(text: string): void {
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

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useTerminalEngine(config: TerminalEngineConfig): TerminalEngineResult {
    const {
        mode,
        serviceId,
        events = [],
        ptyServiceId,
        projectPath,
        readOnly = false,
        maxScrollback = 5000,
        themeOverride,
        onCommand,
        autoClearOnRestart = false,
        onLineClick,
        initialLogs,
    } = config;

    const containerRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const isDisposedRef = useRef(false);
    const lastPathRef = useRef<string | undefined>(projectPath);
    const [isReady, setIsReady] = useState(false);
    
    // Callback Ref para evitar closure traps en los addons de xterm
    const onLineClickRef = useRef(onLineClick);
    useEffect(() => {
        onLineClickRef.current = onLineClick;
    }, [onLineClick]);

    // ── Inicialización del engine ──────────────────────────────────────────

    useEffect(() => {
        if (!containerRef.current) return;

        isDisposedRef.current = false;

        // 1. Construir la instancia xterm
        const baseTheme = getTerminalTheme(useUIStore.getState().terminalThemeId).theme;
        const term = new XTerm({
            ...TERMINAL_OPTIONS_BASE,
            scrollback: maxScrollback,
            theme: { ...baseTheme, ...themeOverride },
            disableStdin: readOnly || mode === 'log-stream',
        });

        // 2. Addons
        const fitAddon    = new FitAddon();
        const searchAddon = new SearchAddon();
        const webLinks    = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        term.loadAddon(webLinks);

        // 3. Montar en el DOM
        term.open(containerRef.current);

        // 4. Fit inicial con rAF para asegurarse de que el renderer esté listo
        requestAnimationFrame(() => {
            if (!isDisposedRef.current && containerRef.current?.offsetWidth) {
                try { fitAddon.fit(); } catch (_) { /* ignore if not yet laid out */ }
            }
        });

        xtermRef.current    = term;
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = searchAddon;

        // 5. Link provider — detecta paths de archivo y los vuelve clicables
        term.registerLinkProvider({
            provideLinks(lineNumber, callback) {
                const line = term.buffer.active.getLine(lineNumber - 1);
                if (!line) return callback(undefined);
                const text = line.translateToString(true);
                const links: any[] = [];
                FILE_PATH_REGEX.lastIndex = 0;
                let match;
                while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
                    const path    = match[1];
                    const lineNum = match[5] ? parseInt(match[5], 10) : undefined;
                    const colNum  = match[7] ? parseInt(match[7], 10) : undefined;
                    const start   = match.index;
                    const length  = match[0].length;
                    links.push({
                        range: { start: { x: start + 1, y: lineNumber }, end: { x: start + length, y: lineNumber } },
                        text: match[0],
                        activate: () => invoke('open_in_editor', { path, line: lineNum, column: colNum }).catch(console.error),
                    });
                }
                callback(links);
            },
        });

        // 6. Link Provider B: API Logs — detecta timestamps o tags [Jira]/[Tempo]
        term.registerLinkProvider({
            provideLinks(lineNumber, callback) {
                const line = term.buffer.active.getLine(lineNumber - 1);
                if (!line) return callback(undefined);
                const text = line.translateToString(true);
                
                // Machea cualquier cosa entre corchetes: [08:37:49 a.m.], [Jira], [My Tag 123], etc.
                const LOG_PATTERN = /\[([^\]]+)\]/g;
                const links: any[] = [];
                let match;
                
                while ((match = LOG_PATTERN.exec(text)) !== null) {
                    const start = match.index;
                    const length = match[0].length;
                    links.push({
                        range: { 
                            start: { x: start + 1, y: lineNumber }, 
                            end: { x: start + length, y: lineNumber } 
                        },
                        text: text,
                        activate: (_e: MouseEvent, t: string) => {
                            toast.info("¡Click detectado en terminal!");
                            if (onLineClickRef.current) {
                                onLineClickRef.current(t);
                            }
                        }
                    });
                }
                callback(links);
            },
        });

        // 7. Handlers de teclado globales (ctrl+c copia, ctrl+v pega, ctrl+f search)
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
            if (e.type !== 'keydown') return true;

            const isMod = e.ctrlKey || e.metaKey;

            if (isMod && e.key === 'c') {
                const sel = term.getSelection();
                if (sel) { writeToClipboard(sel); return false; }
            }

            if (isMod && e.key === 'v') {
                navigator.clipboard?.readText().then(text => {
                    if (!text) return;
                    if (mode !== 'log-stream' && !readOnly && ptyServiceId) {
                        invoke('write_stdin_line', { serviceId: ptyServiceId, line: text }).catch(console.error);
                    }
                }).catch(() => { });
                return false;
            }

            return true;
        });

        // 7. Input del usuario → envía al PTY
        if ((mode === 'interactive' || mode === 'hybrid') && !readOnly && ptyServiceId) {
            term.onData(data => {
                const cancel = onCommand?.(data);
                if (cancel === false) return;
                invoke('write_stdin_line', { serviceId: ptyServiceId, line: data }).catch(console.error);
            });

            // No necesitamos term.onResize porque el ResizeObserver ya lo maneja
        }

        // 8. ResizeObserver — sincroniza fit() y PTY cuando cambia el tamaño
        const resizeObserver = new ResizeObserver(() => {
            if (isDisposedRef.current || !containerRef.current?.offsetParent) return;
            try {
                fitAddon.fit();
                if (ptyServiceId) {
                    invoke('resize_pty', {
                        serviceId: ptyServiceId,
                        rows: term.rows,
                        cols: term.cols,
                    }).catch(() => { });
                }
            } catch (_) { /* terminal may not be laid out yet */ }
        });
        resizeObserver.observe(containerRef.current);

        // 9. Focus automático en terminales interactivas
        if (mode !== 'log-stream') {
            setTimeout(() => term.focus(), 100);
        }

        setIsReady(true);

        // ── Cleanup ──
        return () => {
            isDisposedRef.current = true;
            resizeObserver.disconnect();
            searchAddonRef.current = null;
            fitAddonRef.current    = null;
            xtermRef.current       = null;
            setIsReady(false);
            term.dispose();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [/* solo se inicializa una vez; cambios de config se manejan en effects separados */]);

    // ── Hot-swap del tema sin recrear la instancia ────────────────────────

    const terminalThemeId = useUIStore(s => s.terminalThemeId);
    useEffect(() => {
        const term = xtermRef.current;
        if (!term) return;
        const baseTheme = getTerminalTheme(terminalThemeId).theme;
        term.options.theme = { ...baseTheme, ...themeOverride };
    }, [terminalThemeId, themeOverride]);

    // ── Pre-carga de historial via initialLogs (UI Inject) ────────────────
    
    useEffect(() => {
        if (!isReady || !initialLogs || initialLogs.length === 0) return;
        const term = xtermRef.current;
        if (!term) return;

        // Limpiar para prevenir duplicación si el hook corre dos veces en StrictMode
        term.clear();
        initialLogs.forEach(line => term.writeln(line));
    }, [isReady]); // Este efecto SOLO debe correr al inicializarse isReady, initialLogs es inyectado desde el store.

    // ── Carga de historial (Persistence) ──────────────────────────────────

    useEffect(() => {
        if (!isReady || !serviceId || (mode !== 'log-stream' && mode !== 'hybrid')) return;

        const term = xtermRef.current;
        if (!term) return;

        // Limpiar terminal antes de cargar el nuevo historial para evitar mezclar logs de distintos IDs
        term.clear();

        // 1. Intentar cargar del store de procesos
        const proc = useProcessStore.getState().activeProcesses[serviceId];
        const logs = proc?.logs || [];

        if (logs.length > 0) {
            logs.forEach(line => term.writeln(line));
        } else {
            // 2. Fallback al backend — solo pintamos en el canvas, NO persistimos en el store.
            // Si persisted en el store recrearía el proceso con source='services' (bug).
            invoke<string[]>('get_service_logs', { serviceId, limit: 1000 })
                .then(history => {
                    if (history && history.length > 0 && !isDisposedRef.current) {
                        history.forEach(line => term.writeln(line));
                    }
                })
                .catch(err => {
                    console.warn(`[Terminal] No se pudo recuperar historial para ${serviceId}:`, err);
                });
        }
    }, [isReady, serviceId, mode]);

    // ── Limpieza automática en Reinicio (Auto-clear on Restart) ───────────

    useEffect(() => {
        if (!serviceId || !isReady || !autoClearOnRestart) return;

        const unsubscribe = useProcessStore.subscribe(
            state => state.activeProcesses[serviceId]?.restarts,
            (restarts, prevRestarts) => {
                if (restarts !== undefined && prevRestarts !== undefined && restarts > prevRestarts) {
                    console.log(`[Terminal] Detectado reinicio para ${serviceId}, wipeando pantalla...`);
                    // reset() limpia tanto el scrollback como el viewport visible
                    xtermRef.current?.reset();
                }
            }
        );

        return () => unsubscribe();
    }, [isReady, serviceId, autoClearOnRestart]);

    // ── Fuente A: service-logs (filtrado por serviceId) ────────────────────

    useEffect(() => {
        if (!serviceId || (mode !== 'log-stream' && mode !== 'hybrid')) return;

        let unlisten: UnlistenFn | undefined;

        listen<{ service_id: string; line: string; is_error: boolean }>('service-logs', event => {
            if (event.payload.service_id !== serviceId) return;
            const term = xtermRef.current;
            if (!term) return;
            const { line, is_error } = event.payload;
            if (is_error) {
                term.writeln(`\x1b[31m${line}\x1b[0m`);
            } else {
                term.writeln(line);
            }
        }).then(fn => { unlisten = fn; });

        return () => { unlisten?.(); };
    }, [serviceId, mode]);

    // ── Fuente B: eventos Tauri custom del array `events` ─────────────────

    useEffect(() => {
        if (events.length === 0) return;

        const unlisteners: UnlistenFn[] = [];

        events.forEach(source => {
            listen(source.event, event => {
                const term = xtermRef.current;
                if (!term) return;

                // Aplicar filtro si existe
                if (source.filter && !source.filter(event.payload)) return;

                // Formatear payload
                let line: string | null;
                if (source.format) {
                    line = source.format(event.payload);
                } else if (typeof event.payload === 'string') {
                    line = event.payload;
                } else {
                    line = JSON.stringify(event.payload);
                }

                if (!line) return; // Si el formateador retorna null/empty, ignoramos el evento

                // Si detectamos salida formateada configurada, estilizamos con secuencias ANSI
                if (source.outputFormat) {
                    line = formatAnsiOutput(line, source.outputFormat);
                }

                // Escapar saltos de línea para xterm (\n → \r\n)
                // Limpiamos saltos de línea finales para evitar líneas de prefijo vacías
                const cleanLine = line.replace(/\n$/, '');
                if (cleanLine.length === 0) return;

                const prefix = source.prefix || '';
                const normalized = cleanLine.replace(/\n/g, `\r\n${prefix}`);
                const output = `\r${prefix}${normalized}`;
                term.write(`${output}\r\n`);
            }).then(unsub => {
                if (isDisposedRef.current) unsub();
                else unlisteners.push(unsub);
            });
        });

        return () => {
            unlisteners.forEach(fn => fn());
        };
    // events es un array — usar JSON.stringify para comparación estable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(events.map(e => e.event))]);

    // ── Fuente C: pty-output (output raw del shell interactivo) ───────────

    useEffect(() => {
        if (!ptyServiceId || mode === 'log-stream') return;

        let unlistenFn: UnlistenFn | undefined;
        let isCancelled = false;

        listen('pty-output', (event: any) => {
            const { serviceId: incomingId, data } = event.payload;
            if (incomingId !== ptyServiceId) return;
            xtermRef.current?.write(data);
        }).then(res => {
            if (isCancelled) {
                res();
            } else {
                unlistenFn = res;
            }
        });

        return () => {
            isCancelled = true;
            unlistenFn?.();
        };
    }, [ptyServiceId, mode]);

    // ── Fuente D: Input del usuario (onData -> stdin) ──────────────────────

    useEffect(() => {
        const term = xtermRef.current;
        if (!term || !ptyServiceId || mode === 'log-stream' || readOnly) return;

        const disposable = term.onData(data => {
            invoke('write_stdin_line', { serviceId: ptyServiceId, line: data })
                .catch(err => console.error('[Terminal] Error writing to pty stdin:', err));
        });

        return () => disposable.dispose();
    }, [isReady, ptyServiceId, mode, readOnly]);

    // ── Sincronizar CWD del shell cuando cambia projectPath ───────────────

    useEffect(() => {
        if (!ptyServiceId || !projectPath || projectPath === lastPathRef.current) return;
        lastPathRef.current = projectPath;

        const cdCmd = window.navigator.platform.includes('Win')
            ? `cd "${projectPath}"\r`
            : `cd '${projectPath}'\n`;

        invoke('write_stdin_line', { serviceId: ptyServiceId, line: cdCmd }).catch(console.error);

        // En modo interactivo no pintamos el mensaje nosotros para evitar duplicar el echo del shell
        if (mode === 'log-stream') {
            xtermRef.current?.write(
                `\r\n\x1b[38;5;244m── Switched to: ${projectPath} ──\x1b[0m\r\n`
            );
        }
    }, [projectPath, ptyServiceId, mode]);


    // ── API pública ──────────────────────────────────────────────────────

    const findNext = useCallback((query: string) => {
        searchAddonRef.current?.findNext(query, { caseSensitive: false, regex: false, wholeWord: false });
    }, []);

    const findPrev = useCallback((query: string) => {
        searchAddonRef.current?.findPrevious(query, { caseSensitive: false, regex: false, wholeWord: false });
    }, []);

    const clear = useCallback(() => {
        xtermRef.current?.reset();
    }, []);

    const write = useCallback((ansi: string) => {
        xtermRef.current?.write(ansi);
    }, []);

    const writeLine = useCallback((ansi: string) => {
        xtermRef.current?.writeln(ansi);
    }, []);

    return { containerRef, findNext, findPrev, clear, write, writeLine, isReady };
}
