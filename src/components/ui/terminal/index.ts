/**
 * @file index.ts
 * @description Barrel export del módulo Terminal.
 * Importar siempre desde '@/components/ui/terminal'.
 */

export { Terminal } from './Terminal';
export { useTerminalEngine } from './useTerminalEngine';
export { TERMINAL_PREFIXES, TERMINAL_THEME_DEFAULT } from './terminal.constants';
export type {
    TerminalProps,
    TerminalMode,
    TerminalVariant,
    TerminalEventSource,
    TerminalEngineConfig,
    TerminalEngineResult,
} from './types';
