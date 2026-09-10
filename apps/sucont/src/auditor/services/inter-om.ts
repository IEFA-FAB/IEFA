/**
 * @module auditor/services/inter-om
 * Hipótese de transferência entre OMs sem contrapartida no SILOMS.
 *
 * Duas UGs cujo saldo SIAFI se move em sentidos opostos, com magnitudes que
 * praticamente se anulam, enquanto os dois saldos SILOMS ficam parados, é o
 * desenho de material que trocou de unidade no contábil e não trocou no físico.
 * Sem isso a tela cobra as DUAS como erro de escrituração — uma por ter saldo a
 * mais, outra por ter a menos — quando o que houve foi um movimento único entre
 * elas.
 *
 * É heurística, não prova: nomeia um par para conferência, e o texto que a
 * consome tem obrigação de dizer isso. Duas transferências independentes de valor
 * parecido na mesma competência casam aqui por coincidência.
 *
 * Portada de `lsantosnels/SIAFI-x-SILOMS-Auditor` (`services/aiService.ts`,
 * `detectInterOM`), onde ela existia só para alimentar o prompt. Aqui é função de
 * domínio, com teste, e o texto de IA é um dos consumidores.
 *
 * Quatro defeitos do original foram corrigidos, todos observáveis na série real:
 *  1. lá o movimento saía de `previousSiafiValue || 0`, que vale 0 tanto para
 *     "não mudou" quanto para "a competência anterior não está na base" — a
 *     primeira competência do recorte virava um movimento do tamanho do saldo
 *     inteiro e casava com qualquer outra UG grande. Aqui `hasPrevious` é exigido;
 *  2. lá o par podia ser a MESMA UG em dois grupos de conta. BMP sobe e Consumo
 *     desce dentro da unidade é reclassificação, não transferência entre OMs;
 *  3. lá os pares vinham de qualquer competência que estivesse no recorte;
 *     comparar movimento de março com movimento de julho não descreve transferência
 *     nenhuma. Aqui o par é sempre dentro da mesma competência;
 *  4. lá o corte era `slice(0, 3)` sobre a ordem de iteração — os "3 principais"
 *     eram os três primeiros a aparecer, não os de maior valor.
 */

import { arredondarCentavos } from "#/lib/analysis/tolerancia"
import type { FinancialRecord } from "../types"

/**
 * Movimento mínimo de SIAFI, em reais, para a UG entrar como candidata.
 *
 * Piso de materialidade herdado do upstream, não tolerância de arredondamento
 * (essa é a de `#/lib/analysis/tolerancia`, e vale meio centavo). Abaixo disso o
 * casamento de duas pontas é coincidência estatística: numa competência com 84
 * UGs, movimentos pequenos e opostos existem às dezenas.
 */
export const MOVIMENTO_MINIMO_SIAFI = 100_000

/** Quanto o SILOMS pode ter andado e ainda ser lido como parado, em reais. */
export const MOVIMENTO_MAXIMO_SILOMS = 1_000

/** Folga do casamento: o resíduo `|a + b|` tem de caber nisto da perna maior. */
export const TOLERANCIA_CASAMENTO = 0.05

/** Quantos pares o relatório carrega por padrão. */
export const LIMITE_PADRAO = 3

/**
 * Teto de candidatos por competência antes de formar pares.
 *
 * O casamento é O(n²) sobre os candidatos. Numa competência inteira eles são
 * poucas dezenas, mas o teto existe para que passar a série errada (todas as
 * competências com a mesma etiqueta, base corrompida) degrade o resultado em vez
 * de travar a aba. Os candidatos são ordenados por movimento antes do corte: o
 * que se perde é sempre o menor.
 */
export const MAX_CANDIDATOS_POR_COMPETENCIA = 400

/** Grupo declarado quando as duas pontas não são do mesmo grupo de contas. */
export const GRUPO_DIVERSOS = "DIVERSOS"

export interface InterOmTransfer {
	/** Competência em que as duas pontas se movem (`YYYY-MM`). */
	date: string
	ugA: string
	codA: string
	ugB: string
	codB: string
	/** Grupo de contas comum às duas pontas, ou `DIVERSOS`. */
	group: string
	/** Movimento de SIAFI de cada ponta (com sinal). */
	deltaA: number
	deltaB: number
	/** Magnitude atribuída à hipótese: média das duas pontas. */
	value: number
	/** O que sobrou do casamento (`|deltaA + deltaB|`) — quanto menor, mais limpo. */
	residual: number
}

