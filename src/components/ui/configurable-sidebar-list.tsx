import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Checkbox } from './Checkbox';
import { Input } from './input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './context-menu';
import { Search } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SelectionMode = 'single' | 'multi' | 'none';

/** One entry in the context menu. Use `type: 'separator'` or `type: 'group-label'` for non-item rows. */
export interface ContextMenuEntry<T> {
  /** 'item' (default) | 'separator' | 'group-label' */
  type?: 'item' | 'separator' | 'group-label';
  /** Unique key — required for React reconciliation */
  key: string;
  /** Display label. Ignored for separators. Can be a static ReactNode or a function of the item. */
  label?: React.ReactNode | ((item: T) => React.ReactNode);
  /** Icon placed before the label. Can be a static ReactNode or a function of the item. */
  icon?: React.ReactNode | ((item: T) => React.ReactNode);
  /** Extra Tailwind classes for this row. Can be static or per-item. */
  className?: string | ((item: T) => string);
  /** Return false to HIDE this entry for a given item. If omitted the entry is always visible. */
  show?: (item: T) => boolean;
  /** Return true to disable (but still render) this entry. */
  disabled?: (item: T) => boolean;
  onClick?: (item: T) => void;
}

/** Granular className overrides for every region of the component. */
export interface SidebarListClassNames {
  /** Outermost container */
  root?: string;
  /** Header bar (title + select-all row) */
  header?: string;
  /** Title text node */
  title?: string;
  /** Wrapper div around the filter Input */
  filterWrap?: string;
  /** The Input element itself */
  filterInput?: string;
  /** Scrollable list container */
  list?: string;
  /** Each list row */
  item?: string;
  /** Applied on top of `item` when the row is selected */
  itemSelected?: string;
  /** Inner flex container of prev + text + post */
  itemContent?: string;
  /** Prev slot wrapper */
  itemPrev?: string;
  /** Text / label span */
  itemText?: string;
  /** Post slot wrapper */
  itemPost?: string;
  /** The checkbox input element */
  checkbox?: string;
  /** Empty-state message */
  emptyState?: string;
  /** Resize drag handle */
  dragHandle?: string;
}

/** All rendering + behaviour configuration. Keep this stable (useMemo or module constant). */
export interface SidebarListConfig<T> {
  // ── Item rendering ────────────────────────────────────────────────────────
  /** Extract a unique string key from each item (used as React key and selection id). */
  getKey: (item: T) => string;
  /**
   * Main content of the item. Can return a plain string or a full ReactNode.
   * NOTE: If you return a ReactNode, you must also provide `filterFn` for the built-in filter to work.
   */
  getText: (item: T) => React.ReactNode;
  /** Content rendered BEFORE `getText` (left slot). */
  getPrev?: (item: T) => React.ReactNode;
  /** Content rendered AFTER `getText` (right slot, pushed to edge). */
  getPost?: (item: T) => React.ReactNode;

  // ── Filter ────────────────────────────────────────────────────────────────
  filterEnabled?: boolean;
  filterPlaceholder?: string;
  /**
   * Custom filter predicate. If omitted the component does `String(getText(item)).toLowerCase().includes(query)`.
   * Always provide this when `getText` returns a ReactNode.
   */
  filterFn?: (item: T, query: string) => boolean;

  // ── Selection ─────────────────────────────────────────────────────────────
  /** 'none' (default) | 'single' | 'multi' */
  selectionMode?: SelectionMode;
  /** Render a checkbox in each row. Only relevant when selectionMode is 'multi'. */
  showCheckbox?: boolean;
  /** Show "Seleccionar todos / Deseleccionar" button in the header. Only for 'multi'. */
  showSelectAll?: boolean;

  // ── Context menu ─────────────────────────────────────────────────────────
  contextMenu?: ContextMenuEntry<T>[];

  // ── Styles ────────────────────────────────────────────────────────────────
  classNames?: SidebarListClassNames;

  // ── Header ────────────────────────────────────────────────────────────────
  title?: React.ReactNode;
  /** Extra element placed in the header's right slot (before the select-all button). */
  headerExtra?: React.ReactNode;

  // ── Resize ────────────────────────────────────────────────────────────────
  resizable?: boolean;
  /** localStorage key used to persist the panel width across sessions. */
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;

