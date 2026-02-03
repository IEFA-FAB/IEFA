import type { PostgrestError } from "@supabase/supabase-js"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import supabase from "@/lib/supabase"
import type { EditUserPayload, NewUserPayload, ProfileAdmin } from "@/types/domain/admin"

export const ADMIN_PROFILES_KEY = ["admin", "profiles"]

export function useAdminProfiles() {
	return useQuery({
		queryKey: ADMIN_PROFILES_KEY,
		queryFn: async (): Promise<ProfileAdmin[]> => {
			const { data, error } = await supabase
				.from("profiles_admin")
				.select("*")
				.order("created_at", { ascending: false })

			if (error) {
				throw new Error(error.message || "Erro ao buscar perfis")
			}
			return data || []
		},
	})
}

export function useAddProfile() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (payload: NewUserPayload) => {
			const { error } = await supabase.from("profiles_admin").insert([
				{
					id: payload.id,
					email: payload.email,
					name: payload.name,
					saram: payload.saram,
					role: payload.role,
					om: payload.om,
				},
			])
			if (error) throw error
		},
		onSuccess: (_, variables) => {
			toast.success("Sucesso!", {
				description: `Usuário ${variables.email} adicionado.`,
			})
			queryClient.invalidateQueries({ queryKey: ADMIN_PROFILES_KEY })
		},
		onError: (error: PostgrestError) => {
			toast.error("Erro", {
				description: error?.message ?? "Ocorreu um erro ao salvar.",
			})
		},
	})
}

export function useUpdateProfile() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: EditUserPayload }) => {
			const { error } = await supabase
				.from("profiles_admin")
				.update({
					role: payload.role,
					saram: payload.saram || null,
					om: payload.om || null,
				})
				.eq("id", id)
			if (error) throw error
		},
		onSuccess: () => {
			toast.success("Sucesso!", {
				description: "Perfil atualizado.",
			})
			queryClient.invalidateQueries({ queryKey: ADMIN_PROFILES_KEY })
		},
		onError: (error: PostgrestError) => {
			toast.error("Erro ao atualizar", {
				description: error?.message ?? "Não foi possível atualizar o registro.",
			})
		},
	})
}

export function useDeleteProfile() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase.from("profiles_admin").delete().eq("id", id)
			if (error) throw error
		},
		onSuccess: () => {
			toast.success("Registro excluído", {
				description: "Usuário removido.",
			})
			queryClient.invalidateQueries({ queryKey: ADMIN_PROFILES_KEY })
		},
		onError: (error: PostgrestError) => {
			toast.error("Erro ao excluir", {
				description: error?.message ?? "Não foi possível excluir o registro.",
			})
		},
	})
}
