# Services & Terminals shadcn/ui Visual Refresh — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrar los 5 componentes del área Services & Terminals a shadcn/ui (base-ui) con mejora visual: neon underline en tabs, cards con status bar, Badge por tipo de proyecto, Tooltip en acciones, Dialog para modales.

**Architecture:** Refactoring puro — mismas props/interfaces, misma lógica, solo se reemplazan los elementos DOM raw por primitivos shadcn. `TerminalView` y `WorkspaceContext` no se tocan.

**Tech Stack:** shadcn/ui (base-ui), Button, Select, Dialog, Tooltip, Badge, Popover, Separator — todos ya instalados en `src/components/ui/`.

---

### Task 1: MultiExecutionBar — shadcn Button + Select + Tooltip

**Files:**
- Modify: `src/components/services/MultiExecutionBar.tsx`

**Step 1: Reemplazar imports**

```tsx
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
// Eliminar: import { Select } from '../ui/NexusSelect';
// Eliminar: import { Button } from '../ui/NexusButton';
```

**Step 2: Reemplazar los dos NexusSelect por shadcn Select**

El Select de base-ui usa `value` + `onValueChange` (no `onChange`):

```tsx
<div className="flex items-center gap-2 flex-wrap">
  {/* Script selector */}
  <Select value={multiScript} onValueChange={onScriptChange}>
    <SelectTrigger size="sm" className="w-40">
      <SelectValue placeholder="Comando" />
    </SelectTrigger>
    <SelectContent>
      {extendedScripts.map(s => (
        <SelectItem key={s} value={s}>{s}</SelectItem>
      ))}
    </SelectContent>
  </Select>

  {/* Wand button con Tooltip */}
  <TooltipProvider delay={400}>
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setBuilderOpen(true)}
            className="text-slate-400 hover:text-nexus-neon hover:border-nexus-neon/50"
          />
        }
      >
        <Wand2 size={14} />
      </TooltipTrigger>
      <TooltipContent>Command Builder</TooltipContent>
    </Tooltip>
  </TooltipProvider>

  {/* ENV selector */}
  <Select value={globalEnvName} onValueChange={onEnvChange}>
    <SelectTrigger size="sm" className="w-24">
      <SelectValue placeholder="ENV" />
    </SelectTrigger>
    <SelectContent>
      {allEnvs.map(env => (
        <SelectItem key={env} value={env}>{env === 'none' ? 'None' : env}</SelectItem>
      ))}
    </SelectContent>
  </Select>

  <Separator orientation="vertical" className="h-6 mx-1" />

  {/* Action buttons */}
  <TooltipProvider delay={400}>
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={onPlay}
              className="bg-nexus-neon/10 text-nexus-neon hover:bg-nexus-neon/20 border border-nexus-neon/30 hover:border-nexus-neon/60 gap-1.5"
            />
          }
        >
          <Play size={13} />
          <span>Run</span>
          {selectedCount > 0 && (
            <span className="ml-0.5 bg-nexus-neon text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {selectedCount}
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent>Ejecutar en proyectos seleccionados</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="destructive" size="icon-sm" disabled={disabled} onClick={onStop} />
          }
        >
          <Square size={13} />
        </TooltipTrigger>
        <TooltipContent>Parar todos</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="outline" size="icon-sm" disabled={disabled} onClick={onRestart}
              className="text-slate-300 hover:text-white" />
          }
        >
          <RotateCcw size={13} />
        </TooltipTrigger>
        <TooltipContent>Reiniciar todos</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" onClick={onOpenViteWrapper}
              className="text-slate-400 hover:text-nexus-neon" />
          }
        >
          <FileCode size={13} />
        </TooltipTrigger>
        <TooltipContent>Vite wrapper (remotes MFE)</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</div>
```

**Step 3: Verificar build**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```
Esperado: `✓ built`

---

### Task 2: TerminalTabsBar — neon underline + Tooltip en acciones

**Files:**
- Modify: `src/components/services/TerminalTabsBar.tsx`

**Step 1: Agregar imports**

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

**Step 2: Reemplazar lógica de estilos por cn() limpio + neon underline**

Reemplazar el bloque de ternarios de `tabStyle` y el JSX del tab completo:

```tsx
// Derive status booleans
const isRunning = procStatus === 'running';
const isError   = procStatus === 'error';
const isStopped = procStatus === 'stopped';
const isActive  = activeTerminalTab === serviceId;

