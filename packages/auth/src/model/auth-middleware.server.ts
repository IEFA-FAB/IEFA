// packages/auth/src/model/auth-middleware.ts
import { redirect } from "react-router";
import type { User } from "@supabase/supabase-js";
import { userContext, userMetaContext } from "./context";
import { createSupabaseServerClient } from "../utils/supabase.server";
import { resolveAuthConfig, type AuthConfig, type PublicPath } from "../config";

/**
 * Normaliza o pathname:
 * - garante barra inicial
 * - remove barra final (exceto "/")
 * - colapsa barras duplicadas
 */
const normalizePathname = (pathname: string): string => {
  if (!pathname) return "/";
  let p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
};

/**
 * Garante que o prefixo é correspondente a um segmento de rota completo.
 * Evita "/app" casar com "/apple".
 */
const startsWithSegment = (pathname: string, prefix: string): boolean => {
  if (prefix === "/") return true;
  if (pathname === prefix) return true;
  if (!pathname.startsWith(prefix)) return false;
  const nextChar = pathname.charAt(prefix.length);
  return nextChar === "/" || nextChar === "";
};

function makeIsPublic(publicPaths: PublicPath[]) {
  // Normaliza strings; mantém RegExp e funções como estão
  const compiled = publicPaths.map((pub) =>
    typeof pub === "string" ? normalizePathname(pub) : pub
  );

  return (pathname: string): boolean => {
    const path = normalizePathname(pathname);
    return compiled.some((pub) => {
      if (typeof pub === "string") {
        return startsWithSegment(path, pub);
      }
      if (pub instanceof RegExp) {
        return pub.test(path);
      }
      if (typeof pub === "function") {
        return Boolean(pub(path));
      }
      return false;
    });
  };
}

export function makeAuthMiddleware(
  configOverrides: AuthConfig = {}
): (args: { request: Request; context: any }, next: () => Promise<Response>) => Promise<Response> {
  const config = resolveAuthConfig(configOverrides);

  // Garante que a página de login é pública (evita loop de redirect)
  const publicPaths: PublicPath[] = Array.from(
    new Set<PublicPath>([...(config.publicPaths ?? []), config.loginPath])
  );

  const isPublic = makeIsPublic(publicPaths);

  return async ({ request, context }, next) => {
    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname);

    if (isPublic(pathname)) {
      // Rota pública: segue a cadeia
      return next();
    }

    // Coletor de Set-Cookie para o Supabase
    const setCookieHeaders = new Headers();
    const supabase = createSupabaseServerClient(request, setCookieHeaders);

    const { data, error } = await supabase.auth.getUser();
    const user: User | null = data?.user ?? null;

    if (error || !user) {
      const redirectTo = encodeURIComponent(pathname + url.search);
      throw redirect(`${config.loginPath}?redirectTo=${redirectTo}`);
    }

    // Usuário autenticado: injeta contexts
    context.set(userContext, user);

    // Injeta metadados do usuário (se configurado)
    if (typeof config.fetchUserMeta === "function") {
      try {
        const meta = await config.fetchUserMeta(user);
        context.set(userMetaContext, (meta ?? {}) as Record<string, unknown>);
      } catch {
        // Falha silenciosa: mantém só o user
        context.set(userMetaContext, {});
      }
    }

    // Executa cadeia
    const response = await next();

    // Reanexa APENAS cabeçalhos Set-Cookie produzidos pelo Supabase
    setCookieHeaders.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        response.headers.append("set-cookie", value);
      }
    });

    return response;
  };
}
