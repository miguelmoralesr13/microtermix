# ConfigurableSidebarList

Generic, JSON-driven sidebar list built on shadcn/ui primitives.  
Drop it anywhere you need a resizable, filterable, selectable, right-click-enabled panel.

---

## Quick import

```tsx
import {
  ConfigurableSidebarList,
  type SidebarListConfig,
  type ContextMenuEntry,
} from '@/components/ui/configurable-sidebar-list';
```

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `T[]` | — | **Required.** Raw data array. |
| `config` | `SidebarListConfig<T>` | — | **Required.** Rendering + behaviour config object (see below). |
| `selected` | `string[]` | `[]` | Controlled list of selected keys. |
| `onSelectionChange` | `(keys: string[]) => void` | — | Called whenever selection changes. |
| `className` | `string` | — | Extra classes for the root element. |

---

## SidebarListConfig\<T\>

### Item rendering

| Field | Type | Description |
|---|---|---|
| `getKey` | `(item: T) => string` | **Required.** Unique key for each item. Used as React key and selection id. |
| `getText` | `(item: T) => ReactNode` | **Required.** Main label. Return a plain string for built-in filtering to work without `filterFn`. |
| `getPrev` | `(item: T) => ReactNode` | Optional slot rendered **before** the text (icon, badge, status dot…). |
| `getPost` | `(item: T) => ReactNode` | Optional slot rendered **after** the text, pushed to the right edge. |

### Filter

| Field | Type | Default | Description |
|---|---|---|---|
| `filterEnabled` | `boolean` | `false` | Show the filter input. |
| `filterPlaceholder` | `string` | `'Filtrar...'` | Placeholder text. |
| `filterFn` | `(item: T, query: string) => boolean` | substring match on `getText` | Custom predicate. **Required when `getText` returns a ReactNode.** |

### Selection

| Field | Type | Default | Description |
|---|---|---|---|
| `selectionMode` | `'none' \| 'single' \| 'multi'` | `'none'` | Controls how many items can be selected. |
| `showCheckbox` | `boolean` | `false` | Show a checkbox in each row. Only meaningful for `'multi'`. |
| `showSelectAll` | `boolean` | `false` | Show "Seleccionar todos / Deseleccionar" in the header. Only for `'multi'`. |

### Context menu

| Field | Type | Description |
|---|---|---|
| `contextMenu` | `ContextMenuEntry<T>[]` | Declarative menu definition. Each entry can be an `'item'`, `'separator'`, or `'group-label'`. |

### Header

| Field | Type | Description |
|---|---|---|
| `title` | `ReactNode` | Text or component shown in the header bar. |
| `headerExtra` | `ReactNode` | Extra element placed in the header's right slot. |

### Resize

| Field | Type | Default | Description |
|---|---|---|---|
| `resizable` | `boolean` | `false` | Enable drag-to-resize handle on the right edge. |
| `storageKey` | `string` | — | localStorage key to persist width. |
| `defaultWidth` | `number` | `280` | Initial width in px. |
| `minWidth` | `number` | `180` | Minimum resize width. |
| `maxWidth` | `number` | `600` | Maximum resize width. |

### Empty state

| Field | Type | Default | Description |
|---|---|---|---|
| `emptyState` | `ReactNode` | `'Sin resultados.'` | Shown when no items match. |

### classNames (style overrides)

Every visual region can be overridden with Tailwind classes:

```ts
classNames?: {
  root?       // outermost container div
  header?     // header bar
  title?      // title text
  filterWrap? // div wrapping the Input
  filterInput?// the Input element
  list?       // scrollable list container
  item?       // each list row
  itemSelected// applied when row is selected
  itemContent?// inner flex container
  itemPrev?   // prev slot wrapper
  itemText?   // text span
  itemPost?   // post slot wrapper
  checkbox?   // checkbox input
  emptyState? // empty-state wrapper
  dragHandle? // resize handle
}
```

---

## ContextMenuEntry\<T\>

```ts
interface ContextMenuEntry<T> {
  type?:      'item' | 'separator' | 'group-label'   // default: 'item'
  key:        string                                  // React key (required)
  label?:     ReactNode | ((item: T) => ReactNode)
  icon?:      ReactNode | ((item: T) => ReactNode)
  className?: string   | ((item: T) => string)
  show?:      (item: T) => boolean  // false → entry is hidden for this item
  disabled?:  (item: T) => boolean  // true  → entry is visible but disabled
  onClick?:   (item: T) => void
}
```

---

## Examples

### 1 — Minimal read-only list

```tsx
type Lang = { id: string; name: string };

const LANGS: Lang[] = [
  { id: 'ts', name: 'TypeScript' },
  { id: 'go', name: 'Go' },
  { id: 'rs', name: 'Rust' },
];

const config: SidebarListConfig<Lang> = {
  getKey:  l => l.id,
  getText: l => l.name,
};

<ConfigurableSidebarList items={LANGS} config={config} />
```

---

### 2 — Filter + single selection

