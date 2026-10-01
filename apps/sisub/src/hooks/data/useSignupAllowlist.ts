import type { AuthorizeExternalSignup } from "@iefa/sisub-domain/schemas"
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAssuredMutation } from "@/hooks/auth/useAssuredMutation"
import { queryKeys } from "@/lib/query-keys"
import type { AuthorizeExternalSignupResult, SignupAllowlistRow } from "@/server/signup-allowlist.fn"
import { authorizeExternalSignupFn, listSignupAllowlistFn, revokeExternalSignupFn } from "@/server/signup-allowlist.fn"

export type { AuthorizeExternalSignupResult, SignupAllowlistRow }

export const signupAllowlistQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.sisub.signupAllowlist(),
		queryFn: () => listSignupAllowlistFn(),
		staleTime: 30 * 1000,
	})

export function useSignupAllowlist() {
	return useQuery(signupAllowlistQueryOptions())
}

/**
 * Autoriza o e-mail e convida. `useAssuredMutation` porque a operação é `fresh` no registro: é
 * conceder a alguém de fora a capacidade de ter conta. Sem toast aqui — o formulário mostra o
 * erro ao lado dos campos e o desfecho do convite, que tem três saídas diferentes.
 */
export function useAuthorizeExternalSignup() {
	const queryClient = useQueryClient()
	return useAssuredMutation({
		mutationFn: (input: AuthorizeExternalSignup) => authorizeExternalSignupFn({ data: input }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sisub.signupAllowlist() }),
	})
}

export function useRevokeExternalSignup() {
	const queryClient = useQueryClient()
	return useAssuredMutation({
		mutationFn: (id: string) => revokeExternalSignupFn({ data: { id } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sisub.signupAllowlist() }),
	})
}
