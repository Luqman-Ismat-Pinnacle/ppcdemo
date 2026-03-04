import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
};

export default nextConfig;
