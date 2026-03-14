import { useState, useEffect } from 'react';
import { themesReady } from '@/lib/monacoThemes';
export { MONACO_THEMES } from '@/lib/monacoThemes';
export type { MonacoThemeOption } from '@/lib/monacoThemes';

const STORAGE_KEY = 'microtermix-monaco-theme';
const EVENT_NAME = 'microtermix-monaco-theme-change';

function readTheme(): string {
    try { return localStorage.getItem(STORAGE_KEY) ?? 'vs-dark'; } catch { return 'vs-dark'; }
}

/** Cambia el tema global de Monaco y notifica a todos los editores. */
export function setMonacoTheme(theme: string): void {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent<string>(EVENT_NAME, { detail: theme }));
}

/**
 * Hook que devuelve el tema actual.
 * Devuelve 'vs-dark' hasta que los temas personalizados estén registrados en Monaco,
 * luego cambia al tema guardado en localStorage — garantizando que Monaco reconozca el nombre.
 */
export function useMonacoTheme(): string {
    const [ready, setReady] = useState(false);
    const [theme, setTheme] = useState(readTheme);

    useEffect(() => {
        // Esperar registro de temas antes de aplicar el guardado
        themesReady.then(() => setReady(true));

        const handler = (e: Event) => setTheme((e as CustomEvent<string>).detail);
        window.addEventListener(EVENT_NAME, handler);
        return () => window.removeEventListener(EVENT_NAME, handler);
    }, []);

    // Mientras los temas no estén listos, usamos vs-dark para evitar error de tema desconocido
    return ready ? theme : 'vs-dark';
}
