

const nextConfig = {
  output: 'standalone',

  // Ensure pg (PostgreSQL) native module works in API routes
  serverExternalPackages: ['pg'],

  async redirects() {
    return [
      { source: '/project-controls/project-health', destination: '/project-controls/project-plans', permanent: true },
      { source: '/insights/snapshots-variance', destination: '/insights/overview', permanent: false },
      { source: '/insights/hours', destination: '/insights/tasks', permanent: false },
      { source: '/insights/milestones', destination: '/insights/overview', permanent: false },
      { source: '/insights/qc-dashboard', destination: '/insights/tasks', permanent: false },
      { source: '/project-management/backlog', destination: '/project-management/sprint', permanent: false },
      { source: '/project-management/boards', destination: '/project-management/sprint', permanent: false },
      { source: '/project-controls/resource-leveling', destination: '/project-controls/resourcing', permanent: false },
      { source: '/project-management/sprint/capacity', destination: '/project-management/sprint', permanent: false },
      { source: '/project-management/sprint/iterations', destination: '/project-management/sprint', permanent: false },
    ];
  },

  // Performance optimizations
  compress: true,

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

export default nextConfig;
