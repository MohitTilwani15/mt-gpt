"use client"

import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

type TabsContextValue = {
  value: string
  setValue: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined)

function useTabsContext(component: string) {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error(`${component} must be used within <Tabs> component`)
  }
  return context
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

function Tabs({
  className,
  children,
  value,
  defaultValue,
  onValueChange,
  ...props
}: TabsProps) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = React.useState<string>(defaultValue ?? "")

  React.useEffect(() => {
    if (!isControlled && defaultValue !== undefined) {
      setInternalValue(defaultValue)
    }
  }, [defaultValue, isControlled])

  const currentValue = isControlled ? value ?? "" : internalValue

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setInternalValue(nextValue)
      }
      onValueChange?.(nextValue)
    },
    [isControlled, onValueChange],
  )

  const contextValue = React.useMemo<TabsContextValue>(
    () => ({ value: currentValue, setValue }),
    [currentValue, setValue],
  )

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-full p-1",
        className,
      )}
      {...props}
    />
  ),
)
TabsList.displayName = "TabsList"

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, onClick, ...props }, ref) => {
    const { value: activeValue, setValue } = useTabsContext("TabsTrigger")
    const isActive = activeValue === value

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        data-state={isActive ? "active" : "inactive"}
        aria-selected={isActive}
        className={cn(
          "inline-flex min-w-24 items-center justify-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          "data-[state=active]:bg-background data-[state=active]:text-foreground",
          className,
        )}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) {
            setValue(value)
          }
        }}
        {...props}
      />
    )
  },
)
TabsTrigger.displayName = "TabsTrigger"

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, ...props }, ref) => {
    const { value: activeValue } = useTabsContext("TabsContent")
    const isActive = activeValue === value

    return (
      <div
        ref={ref}
        role="tabpanel"
        data-state={isActive ? "active" : "inactive"}
        hidden={!isActive}
        className={cn(!isActive && "hidden", className)}
        {...props}
      />
    )
  },
)
TabsContent.displayName = "TabsContent"

export { Tabs, TabsContent, TabsList, TabsTrigger }
