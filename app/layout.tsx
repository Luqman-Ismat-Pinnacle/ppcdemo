/**
 * @fileoverview Root Layout for PPC V3 Application.
 * 
 * This is the main layout component that wraps all pages and provides:
 * - Global CSS styles
 * - Font configuration (Space Grotesk, JetBrains Mono)
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
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
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
import SnapshotPopup from '@/components/snapshot/SnapshotPopup';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import HelpButton from '@/components/help/HelpButton';
import RoleViewSwitcher from '@/components/layout/RoleViewSwitcher';
import { RoleViewProvider } from '@/lib/role-view-context';
import AmbientBackground from '@/components/background/AmbientBackground';

const spaceGrotesk = Space_Grotesk({
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
      <body className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ErrorBoundary>
          <Auth0Provider>
            <AuthGuard>
              <InactivityLogout>
                <LogsProvider>
                  <ThemeProvider>
                    <UserProvider>
                      <RoleViewProvider>
                        <DataProvider>
                          <SnapshotProvider>
                            <div className="app-container" style={{ position: 'relative', zIndex: 1 }}>
                              <AmbientBackground />
                              <Header />
                              <main className="main-content">
                                {children}
                              </main>
                              <HelpButton />
                              <RoleViewSwitcher />
                              <SnapshotPopup />
                            </div>
                          </SnapshotProvider>
                        </DataProvider>
                      </RoleViewProvider>
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
