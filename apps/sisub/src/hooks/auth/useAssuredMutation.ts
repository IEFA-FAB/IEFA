import { type UseMutationOptions, type UseMutationResult, useMutation } from "@tanstack/react-query"
import { useAssuranceElevation } from "@/components/features/assurance/AssuranceElevationProvider"
import { runWithElevation } from "@/lib/assurance/assurance-error"

/**
 * `useMutation` que sabe o que fazer quando o servidor responde `MFA_REQUIRED`.
 *
 * Troque `useMutation` por este hook em toda mutação que chame uma server function
 * classificada como `"session"` ou `"fresh"` no registro de garantia. O resto do call site
 * não muda: mesmas opções, mesmo retorno, mesmo `mutateAsync`.
 *
 * ```ts
 * const grant = useAssuredMutation({
 * 	mutationFn: (input: GrantInput) => createUserPermissionFn({ data: input }),
 * 	onSuccess: () => { … },
 * 	// Cancelar o modal chega aqui como `ElevationCancelledError` — use
 * 	// `isElevationCancelled(error)` para não mostrar um toast de falha por uma desistência.
 * })
 * ```
 *
 * ## O que acontece quando a mutação é barrada
 *
 * 1. A recusa é reconhecida (`code: "MFA_REQUIRED"`) e o modal abre SOBRE a tela atual.
 * 2. Verificado o segundo fator, a MESMA mutação é reenviada com o MESMO payload — o valor
 *    que o formulário montou ficou retido no escopo, e nada relê o estado da tela.
 * 3. Cancelado, o erro é `ElevationCancelledError`: o formulário continua preenchido, a
 *    sessão continua ativa e nada foi gravado.
 *
 * Tudo isso acontece DENTRO do `mutationFn`, e essa escolha tem consequência visível: para o
 * react-query a operação inteira é uma só, então `isPending` continua `true` enquanto o modal
 * está aberto. É o que se quer — o botão de enviar segue desabilitado e ninguém submete o
 * formulário duas vezes enquanto digita os seis dígitos.
 *
 * @domain app
 */
export function useAssuredMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
	options: UseMutationOptions<TData, TError, TVariables, TContext> & { mutationFn: (variables: TVariables) => Promise<TData> }
): UseMutationResult<TData, TError, TVariables, TContext> {
	const { requestElevation } = useAssuranceElevation()
	const { mutationFn, ...rest } = options

	return useMutation<TData, TError, TVariables, TContext>({
		...rest,
		mutationFn: (variables) => runWithElevation(variables, mutationFn, requestElevation),
	})
}
