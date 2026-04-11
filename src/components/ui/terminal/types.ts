/**
 * @file types.ts
 * @description Contratos de tipos para el componente <Terminal>.
 * Principio: Single Responsibility — cada interfaz modela un concepto específico.
 * Principio: Open/Closed — agregar funcionalidades via nuevas interfaces, no modificando las existentes.
 */

import type { ITheme } from 'xterm';
import type { TerminalOutputFormat } from '../../../lib/ansiFormatters';

// ─── Fuente de eventos Tauri ──────────────────────────────────────────────────

/**
 * Describe un evento Tauri que la terminal debe escuchar.
 * La terminal filtra, formatea y prefixa el payload antes de escribirlo en xterm.
 */
export interface TerminalEventSource {
  /** Nombre del evento Tauri (ej: 'semgrep-log', 'git-log', 'service-logs') */
  event: string;

  /**
   * Filtro opcional. Si retorna `false`, el evento se ignora.
   * El payload es el objeto crudo recibido del evento.
   */
  filter?: (payload: unknown) => boolean;

  /**
   * Transforma el payload del evento en una línea ANSI lista para pintar.
   * Si se omite, se usa `JSON.stringify(payload)` como fallback.
   */
  format?: (payload: any) => string | null;

  /**
   * Prefijo ANSI que se antepone a cada línea del evento.
   * Ejemplo: '\x1b[33m[⚡ Git]\x1b[0m '
   */
  prefix?: string;

  /**
   * Formato de salida esperado. Si se especifica, el engine aplicará
   * coloreado ANSI automatizado según el formato.
   */
  outputFormat?: TerminalOutputFormat;
}

// ─── Modo de operación ────────────────────────────────────────────────────────

/**
 * Controla el comportamiento de la terminal:
 * - `log-stream`:   Solo lectura. Escucha eventos Tauri y los pinta (no permite input).
 * - `interactive`:  Shell PTY real. Permite escribir comandos. Requiere `ptyServiceId`.
 * - `hybrid`:       Combina los dos anteriores (logs de eventos + shell interactivo).
 */
export type TerminalMode = 'log-stream' | 'interactive' | 'hybrid';

// ─── Variante de layout ───────────────────────────────────────────────────────

/**
 * Determina la forma visual del contenedor:
 * - `full`:    Ocupa todo el espacio del padre (servicios, sonar, semgrep, tests).
 * - `panel`:   Con barra de header colapsable (ej: GitConsole).
 * - `drawer`:  Drawer flotante anclado al bottom del viewport.
 */
export type TerminalVariant = 'full' | 'panel' | 'drawer';

// ─── Props del componente <Terminal> ─────────────────────────────────────────

export interface TerminalProps {
  // ── Identidad ────────────────────────────────────────────────
  /** Nombre que aparece en el header (variant=panel) o en el tab */
  title?: React.ReactNode;
  /** Ícono React mostrado junto al título */
  icon?: React.ReactNode;

  // ── Modo ─────────────────────────────────────────────────────
  mode: TerminalMode;

  // ── Fuentes de datos (log-stream / hybrid) ────────────────────
  /**
   * Service ID para escuchar 'service-logs' filtrado.
   * Formato: `"${projectPath}::${script} "` (notar trailing space — convención del proyecto).
   */
  serviceId?: string;

  /** Eventos Tauri adicionales a escuchar */
  events?: TerminalEventSource[];

  // ── Shell interactivo (interactive / hybrid) ──────────────────
  /** Service ID del proceso PTY en el backend */
  ptyServiceId?: string;
  /** Ruta al directorio de trabajo del shell */
  projectPath?: string;

  // ── Comportamiento ─────────────────────────────────────────────
  /** Cuando es `true`, deshabilita la entrada de teclado (override del modo) */
  readOnly?: boolean;
  /** Número máximo de líneas en el scrollback buffer. Default: 5000 */
  maxScrollback?: number;
  /** Muestra la barra de búsqueda (Ctrl+F). Default: true */
  showSearch?: boolean;
  /** Muestra el botón de limpiar. Default: true */
  showClear?: boolean;
  /** Limpia el scrollback buffer de la terminal al detectar un reinicio del proceso. Default: false */
  autoClearOnRestart?: boolean;

  // ── Layout ────────────────────────────────────────────────────
  /** Define la forma visual del contenedor. Default: 'full' */
  variant?: TerminalVariant;
  /** Si la variante soporta colapsado, determina su estado inicial. Default: false para drawer, true para panel/full */
  defaultIsOpen?: boolean;
  /** Permite al usuario redimensionar la terminal (solo para variant='panel') */
  resizable?: boolean;
  /** Altura personalizada en px (solo para variant='panel') */
  height?: number;
  /** Callback disparado al redimensionar la terminal */
  onHeightChange?: (height: number) => void;
  /** Callback disparado cuando el contenedor cambia su estado de apertura (panel/drawer) */
  onOpenChange?: (isOpen: boolean) => void;
  /** Clase CSS adicional para el contenedor raíz */
  className?: string;

  // ── Overrides del tema xterm ──────────────────────────────────
  /** Sobreescribe parcialmente el tema xterm por defecto */
  themeOverride?: Partial<ITheme>;

  // ── Callbacks ─────────────────────────────────────────────────
  /**
   * Intercepta el command antes de enviarlo al PTY.
   * Si retorna `false`, cancela el envío al backend.
   */
  onCommand?: (cmd: string) => void | boolean | Promise<void | boolean>;
  /** Texto mostrado a la izquierda del input de comandos (ej: nombre del repo) */
  commandPrompt?: string;
  /** Callback disparado al hacer click en una línea de la terminal */
  onLineClick?: (line: string) => void;
  /** Líneas iniciales que se imprimirán directamente en la terminal al completarse su montaje */
  initialLogs?: string[];
}

// ─── Retorno del hook useTerminalEngine ───────────────────────────────────────

export interface TerminalEngineResult {
  /** Ref del div donde xterm monta el canvas */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Busca la siguiente ocurrencia del texto */
  findNext: (query: string) => void;
  /** Busca la ocurrencia anterior del texto */
  findPrev: (query: string) => void;
  /** Limpia el buffer de la terminal */
  clear: () => void;
  /** Escribe crudo (sin newline) en la terminal */
  write: (ansi: string) => void;
  /** Escribe una línea ANSI directamente en la terminal */
  writeLine: (ansi: string) => void;
  /** Indica si el engine está inicializado */
  isReady: boolean;
}

// ─── API Imperativa de la Terminal (Refs) ───────────────────────────────────

export interface TerminalRef {
  /** Escribe texto en la terminal (sin salto de línea automático) */
  write: (ansi: string) => void;
  /** Escribe una línea en la terminal (añade sufijo de salto de línea) */
  writeln: (ansi: string) => void;
  /** Limpia la terminal */
  clear: () => void;
}

// ─── Configuración interna del engine ────────────────────────────────────────

/** Config que recibe `useTerminalEngine` para operar */
export interface TerminalEngineConfig {
  mode: TerminalMode;
  serviceId?: string;
  events?: TerminalEventSource[];
  ptyServiceId?: string;
  projectPath?: string;
  readOnly?: boolean;
  maxScrollback?: number;
  themeOverride?: Partial<ITheme>;
  onCommand?: (cmd: string) => void | boolean | Promise<void | boolean>;
  autoClearOnRestart?: boolean;
  onLineClick?: (line: string) => void;
  initialLogs?: string[];
}
