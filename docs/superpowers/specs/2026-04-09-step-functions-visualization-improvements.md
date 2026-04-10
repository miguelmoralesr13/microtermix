# Plan: Step Functions — Mejoras de Visualización

**Fecha:** 2026-04-09
**Estado:** Pendiente de implementación

## Features a implementar

1. Modal de Request/Response de la Ejecución
2. Steps expandidos por defecto
3. Vista de cambios (diff) con toggle a estado completo

---

## Archivos a modificar

| Archivo | Cambios |
|---|---|
| `src/components/aws/SfnStepCard.tsx` | Diff view, expanded by default, prevOutput prop |
| `src/components/aws/SfnExecutionInspector.tsx` | Pasar prevOutput, botón + modal I/O |

---

## Feature 1 — Modal Request/Response de Ejecución

**Dónde:** `SfnExecutionInspector.tsx`

**Trigger:** Botón pequeño en la barra de tabs (donde ya dice "X steps"), con ícono `ArrowUpDown` o `Eye`.
Solo visible cuando hay una ejecución seleccionada Y los steps ya cargaron.

**Datos:**
- Request = `steps[0].input` (input del primer step = input que recibió la ejecución)
- Response = `steps[steps.length - 1].output` (output del último step = lo que retornó)

**Implementación:**
1. Agregar estado `showIoModal: boolean`
2. Agregar botón junto al badge de "X steps":
   ```
   [nombre ejecución] [X steps] [↕ I/O]
   ```
3. Agregar `<Dialog>` con:
   - Header: nombre de la ejecución + status badge
   - Dos paneles side-by-side: **Request** (input) | **Response** (output)
   - Cada panel tiene botón de copy
   - Usa el mismo `JsonBlock` que ya existe en `SfnStepCard`
   - Footer: botón Close

**No requiere cambios en el backend ni en el store.**

---

## Feature 2 — Steps expandidos por defecto

**Dónde:** `SfnStepCard.tsx`

**Cambio mínimo:**
```ts
// Antes
const [isOpen, setIsOpen] = useState(false);

// Después
const [isOpen, setIsOpen] = useState(true);
```

---

## Feature 3 — Vista de Cambios (Diff) con toggle a estado completo

### 3a. Nuevo prop en SfnStepCard

```ts
interface SfnStepCardProps {
  step: SfnStep;
  isFirst?: boolean;
  isLast?: boolean;
  prevOutput?: string;  // NUEVO: output del step anterior
}
```

En `SfnExecutionInspector.tsx`, al renderizar los cards:
```tsx
steps.map((step, idx) => (
  <SfnStepCard
    key={...}
    step={step}
    isFirst={idx === 0}
    isLast={idx === steps.length - 1}
    prevOutput={steps[idx - 1]?.output}  // undefined para el primer step
  />
))
```

---

### 3b. Función `computeShallowDiff` (dentro de SfnStepCard.tsx)

Diff superficial de dos JSONs (top-level keys):

```ts
interface DiffResult {
  added:     Record<string, any>;                    // keys nuevas en `to`
  removed:   Record<string, any>;                    // keys que desaparecieron
  changed:   Record<string, { from: any; to: any }>; // keys con valor distinto
  unchanged: Record<string, any>;                    // sin cambio (para vista full)
  hasDiff:   boolean;
}

function computeShallowDiff(fromRaw?: string, toRaw?: string): DiffResult | null
```

- Usa el `smartParse` que ya existe en el archivo
- Retorna `null` si no puede parsear o si alguno no es un objeto plano
- Solo aplica a objetos JSON (no arrays, no primitivos) → fallback a vista completa

---

### 3c. Nuevo estado en SfnStepCard

```ts
const [showFull, setShowFull] = useState(false);
```

---

### 3d. Nuevos sub-componentes en SfnStepCard.tsx

#### `DiffEntry` — una fila del diff

| Kind | Color | Prefijo |
|---|---|---|
| `added` | Verde emerald | `+` |
| `removed` | Rosa | `−` |
| `from` (valor anterior de un changed) | Ámbar tachado/opaco | `−` |
| `to` (valor nuevo de un changed) | Ámbar | `+` |

Layout: `[prefix] [key]: [value]` en `font-mono text-[10px]`

#### `DiffBlock` — reemplazo de `JsonBlock` en modo diff

Props: `{ label, diff: DiffResult | null, fallbackRaw?: string, colorClass? }`

- Si `diff === null` → renderiza `<JsonBlock>` normal (fallback)
- Si `diff.hasDiff === false` → muestra `"No changes from previous step"` (gris italic)
- Si hay cambios → lista de `DiffEntry`s (added, removed, changed)

---

### 3e. Layout del card expandido

**Modo Changes (default):**
```
┌─ Header (nombre, duración, LOGS, SUB-SFN, chevron) ──────────────────┐
│                                                                        │
│  [Changes]                              [Layers icon] Full State       │
│                                                                        │
│  Input Changes (from prev)  │  Output Changes                         │
│  ─────────────────────────  │  ──────────────                         │
│  + newKey: value            │  + addedByStep: val                     │
│  − oldKey: val              │  ~ modifiedKey:                         │
│  ~ changedKey:              │      − from: x                          │
│      − from: x              │      + to: y                            │
│      + to: y                │                                         │
└────────────────────────────────────────────────────────────────────────┘
```

**Modo Full State (toggle):**
```
┌─ Header ─────────────────────────────────────────────────────────────┐
│                                                                       │
│  [Full State]                           [Diff icon] Show Changes     │
│                                                                       │
│  Input (full)               │  Output (full)                         │
│  ────────────────────────── │  ─────────────                         │
│  { ... completo ... }       │  { ... completo ... }                  │
└───────────────────────────────────────────────────────────────────────┘
```

**Casos especiales:**
- Primer step (`prevOutput === undefined`): `Input Changes` → muestra `Input` completo (sin prev con qué comparar)
- Step fallido sin output: `Output Changes` → muestra "No output available" (comportamiento actual)
- JSON no parseable o es array/primitivo: fallback a `JsonBlock` normal en ambos lados

---

## Orden de implementación

1. **`SfnStepCard.tsx`** — todo de una:
   - Agregar `computeShallowDiff`
   - Agregar `DiffEntry` y `DiffBlock`
   - Cambiar `isOpen` default a `true`
   - Agregar prop `prevOutput`
   - Agregar estado `showFull`
   - Actualizar el render del body expandido

2. **`SfnExecutionInspector.tsx`**:
   - Pasar `prevOutput={steps[idx-1]?.output}` a cada `SfnStepCard`
   - Agregar estado `showIoModal`
   - Agregar botón `↕ I/O` junto al badge de steps
   - Agregar `<Dialog>` con los dos paneles JSON

---

## Lo que NO cambia

- Backend Rust: sin cambios
- Store (`sfnStore.ts`): sin cambios
- `SfnExecutionList.tsx`: sin cambios
- Comportamiento de selección de ejecuciones: sin cambios
- El `JsonBlock` existente: se mantiene igual, se usa en el modal y como fallback
