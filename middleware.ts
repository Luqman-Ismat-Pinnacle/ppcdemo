import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const legacyPcaRoutes: Record<string, string> = {
    '/wbs': '/pca/wbs',
    '/mapping': '/pca/mapping',
    '/project-plans': '/pca/project-plans',
    '/sprint': '/pca/sprint',
    '/forecast': '/pca/forecast',
    '/metric-provenance': '/pca/metric-provenance',
    '/data-management': '/pca/data-management',
    '/command-center': '/pca',
    '/overview': '/pca',
  };

  if (pathname === '/pcl/pcl' || pathname.startsWith('/pcl/pcl/')) {
    const nextPath = pathname.replace('/pcl/pcl', '/pcl') || '/pcl';
    const url = request.nextUrl.clone();
    url.pathname = nextPath;
    return NextResponse.redirect(url);
  }

  if (legacyPcaRoutes[pathname]) {
    const url = request.nextUrl.clone();
    url.pathname = legacyPcaRoutes[pathname];
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/pcl/pcl/:path*',
    '/wbs',
    '/mapping',
    '/project-plans',
    '/sprint',
    '/forecast',
    '/metric-provenance',
    '/data-management',
    '/command-center',
    '/overview',
  ],
};
