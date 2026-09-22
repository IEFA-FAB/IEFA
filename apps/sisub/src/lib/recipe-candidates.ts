/**
 * Troca do candidato PRINCIPAL de uma linha da ficha técnica.
 *
 * A linha da ficha tem um insumo principal (a escolha 1) e N substitutos. Até aqui o
 * principal era imutável: para trocar o insumo da linha — descobrir que a preparação
 * roda melhor com o substituto e que o cadastrado como principal é que é a exceção —
 * era preciso remover a linha inteira e recadastrá-la, perdendo FC, IR e todos os
 * substitutos junto.
 *
 * `promoteAlternative` é uma TROCA, não uma cópia: o substituto sobe para principal e o
 * principal desce para a vaga que o substituto ocupava. Somar (subir sem descer) deixaria
 * o insumo antigo fora da ficha sem que ninguém tenha pedido para removê-lo; a ordem dos
 * demais substitutos não se mexe porque ela é gravada como `priority_order`.
 *
 * O que NÃO viaja na troca: `correction_factor`, `rehydration_index` e `is_optional`. São
 * da LINHA e valem para qualquer candidato (é o que o seletor diz na tela) — o substituto
 * nem tem onde guardá-los em `kitchen.recipe_ingredient_alternatives`.
 *
 * Módulo puro, fora do componente, porque o índice do candidato em exibição tem que
 * acompanhar a troca: o estado da tabela é "esta linha está lendo o candidato N", e uma
 * troca que mexe no principal sem recalcular esse N faz a tabela trocar de insumo sozinha,
 * sem clique — o mesmo bug que a remoção de substituto já teve.
 */

import type { RecipeAlternativeFormRow } from "@/types/domain/recipes"

/** Forma mínima da linha para a troca — a tabela passa a linha inteira, com os fatores. */
export interface CandidateRow {
	ingredient_id: string | null
	ingredient_name: string
	measure_unit: string
	folder_id: string | null
	net_quantity: number | null
	alternatives: RecipeAlternativeFormRow[]
}

/**
 * Promove o substituto `altIndex` a principal.
 *
 * @param selected índice do candidato em exibição (0 = principal), para acompanhar a troca.
 * @returns linha nova e o índice do candidato em exibição, que continua apontando para o
 * MESMO insumo de antes da troca.
 */
export function promoteAlternative<Row extends CandidateRow>(row: Row, altIndex: number, selected: number): { row: Row; selected: number } {
	const promoted = row.alternatives[altIndex]
	if (!promoted) return { row, selected }

	const asPrimary = {
		ingredient_id: promoted.ingredient_id,
		ingredient_name: promoted.ingredient_name,
		measure_unit: promoted.measure_unit,
		folder_id: promoted.folder_id ?? null,
		net_quantity: promoted.net_quantity,
	}

	// Linha recém-adicionada, ainda sem insumo escolhido: não há principal a rebaixar. O
	// substituto sobe e a vaga dele some. Rebaixar o vazio gravaria um substituto sem
	// `ingredient_id`, que o schema do formulário reprova no salvamento com um erro que
	// ninguém liga à troca.
	if (row.ingredient_id === null) {
		const removedCandidate = altIndex + 1
		return {
			row: { ...row, ...asPrimary, alternatives: row.alternatives.filter((_, i) => i !== altIndex) },
			// O promovido virou o principal (0); quem estava acima dele desce uma casa.
			selected: selected === removedCandidate ? 0 : selected > removedCandidate ? selected - 1 : selected,
		}
	}

	const demoted: RecipeAlternativeFormRow = {
		ingredient_id: row.ingredient_id,
		ingredient_name: row.ingredient_name,
		measure_unit: row.measure_unit,
		folder_id: row.folder_id,
		net_quantity: row.net_quantity,
	}

	const promotedCandidate = altIndex + 1
	return {
		row: { ...row, ...asPrimary, alternatives: row.alternatives.map((alt, i) => (i === altIndex ? demoted : alt)) },
		// Os dois trocaram de lugar; qualquer outro candidato ficou onde estava.
		selected: selected === promotedCandidate ? 0 : selected === 0 ? promotedCandidate : selected,
	}
}
