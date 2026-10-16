// Extraído de routes/monitoramento.tsx (port do Analistasaldoimproprio e do centromonitoramento):
// os `useMemo` que derivam os painéis operacional, tático, estratégico e de apoio à decisão.
import { getOrganizacao } from "#/lib/analista/organizacao"
import type { ProcessedRow } from "#/lib/analista/types"
import { chartChrome } from "#/lib/chart-theme"
import { getConferente } from "#/lib/ug/registry"

// Paleta CATEGÓRICA de visualização: existe para distinguir categorias entre si.
// Fica em hex explícito de propósito (ver STYLE_CONTRACT §8) — mapeá-la para
// tokens de estado colapsa cores diferentes na mesma e a legenda passa a afirmar
// que duas categorias são a mesma coisa.
export const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#6366f1", "#ef4444", "#f43f5e", "#f97316"]

// Paleta do donut de ODS — era um literal dentro do JSX quando cada fatia era um
// `<Cell>`; virou constante para não remontar o array a cada render.
export const ODS_PIE_COLORS = ["var(--success)", "var(--series-bmp)", "var(--warning)", "var(--destructive)", "var(--series-pareto)", chartChrome.axis]

export type DashboardData = NonNullable<ReturnType<typeof computeDashboardData>>
export type ManagerialData = NonNullable<ReturnType<typeof computeManagerialData>>
export type EstrategicoData = NonNullable<ReturnType<typeof computeEstrategicoData>>
export type DecisaoData = NonNullable<ReturnType<typeof computeDecisaoData>>

/**
 * Legenda do cartão "Maior risco por ODS". Sem cobrança não há ODS no topo, e a tela
 * mostrava "undefined% das inconsistências".
 */
export function describeTopOdsShare(topOds: readonly { percent: number }[]): string {
	const top = topOds[0]
	return top ? `${top.percent.toFixed(1)}% das inconsistências` : "nenhuma inconsistência no recorte"
}

export function computeDashboardData(filteredData: ProcessedRow[]) {
	if (filteredData.length === 0) return null
	const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
	const excecoes = filteredData.filter((r) => r.classificacao === "EXCEÇÃO PREVISTA")
	const foraEscopo = filteredData.filter((r) => r.classificacao === "FORA DO ESCOPO PARAMETRIZADO")
	return {
		totalRegistros: filteredData.length,
		totalCobrancas: cobrancas.length,
		ugsComInconsistencia: new Set(cobrancas.map((r) => r.ug)).size,
		totalExcecoes: excecoes.length,
		totalForaEscopo: foraEscopo.length,
		volumeFinanceiro: cobrancas.reduce((acc, r) => acc + Math.abs(r.saldo), 0),
	}
}

