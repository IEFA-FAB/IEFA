import type { PolicyStatementInput } from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/lib/query-keys"
import {
	addPolicyStatementFn,
	attachPolicyFn,
	createPolicyFn,
	deletePolicyFn,
	detachPolicyFn,
	fetchEffectivePermissionsFn,
	fetchPoliciesFn,
	fetchPolicyFn,
	fetchUserPoliciesFn,
	removePolicyStatementFn,
	updatePolicyFn,
	updatePolicyStatementFn,
} from "@/server/policies.fn"

export function usePolicies() {
	return useQuery({
		queryKey: queryKeys.policies.all(),
		queryFn: () => fetchPoliciesFn({ data: {} }),
	})
}

export function usePolicy(policyId: string | null) {
	return useQuery({
		queryKey: queryKeys.policies.detail(policyId),
		queryFn: () => fetchPolicyFn({ data: { policyId: policyId as string } }),
		enabled: !!policyId,
	})
}

export function useUserPolicies(userId: string | null) {
	return useQuery({
		queryKey: queryKeys.policies.ofUser(userId),
		queryFn: () => fetchUserPoliciesFn({ data: { userId: userId as string } }),
		enabled: !!userId,
	})
}

/** Permissões efetivas com a origem de cada uma — a resposta canônica do console. */
export function useEffectivePermissions(userId: string | null) {
	return useQuery({
		queryKey: queryKeys.policies.effective(userId),
		queryFn: () => fetchEffectivePermissionsFn({ data: { userId: userId as string } }),
		enabled: !!userId,
	})
}

/** Invalida tudo que depende de uma política — inclusive o efetivo de quem a tem anexada. */
function usePolicyInvalidation() {
	const queryClient = useQueryClient()
	return () => {
		queryClient.invalidateQueries({ queryKey: queryKeys.policies.all() })
		// Prefixo: pega detail, ofUser e effective de qualquer usuário.
		queryClient.invalidateQueries({ queryKey: ["policies"] })
		queryClient.invalidateQueries({ queryKey: ["userPermissions"] })
	}
}

export function useCreatePolicy() {
	const invalidate = usePolicyInvalidation()
	return useMutation({
		mutationFn: (data: { name: string; description?: string | null }) => createPolicyFn({ data }),
		onSuccess: (policy) => {
			toast.success(`Política "${policy.name}" criada`)
			invalidate()
		},
		onError: (error: Error) => toast.error("Erro ao criar política", { description: error.message }),
	})
}

export function useUpdatePolicy() {
	const invalidate = usePolicyInvalidation()
	return useMutation({
		mutationFn: (data: { policyId: string; name?: string; description?: string | null }) => updatePolicyFn({ data }),
		onSuccess: () => {
			toast.success("Política atualizada")
			invalidate()
		},
		onError: (error: Error) => toast.error("Erro ao atualizar política", { description: error.message }),
	})
}

export function useDeletePolicy() {
	const invalidate = usePolicyInvalidation()
	return useMutation({
		mutationFn: (policyId: string) => deletePolicyFn({ data: { policyId } }),
		onSuccess: () => {
			toast.success("Política removida")
			invalidate()
		},
		onError: (error: Error) => toast.error("Erro ao remover política", { description: error.message }),
	})
}

export function useAddPolicyStatement() {
	const invalidate = usePolicyInvalidation()
	return useMutation({
		mutationFn: (data: { policyId: string; statement: PolicyStatementInput }) => addPolicyStatementFn({ data }),
		onSuccess: () => {
			toast.success("Permissão adicionada à política")
			invalidate()
		},
		onError: (error: Error) => toast.error("Erro ao adicionar permissão", { description: error.message }),
	})
}

export function useUpdatePolicyStatement() {
	const invalidate = usePolicyInvalidation()
	return useMutation({
		mutationFn: (data: { statementId: string; statement: PolicyStatementInput }) => updatePolicyStatementFn({ data }),
		onSuccess: () => {
			toast.success("Permissão atualizada")
			invalidate()
		},
		onError: (error: Error) => toast.error("Erro ao atualizar permissão", { description: error.message }),
	})
}

export function useRemovePolicyStatement() {
	const invalidate = usePolicyInvalidation()
	return useMutation({
		mutationFn: (statementId: string) => removePolicyStatementFn({ data: { statementId } }),
		onSuccess: () => {
			toast.success("Permissão removida da política")
			invalidate()
		},
		onError: (error: Error) => toast.error("Erro ao remover permissão", { description: error.message }),
	})
}

export function useAttachPolicy() {
	const invalidate = usePolicyInvalidation()
	return useMutation({
		mutationFn: (data: { userId: string; policyId: string }) => attachPolicyFn({ data }),
		onSuccess: () => {
			toast.success("Política anexada")
			invalidate()
		},
		onError: (error: Error) => toast.error("Erro ao anexar política", { description: error.message }),
	})
}

export function useDetachPolicy() {
	const invalidate = usePolicyInvalidation()
	return useMutation({
		mutationFn: (data: { userId: string; policyId: string }) => detachPolicyFn({ data }),
		onSuccess: () => {
			toast.success("Política desanexada")
			invalidate()
		},
		onError: (error: Error) => toast.error("Erro ao desanexar política", { description: error.message }),
	})
}
