// src/hooks/useFiscalOps.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import supabase from "@/lib/supabase"
import type { FiscalFilters } from "@/types/domain"

// QUERIES KEYS
const opsKeys = {
	messHallId: (code: string) => ["messHallId", code] as const,
	othersCount: (date: string, meal: string, messHallId: number) =>
		["othersCount", date, meal, messHallId] as const,
}

// ============================================================================
// RESOLVE MESS HALL
// ============================================================================
async function fetchMessHallId(code: string): Promise<number | null> {
	if (!code) return null
	const { data, error } = await supabase
		.schema("sisub")
		.from("mess_halls")
		.select("id")
		.eq("code", code)
		.maybeSingle()

	if (error) throw error
	return data?.id ?? null
}

export function useMessHallId(unitCode: string) {
	return useQuery({
		queryKey: opsKeys.messHallId(unitCode),
		queryFn: () => fetchMessHallId(unitCode),
		staleTime: Infinity, // IDs don't change often
		enabled: !!unitCode,
	})
}

// ============================================================================
// OTHERS PRESENCE
// ============================================================================
export function useOtherPresencesCount(filters: FiscalFilters) {
	const { data: messHallId } = useMessHallId(filters.unit)

	return useQuery({
		queryKey: opsKeys.othersCount(filters.date, filters.meal, messHallId ?? 0),
		queryFn: async () => {
			if (!messHallId) return 0
			const { count, error } = await supabase
				.schema("sisub")
				.from("other_presences")
				.select("*", { count: "exact", head: true })
				.eq("date", filters.date)
				.eq("meal", filters.meal)
				.eq("mess_hall_id", messHallId)

			if (error) throw error
			return count ?? 0
		},
		enabled: !!filters.date && !!filters.meal && !!messHallId,
	})
}

export function useAddOtherPresence() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({ filters, adminId }: { filters: FiscalFilters; adminId: string }) => {
			const messHallId = await fetchMessHallId(filters.unit)
			if (!messHallId) throw new Error("Unidade inválida")

			const { error } = await supabase.schema("sisub").from("other_presences").insert({
				admin_id: adminId,
				date: filters.date,
				meal: filters.meal,
				mess_hall_id: messHallId,
			})

			if (error) throw error
			return messHallId // return for invalidation context if needed
		},
		onSuccess: (_, { filters }) => {
			// Não temos o ID aqui fácil sem refazer a query, mas podemos invalidar tudo
			// Melhor seria invalidar apenas com os dados que temos.
			// Como useOtherPresencesCount depende de (date, meal, messHallId),
			// precisamos re-resolver ou invalidar de forma mais ampla se não quisermos esperar.
			// Para simplificar, invalidamos 'othersCount' geral ou precisamos do ID.
			// O hook useOtherPresencesCount se atualizará se invalidarmos a chave certa.

			// Vamos invalidar todas as contagens para esta data/refeição para garantir
			queryClient.invalidateQueries({
				queryKey: ["othersCount"],
			})

			toast.success("Outro registrado", {
				description: "Entrada sem cadastro adicionada com sucesso.",
			})
		},
		onError: (error) => {
			console.error("Erro ao registrar Outros:", error)
			toast.error("Erro", {
				description: "Não foi possível registrar a entrada.",
			})
		},
	})
}

// ============================================================================
// SCAN PROCESSING
// ============================================================================
export function useScanProcessor() {
	const processScan = async (
		uuid: string,
		filters: FiscalFilters
	): Promise<{ systemForecast: boolean | null; displayWidth?: string }> => {
		const messHallId = await fetchMessHallId(filters.unit)
		let systemForecast: boolean | null = null

		if (messHallId) {
			const { data: forecast, error } = await supabase
				.schema("sisub")
				.from("meal_forecasts")
				.select("will_eat")
				.eq("user_id", uuid)
				.eq("date", filters.date)
				.eq("meal", filters.meal)
				.eq("mess_hall_id", messHallId)
				.maybeSingle()

			if (!error && forecast) {
				systemForecast = !!forecast.will_eat
			}
		}

		return { systemForecast }
	}

	return { processScan }
}
