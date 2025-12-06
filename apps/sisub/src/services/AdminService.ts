// adminService.ts
import {
	type QueryClient,
	type UseQueryOptions,
	useQuery,
} from "@tanstack/react-query";
import supabase from "@/utils/supabase";

export type UserLevel = "user" | "admin" | "superadmin";
export type UserLevelOrNull = UserLevel | null;
export type UserOm = string | null;

export type AdminProfile = {
	role: UserLevelOrNull;
	om: UserOm;
};

// Query Keys centralizados
export const QUERY_KEYS = {
	admin: {
		profile: (userId: string | null | undefined) =>
			["admin", "profile", userId ?? null] as const,
	},
} as const;

// Sanitizador para garantir o tipo
function sanitizeRole(input: unknown): UserLevelOrNull {
	return input === "admin" || input === "superadmin" || input === "user"
		? input
		: null;
}

// Fetcher único (role + om)
export async function fetchAdminProfile(
	userId: string,
): Promise<AdminProfile | null> {
	const { data, error } = await supabase
		.from("profiles_admin")
		.select("role, om")
		.eq("id", userId)
		.maybeSingle();

	if (error) {
		// Lançamos erro para o React Query tratar como isError
		throw new Error(error.message || "Erro ao buscar perfil admin");
	}
	if (!data) return null;

	return {
		role: sanitizeRole(data.role),
		om: data.om ?? null,
	};
}

/**
  Hook base: traz role e om juntos.
  - enabled: apenas quando há userId
  - staleTime: 10 minutos (role/om mudam pouco)
  - gcTime: 30 minutos
  - refetchOnWindowFocus: false (evita chamadas desnecessárias)
*/
export function useAdminProfile<TData = AdminProfile | null>(
	userId: string | null | undefined,
	options?: Omit<
		UseQueryOptions<AdminProfile | null, Error, TData>,
		"queryKey" | "queryFn"
	>,
) {
	return useQuery<AdminProfile | null, Error, TData>({
		queryKey: QUERY_KEYS.admin.profile(userId),
		queryFn: () => (userId ? fetchAdminProfile(userId) : Promise.resolve(null)),
		enabled: !!userId,
		staleTime: 10 * 60 * 1000,
		gcTime: 30 * 60 * 1000,
		refetchOnWindowFocus: false,
		...options,
	});
}

// Hooks derivados com select (reutilizam o mesmo cache do perfil)
export function useUserLevel(
	userId: string | null | undefined,
	options?: Omit<
		UseQueryOptions<AdminProfile | null, Error, UserLevelOrNull>,
		"queryKey" | "queryFn" | "select"
	>,
) {
	return useAdminProfile<UserLevelOrNull>(userId, {
		select: (data) => data?.role ?? null,
		...options,
	});
}

export function useUserOm(
	userId: string | null | undefined,
	options?: Omit<
		UseQueryOptions<AdminProfile | null, Error, UserOm>,
		"queryKey" | "queryFn" | "select"
	>,
) {
	return useAdminProfile<UserOm>(userId, {
		select: (data) => data?.om ?? null,
		...options,
	});
}

// Helpers para SSR/prefetch (Remix/Next) e invalidation
export function prefetchAdminProfile(qc: QueryClient, userId: string) {
	return qc.prefetchQuery({
		queryKey: QUERY_KEYS.admin.profile(userId),
		queryFn: () => fetchAdminProfile(userId),
		staleTime: 10 * 60 * 1000,
	});
}

export function invalidateAdminProfile(qc: QueryClient, userId: string) {
	return qc.invalidateQueries({ queryKey: QUERY_KEYS.admin.profile(userId) });
}

/* Compat: wrappers assíncronos (para uso fora de React)
   Observação: como estes não usam cache do React Query, prefira os hooks acima em componentes. */
export async function checkUserLevel(
	userId: string | null | undefined,
): Promise<UserLevelOrNull> {
	if (!userId) return null;
	try {
		const profile = await fetchAdminProfile(userId);
		return profile?.role ?? null;
	} catch (e) {
		console.error("Erro ao verificar o nível de admin:", e);
		return null;
	}
}

export async function checkUserOm(
	userId: string | null | undefined,
): Promise<UserOm> {
	if (!userId) return null;
	try {
		const profile = await fetchAdminProfile(userId);
		return profile?.om ?? null;
	} catch (e) {
		console.error("Erro ao verificar OM do usuário:", e);
		return null;
	}
}
