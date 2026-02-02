import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from './context/ThemeContext';
import { AdminProvider } from './context/AdminContext';
import { AuthWithAdminProvider } from './context/AuthWithAdminContext';
import { MultiUserFinanceProvider } from './context/MultiUserFinanceContext';
import { FinanceProvider } from './context/FinanceContext';
import { BudgetProvider } from './context/BudgetContext';
import { SyncProvider } from './context/SyncContext';
import AppLayout from './components/AppLayout';
import { Toaster } from "../components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Finance Tracker",
  description: "Track and visualize your personal expenses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider defaultTheme="system">
          <AdminProvider>
            <AuthWithAdminProvider>
              <MultiUserFinanceProvider>
                <FinanceProvider>
                  <BudgetProvider>
                    <SyncProvider>
                      <AppLayout>
                        {children}
                      </AppLayout>
                    </SyncProvider>
                  </BudgetProvider>
                </FinanceProvider>
              </MultiUserFinanceProvider>
            </AuthWithAdminProvider>
            <Toaster />
          </AdminProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
