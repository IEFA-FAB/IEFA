// packages/auth/src/model/redirect.ts
import { resolveAuthConfig } from "../config";

function getSafeSessionStorage(): Storage | null {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.sessionStorage !== "undefined"
    ) {
      return window.sessionStorage;
    }
  } catch {}
  return null;
}

export function getRedirectCandidates(
  locationSearch: string,
  locationState: any | undefined,
  redirectKey: string
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
  fallback = "/"
): string {
  if (!target) return fallback;
  let decoded = target;
  try {
    decoded = decodeURIComponent(target);
  } catch {}
  if (decoded.startsWith("/") && !decoded.startsWith("//")) {
    return decoded;
  }
  return fallback;
}

export function preserveRedirectFromQuery(
  locationSearch: string,
  redirectKey: string
) {
  const params = new URLSearchParams(locationSearch || "");
  const qsRedirect = params.get("redirectTo");
  if (qsRedirect) {
    const ss = getSafeSessionStorage();
    ss?.setItem(redirectKey, qsRedirect);
  }
}

// Ajuda a resolver defaultRedirect da config:
export function resolveTarget(
  locationSearch: string,
  locationState: any | undefined,
  defaultRedirect: string,
  redirectKey: string
) {
  const { qsTarget, stateTarget, stored } = getRedirectCandidates(
    locationSearch,
    locationState,
    redirectKey
  );
  const target = safeRedirect(
    qsTarget ?? stored ?? stateTarget,
    defaultRedirect
  );
  return { target, stored };
}
