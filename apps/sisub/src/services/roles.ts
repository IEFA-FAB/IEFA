// ~/services/roles.ts
import { useQuery } from "@tanstack/react-query"
// ou reutilize sua função existente:
import { checkUserLevel } from "@/services/AdminService"

export type Role = "superadmin" | "admin" | "fiscal" | "user"

export async function fetchUserRole(userId: string): Promise<Role> {
	// Se já existir "checkUserLevel", apenas use:
	const level = await checkUserLevel(userId)
	return (level as Role) ?? "user"
	// Alternativa (exemplo via tabela):
	// const { data, error } = await supabase
	//   .from("user_roles")
	//   .select("role")
	//   .eq("user_id", userId)
	//   .maybeSingle();
	// if (error) throw error;
	// return (data?.role as Role) ?? "user";
}

export function useUserRole(userId?: string) {
	return useQuery({
		queryKey: ["user-role", userId],
		queryFn: () => fetchUserRole(userId || ""),
		enabled: !!userId,
		staleTime: 5 * 60_000,
		gcTime: 10 * 60_000,
	})
}
