import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "sf_uid";

export default function middleware(req: NextRequest) {
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  if (existing) return NextResponse.next();

  // First visit — generate a session ID and set it as a cookie
  const uid = crypto.randomUUID();
  const res = NextResponse.next();
  res.cookies.set(COOKIE_NAME, uid, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
