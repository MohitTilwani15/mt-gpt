import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  const protectedRoutes = ['/'];
  const authRoutes = ['/login'];
  
  const sessionCookie = request.cookies.get('better-auth.session_token');
  const isLoggedIn = !!sessionCookie;
  
  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
  
  if (authRoutes.some(route => pathname.startsWith(route))) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login']
};
