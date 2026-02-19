'use client';


import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    // Redirect to WBS Gantt as the home/landing page
    router.push('/project-controls/wbs-gantt');
  }, [router]);

  return <main className="main-content" />;
}
