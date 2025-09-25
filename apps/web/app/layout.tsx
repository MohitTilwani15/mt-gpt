import { Geist, Geist_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import { Providers } from "@/components/providers"
import { MainLayout } from "@/components/main-layout"
import { SWRProvider } from "@workspace/client/providers"
import { ConditionalHeaderActions } from "@/components/conditional-header-actions"
import CommandK from "@/components/command-k"
import { ChatProvider } from "@workspace/client/providers"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased `}
      >
        <Providers>
          <SWRProvider>
            <ChatProvider>
              <MainLayout headerActions={<ConditionalHeaderActions />}>
                {children}
                <CommandK />
              </MainLayout>
            </ChatProvider>
          </SWRProvider>
        </Providers>
      </body>
    </html>
  )
}
