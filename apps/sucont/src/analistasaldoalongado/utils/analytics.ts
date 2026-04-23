import { getUgHierarchy } from "./hierarchy"
import type { ParsedRow } from "./parser"

export interface UgDetail {
	ug: string
	nome_ug?: string
	conta_contabil: string
	nome_conta?: string
	conta_corrente: string
	saldo: number
	status: string
}

export interface UgConsolidated {
	ug: string
	nome_ug?: string
	quantidade_ocorrencias: number
	saldo_total: number
	qtd_contas_contabeis_distintas: number
	qtd_contas_correntes_distintas: number
	conta_contabil_mais_recorrente: string
	ocorrencias: UgDetail[]
}

export interface DashboardMetrics {
	totalUgs: number
	totalOcorrencias: number
	saldoTotal: number
	contaMaisRecorrente: string | null
}

export const consolidateData = (rows: ParsedRow[]): { consolidated: UgConsolidated[]; metrics: DashboardMetrics } => {
	const ugMap = new Map<string, UgConsolidated>()
	const globalContaCount = new Map<string, number>()

	let totalOcorrencias = 0
	let saldoTotal = 0

	rows.forEach((row) => {
		totalOcorrencias++
		saldoTotal += row.saldo

		globalContaCount.set(row.contaContabil, (globalContaCount.get(row.contaContabil) || 0) + 1)

		const hierarchy = getUgHierarchy(row.ug)
		const nomeUg = row.nomeUg && row.nomeUg !== "Desconhecido" ? row.nomeUg : hierarchy.nome

		if (!ugMap.has(row.ug)) {
			ugMap.set(row.ug, {
				ug: row.ug,
				nome_ug: nomeUg,
				quantidade_ocorrencias: 0,
				saldo_total: 0,
				qtd_contas_contabeis_distintas: 0,
				qtd_contas_correntes_distintas: 0,
				conta_contabil_mais_recorrente: "",
				ocorrencias: [],
			})
		}

		const ugData = ugMap.get(row.ug)
		if (!ugData) return
		ugData.quantidade_ocorrencias++
		ugData.saldo_total += row.saldo

		ugData.ocorrencias.push({
			ug: row.ug,
			nome_ug: nomeUg,
			conta_contabil: row.contaContabil,
			nome_conta: row.nomeConta,
			conta_corrente: row.contaCorrente,
			saldo: row.saldo,
			status: "Mensagem gerada",
		})
	})

	const consolidated = Array.from(ugMap.values()).map((ugData) => {
		const contasContabeis = new Set<string>()
		const contasCorrentes = new Set<string>()
		const contaCount = new Map<string, number>()

		ugData.ocorrencias.forEach((occ) => {
			contasContabeis.add(occ.conta_contabil)
			contasCorrentes.add(occ.conta_corrente)
			contaCount.set(occ.conta_contabil, (contaCount.get(occ.conta_contabil) || 0) + 1)
		})

		ugData.qtd_contas_contabeis_distintas = contasContabeis.size
		ugData.qtd_contas_correntes_distintas = contasCorrentes.size

		let maxConta = ""
		let maxCount = 0
		contaCount.forEach((count, conta) => {
			if (count > maxCount) {
				maxCount = count
				maxConta = conta
			}
		})
		ugData.conta_contabil_mais_recorrente = maxConta

		return ugData
	})

	let globalMaxConta = ""
	let globalMaxCount = 0
	globalContaCount.forEach((count, conta) => {
		if (count > globalMaxCount) {
			globalMaxCount = count
			globalMaxConta = conta
		}
	})

	return {
		consolidated: consolidated.sort((a, b) => b.saldo_total - a.saldo_total),
		metrics: {
			totalUgs: consolidated.length,
			totalOcorrencias,
			saldoTotal,
			contaMaisRecorrente: globalMaxConta || null,
		},
	}
}
