"use client"

import * as React from "react"
import { ThemeProvider } from "next-themes"

import { AuthProvider, SWRProvider } from "@workspace/client/providers"
import { authClient } from "@/auth/auth-client"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider authClient={authClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        enableColorScheme
      >
        <SWRProvider>
          {children}
        </SWRProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}
