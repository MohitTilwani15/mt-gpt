import { Geist, Geist_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import { Providers } from "@/components/providers"
import { MainLayout } from "@/components/main-layout"
import SWRProvider from "@/components/swr-provider"
import { ConditionalHeaderActions } from "@/components/conditional-header-actions"

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
            <MainLayout headerActions={<ConditionalHeaderActions />}>
              {children}
            </MainLayout>
          </SWRProvider>
        </Providers>
      </body>
    </html>
  )
}
