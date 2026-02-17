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
import { Suspense } from 'react';
import { Montserrat, JetBrains_Mono } from 'next/font/google';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { DataProvider } from '@/lib/data-context';
import { SnapshotProvider } from '@/lib/snapshot-context';
import { LogsProvider } from '@/lib/logs-context';
import { UserProvider } from '@/lib/user-context';
import Auth0Provider from '@/components/providers/Auth0Provider';
import AuthGuard from '@/components/auth/AuthGuard';
import InactivityLogout from '@/components/auth/InactivityLogout';
import Header from '@/components/layout/Header';
import RouteTransitionLoader from '@/components/layout/RouteTransitionLoader';
import SnapshotPopup from '@/components/snapshot/SnapshotPopup';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import HelpButton from '@/components/help/HelpButton';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
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
  title: 'Pinnacle Project Management',
  description: 'A comprehensive project portfolio management system with advanced visualizations',
};

// Trivial change to trigger rebuild
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${montserrat.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
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
            <AuthGuard>
              <InactivityLogout>
                <LogsProvider>
                  <ThemeProvider>
                    <UserProvider>
                      <DataProvider>
                        <SnapshotProvider>
                          <div className="app-container" style={{ position: 'relative', zIndex: 1 }}>
                            <Header />
                            <Suspense fallback={null}>
                              <RouteTransitionLoader />
                            </Suspense>
                            <main className="main-content">
                              {children}
                            </main>
                            <HelpButton />
                            <SnapshotPopup />
                          </div>
                        </SnapshotProvider>
                      </DataProvider>
                    </UserProvider>
                  </ThemeProvider>
                </LogsProvider>
              </InactivityLogout>
            </AuthGuard>
          </Auth0Provider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
