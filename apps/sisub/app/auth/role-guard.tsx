// ~/auth/role-guard.tsx
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@iefa/auth";
import { useUserLevel, type UserLevelOrNull } from "~/services/AdminService";

export function RoleGuard({
  requireAny,
  redirectTo = "/rancho",
  children,
}: {
  // Passe explicitamente os níveis permitidos em cada rota
  requireAny: Exclude<UserLevelOrNull, null>[];
  redirectTo?: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const { user } = useAuth();
  const {
    data: level,

    isError,
  } = useUserLevel(user?.id);

  // Não autenticado => mandar para login com redirect back
  if (!user) {
    const to = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?redirectTo=${to}`} replace />;
  }

  // Em erro ou sem perfil na tabela => tratar como sem acesso
  const effectiveLevel: UserLevelOrNull = isError ? null : (level ?? null);

  const allowed = !!effectiveLevel && requireAny.includes(effectiveLevel);
  if (!allowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
