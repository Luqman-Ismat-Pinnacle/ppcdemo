

const nextConfig = {
  output: 'standalone',

  // Ensure pg (PostgreSQL) native module works in API routes
  serverExternalPackages: ['pg'],

  async redirects() {
    return [
      { source: '/project-controls/project-health', destination: '/project-controls/folders', permanent: true },
      { source: '/insights/snapshots-variance', destination: '/insights/overview', permanent: false },
    ];
  },

  // Performance optimizations
  compress: true,

  // Ignore build errors for demo deployment
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

export default nextConfig;