  // ── Empty state ───────────────────────────────────────────────────────────
  /** Shown when the list is empty (no items or no filter results). */
  emptyState?: React.ReactNode;
}

export interface ConfigurableSidebarListProps<T> {
  items: T[];
  config: SidebarListConfig<T>;
  /** Controlled array of selected keys. */
  selected?: string[];
  onSelectionChange?: (selected: string[]) => void;
  className?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolve<T, R>(val: R | ((item: T) => R), item: T): R {
  return typeof val === 'function' ? (val as (item: T) => R)(item) : val;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConfigurableSidebarList<T>({
  items,
  config,
  selected = [],
  onSelectionChange,
  className,
}: ConfigurableSidebarListProps<T>) {
  const {
    getKey,
    getText,
    getPrev,
    getPost,
    filterEnabled = false,
    filterPlaceholder = 'Filtrar...',
    filterFn,
    selectionMode = 'none',
    showCheckbox = false,
    showSelectAll = false,
    contextMenu,
    classNames = {},
    title,
    headerExtra,
    resizable = false,
    storageKey,
    defaultWidth = 280,
    minWidth = 180,
    maxWidth = 600,
    emptyState,
  } = config;

  // ── Filter ───────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');

  // ── Resize ───────────────────────────────────────────────────────────────
  const [width, setWidth] = useState(() => {
    if (!resizable) return defaultWidth;
    const saved = storageKey ? localStorage.getItem(storageKey) : null;
    return saved ? parseInt(saved, 10) : defaultWidth;
  });
  const isDragging = useRef(false);
  const widthRef = useRef(width);

  useEffect(() => { widthRef.current = width; }, [width]);

  useEffect(() => {
    if (!resizable) return;
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setWidth(prev => Math.max(minWidth, Math.min(prev + e.movementX, maxWidth)));
    };
    const onUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = 'default';
      if (storageKey) localStorage.setItem(storageKey, widthRef.current.toString());
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [resizable, minWidth, maxWidth, storageKey]);

  // ── Filtered items ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!filterEnabled || !query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(item =>
      filterFn ? filterFn(item, q) : String(getText(item)).toLowerCase().includes(q)
    );
  }, [items, query, filterEnabled, filterFn, getText]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const handleSelect = useCallback((key: string) => {
    if (selectionMode === 'none') return;
    if (selectionMode === 'single') {
      onSelectionChange?.(selected.includes(key) ? [] : [key]);
    } else {
      onSelectionChange?.(
        selected.includes(key)
          ? selected.filter(k => k !== key)
          : [...selected, key]
      );
    }
  }, [selectionMode, selected, onSelectionChange]);

  const allSelected = filtered.length > 0 && filtered.every(item => selected.includes(getKey(item)));
  const someSelected = selected.length > 0;

