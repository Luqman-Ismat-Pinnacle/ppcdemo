/**
 * @fileoverview 404 Not Found Page for PPC V3.
 * 
 * Displays a friendly error message when users navigate to
 * a non-existent route. Provides a link to the main dashboard.
 * 
 * @module app/not-found
 */

import Link from 'next/link';

/**
 * NotFound component displayed for invalid routes.
 */
export default function NotFound() {
  return (
    <div className="page-panel" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <h1 className="page-title">404 - Page Not Found</h1>
      <p className="page-description">The page you're looking for doesn't exist.</p>
      <Link href="/project-controls/wbs-gantt" className="btn btn-primary">
        Go to Dashboard
      </Link>
    </div>
  );
}

