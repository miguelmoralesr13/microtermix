/// <reference types="vite/client" />

interface Window {
    _logBuffer?: Record<string, string[]>;
    _logTimer?: ReturnType<typeof setTimeout> | null;
}
z