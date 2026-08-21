import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseCredentials, isAdminEmail } from "@/lib/env";
import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED_PREFIXES = ["/app", "/admin", "/onboarding"];
const AUTH_PAGES = ["/login", "/signup"];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Sin credenciales de Supabase la app corre en modo vitrina: no hay sesión
  // que refrescar y no tiene caso mandar a nadie a /login en bucle.
  if (!hasSupabaseCredentials()) return NextResponse.next();

  const { response, user } = await updateSession(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // /admin/* es solo para los emails de ADMIN_EMAILS.
  if (pathname.startsWith("/admin") && user && !isAdminEmail(user.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Ya autenticado: /login y /signup no tienen nada que ofrecer.
  if (AUTH_PAGES.includes(pathname) && user) {
    const url = request.nextUrl.clone();
    url.pathname = isAdminEmail(user.email) ? "/admin" : "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo menos estáticos, el service worker y el manifest, para no gastar
     * una llamada a Supabase en cada icono.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|robots.txt).*)",
  ],
};
