/**
 * @fileoverview Root Layout for PPC V3 Application.
 * 
 * This is the main layout component that wraps all pages and provides:
 * - Global CSS styles
 * - Font configuration (Outfit, JetBrains Mono)
 * - Theme provider (dark/light mode)
 * - Data provider (centralized data context)
 * - Error boundary for graceful error handling
 * - Header component (hidden on login page)
 * - Help button (floating help access)
 * - Background image with overlay
 * 
 * @module app/layout
 */

import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { DataProvider } from '@/lib/data-context';
import { UserProvider } from '@/lib/user-context';
import Auth0Provider from '@/components/providers/Auth0Provider';
import Header from '@/components/layout/Header';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import HelpButton from '@/components/help/HelpButton';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap', // Optimize font loading
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap', // Optimize font loading
  preload: true,
});

export const metadata: Metadata = {
  title: 'Pinnacle Project Controls',
  description: 'A comprehensive project portfolio control system with advanced visualizations',
};

// Trivial change to trigger rebuild
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {/* Background Image */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: -1,
          overflow: 'hidden',
          backgroundImage: 'url("/Final Background.png")',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}>
          {/* Theme-aware Overlay */}
          <div className="video-overlay" />
          {/* Bottom Right Blur Overlay */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '400px',
            height: '400px',
            background: 'rgba(0,0,0,0.1)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            maskImage: 'radial-gradient(circle at bottom right, black, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(circle at bottom right, black, transparent 70%)',
            zIndex: 1
          }} />
        </div>
        <ErrorBoundary>
          <Auth0Provider>
            <ThemeProvider>
              <UserProvider>
                <DataProvider>
                  <div className="app-container" style={{ position: 'relative', zIndex: 1 }}>
                    <Header />
                    <main className="main-content">
                      {children}
                    </main>
                    <HelpButton />
                  </div>
                </DataProvider>
              </UserProvider>
            </ThemeProvider>
          </Auth0Provider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
