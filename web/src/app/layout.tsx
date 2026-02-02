import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from './context/ThemeContext';
import { AdminProvider } from './context/AdminContext';
import { AuthWithAdminProvider } from './context/AuthWithAdminContext';
import { MultiUserFinanceProvider } from './context/MultiUserFinanceContext';
import { FinanceProvider } from './context/FinanceContext';
import { BudgetProvider } from './context/BudgetContext';
import { Toaster } from "../components/ui/toaster";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-terminal",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-terminal-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://pfinance.app'),
  title: {
    default: "PFinance - Personal Finance Tracker",
    template: "%s | PFinance",
  },
  description: "Track expenses, manage budgets, and collaborate with your household. Beautiful visualizations, AI-powered insights, and multi-user support.",
  keywords: [
    "personal finance",
    "expense tracker",
    "budget management",
    "money tracking",
    "finance app",
    "household budget",
    "expense categories",
    "financial planning",
  ],
  authors: [{ name: "PFinance" }],
  creator: "PFinance",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "PFinance",
    title: "PFinance - Personal Finance Tracker",
    description: "Track expenses, manage budgets, and collaborate with your household. Beautiful visualizations, AI-powered insights, and multi-user support.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PFinance - Personal Finance Tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PFinance - Personal Finance Tracker",
    description: "Track expenses, manage budgets, and collaborate with your household.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${ibmPlexMono.variable} ${spaceMono.variable} font-sans antialiased`}
      >
        <ThemeProvider defaultTheme="system">
          <AdminProvider>
            <AuthWithAdminProvider>
              <MultiUserFinanceProvider>
                <FinanceProvider>
                  <BudgetProvider>
                    {children}
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
