# Terminal — Documentación del Componente

> **Archivos**: `src/components/ui/terminal/`  
> **Versión**: 1.0.0  
> **Propósito**: Building block reutilizable y parametrizable de terminal xterm.js para Microtermix.

---

## Conceptos clave

### 1. Modos de operación (`mode`)

| Modo | Comportamiento | Cuándo usarlo |
|---|---|---|
| `log-stream` | Solo lectura. Escucha eventos Tauri y los pinta. No permite input del usuario. | Sonar, Semgrep, Tests, Jira API logs |
| `interactive` | Shell PTY real. El usuario puede escribir comandos. | GitConsole, terminal de proyecto |
| `hybrid` | PTY real + escucha eventos de observabilidad de la app al mismo tiempo. | Terminal global con logs del sistema |

### 2. Variantes de layout (`variant`)

| Variante | Comportamiento visual | Cuándo usarlo |
|---|---|---|
| `full` | Ocupa todo el espacio del contenedor padre. | Dentro de tabs, paneles completos |
| `panel` | Tiene un header con título que colapsa/expande (altura animada). | GitConsole, consola embebida en una panel |
| `drawer` | Flotante, anclado al bottom del viewport. | Terminal global accesible desde cualquier utilidad |

### 3. Persistencia y Memoria (History)

El componente tiene **persistencia inteligente** integrada:
- Al montarse, si detecta un `serviceId`, busca automáticamente logs en el `useProcessStore`.
- Si el store está vacío, intenta recuperar el historial directamente del backend (`get_service_logs`).
- Esto permite que, al cambiar de pestaña o navegar por la app, la terminal mantenga el contexto y los logs del proceso sin interrupciones.
- El límite de RAM está garantizado tanto en el store (1000 líneas) como en xterm (5000 líneas por defecto).

### 4. Fuentes de datos

La terminal puede recibir datos de tres fuentes independientes, combinables:

**A. `serviceId`** — escucha el evento `service-logs` filtrado por ese ID:
```tsx
// Solo muestra los logs del servicio "mi-proyecto::npm run dev "
<Terminal mode="log-stream" serviceId="my-project::npm run dev " />
```

**B. `events[]`** — array de eventos Tauri custom con formato propio:
```tsx
<Terminal
  mode="log-stream"
  events={[
    { event: 'semgrep-log', prefix: TERMINAL_PREFIXES.SEMGREP },
    { event: 'git-log', prefix: TERMINAL_PREFIXES.GIT, format: (p: any) => `${p.command}\n${p.stdout}` },
  ]}
/>
```

**C. PTY output** — output raw del shell interactivo vía `pty-output` (activo cuando `mode === 'interactive'` o `'hybrid'` y se pasa `ptyServiceId`).

---

## API de Props

```typescript
interface TerminalProps {
  // ── Identidad ──────────────────────────────────────────────────────
  title?: string;           // Label del header (variant=panel/drawer)
  icon?: React.ReactNode;   // Ícono mostrado junto al título

  // ── Modo (REQUERIDO) ────────────────────────────────────────────────
  mode: 'log-stream' | 'interactive' | 'hybrid';

  // ── Fuentes de datos ────────────────────────────────────────────────
  serviceId?: string;         // Escucha 'service-logs' filtrado por este ID
  events?: TerminalEventSource[];  // Eventos Tauri adicionales
  initialLogs?: string[];     // Array de strings ANSI para rehidratar el log inicial síncronamente

  // ── Shell PTY (solo para interactive / hybrid) ─────────────────────
  ptyServiceId?: string;      // ID del proceso PTY en el backend Rust
  projectPath?: string;       // Directorio de trabajo del shell

  // ── Comportamiento ──────────────────────────────────────────────────
  readOnly?: boolean;         // Deshabilita el input (default: false)
  maxScrollback?: number;     // Líneas en el buffer (default: 5000)
  showSearch?: boolean;       // Muestra Ctrl+F (default: true)
  showClear?: boolean;        // Muestra botón de limpiar (default: true)
  autoClearOnRestart?: boolean; // Limpia automáticamente el buffer al detectar que el proceso fue reiniciado en el store (default: false)

  // ── Layout ──────────────────────────────────────────────────────────
  variant?: 'full' | 'panel' | 'drawer';  // (default: 'full')
  className?: string;         // Clase CSS adicional para el root

  // ── Theme ───────────────────────────────────────────────────────────
  themeOverride?: Partial<ITheme>;  // Sobreescribe parcialmente el tema xterm

  // ── Callbacks ───────────────────────────────────────────────────────
  onCommand?: (cmd: string) => boolean | void;
  // Intercepta comandos antes de enviarlos al PTY.
  // Si retorna `false`, cancela el envío al backend.
}
```