  const handleSelectAll = useCallback(
    () => onSelectionChange?.(filtered.map(getKey)),
    [filtered, getKey, onSelectionChange]
  );
  const handleDeselectAll = useCallback(
    () => onSelectionChange?.([]),
    [onSelectionChange]
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        'flex flex-col border-r border-slate-800 bg-slate-950/30 overflow-hidden shrink-0 relative',
        classNames.root,
        className
      )}
      style={resizable ? { width: `${width}px` } : undefined}
    >
      {/* ── Header ── */}
      {(title || headerExtra || (showSelectAll && selectionMode === 'multi')) && (
        <div className={cn(
          'px-3 py-2 border-b border-slate-800 bg-slate-900/80 flex items-center gap-2 shrink-0',
          classNames.header
        )}>
          {title && (
            <span className={cn('text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0', classNames.title)}>
              {title}
            </span>
          )}

          {headerExtra && <div className="ml-1 flex items-center gap-1">{headerExtra}</div>}

          {showSelectAll && selectionMode === 'multi' && (
            <Button
              variant="ghost"
              size="xs"
              onClick={someSelected ? handleDeselectAll : handleSelectAll}
              className={cn(
                'ml-auto text-[10px] h-auto py-0.5',
                someSelected
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-microtermix-neon hover:text-microtermix-neon/80 hover:bg-microtermix-neon/10'
              )}
            >
              {allSelected ? 'Deseleccionar' : someSelected ? 'Deseleccionar' : 'Seleccionar todos'}
            </Button>
          )}
        </div>
      )}

      {/* ── Filter ── */}
      {filterEnabled && (
        <div className={cn('px-2 py-1.5 border-b border-slate-800 shrink-0', classNames.filterWrap)}>
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={filterPlaceholder}
              className={cn(
                'h-6 pl-6 pr-2 text-[11px] bg-slate-900 border-slate-700 text-slate-300',
                'placeholder:text-slate-600 focus-visible:ring-microtermix-neon/30',
                classNames.filterInput
              )}
            />
          </div>
        </div>
      )}

      {/* ── List ── */}
      <div className={cn('flex-1 overflow-y-auto', classNames.list)}>
        {filtered.length === 0 ? (
          <div className={cn('p-6 text-center text-slate-500 text-sm', classNames.emptyState)}>
            {emptyState ?? (query ? 'Sin resultados.' : 'No hay ítems.')}
          </div>
        ) : (
          filtered.map(item => {
            const key = getKey(item);
            const isSelected = selected.includes(key);

            const row = (
              <div
                key={key}
                onClick={() => handleSelect(key)}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 transition-colors',
                  selectionMode !== 'none' ? 'cursor-pointer' : 'cursor-default',
                  'hover:bg-slate-800/50',
                  isSelected && 'bg-microtermix-neon/10',
                  classNames.item,
                  isSelected && classNames.itemSelected
                )}
              >
                {/* Checkbox */}
                {showCheckbox && selectionMode === 'multi' && (
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleSelect(key)}
                    onClick={e => e.stopPropagation()}
                    className={classNames.checkbox}
                  />
                )}

                {/* Prev slot */}
                {getPrev && (
                  <span className={cn('shrink-0', classNames.itemPrev)}>
                    {getPrev(item)}
                  </span>
                )}

                {/* Text slot */}
                <span className={cn(
                  'flex-1 min-w-0 truncate text-xs text-slate-300',
                  classNames.itemText
                )}>
                  {getText(item)}
                </span>

                {/* Post slot */}
                {getPost && (
                  <span className={cn('shrink-0 ml-auto flex items-center', classNames.itemPost)}>
                    {getPost(item)}
                  </span>
                )}
              </div>
            );

            // Without context menu — render row directly
            if (!contextMenu || contextMenu.length === 0) {
              return <React.Fragment key={key}>{row}</React.Fragment>;
            }

            // Filter which entries are visible for this specific item
            const visibleEntries = contextMenu.filter(entry => {
              if (entry.type === 'separator' || entry.type === 'group-label') return true;
              return !entry.show || entry.show(item);
            });

            // If nothing is visible just skip the context-menu wrapper
            if (visibleEntries.length === 0) {
              return <React.Fragment key={key}>{row}</React.Fragment>;
            }

            return (
              <ContextMenu key={key}>
                <ContextMenuTrigger>{row}</ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  {visibleEntries.map(entry => {
                    if (entry.type === 'separator') {
                      return <ContextMenuSeparator key={entry.key} className="bg-slate-800" />;
                    }
                    if (entry.type === 'group-label') {
                      return (
                        <div
                          key={entry.key}
                          className="px-2 py-1 text-[9px] font-black text-slate-600 uppercase tracking-widest"
                        >
                          {resolve(entry.label ?? '', item)}
                        </div>
                      );
                    }
                    return (
                      <ContextMenuItem
                        key={entry.key}
                        disabled={entry.disabled?.(item) ?? false}
                        onClick={() => entry.onClick?.(item)}
                        className={cn(
                          'gap-2 text-xs text-slate-300',
                          entry.className ? resolve(entry.className, item) : ''
                        )}
                      >
                        {entry.icon ? resolve(entry.icon, item) : null}
                        {entry.label ? resolve(entry.label, item) : null}
                      </ContextMenuItem>
                    );
                  })}
                </ContextMenuContent>
              </ContextMenu>
            );
          })
        )}
      </div>

      {/* ── Drag handle ── */}
      {resizable && (
        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-microtermix-neon/50 transition-colors z-10',
            classNames.dragHandle
          )}
          onMouseDown={e => {
            e.preventDefault();
            isDragging.current = true;
            document.body.style.cursor = 'col-resize';
          }}
        />
      )}
    </div>
  );
}
