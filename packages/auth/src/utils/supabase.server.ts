// packages/auth/src/utils/supabase.server.ts
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
  type CookieMethodsServer,
} from "@supabase/ssr";

export function createSupabaseServerClient(
  request: Request,
  setCookieHeaders: Headers
) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  const cookieHeader = request.headers.get("Cookie") ?? "";

  return createServerClient(url, anon, {
    cookies: {
      getAll(): { name: string; value: string }[] {
        // keep only cookies that have a defined value and ensure value is string
        return parseCookieHeader(cookieHeader)
          .filter((c): c is { name: string; value: string } => c.value !== undefined)
          .map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          setCookieHeaders.append(
            "Set-Cookie",
            serializeCookieHeader(name, value, options as CookieOptions)
          );
        });
      },
    } as CookieMethodsServer,
  });
}