---

## Interfaz `TerminalEventSource`

```typescript
interface TerminalEventSource {
  event: string;                        // Nombre del evento Tauri
  filter?: (payload: unknown) => boolean; // Retorna false para ignorar el evento
  format?: (payload: unknown) => string;  // Transforma el payload en string ANSI
  prefix?: string;                        // Prefijo ANSI antepuesto a cada línea
}
```

---

## Prefijos ANSI disponibles (`TERMINAL_PREFIXES`)

Importa desde `@/components/ui/terminal`:

```typescript
import { TERMINAL_PREFIXES } from '@/components/ui/terminal';

TERMINAL_PREFIXES.GIT      // [⚡ Git]   naranja
TERMINAL_PREFIXES.SERVICE  // [SVC]      azul claro
TERMINAL_PREFIXES.SONAR    // [Sonar]    azul
TERMINAL_PREFIXES.SEMGREP  // [Semgrep]  violeta
TERMINAL_PREFIXES.JENKINS  // [Jenkins]  amarillo
TERMINAL_PREFIXES.JIRA     // [Jira]     azul Jira
TERMINAL_PREFIXES.TESTS    // [Tests]    verde
TERMINAL_PREFIXES.SYSTEM   // [System]   gris
TERMINAL_PREFIXES.APP      // [App]      naranja oscuro
```

Para agregar un prefijo nuevo: modificar `terminal.constants.ts`, no el componente.

---

## Ejemplos de uso

### Reemplazar `TerminalView` (services)

```tsx
import { Terminal } from '@/components/ui/terminal';

// Antes:
<TerminalView serviceId={serviceId} />

// Después:
<Terminal mode="log-stream" serviceId={serviceId} variant="full" />
```

### Reemplazar `GitConsole`

```tsx
import { Terminal } from '@/components/ui/terminal';

// Antes: componente de 174 líneas con todo hardcodeado
// Después:
<Terminal
  mode="interactive"
  ptyServiceId="global::git-terminal "
  projectPath={projectPath}
  variant="panel"
  title="Git Terminal"
/>
```

### Log-stream de Semgrep

```tsx
import { Terminal, TERMINAL_PREFIXES } from '@/components/ui/terminal';

<Terminal
  mode="log-stream"
  events={[{
    event: 'semgrep-log',
    prefix: TERMINAL_PREFIXES.SEMGREP,
  }]}
  variant="full"
/>
```

### Log-stream con formato custom (payload de objeto)

