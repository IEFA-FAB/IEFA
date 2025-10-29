// ~/auth/role-guard.tsx
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@iefa/auth";
import { useUserLevel, type UserLevelOrNull } from "~/services/AdminService";

function FullPageSpinner({
  label = "Verificando permissões...",
}: {
  label?: string;
}) {
  return (
    <div className="min-h-[100svh] supports-[height:100dvh]:min-h-[100dvh] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
        <p className="text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

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
  const { user, isLoading } = useAuth();
  const {
    data: level,
    isLoading: levelLoading,
    isError,
  } = useUserLevel(user?.id);

  // Autenticação ainda carregando OU nível ainda carregando
  if (isLoading || (user && levelLoading)) {
    return <FullPageSpinner />;
  }

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
