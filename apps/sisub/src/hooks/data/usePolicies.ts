import type { PolicyStatementInput } from "@iefa/sisub-domain"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { useAssuredMutation } from "@/hooks/auth/useAssuredMutation"
import { isElevationCancelled } from "@/lib/assurance/assurance-error"
import { queryKeys } from "@/lib/query-keys"
import {
	addPolicyStatementFn,
	attachPolicyFn,
	createPolicyFn,
	deletePolicyFn,
	detachPolicyFn,
	fetchEffectivePermissionsFn,
	fetchManagedPolicyFn,
	fetchPoliciesFn,
	fetchPolicyFn,
	fetchPolicyMembersFn,
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

/** Nome da política gerenciada que define o ambiente de treino (seeded por migration). */
export const TRAINING_POLICY_NAME = "Conjunto Treino"

/** A política de treino, resolvida pelo nome — o id é gerado por migration e varia por ambiente. */
export function useTrainingPolicy() {
	return useQuery({
		queryKey: queryKeys.policies.managed(TRAINING_POLICY_NAME),
		queryFn: () => fetchManagedPolicyFn({ data: { name: TRAINING_POLICY_NAME } }),
	})
}

/**
 * Quem tem a política anexada — a turma.
 *
 * `enabled` porque a operação exige `global:2`, como todas as de política: membership é
 * dado de acesso. Telas visíveis em `global:1` precisam pular a busca em vez de disparar
 * uma query que vai falhar.
 */
export function usePolicyMembers(policyId: string | null, options?: { enabled?: boolean; includeExpired?: boolean }) {
	const includeExpired = options?.includeExpired ?? false
	return useQuery({
		queryKey: queryKeys.policies.members(policyId, includeExpired),
		queryFn: () => fetchPolicyMembersFn({ data: { policyId: policyId as string, includeExpired } }),
		enabled: !!policyId && (options?.enabled ?? true),
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

/**
 * `onError` das mutações de política, com a desistência tratada como desistência.
 *
 * As oito mutações deste arquivo são classificadas como `"fresh"` no registro de garantia
 * (`admin` nível 2): quando o piso subir, fechar o modal de elevação chega aqui como
 * `ElevationCancelledError`. Um toast vermelho de "erro ao criar política" depois de um
 * cancelamento deliberado manda a pessoa procurar um problema que ela mesma acabou de
 * decidir não ter.
 */
function reportPolicyError(title: string) {
	return (error: Error) => {
		if (isElevationCancelled(error)) return
		toast.error(title, { description: error.message })
	}
}

export function useCreatePolicy() {
	const invalidate = usePolicyInvalidation()
	return useAssuredMutation({
		mutationFn: (data: { name: string; description?: string | null }) => createPolicyFn({ data }),
		onSuccess: (policy) => {
			toast.success(`Política "${policy.name}" criada`)
			invalidate()
		},
		onError: reportPolicyError("Erro ao criar política"),
	})
}

export function useUpdatePolicy() {
	const invalidate = usePolicyInvalidation()
	return useAssuredMutation({
		mutationFn: (data: { policyId: string; name?: string; description?: string | null }) => updatePolicyFn({ data }),
		onSuccess: () => {
			toast.success("Política atualizada")
			invalidate()
		},
		onError: reportPolicyError("Erro ao atualizar política"),
	})
}

export function useDeletePolicy() {
	const invalidate = usePolicyInvalidation()
	return useAssuredMutation({
		mutationFn: (policyId: string) => deletePolicyFn({ data: { policyId } }),
		onSuccess: () => {
			toast.success("Política removida")
			invalidate()
		},
		onError: reportPolicyError("Erro ao remover política"),
	})
}

export function useAddPolicyStatement() {
	const invalidate = usePolicyInvalidation()
	return useAssuredMutation({
		mutationFn: (data: { policyId: string; statement: PolicyStatementInput }) => addPolicyStatementFn({ data }),
		onSuccess: () => {
			toast.success("Permissão adicionada à política")
			invalidate()
		},
		onError: reportPolicyError("Erro ao adicionar permissão"),
	})
}

export function useUpdatePolicyStatement() {
	const invalidate = usePolicyInvalidation()
	return useAssuredMutation({
		mutationFn: (data: { statementId: string; statement: PolicyStatementInput }) => updatePolicyStatementFn({ data }),
		onSuccess: () => {
			toast.success("Permissão atualizada")
			invalidate()
		},
		onError: reportPolicyError("Erro ao atualizar permissão"),
	})
}

export function useRemovePolicyStatement() {
	const invalidate = usePolicyInvalidation()
	return useAssuredMutation({
		mutationFn: (statementId: string) => removePolicyStatementFn({ data: { statementId } }),
		onSuccess: () => {
			toast.success("Permissão removida da política")
			invalidate()
		},
		onError: reportPolicyError("Erro ao remover permissão"),
	})
}

/**
 * Anexa (ou REANEXA) uma política.
 *
 * `expires_at` é substituição, não patch: reanexar sem prazo torna o acesso permanente, e
 * é assim que se renova ou encerra um anexo com prazo. `null`/ausente = sem prazo.
 */
export function useAttachPolicy() {
	const invalidate = usePolicyInvalidation()
	return useAssuredMutation({
		mutationFn: (data: { userId: string; policyId: string; expires_at?: string | null }) => attachPolicyFn({ data }),
		onSuccess: (_result, variables) => {
			toast.success(variables.expires_at ? "Política anexada com prazo" : "Política anexada")
			invalidate()
		},
		onError: reportPolicyError("Erro ao anexar política"),
	})
}

export function useDetachPolicy() {
	const invalidate = usePolicyInvalidation()
	return useAssuredMutation({
		mutationFn: (data: { userId: string; policyId: string }) => detachPolicyFn({ data }),
		onSuccess: () => {
			toast.success("Política desanexada")
			invalidate()
		},
		onError: reportPolicyError("Erro ao desanexar política"),
	})
}
