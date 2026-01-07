import { Navigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/auth/useAuth";
import { useUserLevel } from "@/services/AdminService";
import type { UserLevelOrNull } from "@/types/domain";

interface RoleGuardProps {
	requireAny: NonNullable<UserLevelOrNull>[];
	redirectTo?: string;
	children: React.ReactNode;
}

export function RoleGuard({
	requireAny,
	redirectTo = "/forecast",
	children,
}: RoleGuardProps) {
	const location = useLocation();
	const { user } = useAuth();
	const { data: level, isError } = useUserLevel(user?.id);

	// Não autenticado => mandar para login com redirect back
	if (!user) {
		const to = `${location.pathname}${location.search}`;
		return <Navigate to="/auth" search={{ redirect: to }} replace />;
	}

	// Em erro ou sem perfil na tabela => tratar como sem acesso
	const effectiveLevel: UserLevelOrNull = isError ? null : (level ?? null);

	const allowed = !!effectiveLevel && requireAny.includes(effectiveLevel);
	if (!allowed) {
		return <Navigate to={redirectTo} replace />;
	}

	return <>{children}</>;
}
