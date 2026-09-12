import { useAssuranceElevation } from "@/components/features/assurance/AssuranceElevationProvider"
import { runWithElevation } from "@/lib/assurance/assurance-error"

/**
 * A mesma elevação, para código IMPERATIVO — a tela que chama a server function direto,
 * dentro de um `try/catch` com estado local de "ocupado", sem passar por `useMutation`.
 *
 * Existe porque metade das operações classificadas mora nesse formato: as telas de execução
 * orçamentária (`empenhos`, `liquidations`, `payments`, `reconciliation`, `siafi`) foram
 * escritas com `setBusy(true)` + `await fn(...)` + `router.invalidate()`. Convertê-las a
 * react-query só para ganhar o wrapper seria um refactor com risco próprio, ortogonal a esta
 * mudança — e o núcleo da elevação (`runWithElevation`) não depende de react-query nenhum.
 *
 * ```ts
 * const runAssured = useAssuredAction()
 * // …
 * try {
 * 	await runAssured(() => createPagamentoFn({ data: payload }))
 * } catch (error) {
 * 	// Desistir do modal não é falha: nada foi gravado e o formulário continua preenchido.
 * 	if (isElevationCancelled(error)) return
 * 	toast.error(…)
 * }
 * ```
 *
 * O payload é reenviado por ser o MESMO closure nas duas execuções — o mesmo mecanismo do
 * `useAssuredMutation`, e pela mesma razão: nada relê o estado da tela depois do modal.
 *
 * @domain app
 */
export function useAssuredAction(): <TData>(run: () => Promise<TData>) => Promise<TData> {
	const { requestElevation } = useAssuranceElevation()
	return (run) => runWithElevation(undefined, run, requestElevation)
}
