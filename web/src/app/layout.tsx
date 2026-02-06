import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from './context/ThemeContext';
import { Toaster } from "../components/ui/toaster";
import { FirebaseInitBanner } from './components/FirebaseInitBanner';

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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
  width: "device-width",
  initialScale: 1,
};

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
  alternates: {
    canonical: "/",
  },
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
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* FOUC prevention for theme and palette */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('pfinance-theme');
                  var palette = localStorage.getItem('pfinance-palette');
                  var root = document.documentElement;

                  // Apply theme class
                  if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    root.classList.add('dark');
                  } else if (theme === 'light') {
                    root.classList.add('light');
                  } else if (!theme || theme === 'system') {
                    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                      root.classList.add('dark');
                    } else {
                      root.classList.add('light');
                    }
                  }

                  // Apply palette attribute (only if not default amber-terminal)
                  if (palette && palette !== 'amber-terminal') {
                    root.dataset.palette = palette;
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${ibmPlexMono.variable} ${spaceMono.variable} font-sans antialiased`}
      >
        {/* Skip link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Skip to main content
        </a>
        <ThemeProvider defaultTheme="system">
          <FirebaseInitBanner />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
