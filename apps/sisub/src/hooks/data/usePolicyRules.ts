import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { createPolicyRuleFn, deletePolicyRuleFn, fetchPolicyRulesFn, generateReviewPromptFn, updatePolicyRuleFn } from "@/server/policy.fn"
import type { PolicyRule, PolicyRuleInsert, PolicyRuleUpdate, PolicyTarget } from "@/types/domain/policy"

// ============================================================================
// Query Options
// ============================================================================

export const policyRulesQueryOptions = (target: PolicyTarget) =>
	queryOptions({
		queryKey: ["sisub", "policy-rules", target],
		queryFn: () => fetchPolicyRulesFn({ data: { target } }) as Promise<PolicyRule[]>,
		staleTime: 5 * 60 * 1000,
	})

export const reviewPromptQueryOptions = (target: PolicyTarget) =>
	queryOptions({
		queryKey: ["sisub", "policy-prompt", target],
		queryFn: () => generateReviewPromptFn({ data: { target } }) as Promise<string>,
		staleTime: 0,
		enabled: false,
	})

// ============================================================================
// Query Hooks
// ============================================================================

export function usePolicyRules(target: PolicyTarget) {
	return useQuery(policyRulesQueryOptions(target))
}

export function useReviewPrompt(target: PolicyTarget) {
	return useQuery(reviewPromptQueryOptions(target))
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useCreatePolicyRule() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (input: PolicyRuleInsert) => createPolicyRuleFn({ data: input }),
		onSuccess: (created) => {
			queryClient.invalidateQueries({ queryKey: ["sisub", "policy-rules", created.target] })
			toast.success("Regra criada com sucesso.")
		},
		onError: (error) => {
			toast.error("Erro ao criar regra", {
				description: error instanceof Error ? error.message : "Erro desconhecido",
			})
		},
	})
}

export function useUpdatePolicyRule() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (vars: { id: string; target: PolicyTarget; payload: PolicyRuleUpdate }) => updatePolicyRuleFn({ data: { id: vars.id, ...vars.payload } }),
		onSuccess: (_updated, { target }) => {
			queryClient.invalidateQueries({ queryKey: ["sisub", "policy-rules", target] })
			toast.success("Regra atualizada.")
		},
		onError: (error) => {
			toast.error("Erro ao atualizar regra", {
				description: error instanceof Error ? error.message : "Erro desconhecido",
			})
		},
	})
}

export function useDeletePolicyRule() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (vars: { id: string; target: PolicyTarget }) => deletePolicyRuleFn({ data: { id: vars.id } }),
		onSuccess: (_data, { target }) => {
			queryClient.invalidateQueries({ queryKey: ["sisub", "policy-rules", target] })
			toast.success("Regra removida.")
		},
		onError: (error) => {
			toast.error("Erro ao remover regra", {
				description: error instanceof Error ? error.message : "Erro desconhecido",
			})
		},
	})
}
