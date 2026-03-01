import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PPC Minimal',
  description: 'Minimal PCA Project Controls',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  );
}
