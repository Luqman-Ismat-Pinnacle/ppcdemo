'use client';


import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    // Redirect directly to overview, bypassing login
    router.push('/insights/overview');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--pinnacle-teal)] mx-auto"></div>
        <p className="mt-4 text-[var(--text-muted)]">Loading...</p>
      </div>
    </div>
  );
}