```tsx
const [sel, setSel] = useState<string[]>([]);

const config: SidebarListConfig<Lang> = {
  getKey:         l => l.id,
  getText:        l => l.name,
  filterEnabled:  true,
  filterPlaceholder: 'Buscar lenguaje...',
  selectionMode:  'single',
  title:          'Lenguajes',
};

<ConfigurableSidebarList
  items={LANGS}
  config={config}
  selected={sel}
  onSelectionChange={setSel}
/>
```

---

### 3 — Multi-select with checkboxes + select-all

```tsx
const [sel, setSel] = useState<string[]>([]);

const config: SidebarListConfig<Lang> = {
  getKey:        l => l.id,
  getText:       l => l.name,
  selectionMode: 'multi',
  showCheckbox:  true,
  showSelectAll: true,
  title:         'Proyectos',
  filterEnabled: true,
};

<ConfigurableSidebarList
  items={LANGS}
  config={config}
  selected={sel}
  onSelectionChange={setSel}
/>
```

---

### 4 — Prev/Post slots (icon + badge)

```tsx
import { Circle } from 'lucide-react';

type Project = { id: string; name: string; status: 'running' | 'stopped' };

const config: SidebarListConfig<Project> = {
  getKey:  p => p.id,
  getText: p => p.name,

  getPrev: p => (
    <Circle
      size={8}
      className={p.status === 'running' ? 'text-emerald-400 fill-current' : 'text-slate-600 fill-current'}
    />
  ),

  getPost: p => (
    <span className="text-[10px] text-slate-500">{p.status}</span>
  ),
};
```

---

### 5 — Context menu (conditional options)

```tsx
import { Play, Square, Settings, Trash2 } from 'lucide-react';

const contextMenu: ContextMenuEntry<Project>[] = [
  {
    key: 'actions-label',
    type: 'group-label',
    label: 'Acciones',
  },
  {
    key: 'start',
    label: 'Iniciar',
    icon: <Play size={13} />,
    className: 'text-emerald-400 hover:bg-emerald-500/10',
    // Only show "Start" when the project is NOT running
    show: p => p.status !== 'running',
    onClick: p => console.log('start', p.id),
  },
  {
    key: 'stop',
    label: 'Detener',
    icon: <Square size={13} />,
    className: 'text-rose-400 hover:bg-rose-500/10',
    // Only show "Stop" when running
    show: p => p.status === 'running',
    onClick: p => console.log('stop', p.id),
  },
  { key: 'sep-1', type: 'separator' },
  {
    key: 'settings',
    label: 'Configuración',
    icon: <Settings size={13} />,
    onClick: p => console.log('settings', p.id),
  },
  {
    key: 'delete',
    label: 'Eliminar',
    icon: <Trash2 size={13} />,
    className: 'text-red-500',
    // Disable delete for running projects
    disabled: p => p.status === 'running',
    onClick: p => console.log('delete', p.id),
  },
];

const config: SidebarListConfig<Project> = {
  getKey:      p => p.id,
  getText:     p => p.name,
  contextMenu,
};
```

---

### 6 — Resizable panel with persistence

```tsx
const config: SidebarListConfig<Project> = {
  getKey:      p => p.id,
  getText:     p => p.name,
  resizable:   true,
  storageKey:  'my-panel-width',
  defaultWidth: 320,
  minWidth:    200,
  maxWidth:    700,
};
```

---

### 7 — Custom styles (full override)

```tsx
const config: SidebarListConfig<Project> = {
  getKey:  p => p.id,
  getText: p => p.name,
  classNames: {
    root:         'border-violet-900',
    header:       'bg-violet-950',
    title:        'text-violet-400',
    item:         'rounded-md mx-1 my-0.5',
    itemSelected: 'bg-violet-500/20 border border-violet-500/30',
    itemText:     'text-violet-200',
  },
};
```

---

### 8 — ReactNode text + custom filterFn

When `getText` returns a ReactNode (e.g. rich content with icons), the default
string-based filter won't work. Provide `filterFn` to handle it yourself:

```tsx
type Env = { id: string; name: string; active: boolean };

const config: SidebarListConfig<Env> = {
  getKey:  e => e.id,
  getText: e => (
    <span className="flex items-center gap-1.5">
      {e.name}
      {e.active && <span className="text-[9px] text-emerald-400 font-bold">LIVE</span>}
    </span>
  ),
  // Filter by name since getText is a ReactNode
  filterFn: (e, q) => e.name.toLowerCase().includes(q),
  filterEnabled: true,
};
```

---

## Migrating ProjectListPane

The existing `ProjectListPane` can be replaced like this:

```tsx
import { ConfigurableSidebarList, type SidebarListConfig } from '@/components/ui/configurable-sidebar-list';
import type { Project } from '@/context/WorkspaceContext';

const config: SidebarListConfig<Project> = {
  getKey:      p => p.path,
  getText:     p => p.name,
  filterFn:    (p, q) => p.name.toLowerCase().includes(q),
  filterEnabled: true,
  selectionMode: 'multi',
  showCheckbox:  true,
  showSelectAll: true,
  title:         'Proyectos',
  resizable:     true,
  storageKey:    'microtermix-project-pane-width',
  defaultWidth:  352,
  // ... contextMenu definition here
};

<ConfigurableSidebarList
  items={projects}
  config={config}
  selected={selectedProjects}
  onSelectionChange={setSelectedProjects}
/>
```
