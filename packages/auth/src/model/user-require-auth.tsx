// packages/auth/src/model/use-require-auth.ts
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { resolveAuthConfig } from "../config";
import { useAuth } from "./auth-provider";
import { getRedirectTo, safeRedirect } from "./redirect";

export const useRequireAuth = (overrides?: Parameters<typeof resolveAuthConfig>[0]) => {
    const cfg = resolveAuthConfig(overrides);
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const isPublic = cfg.publicPaths.some((p) => {
            if (typeof p === "string") return location.pathname === p || location.pathname.startsWith(p);
            if (p instanceof RegExp) return p.test(location.pathname);
            if (typeof p === "function") return p(location.pathname);
            return false;
        });
        if (!isLoading && !isAuthenticated && !isPublic) {
            const target = safeRedirect(getRedirectTo(location.search, location.state), cfg.defaultRedirect);
            navigate(`${cfg.loginPath}?redirectTo=${encodeURIComponent(target)}`, {
                replace: true,
            });
        }
    }, [cfg, isAuthenticated, isLoading, location.pathname, location.search, location.state, navigate]);

    return { isAuthenticated, isLoading };
};
