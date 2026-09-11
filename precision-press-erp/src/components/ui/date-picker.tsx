"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  id?: string
  value?: string
  onChange?: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
  placeholder?: string
  className?: string
}

export function DatePicker({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const date = value ? new Date(value + "T00:00:00") : undefined

  function handleSelect(day: Date | undefined) {
    if (day) {
      const iso = format(day, "yyyy-MM-dd")
      onChange?.(iso)
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          onKeyDown={onKeyDown}
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-9 bg-transparent",
            !date && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          {date ? format(date, "MMM d, yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          defaultMonth={date}
        />
      </PopoverContent>
    </Popover>
  )
}
