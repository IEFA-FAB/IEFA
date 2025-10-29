// apps/sisub/app/components/auth/protected-boundary.tsx
import { Navigate, useLocation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@iefa/auth";

export function ProtectedBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, isLoading, refreshSession } = useAuth();

  // tentativa de recuperar sessão (uma vez)
  const attemptedRecoveryRef = useRef(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (isLoading || user || attemptedRecoveryRef.current) return;
    attemptedRecoveryRef.current = true;
    setRecovering(true);

    (async () => {
      try {
        await refreshSession().catch(() => {});
        await new Promise((r) => setTimeout(r, 50));
      } finally {
        setRecovering(false);
      }
    })();
  }, [isLoading, user, refreshSession]);

  if (isLoading || recovering) {
    return (
      <div className="min-h-[100svh] supports-[height:100dvh]:min-h-[100dvh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    const redirectTo = encodeURIComponent(
      `${location.pathname}${location.search}`
    );
    return <Navigate to={`/login?redirectTo=${redirectTo}`} replace />;
  }

  return <>{children}</>;
}
