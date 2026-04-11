/**
 * @file terminal.constants.ts
 * @description Constantes y configuración por defecto del componente <Terminal>.
 * Principio: Open/Closed — el consumidor puede sobrescribir via `themeOverride`,
 * sin necesidad de tocar este archivo.
 * Principio: DIP — el componente depende de estas abstracciones, no de valores hardcodeados.
 */

import type { ITheme, ITerminalOptions } from 'xterm';

// ─── Tema visual del canvas xterm ─────────────────────────────────────────────

/**
 * Tema Dracula adaptado a la identidad visual de Microtermix.
 * Background = #020617 (--microtermix-darker definido en App.css).
 */
export const TERMINAL_THEME_DEFAULT: ITheme = {
    background:     '#020617',
    foreground:     '#f8fafc',
    cursor:         '#38bdf8',
    cursorAccent:   '#020617',
    selectionBackground:    'rgba(56, 189, 248, 0.25)',
    selectionForeground:    '#ffffff',
    // Colores estándar ANSI
    black:          '#020617',
    red:            '#ff5555',
    green:          '#50fa7b',
    yellow:         '#f1fa8c',
    blue:           '#bd93f9',
    magenta:        '#ff79c6',
    cyan:           '#8be9fd',
    white:          '#f8fafc',
    // Bright
    brightBlack:    '#6272a4',
    brightRed:      '#ff6e6e',
    brightGreen:    '#69ff94',
    brightYellow:   '#ffffa5',
    brightBlue:     '#d6acff',
    brightMagenta:  '#ff92df',
    brightCyan:     '#a4ffff',
    brightWhite:    '#ffffff',
};

// ─── Opciones base de xterm ───────────────────────────────────────────────────

/**
 * Opciones por defecto pasadas al constructor de `Terminal` (xterm.js).
 * NOTA: el `theme` se inyecta separado para permitir merge con `themeOverride`.
 */
export const TERMINAL_OPTIONS_BASE: Omit<ITerminalOptions, 'theme'> = {
    fontFamily:         'Consolas, "Courier New", monospace',
    fontSize:           13,
    lineHeight:         1.4,
    scrollback:         5000,
    convertEol:         true,
    cursorBlink:        true,
    cursorStyle:        'underline',
    allowProposedApi:   true,
    allowTransparency:  false,
};

// ─── Prefijos ANSI para eventos de observabilidad ─────────────────────────────

/**
 * Paleta de prefijos listos para usar en `TerminalEventSource.prefix`.
 * Cada uno incluye el reset `\x1b[0m` al final.
 */
export const TERMINAL_PREFIXES = {
    GIT:        '\x1b[38;5;214m[⚡ Git]\x1b[0m ',       // naranja
    SERVICE:    '\x1b[38;5;39m[SVC]\x1b[0m ',            // azul claro
    SONAR:      '\x1b[38;5;75m[Sonar]\x1b[0m ',          // azul
    SEMGREP:    '\x1b[38;5;135m[Semgrep]\x1b[0m ',       // violeta
    JENKINS:    '\x1b[38;5;220m[Jenkins]\x1b[0m ',       // amarillo
    JIRA:       '\x1b[38;5;33m[Jira]\x1b[0m ',           // azul Jira
    TESTS:      '\x1b[38;5;82m[Tests]\x1b[0m ',          // verde
    SYSTEM:     '\x1b[38;5;244m[System]\x1b[0m ',        // gris
    APP:        '\x1b[38;5;208m[App]\x1b[0m ',           // naranja oscuro
} as const;

// ─── Regex de detección de paths clicables ────────────────────────────────────

/**
 * Detecta rutas de archivo con número de línea/columna opcionales.
 * Usado por el link provider de xterm para abrir archivos en el editor.
 */
export const FILE_PATH_REGEX =
    /((\/|[A-Z]:\\)[\w\d./\\-]+\.(ts|js|tsx|jsx|rs|py|go|json|html|css|md|txt|java|kt|vue|svelte))(:\d+)?(:\d+)?/gi;
