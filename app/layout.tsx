"use client";

import "./globals.css";
import { ThemeProvider, SidebarProvider, SidebarInset } from "@kognitos/lattice";
import { ChatProvider } from "@/lib/chat/chat-context";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme="light">
          <ChatProvider>
            <SidebarProvider>
              {/* Add your <AppSidebar /> component here */}
              <SidebarInset>{children}</SidebarInset>
            </SidebarProvider>
          </ChatProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
