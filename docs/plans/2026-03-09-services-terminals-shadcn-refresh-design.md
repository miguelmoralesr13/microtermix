# Services & Terminals — shadcn/ui Visual Refresh

**Date:** 2026-03-09
**Status:** Approved

## Goal

Migrate the Services & Terminals section to shadcn/ui primitives, reduce boilerplate, and apply a polished visual refresh. Base: dark neon (`microtermix-neon`, `microtermix-accent`) with more breathing room and clearer hierarchy.

## Layout (unchanged)

```
┌──────────────────┬──────────────────────────────────────┐
│  ProjectListPane │  MultiExecutionBar (toolbar)          │
│   (resizable)    ├──────────────────────────────────────┤
│                  │  TerminalTabsBar (tabs arriba)        │
│                  ├──────────────────────────────────────┤
│                  │  TerminalArea (xterm.js — sin tocar)  │
└──────────────────┴──────────────────────────────────────┘
```

## Components

### ProjectListPane + ProjectRow

- Header: shadcn `Button variant="ghost"` for "Select all" / "Deselect"
- Each row as a **card** with generous padding and subtle separator
- Project name: `text-sm font-semibold`, type badge with shadcn `Badge` colored by type (Node=cyan, Go=sky, Rust=orange)
- Status indicator: 3px left border bar (green=running, red=error, gray=idle)
- Scripts: horizontal scrollable chips using shadcn `Button size="xs"`, glow on hover with `microtermix-neon`
- `Tooltip` on each script button showing full command
- Env manager and npm install as icon buttons with `Tooltip`

### MultiExecutionBar

- shadcn `Select` for script and ENV dropdowns
- `Separator orientation="vertical"` between selects and action buttons
- shadcn `Button` variants:
  - Run → `bg-microtermix-neon text-slate-900` + `Play` icon + `Badge` for selected count
  - Stop → `variant="destructive"`
  - Restart → `variant="outline"`
  - Vite wrapper → `variant="ghost"` + `Tooltip`
  - Wand2 → `variant="ghost"` + `Tooltip`

### TerminalTabsBar

- Active tab: `border-b-2 border-microtermix-neon bg-slate-900` (neon underline instead of full border)
- Status indicators (left dot + text color):
  - Running: `bg-emerald-400 animate-pulse` + white text
  - Error: `bg-red-400` + `text-red-400`
  - Stopped: `bg-slate-500` + `text-slate-500`
- Action buttons: shadcn `Button size="icon" variant="ghost"` + `Tooltip`
- Refactor ~40 lines of nested ternaries into clean `cn()` calls

### CommandBuilderModal

- Replace manual modal div+backdrop with shadcn `Dialog` + `DialogContent` + `DialogHeader` + `DialogFooter`
- Eliminates ~30 lines of modal scaffolding

## What is NOT changed

- `TerminalView` (xterm.js internals) — zero changes
- `WorkspaceContext` — zero changes
- Resize logic in `ProjectListPane` — kept as-is (works correctly)
- All props/interfaces — backward compatible

## shadcn Components Used

All already installed: `Button`, `Select`, `Dialog`, `Tooltip`, `Badge`, `Separator`, `Input`, `Textarea`
No new dependencies required.
