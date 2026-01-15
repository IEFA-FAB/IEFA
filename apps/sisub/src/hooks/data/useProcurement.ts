import { useQuery } from "@tanstack/react-query";
import {
	type ProcurementParams,
	procurementNeedsQueryOptions,
} from "@/services/ProcurementService";

/**
 * Hook para buscar necessidades de compra
 *
 * Calcula lista de compras baseada em cardápios planejados no período
 * Usa client-side aggregation - pode ser lento para muitos cardápios
 *
 * @param params Período e kitchen (opcional)
 * @returns Lista de produtos com quantidades necessárias, erro, e função refetch
 *
 * @example
 * ```tsx
 * const { needs, error, refetch } = useProcurement({
 *   startDate: '2026-01-15',
 *   endDate: '2026-01-22',
 *   kitchenId: 1
 * });
 * ```
 */
export function useProcurement(params: ProcurementParams) {
	const query = useQuery(procurementNeedsQueryOptions(params));

	return {
		needs: query.data ?? [],
		error: query.error,
		refetch: query.refetch,
		isLoading: query.isLoading,
	};
}
