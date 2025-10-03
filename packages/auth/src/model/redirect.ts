// app/auth/redirect.ts

function getSafeSessionStorage(): Storage | null {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.sessionStorage !== "undefined"
    ) {
      return window.sessionStorage;
    }
  } catch {
    // Safari Private Mode ou políticas de bloqueio podem lançar erro
  }
  return null;
}

// Lê redirectTo de query, state e sessionStorage (seguro para SSR)
export function getRedirectCandidates(
  locationSearch: string,
  locationState?: any,
  redirectKey = "auth:redirectTo"
) {
  const params = new URLSearchParams(locationSearch || "");
  const qsTarget = params.get("redirectTo");
  const stateFrom = locationState?.from;
  const stateTarget =
    stateFrom && typeof stateFrom === "object"
      ? `${stateFrom.pathname ?? ""}${stateFrom.search ?? ""}`
      : locationState?.from?.pathname || null;

  const ss = getSafeSessionStorage();
  const stored = ss?.getItem(redirectKey) ?? null;

  return { qsTarget, stateTarget, stored };
}

export function getRedirectTo(
  locationSearch: string,
  locationState?: any
): string | null {
  const params = new URLSearchParams(locationSearch || "");
  const qsTarget = params.get("redirectTo");
  const stateTarget = locationState?.from?.pathname as string | undefined;
  return qsTarget ?? stateTarget ?? null;
}

export function safeRedirect(
  target: string | null | undefined,
  fallback = "/rancho"
): string {
  if (!target) return fallback;
  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    // mantém original
  }
  if (decoded.startsWith("/") && !decoded.startsWith("//")) {
    return decoded;
  }
  return fallback;
}

// Persiste o redirectTo quando estiver presente na query string (seguro para SSR)
export function preserveRedirectFromQuery(
  locationSearch: string,
  redirectKey = "auth:redirectTo"
) {
  const params = new URLSearchParams(locationSearch || "");
  const qsRedirect = params.get("redirectTo");
  if (qsRedirect) {
    const ss = getSafeSessionStorage();
    ss?.setItem(redirectKey, qsRedirect);
  }
}
