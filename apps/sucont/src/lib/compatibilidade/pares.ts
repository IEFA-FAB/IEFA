/**
 * @module lib/compatibilidade/pares
 * Regra das Questões 40, 41 e 42 do RAC: três pares de contas que devem fechar
 * por UG.
 *
 * Extraído da rota para poder ser testado. A agregação mora aqui porque era o
 * ponto de falha: a versão anterior fazia `contas[conta] = saldo` e, quando o
 * relatório trazia mais de uma linha para a mesma UG e conta (por conta corrente,
 * mês ou fonte), guardava só a última — inventando divergência onde o par estava
 * equilibrado.
 */

import { arredondarCentavos, saldosDivergem } from "#/lib/analysis/tolerancia"
import { citarMacrofuncao, MACROFUNCOES } from "#/lib/normas"

export interface ParDeContas {
	id: number
	/** Conta do lado A (patrimonial/financeiro). */
	a: string
	nameA: string
	/** Conta do lado B (controle). */
	b: string
	nameB: string
	formattedA: string
	formattedB: string
	/** Trecho de fundamentação normativa, colado ao fim da frase de abertura. */
	legis: string
	question: string
}

export const PARES: ParDeContas[] = [
	{
		id: 1,
		a: "111111903",
		nameA: "CAIXA ECONÔMICA FEDERAL",
		b: "811110113",
		nameB: "CAUÇÃO A EXECUTAR",
		formattedA: "1.1.1.1.1.19.03",
		formattedB: "8.1.1.1.1.01.13",
		// O par compara um ativo (classe 1) com um controle (classe 8): o espelhamento
		// decorre da rotina de caução depositada em conta bancária específica, não de
		// contrapartida do PCASP. Enquanto a rotina não estiver referenciada em norma
		// citável, a mensagem aponta o dever geral de análise e conciliação da 02.03.18.
		legis: `, em desacordo com o item 5.1 da ${citarMacrofuncao(MACROFUNCOES.encerramento)}, que determina a análise e a conciliação dos saldos, ainda que em nível de conta corrente`,
		question: "Questão 40 do Roteiro de Acompanhamento Contábil (SUCONT-3)",
	},
	{
		id: 2,
		a: "115511000",
		nameA: "MATERIAIS DE CONSUMO EM TRÂNSITO",
		b: "899920102",
		nameB: "BENS DE ESTOQUE ENVIADOS",
		formattedA: "1.1.5.5.1.10.00",
		formattedB: "8.9.9.9.2.01.02",
		legis: ", em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e)",
		question: "Questão 41 do Roteiro de Acompanhamento Contábil (SUCONT-3)",
	},
	{
		id: 3,
		a: "123119905",
		nameA: "BENS MÓVEIS EM TRÂNSITO",
		b: "899920202",
		nameB: "BENS MÓVEIS ENVIADOS",
		formattedA: "1.2.3.1.1.99.05",
		formattedB: "8.9.9.9.2.02.02",
		legis: ", em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e)",
		question: "Questão 42 do Roteiro de Acompanhamento Contábil (SUCONT-3)",
	},
]

export interface LinhaSaldo {
	ug: string
	conta: string
	saldo: number
}

/** Saldos somados por UG e por conta contábil. */
export type SaldosPorUg = Record<string, Record<string, number>>

/** Agrega as linhas do relatório somando — nunca sobrescrevendo — por UG × conta. */
export function agregarSaldos(linhas: LinhaSaldo[]): SaldosPorUg {
	const ugs: SaldosPorUg = {}

	for (const { ug, conta, saldo } of linhas) {
		if (!ug || !conta) continue
		if (!ugs[ug]) ugs[ug] = {}
		ugs[ug][conta] = arredondarCentavos((ugs[ug][conta] ?? 0) + (Number.isFinite(saldo) ? saldo : 0))
	}

	return ugs
}

export interface ParDivergente {
	par: ParDeContas
	indice: number
	saldoA: number | undefined
	saldoB: number | undefined
	/** A − B. Preserva o sinal: indica qual lado está maior. */
	diff: number
	absDiff: number
	hasA: boolean
	hasB: boolean
}

/**
 * Compara os três pares para uma UG.
 *
 * Par ausente por inteiro é ignorado (a UG não opera aquelas contas). Par com um
 * lado só é divergência mesmo que o lado presente esteja zerado: falta o registro
 * espelhado.
 */
export function compararPares(contas: Record<string, number>): { divergentes: ParDivergente[]; totalDiff: number } {
	const divergentes: ParDivergente[] = []
	let totalDiff = 0

	PARES.forEach((par, indice) => {
		const saldoA = contas[par.a]
		const saldoB = contas[par.b]
		const hasA = saldoA !== undefined
		const hasB = saldoB !== undefined

		if (!hasA && !hasB) return

		const valA = hasA ? saldoA : 0
		const valB = hasB ? saldoB : 0
		const diff = arredondarCentavos(valA - valB)
		const absDiff = Math.abs(diff)

		if (!saldosDivergem(valA, valB) && hasA && hasB) return

		totalDiff = arredondarCentavos(totalDiff + absDiff)
		divergentes.push({ par, indice, saldoA, saldoB, diff, absDiff, hasA, hasB })
	})

	return { divergentes, totalDiff }
}
