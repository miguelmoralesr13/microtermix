"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type CalendarProps = {
  mode?: "single" | "range" | "multiple"
  selected?: Date | Date[] | undefined
  onSelect?: (date: Date | undefined) => void
  className?: string
  disabled?: boolean | ((date: Date) => boolean)
  initialFocus?: boolean
  fromDate?: Date
  toDate?: Date
}

function Calendar({
  mode: _mode = "single",
  selected,
  onSelect,
  className,
  disabled,
}: CalendarProps) {
  const selectedDate =
    selected instanceof Date ? selected : Array.isArray(selected) ? selected[0] : undefined

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onSelect) return
    const val = e.target.value
    if (!val) {
      onSelect(undefined)
      return
    }
    const d = new Date(val + "T00:00:00")
    if (!isNaN(d.getTime())) {
      onSelect(d)
    }
  }

  const toInputValue = (d: Date | undefined) => {
    if (!d) return ""
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const isDisabled = typeof disabled === "function" ? false : !!disabled

  return (
    <div className={cn("p-3", className)}>
      <input
        type="date"
        value={toInputValue(selectedDate)}
        onChange={handleChange}
        disabled={isDisabled}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  )
}

Calendar.displayName = "Calendar"

export { Calendar }
