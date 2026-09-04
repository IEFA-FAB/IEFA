/**
 * Hooks dos equipamentos: catálogo (papéis + modelos), parque da cozinha,
 * lista mínima da preparação e atendimento (a cozinha consegue produzir?).
 */

import type {
	CreateEquipmentModel,
	CreateEquipmentRole,
	CreateEquipmentUnit,
	CreateMaintenancePlan,
	LogMaintenance,
	ReportEquipmentIssue,
	SaveRecipeEquipment,
	UpdateEquipmentIssue,
	UpdateEquipmentModel,
	UpdateEquipmentUnit,
	UpdateMaintenancePlan,
} from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import {
	createEquipmentModelFn,
	createEquipmentRoleFn,
	createEquipmentUnitFn,
	createMaintenancePlanFn,
	deleteEquipmentModelFn,
	deleteEquipmentUnitFn,
	deleteMaintenancePlanFn,
	evaluateMenuEquipmentFitnessFn,
	evaluateRecipeEquipmentFitnessFn,
	fetchRecipeEquipmentFn,
	getFleetEquipmentReportFn,
	getKitchenEquipmentConditionFn,
	getKitchenMaintenanceMatrixFn,
	listApplicablePlansFn,
	listEquipmentIssuesFn,
	listEquipmentModelsFn,
	listEquipmentRolesFn,
	listKitchenEquipmentFn,
	listMaintenanceLogsFn,
	listMaintenancePlansFn,
	logMaintenanceFn,
	reportEquipmentIssueFn,
	saveRecipeEquipmentFn,
	setUtensilRoleFn,
	suggestRecipeEquipmentFromFlowFn,
	updateEquipmentIssueFn,
	updateEquipmentModelFn,
	updateEquipmentUnitFn,
	updateMaintenancePlanFn,
} from "@/server/equipment.fn"

const CATALOG_STALE_TIME = 5 * 60 * 1000

export function useEquipmentRoles(category?: string | null) {
	return useQuery({
		queryKey: queryKeys.equipment.roles(category),
		queryFn: () => listEquipmentRolesFn({ data: { category: (category ?? null) as never } }),
		staleTime: CATALOG_STALE_TIME,
	})
}

export function useEquipmentModels(kitchenId?: number | null, roleId?: string | null) {
	return useQuery({
		queryKey: queryKeys.equipment.models(kitchenId, roleId),
		queryFn: () => listEquipmentModelsFn({ data: { kitchenId: kitchenId ?? null, roleId: roleId ?? null } }),
		staleTime: CATALOG_STALE_TIME,
	})
}

export function useKitchenEquipment(kitchenId: number | undefined, includeInactive = false) {
	return useQuery({
		queryKey: queryKeys.equipment.kitchenUnits(kitchenId as number, includeInactive),
		queryFn: () => listKitchenEquipmentFn({ data: { kitchenId: kitchenId as number, includeInactive } }),
		enabled: kitchenId != null,
		staleTime: 60 * 1000,
	})
}

export function useRecipeEquipment(recipeId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.equipment.recipeRequirements(recipeId),
		queryFn: () => fetchRecipeEquipmentFn({ data: { recipeId: recipeId as string } }),
		enabled: !!recipeId,
		staleTime: 60 * 1000,
	})
}

/**
 * Atendimento da preparação numa cozinha. Só faz sentido com as duas pontas conhecidas.
 * `portions` opcional acrescenta bateladas e ciclos à resposta (pergunta de volume).
 */
export function useRecipeEquipmentFitness(recipeId: string | undefined, kitchenId: number | null | undefined, portions?: number | null) {
	return useQuery({
		queryKey: queryKeys.equipment.fitness(recipeId, kitchenId ?? null, portions ?? null),
		queryFn: () => evaluateRecipeEquipmentFitnessFn({ data: { recipeId: recipeId as string, kitchenId: kitchenId as number, portions: portions ?? null } }),
		enabled: !!recipeId && kitchenId != null,
		staleTime: 60 * 1000,
	})
}

/**
 * Atendimento da refeição inteira: as preparações do mesmo `daily_menu` disputam o parque.
 * É o que a tela da preparação não vê — cada ficha isolada "atende", o almoço não.
 */