export function computeManagerialData(filteredData: ProcessedRow[]) {
	if (filteredData.length === 0) return null
	const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
	const totalRiskValue = cobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
	const ugMap = new Map<string, { count: number; value: number }>()
	const racMap = new Map<string, number>()
	const conferenteMap = new Map<string, { count: number; ugs: Set<string> }>()

	for (const item of cobrancas) {
		const ugData = ugMap.get(item.ug) || { count: 0, value: 0 }
		ugData.count += 1
		ugData.value += Math.abs(item.saldo)
		ugMap.set(item.ug, ugData)

		const rac = item.questaoRAC || "Outras Inconsistências"
		racMap.set(rac, (racMap.get(rac) || 0) + 1)

		const conferente = getConferente(item.ug)
		const confData = conferenteMap.get(conferente) || {
			count: 0,
			ugs: new Set<string>(),
		}
		confData.count += 1
		confData.ugs.add(item.ug)
		conferenteMap.set(conferente, confData)
	}

	return {
		totalRiskValue,
		topUgs: Array.from(ugMap.entries())
			.map(([ug, d]) => ({ ug, ...d }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10),
		topRacs: Array.from(racMap.entries())
			.map(([name, value]) => ({ name, value }))
			.sort((a, b) => b.value - a.value)
			// A cor mora no dado: o recharts pinta o setor por `fill` da linha e é dela
			// que saem legenda e marcador do tooltip. Cor só no `shape` (ou só no
			// `<Cell>`) deixa os dois no cinza padrão.
			.map((rac, index) => ({ ...rac, fill: PIE_COLORS[index % PIE_COLORS.length] })),
		totalIssues: cobrancas.length,
		conferentes: Array.from(conferenteMap.entries())
			.map(([name, d]) => ({
				name,
				count: d.count,
				ugs: Array.from(d.ugs).sort(),
			}))
			.sort((a, b) => b.count - a.count),
	}
}

export function computeEstrategicoData(filteredData: ProcessedRow[]) {
	if (filteredData.length === 0) return null
	const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
	const totalRiskValue = cobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
	const odsMap = new Map<string, { count: number; value: number }>()
	const orgaoSuperiorMap = new Map<string, { count: number; value: number }>()
	const contaMap = new Map<string, { count: number; value: number; descricao: string }>()

	for (const item of cobrancas) {
		const org = getOrganizacao(item.ug)

		const odsData = odsMap.get(org.ods) || { count: 0, value: 0 }
		odsData.count += 1
		odsData.value += Math.abs(item.saldo)
		odsMap.set(org.ods, odsData)

		const orgaoSupData = orgaoSuperiorMap.get(org.orgaoSuperior) || {
			count: 0,
			value: 0,
		}
		orgaoSupData.count += 1
		orgaoSupData.value += Math.abs(item.saldo)
		orgaoSuperiorMap.set(org.orgaoSuperior, orgaoSupData)

		const contaData = contaMap.get(item.conta) || {
			count: 0,
			value: 0,
			descricao: item.descricao,
		}
		contaData.count += 1
		contaData.value += Math.abs(item.saldo)
		contaMap.set(item.conta, contaData)
	}

	const topOds = Array.from(odsMap.entries())
		.map(([name, d]) => ({
			name,
			...d,
			percent: (d.count / cobrancas.length) * 100,
		}))
		.sort((a, b) => b.count - a.count)
		// Idem: `fill` na linha alimenta setor, legenda e tooltip da mesma fonte.
		.map((ods, index) => ({ ...ods, fill: ODS_PIE_COLORS[index % ODS_PIE_COLORS.length] }))

	return {
		totalRiskValue,
		topOds,
		topOrgaosSuperiores: Array.from(orgaoSuperiorMap.entries())
			.map(([name, d]) => ({
				name,
				...d,
				percent: (d.count / cobrancas.length) * 100,
			}))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10),
		topContas: Array.from(contaMap.entries())
			.map(([conta, d]) => ({ conta, ...d }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10),
		totalIssues: cobrancas.length,
	}
}

export function computeDecisaoData(filteredData: ProcessedRow[], estrategicoData: EstrategicoData | null) {
	if (filteredData.length === 0) return null
	const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
	const totalIssues = cobrancas.length

	const ugMap = new Map<string, number>()
	for (const r of cobrancas) ugMap.set(r.ug, (ugMap.get(r.ug) || 0) + 1)

	const sortedUgs = Array.from(ugMap.entries())
		.map(([ug, count]) => ({ ug, count }))
		.sort((a, b) => b.count - a.count)

	const totalUgs = sortedUgs.length
	// Sem cobrança não há UG para os 20%, e o percentual é 0: antes saíam 1 UG e NaN ("NaN%").
	const twentyPercentCount = totalUgs === 0 ? 0 : Math.max(1, Math.round(totalUgs * 0.2))
	const topTwentyUgs = sortedUgs.slice(0, twentyPercentCount)
	const topTwentyIssuesCount = topTwentyUgs.reduce((acc, curr) => acc + curr.count, 0)
	const paretoPercent = totalIssues === 0 ? 0 : (topTwentyIssuesCount / totalIssues) * 100

	const maxCount = sortedUgs[0]?.count || 1
	const maxValue = Math.max(...sortedUgs.map((u) => cobrancas.filter((c) => c.ug === u.ug).reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)))

	const prioritizedUgs = sortedUgs
		.map((u) => {
			const ugCobrancas = cobrancas.filter((c) => c.ug === u.ug)
			const value = ugCobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
			const org = getOrganizacao(u.ug)
			const score = (u.count / maxCount) * 0.4 + (value / (maxValue || 1)) * 0.4 + 0.2
			return {
				...u,
				value,
				nome: org.nome,
				ods: org.ods,
				superior: org.orgaoSuperior,
				score,
			}
		})
		.sort((a, b) => b.score - a.score)

	return {
		pareto: {
			totalUgs,
			twentyPercentCount,
			paretoPercent,
			topTwentyUgs: prioritizedUgs.slice(0, twentyPercentCount),
		},
		priorities: prioritizedUgs.slice(0, 15),
		criticalLevels: {
			ods: estrategicoData?.topOds[0]?.name ?? "-",
			superior: estrategicoData?.topOrgaosSuperiores[0]?.name ?? "-",
			ugCount: sortedUgs[0]?.ug ?? "-",
			ugValue: prioritizedUgs.sort((a, b) => b.value - a.value)[0]?.ug ?? "-",
		},
	}
}