return (
  <TooltipProvider delay={400} key={serviceId}>
    <div
      onClick={() => onTabSelect(serviceId)}
      className={cn(
        'group flex shrink-0 items-center gap-2 px-3 py-2 min-w-[110px] max-w-[200px]',
        'cursor-pointer border-b-2 transition-all duration-150 select-none',
        isActive
          ? cn(
              'border-nexus-neon bg-slate-900',
              isError && 'border-red-400',
              isStopped && 'border-slate-600',
            )
          : 'border-transparent hover:bg-slate-800/60 hover:border-slate-600',
      )}
    >
      {/* Status dot */}
      <span className={cn(
        'w-1.5 h-1.5 shrink-0 rounded-full',
        isRunning && 'bg-emerald-400 animate-pulse',
        isError   && 'bg-red-400',
        isStopped && 'bg-slate-500',
        !isRunning && !isError && !isStopped && 'bg-slate-600',
      )} />

      {/* Label */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <span className={cn(
          'truncate text-xs font-semibold',
          isActive && !isError && !isStopped && 'text-slate-100',
          isActive && isError   && 'text-red-400',
          isActive && isStopped && 'text-slate-400',
          !isActive && 'text-slate-500 group-hover:text-slate-300',
        )}>
          {tabLabel}
        </span>
        {scriptLabel && (
          <span className="truncate text-[10px] text-slate-500">{scriptLabel}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {isRunning && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost" size="icon-xs"
                  onClick={(e) => { e.stopPropagation(); onTabStop(e, serviceId); }}
                  className="text-slate-500 hover:text-amber-400"
                />
              }
            >
              <Square size={11} />
            </TooltipTrigger>
            <TooltipContent>Parar proceso</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost" size="icon-xs"
                onClick={(e) => { e.stopPropagation(); onTabRestart(e, serviceId); }}
                className={cn(
                  isError ? 'text-red-400 hover:bg-red-900/30' : 'text-slate-500 hover:text-emerald-400',
                )}
              />
            }
          >
            <RotateCcw size={11} />
          </TooltipTrigger>
          <TooltipContent>Reiniciar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost" size="icon-xs"
                onClick={(e) => { e.stopPropagation(); onTabClose(e, serviceId); }}
                className="text-slate-500 hover:text-red-400"
              />
            }
          >
            <X size={11} />
          </TooltipTrigger>
          <TooltipContent>Cerrar</TooltipContent>
        </Tooltip>
      </div>
    </div>
  </TooltipProvider>
);
```

**Step 3: Cambiar el contenedor padre** — quitar `border-b` y `min-h-[40px]` heredado, agregar `border-b border-slate-800`:

```tsx
<div className="flex bg-slate-900/95 border-b border-slate-800 shrink-0 overflow-x-auto overflow-y-hidden">
  <div className="flex shrink-0 items-stretch gap-0 px-1">
    {/* tabs aquí */}
  </div>
</div>
```

**Step 4: Verificar build**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

---

### Task 3: CommandBuilderModal → shadcn Dialog

**Files:**
- Modify: `src/components/services/CommandBuilderModal.tsx`
- Modify: `src/components/services/MultiExecutionBar.tsx` (cambiar cómo se abre el modal)

**Step 1: Agregar imports en CommandBuilderModal**

```tsx
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
```

**Step 2: Cambiar la firma del componente para aceptar `open`**

```tsx
interface CommandBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, command: string, steps: CommandStep[]) => void;
  initialName?: string;
  initialSteps?: CommandStep[];
}

