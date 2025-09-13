"use client"

import { Toaster } from "sonner"
import { usePathname } from "next/navigation"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"
import { AppSidebar } from "./app-sidebar"
import { authClient } from "@/lib/auth-client"

interface MainLayoutProps {
  children: React.ReactNode
  headerActions?: React.ReactNode
}

export function MainLayout({ children, headerActions }: MainLayoutProps) {
  const pathname = usePathname()
  const { data: session, isPending } = authClient.useSession()
  
  const shouldShowSidebar = session && pathname !== "/login"
  
  if (isPending) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        Loading...
      </div>
    )
  }
  
  if (!shouldShowSidebar) {
    return <>{children}</>
  }

  return (
    <SidebarProvider>
      <Toaster position="top-center" />
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          {headerActions}
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
