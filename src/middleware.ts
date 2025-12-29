import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'laundromat-secret-key-2024');
const AUTH_COOKIE_NAME = 'auth-token';

// Public paths that don't require authentication
const publicPaths = [
  '/login',
  '/api/auth/login',
  '/api/health',
];

// API paths that should return JSON errors
const apiPaths = ['/api/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') // Static files with extensions
  ) {
    return NextResponse.next();
  }

  // Get the auth token from cookies
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    // For API routes, return 401 JSON response
    if (apiPaths.some(path => pathname.startsWith(path))) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    // For pages, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // Verify the token
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Add user info to headers for use in API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId as string);
    requestHeaders.set('x-user-email', payload.email as string);
    requestHeaders.set('x-user-role', payload.role as string);
    requestHeaders.set('x-user-name', `${payload.firstName} ${payload.lastName}`);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    // Token is invalid or expired
    if (apiPaths.some(path => pathname.startsWith(path))) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 403 }
      );
    }
    // For pages, redirect to login
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*$).*)',
  ],
};