export const CommandBuilderModal: React.FC<CommandBuilderModalProps> = ({
  open,
  onOpenChange,
  onSave,
  initialName,
  initialSteps,
}) => {
  // Reemplazar todas las referencias a `onClose` por `() => onOpenChange(false)`
```

**Step 3: Reemplazar el wrapper manual por Dialog**

```tsx
return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className="max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border-slate-700 p-0"
      showCloseButton={false}
    >
      <DialogHeader className="flex-row items-center gap-2 p-4 border-b border-slate-800">
        <TerminalSquare className="text-nexus-neon" size={18} />
        <DialogTitle className="text-slate-200">
          {isEditing ? 'Edit Command' : 'Command Builder'}
        </DialogTitle>
        <Button
          variant="ghost" size="icon-sm"
          onClick={() => onOpenChange(false)}
          className="ml-auto text-slate-500 hover:text-slate-300"
        >
          <X size={16} />
        </Button>
      </DialogHeader>

      {/* Body — mantener el contenido interno sin cambios */}
      <div className="p-4 flex-1 overflow-y-auto">
        {/* ... todo el contenido interno existente ... */}
      </div>

      <DialogFooter className="p-4 border-t border-slate-800 bg-slate-950/50 rounded-b-xl">
        <div className="w-full mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Vista Previa Generada
          </label>
          <div className="bg-slate-950 border border-slate-800 rounded p-3 font-mono text-sm text-slate-300 min-h-[44px] break-all">
            {generatedPreview || <span className="text-slate-600 italic">El comando aparecerá aquí...</span>}
          </div>
        </div>
        <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400">
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          disabled={!canSave}
          className="bg-nexus-neon text-slate-900 hover:bg-nexus-neon/80 font-bold"
        >
          <Check size={14} />
          {isEditing ? 'Guardar Cambios' : 'Guardar & Aplicar'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
```

**Step 4: Actualizar uso en MultiExecutionBar**

```tsx
// Antes:
{builderOpen && (
  <CommandBuilderModal onClose={() => setBuilderOpen(false)} onSave={...} />
)}

// Después:
<CommandBuilderModal
  open={builderOpen}
  onOpenChange={setBuilderOpen}
  onSave={(name, cmd, steps) => {
    addSavedCommand(name, cmd, steps);
    onScriptChange(name);
    setBuilderOpen(false);
  }}
/>
```

**Step 5: Verificar build**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

---

### Task 4: ProjectRow — Badge + Popover para scripts + Dialog para add-deps

**Files:**
- Modify: `src/components/ProjectRow.tsx`

**Step 1: Agregar imports**

```tsx
import { Badge } from '@/components/ui/badge';
import {
  Popover, PopoverTrigger, PopoverContent,
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
```

**Step 2: Badge por tipo de proyecto + status bar lateral**

```tsx
// Mapa de colores de Badge por tipo
const TYPE_BADGE: Record<string, string> = {
  node: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  go:   'bg-sky-500/15 text-sky-400 border-sky-500/30',
  rust: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

const STATUS_BAR: Record<string, string> = {
  running: 'bg-emerald-400',
  error:   'bg-red-400',
  stopped: 'bg-slate-500',
  idle:    'bg-transparent',
};

// En el JSX del row:
<div className={cn(
  'group flex items-center gap-2 px-3 py-2 border-b border-slate-800/60',
  'hover:bg-slate-800/40 transition-colors relative',
  isSelected && 'bg-slate-800/30',
)}>
  {/* Status bar lateral izquierda */}
  <div className={cn(
    'absolute left-0 top-2 bottom-2 w-0.5 rounded-full transition-colors',
    STATUS_BAR[status] ?? 'bg-transparent',
  )} />

  {/* Checkbox */}
  <input
    type="checkbox"
    checked={isSelected}
    onChange={onToggleSelect}
    className="accent-nexus-neon shrink-0 w-3.5 h-3.5 ml-2"
  />

  {/* Nombre + Badge tipo */}
  <div
    className="flex-1 min-w-0 cursor-pointer"
    onClick={onToggleSelect}
  >
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-xs font-semibold text-slate-200 truncate">
        {project.name}
      </span>
      {project.project_type && (
        <Badge className={cn(
          'text-[9px] px-1.5 py-0 border shrink-0 font-mono uppercase',
          TYPE_BADGE[project.project_type] ?? 'bg-slate-700 text-slate-400',
        )}>
          {project.project_type}
        </Badge>
      )}
    </div>
    {status !== 'idle' && (
      <p className={cn(
        'text-[9px] mt-0.5',
        status === 'running' && 'text-emerald-400',
        status === 'error'   && 'text-red-400',
        status === 'stopped' && 'text-slate-500',
      )}>
        {status === 'stopped' ? 'parado' : status}
      </p>
    )}
  </div>

  {/* Action buttons */}
  <TooltipProvider delay={400}>
    <div className="flex items-center gap-0.5 shrink-0">

      {/* Scripts popover */}
      {project.scripts && project.scripts.length > 0 && (
        <Popover open={scriptMenuOpen} onOpenChange={setScriptMenuOpen}>
          <PopoverTrigger className="p-1 text-slate-500 hover:text-nexus-neon hover:bg-slate-800 rounded transition-colors">
            <Play size={13} className="fill-current" />
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            className="w-40 p-1 bg-slate-900 border-slate-700"
          >
            <p className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800 mb-1">
              Scripts
            </p>
            {project.scripts.map(s => (
              <button
                key={s}
                className="w-full text-left px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-nexus-neon rounded transition-colors"
                onClick={() => { onPlayScript(s); setScriptMenuOpen(false); }}
              >
                {s}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* npm install */}
      {isNode && (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost" size="icon-xs"
                  onClick={(e) => { e.stopPropagation(); handleNpmInstall(); }}
                  className="text-slate-500 hover:text-nexus-neon"
                />
              }
            >
              <Package size={12} />
            </TooltipTrigger>
            <TooltipContent>npm install</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost" size="icon-xs"
                  onClick={(e) => { e.stopPropagation(); setAddDepsOpen(true); }}
                  className="text-slate-500 hover:text-nexus-neon"
                />
              }
            >
              <Plus size={12} />
            </TooltipTrigger>
            <TooltipContent>Agregar dependencias</TooltipContent>
          </Tooltip>
        </>
      )}

      {/* ENV button */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost" size="icon-xs"
              onClick={(e) => { e.stopPropagation(); setEnvManagerOpen(true); }}
              className="text-slate-500 hover:text-nexus-neon text-[9px] w-auto px-1.5"
            />
          }
        >
          <span className="font-mono text-[9px]">ENV{Object.keys(activeVars).length > 0 && ` (${Object.keys(activeVars).length})`}</span>
        </TooltipTrigger>
        <TooltipContent>Gestionar variables de entorno</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
</div>
```

**Step 3: Reemplazar modal de add-deps con Dialog**

```tsx
{/* Reemplazar el div fixed ... por: */}
<Dialog open={addDepsOpen} onOpenChange={setAddDepsOpen}>
  <DialogContent className="max-w-md bg-slate-900 border-slate-700">
    <DialogHeader>
      <DialogTitle className="text-slate-200">Agregar dependencias</DialogTitle>
      <p className="text-[10px] text-slate-500 font-mono truncate">{projectPath}</p>
    </DialogHeader>

    <Input
      value={addDepsPackages}
      onChange={e => setAddDepsPackages(e.target.value)}
      placeholder="lodash axios react"
      className="bg-slate-950 border-slate-700 focus:border-nexus-neon"
      onKeyDown={e => e.key === 'Enter' && handleAddDepsInstall()}
      autoFocus
    />

    <div className="flex items-center gap-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="radio" name="depsType" checked={!addDepsDev}
          onChange={() => setAddDepsDev(false)} className="accent-nexus-neon" />
        <span className="text-xs text-slate-300">Dependencies</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="radio" name="depsType" checked={addDepsDev}
          onChange={() => setAddDepsDev(true)} className="accent-nexus-neon" />
        <span className="text-xs text-slate-300">Dev Dependencies</span>
      </label>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => setAddDepsOpen(false)} className="text-slate-400">
        Cancelar
      </Button>
      <Button
        onClick={handleAddDepsInstall}
        disabled={!addDepsPackages.trim()}
        className="bg-nexus-neon text-slate-900 hover:bg-nexus-neon/80 font-bold"
      >
        Instalar
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Step 4: Verificar build**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```

---

### Task 5: ProjectListPane — header con shadcn Button

**Files:**
- Modify: `src/components/services/ProjectListPane.tsx`

**Step 1: Agregar import**

```tsx
import { Button } from '@/components/ui/button';
```

**Step 2: Reemplazar botones de selección en el header**

```tsx
<div className="px-3 py-2 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center shrink-0 gap-2">
  <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
    Proyectos <span className="text-slate-600">({projects.length})</span>
  </h2>
  {selectedProjects.length > 0 ? (
    <Button variant="ghost" size="xs" onClick={onDeselectAll}
      className="text-slate-400 hover:text-slate-200 text-[10px]">
      Deseleccionar
    </Button>
  ) : (
    <Button variant="ghost" size="xs" onClick={onSelectAll}
      className="text-nexus-neon hover:text-nexus-neon/80 hover:bg-nexus-neon/10 text-[10px]">
      Seleccionar todos
    </Button>
  )}
</div>
```

**Step 3: Verificar build final**

```bash
npm run build 2>&1 | grep -E "error TS|✓ built"
```
Esperado: `✓ built`

---

### Task 6: Verificación visual rápida

**Step 1: Arrancar dev**
```bash
npm run tauri dev
```

**Step 2: Checklist visual**
- [ ] MultiExecutionBar: Select muestra opciones, Run button con badge de count, Tooltip en Wand/Vite
- [ ] TerminalTabs: tab activo tiene línea neon abajo, botones de acción aparecen en hover con Tooltip
- [ ] Command Builder abre como Dialog centrado sin backdrop manual
- [ ] ProjectRow: badge de tipo (Node/Go/Rust), status bar lateral izquierda, scripts en Popover, add-deps en Dialog
- [ ] ProjectListPane: botón "Seleccionar todos" con estilo ghost neon
