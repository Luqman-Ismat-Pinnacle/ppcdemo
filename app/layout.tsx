import type { Metadata } from 'next';
import './globals.css';
import Auth0Provider from '@/components/providers/Auth0Provider';
import AuthGuard from '@/components/auth/AuthGuard';
import { UserProvider } from '@/lib/user-context';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import FeedbackButton from '@/components/feedback/FeedbackButton';

export const metadata: Metadata = {
  title: 'Pinnacle Project Management',
  description: 'Pinnacle Project Management platform',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Auth0Provider>
          <AuthGuard>
            <UserProvider>
              <ErrorBoundary>
                <div className="ambient-bg" aria-hidden>
                  <span className="ambient-image" />
                  <span className="ambient-blob ambient-blob-a" />
                  <span className="ambient-blob ambient-blob-b" />
                  <span className="ambient-blob ambient-blob-c" />
                  <span className="ambient-vignette" />
                  <span className="ambient-mask" />
                  <span className="ambient-grid" />
                </div>
                {children}
                <FeedbackButton />
              </ErrorBoundary>
            </UserProvider>
          </AuthGuard>
        </Auth0Provider>
      </body>
    </html>
  );
}
