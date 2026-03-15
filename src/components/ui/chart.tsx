import * as React from "react"
import { ResponsiveContainer, TooltipContentProps } from "recharts"

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { config?: any }
>(({ className, children, ...props }, ref) => {
  return (
    <div ref={ref} className={`w-full h-full ${className || ''}`} {...props}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
})
ChartContainer.displayName = "ChartContainer"

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: Omit<TooltipContentProps<number, string>, "formatter"> & { 
  formatter?: (val: number) => React.ReactNode 
}) {
  if (!active || !payload?.length) return null
  
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <div className="font-mono text-slate-400 mb-1">{label}</div>
      {payload.map((item, index) => (
        <div key={index} className="flex items-center gap-2 font-mono">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-slate-200 font-medium">
            {formatter ? formatter(item.value as number) : item.value}
          </span>
        </div>
      ))}
    </div>
  )
}