```tsx
<Terminal
  mode="log-stream"
  events={[{
    event: 'git-log',
    prefix: TERMINAL_PREFIXES.GIT,
    format: (payload: unknown) => {
      const p = payload as { command: string; stdout: string; stderr: string };
      const lines = [p.command];
      if (p.stdout) lines.push(p.stdout);
      if (p.stderr) lines.push(`\x1b[31m${p.stderr}\x1b[0m`);
      return lines.join('\n');
    },
  }]}
  variant="full"
/>
```

### Interceptar comandos (onCommand)

```tsx
<Terminal
  mode="interactive"
  ptyServiceId="global::shell "
  projectPath={path}
  onCommand={(cmd) => {
    if (cmd === 'rm -rf /\r\n') {
      toast.error('Eso no, loco.');
      return false; // cancela el envío al PTY
    }
  }}
/>
```

### Terminal como drawer global

```tsx
<Terminal
  mode="hybrid"
  ptyServiceId="global::terminal "
  projectPath={state.currentPath}
  events={[
    { event: 'git-log', prefix: TERMINAL_PREFIXES.GIT },
    { event: 'service-logs', prefix: TERMINAL_PREFIXES.SERVICE },
  ]}
  variant="drawer"
  title="Terminal Global"
/>
```

### Control Imperativo de Terminal (Uso de Ref)

Si necesitas inyectar memoria manual, enviar logs que provengan de fuentes ajenas a Tauri, o limpiar el canvas manualmente, puedes usar la API imperativa expuesta mediante un `ref`.

```tsx
import { useRef } from 'react';
import { Terminal } from '@/components/ui/terminal';
import type { TerminalRef } from '@/components/ui/terminal/types';

export const MiComponente = () => {
    const terminalRef = useRef<TerminalRef>(null);

    const emitirLog = () => {
        terminalRef.current?.writeln('\x1b[32m[Success]\x1b[0m Mi log inyectado.');
    };

    return (
        <Terminal ref={terminalRef} mode="log-stream" variant="full" />
    );
};
```
**Métodos expuestos en `TerminalRef`:**
- `write(data: string)`: Escribe texto sin salto de línea.
- `writeln(data: string)`: Escribe texto con salto de línea `\r\n`.
- `clear()`: Limpia todo el historial de scroll y la pantalla.

---

## Arquitectura interna

```
Terminal.tsx                ← Layout y UI (SRP: solo presentación)
  └── useTerminalEngine.ts ← Engine xterm (SRP: solo lógica de terminal)
       ├── xterm/Terminal  ← Instancia xterm.js
       ├── FitAddon        ← Auto-resize del canvas
       ├── SearchAddon     ← Búsqueda Ctrl+F
       ├── WebLinksAddon   ← Links clickeables en URLs
       └── Tauri listeners ← Eventos de backend

terminal.constants.ts       ← Tema, opciones xterm, prefijos ANSI (OCP)
types.ts                    ← Contratos de interfaces (ISP, DIP)
index.ts                    ← Barrel export
```

### Flujo de datos

```
Backend (Rust)
  ├── emit('service-logs', { service_id, line }) → useTerminalEngine filtra por serviceId → xterm.writeln()
  ├── emit('pty-output', { serviceId, data })    → useTerminalEngine filtra por ptyServiceId → xterm.write()
  └── emit('semgrep-log', string)                → events[].format/prefix → xterm.write()

Usuario tipea en xterm
  └── term.onData(data)
      └── onCommand(data) → si no cancela → invoke('write_stdin_line', { serviceId: ptyServiceId, line: data })
```

---

## Convenciones del proyecto aplicadas

- **Service ID format**: `"${projectPath}::${script} "` (trailing space — requerido por el backend)  
- **Background del tema**: `#020617` (--microtermix-darker, definido en App.css)
- **shadcn/ui**: Se usan `Button` de `@/components/ui/button` (nunca botones nativos sin estilo)
- **cn()**: Siempre para merging de clases Tailwind

---

## Cómo agregar un nuevo evento Tauri a escuchar

1. Identificar el nombre del evento en el backend Rust (ejemplo: `app_handle.emit("my-event", payload)`)
2. Definir el formateo del `payload` como `TerminalEventSource.format`
3. Elegir o agregar un prefijo en `TERMINAL_PREFIXES` (`terminal.constants.ts`)
4. Pasar el event source al componente:

```tsx
<Terminal
  mode="log-stream"
  events={[{
    event: 'my-event',
    prefix: '\x1b[33m[MyTool]\x1b[0m ',
    format: (payload) => String(payload),
  }]}
/>
```

**No hay que tocar ni `Terminal.tsx` ni `useTerminalEngine.ts`.**

---

## Cómo agregar una nueva variante de layout

1. Agregar el valor al tipo `TerminalVariant` en `types.ts`
2. Agregar el branch correspondiente en `Terminal.tsx` (en el bloque de render)
3. El `useTerminalEngine` no cambia

---

## Roadmap / TODO

- [x] **Logs históricos**: Cargar los logs persistidos al montar (`get_service_logs` al inicializarse en `log-stream`)
- [ ] **Sugerencias de acciones**: Port del sistema `useLogActions` de `TerminalView`
- [ ] **Migración GitConsole**: Reemplazar `GitConsole.tsx` con `<Terminal mode="interactive" variant="panel" />`
- [ ] **Migración TerminalView**: Reemplazar `TerminalArea.tsx` con `<Terminal mode="log-stream" variant="full" />`
- [ ] **Migración Semgrep**: Reemplazar el log viewer ad-hoc
- [ ] **drawer global**: Terminal de observabilidad accesible desde el Header
