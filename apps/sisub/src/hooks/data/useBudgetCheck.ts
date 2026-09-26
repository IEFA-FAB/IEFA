import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type BudgetCheckForEmpenhoInput, checkBudgetForEmpenhoFn } from "@/server/budget.fn"

/**
 * Conferência de crédito da NE que está sendo registrada — AVISO, nunca bloqueio.
 *
 * Para a tela de NE (registro completo ou rápido): passe unidade, valor e a classificação
 * que o usuário já digitou. Sem ND ou sem valor positivo a consulta não dispara. O retorno
 * (`ClassifiedCreditCheck`) traz `status` (`ok` · `insufficient` · `no_data`), `excedente`,
 * `message` pronta para exibir, a linha de crédito usada e a projeção dela. Com
 * `insufficient`, mostre a mensagem e siga com o registro: o sisub registra o ato já feito no
 * SIAFI (Lei 4.320, art. 59 vira alerta aqui).
 *
 * Ao completar uma NE já registrada, passe `excludeEmpenhoId` para ela não contar contra si.
 *
 * Ligado hoje no registro de empenho do painel da ARP (`EmpenhoBalancePanel` → `EmpenhoForm`).
 * A tela de NE com itens (contratação de origem, PR #473) usa o mesmo hook: valor da NE, ND,
 * PTRES, fonte e data do formulário; mostrar `data.message` e seguir com o registro.
 */
export function useBudgetCheckForEmpenho(input: Partial<BudgetCheckForEmpenhoInput> & { unitId: number }) {
	const valor = Number(input.valor ?? 0)
	const enabled = Number.isFinite(valor) && valor > 0 && typeof input.nd === "string" && input.nd.trim() !== ""

	return useQuery({
		// chave local: a conferência é efêmera e só esta tela a lê
		queryKey: [
			"sisub",
			"budget-check",
			input.unitId,
			valor,
			input.nd ?? null,
			input.ptres ?? null,
			input.fonte ?? null,
			input.ug ?? null,
			input.dataEmpenho ?? null,
			input.excludeEmpenhoId ?? null,
		] as const,
		queryFn: () =>
			checkBudgetForEmpenhoFn({
				data: {
					unitId: input.unitId,
					valor,
					nd: input.nd ?? null,
					ptres: input.ptres ?? null,
					fonte: input.fonte ?? null,
					ug: input.ug ?? null,
					dataEmpenho: input.dataEmpenho,
					exercicio: input.exercicio,
					excludeEmpenhoId: input.excludeEmpenhoId,
				},
			}),
		enabled,
		staleTime: 30_000,
		placeholderData: keepPreviousData,
	})
}
