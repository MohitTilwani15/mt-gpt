import { NextRequest, NextResponse } from 'next/server';

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/auth/')) {
    const targetUrl = new URL(pathname, backendUrl);
    targetUrl.search = request.nextUrl.search;

    return NextResponse.rewrite(targetUrl);
  }
}

export const config = {
  matcher: ['/api/auth/:path*'],
};
