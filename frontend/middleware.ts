import { NextResponse, type NextRequest } from "next/server";

const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /api/
`.trim();

const SECURITY_TXT = `Contact: https://claidex.com/contact
Expires: 2026-12-31T23:59:59.000Z
Preferred-Languages: en
`.trim();

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/robots.txt") {
    return new NextResponse(ROBOTS_TXT, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (pathname === "/.well-known/security.txt") {
    return new NextResponse(SECURITY_TXT, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = {
  matcher: [
    "/robots.txt",
    "/.well-known/security.txt",
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