export function useMenuEquipmentFitness(dailyMenuId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.equipment.menuFitness(dailyMenuId),
		queryFn: () => evaluateMenuEquipmentFitnessFn({ data: { dailyMenuId: dailyMenuId as string } }),
		enabled: !!dailyMenuId,
		staleTime: 60 * 1000,
	})
}

/** Sugestões de exigência derivadas do fluxo (etapas com utensílio mapeado a papel). */
export function useRecipeEquipmentSuggestions(recipeId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.equipment.suggestions(recipeId),
		queryFn: () => suggestRecipeEquipmentFromFlowFn({ data: { recipeId: recipeId as string } }),
		enabled: !!recipeId,
		staleTime: 60 * 1000,
	})
}

export function useSetUtensilRole() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: { utensilId: string; roleId: string | null }) => setUtensilRoleFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.recipeFlow.utensilsAll() })
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Utensílio mapeado")
		},
		onError: (error) => toast.error(`Erro ao mapear utensílio: ${error.message}`),
	})
}

export function useSaveRecipeEquipment(recipeId: string | undefined) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: SaveRecipeEquipment) => saveRecipeEquipmentFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.recipeRequirements(recipeId) })
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Equipamentos da preparação salvos")
		},
		onError: (error) => toast.error(`Erro ao salvar equipamentos: ${error.message}`),
	})
}

export function useCreateEquipmentUnit() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateEquipmentUnit) => createEquipmentUnitFn({ data }),
		onSuccess: () => {
			// Árvore inteira: o parque muda o atendimento da preparação E o do cardápio, e um
			// alerta que continua acusando falta já resolvida é pior que alerta nenhum.
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Equipamento cadastrado")
		},
		onError: (error) => toast.error(`Erro ao cadastrar equipamento: ${error.message}`),
	})
}

export function useUpdateEquipmentUnit() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: UpdateEquipmentUnit) => updateEquipmentUnitFn({ data }),
		onSuccess: () => {
			// Árvore inteira: o parque muda o atendimento da preparação E o do cardápio, e um
			// alerta que continua acusando falta já resolvida é pior que alerta nenhum.
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Equipamento atualizado")
		},
		onError: (error) => toast.error(`Erro ao atualizar equipamento: ${error.message}`),
	})
}

export function useDeleteEquipmentUnit() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (unitId: string) => deleteEquipmentUnitFn({ data: { unitId } }),
		onSuccess: () => {
			// Árvore inteira: o parque muda o atendimento da preparação E o do cardápio, e um
			// alerta que continua acusando falta já resolvida é pior que alerta nenhum.
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Equipamento removido")
		},
		onError: (error) => toast.error(`Erro ao remover equipamento: ${error.message}`),
	})
}

export function useCreateEquipmentModel() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateEquipmentModel) => createEquipmentModelFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Modelo cadastrado")
		},
		onError: (error) => toast.error(`Erro ao cadastrar modelo: ${error.message}`),
	})
}

export function useUpdateEquipmentModel() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: UpdateEquipmentModel) => updateEquipmentModelFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Modelo atualizado")
		},
		onError: (error) => toast.error(`Erro ao atualizar modelo: ${error.message}`),
	})
}

export function useDeleteEquipmentModel() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (modelId: string) => deleteEquipmentModelFn({ data: { modelId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Modelo removido")
		},
		onError: (error) => toast.error(`Erro ao remover modelo: ${error.message}`),
	})
}

export function useCreateEquipmentRole() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateEquipmentRole) => createEquipmentRoleFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Papel cadastrado")
		},
		onError: (error) => toast.error(`Erro ao cadastrar papel: ${error.message}`),
	})
}

// ── Condição e manutenção ─────────────────────────────────────────────────

export function useEquipmentIssues(kitchenId: number | undefined, onlyOpen = true) {
	return useQuery({
		queryKey: queryKeys.equipment.issues(kitchenId, onlyOpen),
		queryFn: () => listEquipmentIssuesFn({ data: { kitchenId: kitchenId as number, unitId: null, onlyOpen, limit: 100 } }),
		enabled: kitchenId != null,
		staleTime: 30 * 1000,
	})
}

