/**
 * Onde mora cada quantidade de um cardápio (change `sisub-menu-composition-relative-quantities`).
 *
 * O modelo GLOBAL (SDAB) guarda só quantidade relativa: proporção, porções por kit, preparações
 * por grupo. O número absoluto (efetivo, pax, ocorrências por mês, kits) é da cozinha. Quem
 * dimensiona compra (anexo quantitativo, previsão de demanda) precisa do absoluto, então só
 * aceita o cardápio da cozinha — o modelo global entra adaptado.
 */

import { DomainError } from "../types/errors.ts"

/** Recusa modelos globais onde a quantidade absoluta é obrigatória. */
export function assertNoGlobalTemplates(globalTemplateIds: readonly string[]): void {
	if (globalTemplateIds.length === 0) return
	throw new DomainError(
		"GLOBAL_TEMPLATE_NEEDS_ADAPTATION",
		`Modelo global não tem efetivo nem ocorrências: adapte o modelo para a cozinha e informe o efetivo antes de usá-lo aqui (${[...new Set(globalTemplateIds)].join(", ")}).`
	)
}