/** Movimento de SIAFI da competência anterior para esta. `null` quando não há anterior. */
function siafiMovement(record: FinancialRecord): number | null {
	if (record.hasPrevious !== true) return null
	return arredondarCentavos(record.siafiValue - (record.previousSiafiValue ?? 0))
}

/** Movimento de SILOMS no mesmo intervalo. `null` quando não há competência anterior. */
function silomsMovement(record: FinancialRecord): number | null {
	if (record.hasPrevious !== true) return null
	return arredondarCentavos(record.silomsValue - (record.previousSilomsValue ?? 0))
}

/**
 * Pares de UGs cujo movimento de SIAFI se anula enquanto o SILOMS não anda.
 *
 * Espera registros já passados por `recalculateDeltas` — é de lá que vêm
 * `hasPrevious` e os valores da competência anterior. Sem isso a função devolve
 * lista vazia, que é o certo: sem período anterior não existe movimento a casar.
 */
export function detectInterOmTransfers(records: FinancialRecord[], options: { limit?: number } = {}): InterOmTransfer[] {
	const limit = options.limit ?? LIMITE_PADRAO
	if (limit <= 0 || !Array.isArray(records) || records.length === 0) return []

	interface Candidate {
		record: FinancialRecord
		delta: number
	}

	// Candidato: moveu SIAFI acima do piso e manteve o SILOMS parado no mesmo
	// intervalo. A condição do SILOMS é de cada ponta, então filtra aqui em vez de
	// dentro do laço de pares — o resultado é o mesmo e o laço fica menor.
	const byPeriod = new Map<string, Candidate[]>()
	for (const record of records) {
		const delta = siafiMovement(record)
		if (delta === null || Math.abs(delta) <= MOVIMENTO_MINIMO_SIAFI) continue

		const siloms = silomsMovement(record)
		if (siloms === null || Math.abs(siloms) >= MOVIMENTO_MAXIMO_SILOMS) continue

		const bucket = byPeriod.get(record.date)
		if (bucket) bucket.push({ record, delta })
		else byPeriod.set(record.date, [{ record, delta }])
	}

	const found: InterOmTransfer[] = []

	for (const [date, all] of byPeriod) {
		const candidates =
			all.length > MAX_CANDIDATOS_POR_COMPETENCIA
				? [...all].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, MAX_CANDIDATOS_POR_COMPETENCIA)
				: all

		for (let i = 0; i < candidates.length; i++) {
			for (let j = i + 1; j < candidates.length; j++) {
				const a = candidates[i]
				const b = candidates[j]

				// Mesma unidade nas duas pontas é remanejamento interno entre grupos de
				// conta, e cobrá-lo como transferência entre OMs manda a UG procurar uma
				// contraparte que não existe.
				if (a.record.cod === b.record.cod || a.record.ug === b.record.ug) continue

				const residual = Math.abs(arredondarCentavos(a.delta + b.delta))
				const largest = Math.max(Math.abs(a.delta), Math.abs(b.delta))
				// Sinais opostos não precisam de teste próprio: com as duas pernas acima
				// do piso, mesmo sinal produz resíduo maior que a própria perna maior.
				if (residual > largest * TOLERANCIA_CASAMENTO) continue

				// Qual ponta é A e qual é B não é informação: o par é simétrico. Fixar a
				// ordem pelo código faz a saída depender só do CONTEÚDO do recorte — sem
				// isto, reordenar a mesma série troca A por B e o texto gerado a partir
				// daqui muda de uma execução para a outra sem nada ter mudado.
				const [first, second] = a.record.cod <= b.record.cod ? [a, b] : [b, a]

				found.push({
					date,
					ugA: first.record.ug,
					codA: first.record.cod,
					ugB: second.record.ug,
					codB: second.record.cod,
					group: a.record.group === b.record.group ? a.record.group : GRUPO_DIVERSOS,
					deltaA: first.delta,
					deltaB: second.delta,
					value: arredondarCentavos((Math.abs(a.delta) + Math.abs(b.delta)) / 2),
					residual,
				})
			}
		}
	}

	// Ordem por valor, com desempate estável pelos códigos: o mesmo recorte tem de
	// produzir a mesma lista em duas execuções, senão o texto gerado muda sozinho.
	found.sort((x, y) => y.value - x.value || x.date.localeCompare(y.date) || x.codA.localeCompare(y.codA) || x.codB.localeCompare(y.codB))

	return found.slice(0, limit)
}