export function useKitchenEquipmentCondition(kitchenId: number | undefined) {
	return useQuery({
		queryKey: queryKeys.equipment.condition(kitchenId),
		queryFn: () => getKitchenEquipmentConditionFn({ data: { kitchenId: kitchenId as number, historyLimit: 20 } }),
		enabled: kitchenId != null,
		staleTime: 30 * 1000,
	})
}

export function useKitchenMaintenanceMatrix(kitchenId: number | undefined) {
	return useQuery({
		queryKey: queryKeys.equipment.matrix(kitchenId),
		queryFn: () => getKitchenMaintenanceMatrixFn({ data: { kitchenId: kitchenId as number, today: null } }),
		enabled: kitchenId != null,
		staleTime: 60 * 1000,
	})
}

export function useMaintenancePlans(kitchenId: number | null = null) {
	return useQuery({
		queryKey: queryKeys.equipment.plans(kitchenId),
		queryFn: () => listMaintenancePlansFn({ data: { kitchenId, roleId: null, modelId: null } }),
		staleTime: 5 * 60 * 1000,
	})
}

export function useApplicablePlans(unitId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.equipment.applicablePlans(unitId),
		queryFn: () => listApplicablePlansFn({ data: { unitId: unitId as string } }),
		enabled: !!unitId,
		staleTime: 5 * 60 * 1000,
	})
}

export function useMaintenanceLogs(kitchenId: number | undefined, unitId: string | null = null) {
	return useQuery({
		queryKey: queryKeys.equipment.logs(kitchenId, unitId),
		queryFn: () => listMaintenanceLogsFn({ data: { kitchenId: kitchenId as number, unitId, planId: null, limit: 100 } }),
		enabled: kitchenId != null,
		staleTime: 60 * 1000,
	})
}

export function useFleetEquipmentReport(filters: { roleId?: string | null; modelId?: string | null; kitchenId?: number | null } = {}) {
	return useQuery({
		queryKey: queryKeys.equipment.fleet(filters),
		queryFn: () =>
			getFleetEquipmentReportFn({
				data: { roleId: filters.roleId ?? null, modelId: filters.modelId ?? null, kitchenId: filters.kitchenId ?? null, today: null },
			}),
		staleTime: 5 * 60 * 1000,
	})
}

/**
 * Relatar ou encerrar pane muda a CONDIÇÃO da unidade, e a condição decide quem entra no
 * cálculo de atendimento. Por isso a invalidação é da árvore inteira de equipamento: o parque,
 * o atendimento da preparação e o alerta do cardápio mudam todos com uma pane.
 */
export function useReportEquipmentIssue() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: ReportEquipmentIssue) => reportEquipmentIssueFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Pane registrada")
		},
		onError: (error) => toast.error(`Erro ao registrar pane: ${error.message}`),
	})
}

export function useUpdateEquipmentIssue() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: UpdateEquipmentIssue) => updateEquipmentIssueFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Pane atualizada")
		},
		onError: (error) => toast.error(`Erro ao atualizar pane: ${error.message}`),
	})
}

export function useLogMaintenance() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: LogMaintenance) => logMaintenanceFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Manutenção registrada")
		},
		onError: (error) => toast.error(`Erro ao registrar manutenção: ${error.message}`),
	})
}

export function useCreateMaintenancePlan() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: CreateMaintenancePlan) => createMaintenancePlanFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Rotina cadastrada")
		},
		onError: (error) => toast.error(`Erro ao cadastrar rotina: ${error.message}`),
	})
}

export function useUpdateMaintenancePlan() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (data: UpdateMaintenancePlan) => updateMaintenancePlanFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Rotina atualizada")
		},
		onError: (error) => toast.error(`Erro ao atualizar rotina: ${error.message}`),
	})
}

export function useDeleteMaintenancePlan() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (planId: string) => deleteMaintenancePlanFn({ data: { planId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all() })
			toast.success("Rotina removida")
		},
		onError: (error) => toast.error(`Erro ao remover rotina: ${error.message}`),
	})
}
