'use client';

import { useEffect } from 'react';
import { useUser } from '@/lib/user-context';

export default function RootPage() {
  const { user, isLoading } = useUser();

  useEffect(() => {
    if (isLoading || !user) return;
    const role = (user.role || '').trim();
    if (role === 'COO') {
      window.location.href = '/coo';
      return;
    }
    if (role === 'PCL') {
      window.location.href = '/pcl';
      return;
    }
    if (role === 'Senior Manager' || role === 'SM') {
      window.location.href = '/senior-manager';
      return;
    }
    if (role === 'Project Lead' || role === 'PL') {
      window.location.href = '/project-lead';
      return;
    }
    window.location.href = '/pca';
  }, [user, isLoading]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading...</p>
      </div>
    </div>
  );
}
