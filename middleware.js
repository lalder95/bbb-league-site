// middleware.js
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request) {
  // Get the pathname
  const path = request.nextUrl.pathname;
  
  // Public paths that don't require authentication
  const isPublicPath = path === '/login';
  
  // Admin paths
  const isAdminPath = path === '/admin' || path.startsWith('/admin/');
  
  // Get the token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  
  // If it's a public path and the user is logged in, redirect to callbackUrl (if present) or home page
  if (isPublicPath && token) {
    const cb = request.nextUrl.searchParams.get('callbackUrl');
    if (cb) {
      try {
        // Only allow same-origin redirects to avoid open-redirects
        const base = new URL(request.url);
        const url = cb.startsWith('http') ? new URL(cb) : new URL(cb, base);
        if (url.origin !== base.origin) throw new Error('cross-origin not allowed');
        return NextResponse.redirect(url);
      } catch {
        // Fallback to home on invalid URL
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
    return NextResponse.redirect(new URL('/', request.url));
  }
  
  // If it's not a public path and user isn't logged in, redirect to login
  if (!isPublicPath && !token) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the page the user tried to access so we can send them back after login
    const attempted = request.nextUrl.pathname + request.nextUrl.search;
    loginUrl.searchParams.set('callbackUrl', attempted);
    return NextResponse.redirect(loginUrl);
  }
  
  // If it's an admin path and user is not an admin, redirect to home
  if (isAdminPath && token?.role !== 'admin') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  
  // Otherwise, continue
  return NextResponse.next();
}

// See: https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};