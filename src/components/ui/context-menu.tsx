import * as React from "react"
import * as ReactDOM from "react-dom"
import { cn } from "../../lib/utils"

interface ContextMenuProps {
  children: React.ReactNode
}

interface ContextMenuTriggerProps {
  children?: React.ReactNode
  render?: React.ReactElement
  className?: string
}

interface ContextMenuContentProps {
  children: React.ReactNode
  className?: string
}

interface ContextMenuItemProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
}

const ContextMenuContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
  x: number
  setX: (x: number) => void
  y: number
  setY: (y: number) => void
} | null>(null)

export function ContextMenu({ children }: ContextMenuProps) {
  const [open, setOpen] = React.useState(false)
  const [x, setX] = React.useState(0)
  const [y, setY] = React.useState(0)

  return (
    <ContextMenuContext.Provider value={{ open, setOpen, x, setX, y, setY }}>
      {children}
    </ContextMenuContext.Provider>
  )
}

export function ContextMenuTrigger({ children, render, className }: ContextMenuTriggerProps) {
  const context = React.useContext(ContextMenuContext)
  if (!context) throw new Error("ContextMenuTrigger must be used within ContextMenu")

  const handleContextMenu = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    context.setX(e.clientX)
    context.setY(e.clientY)
    context.setOpen(true)
  }

  if (render) {
    return React.cloneElement(render as React.ReactElement<any>, {
      onContextMenu: handleContextMenu,
      className: cn((render as any).props?.className, className)
    });
  }

  return (
    <div 
      onContextMenu={handleContextMenu} 
      className={cn("w-full", className)}
    >
      {children}
    </div>
  )
}

export function ContextMenuContent({ children, className }: ContextMenuContentProps) {
  const context = React.useContext(ContextMenuContext)
  const ref = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null)

  // Medir y clampear dentro del viewport después de cada apertura
  React.useLayoutEffect(() => {
    if (!context?.open || !ref.current) {
      setPos(null)
      return
    }
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const MARGIN = 6

    let left = context.x
    let top = context.y

    if (left + rect.width > vw) left = vw - rect.width - MARGIN
    if (top + rect.height > vh) top = vh - rect.height - MARGIN
    if (top < MARGIN) top = MARGIN
    if (left < MARGIN) left = MARGIN

    setPos({ left, top })
  }, [context?.open, context?.x, context?.y])

  if (!context || !context.open) return null

  return ReactDOM.createPortal(
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={() => context.setOpen(false)}
        onContextMenu={(e) => { e.preventDefault(); context.setOpen(false); }}
      />
      <div
        ref={ref}
        style={{
          position: "fixed",
          left: pos ? pos.left : context.x,
          top: pos ? pos.top : context.y,
          visibility: pos ? "visible" : "hidden",
        }}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-slate-900 border-slate-800 p-1 text-slate-200 shadow-md animate-in fade-in-0 zoom-in-95",
          className
        )}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

export function ContextMenuItem({ children, onClick, className, disabled }: ContextMenuItemProps) {
  const context = React.useContext(ContextMenuContext)
  if (!context) return null

  return (
    <div
      onClick={(e) => {
        if (disabled) return
        e.stopPropagation()
        onClick?.()
        context.setOpen(false)
      }}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {children}
    </div>
  )
}

export function ContextMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("-mx-1 my-1 h-px bg-border", className)} />
}
