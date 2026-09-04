import { arredondarCentavos, saldoZerado } from "#/lib/analysis/tolerancia"
import { blocoFundamentacao, FUNDAMENTO_CONCILIACAO_SISTEMAS } from "#/lib/normas"
import {
	AccountGroup,
	type FinancialRecord,
	ImpactLevel,
	ProbabilityLevel,
	type RawInputRow,
	RiskLevel,
	type StoredBalanceRow,
	type TimeFilter,
} from "../types"
import { UG_MAPPING } from "../ugMapping"

// --- RISK CLASSIFICATION ---
/**
 * Chave da estatística de risco.
 *
 * Antes era só a UG: impacto, probabilidade e nível eram calculados por unidade e
 * carimbados em TODOS os registros dela. Na prática, o Intangível zerado de uma UG
 * herdava o "Crítico" do BMP com centenas de milhões de divergência — a tela e a
 * MSG classificavam como crítica uma conta que estava conciliada. O grão certo é
 * (UG, grupo de contas): é sobre uma conta específica que a Setorial cobra.
 */
const riskKey = (ug: string, group: string) => `${ug}\u0000${group}`

export const applyRiskClassification = (data: FinancialRecord[]): FinancialRecord[] => {
	if (!data || data.length === 0) return []

	const stats: Record<string, { months: Set<string>; maxDiff: number; totalDiff: number }> = {}

	data.forEach((record) => {
		const key = riskKey(record.ug, record.group)
		if (!stats[key]) {
			stats[key] = { months: new Set(), maxDiff: 0, totalDiff: 0 }
		}
		// Divergência é o que passa da tolerância de arredondamento, não `> 0`: resíduo
		// de meio centavo do parse de moeda contava competência e empurrava a
		// probabilidade — e, com ela, o nível de risco.
		if (!saldoZerado(record.difference)) {
			stats[key].months.add(record.date)
		}
		stats[key].maxDiff = Math.max(stats[key].maxDiff, record.difference)
		stats[key].totalDiff += record.difference
	})

	/**
	 * Quantas competências o recorte carregado realmente cobre.
	 *
	 * A probabilidade era `meses / 12` fixo. Com uma série plurianual (o relatório
	 * de importação traz 32 competências) isso passa de 100% para quase toda UG —
	 * chegou a 266% — e desequilibra a mistura 70/30 com o impacto. Pior: os cortes
	 * absolutos (">9 meses = Crônico") jogavam 96% dos registros no mesmo balde e o
	 * eixo parava de separar qualquer coisa. Relativo à janela observada, volta a
	 * ter significado tanto num arquivo de 6 meses quanto num de 32.
	 */
	const periodCount = new Set(data.map((r) => r.sortableDate)).size || 1

	const allMaxDiffs = Object.values(stats).map((s) => s.maxDiff)
	const absoluteMaxDiff = Math.max(...allMaxDiffs, 1)

	const scores = Object.entries(stats).map(([key, s]) => {
		const impactScore = (s.maxDiff / absoluteMaxDiff) * 100
		const probabilityScore = (s.months.size / periodCount) * 100
		const finalScore = impactScore * 0.7 + probabilityScore * 0.3
		return { key, score: finalScore, maxDiff: s.maxDiff, months: s.months.size }
	})

	const sortedScores = [...scores].map((s) => s.score).sort((a, b) => a - b)

	const getRiskLevelFromScore = (score: number): RiskLevel => {
		if (sortedScores.length === 0) return RiskLevel.BAIXO
		const index = sortedScores.findIndex((s) => s >= score)
		const percentile = (index / sortedScores.length) * 100
		if (percentile <= 25) return RiskLevel.BAIXO
		if (percentile <= 50) return RiskLevel.MEDIO
		if (percentile <= 75) return RiskLevel.ALTO
		return RiskLevel.CRITICO
	}

	const sortedMaxDiffs = [...allMaxDiffs].sort((a, b) => a - b)
	const getImpactLevel = (val: number): ImpactLevel => {
		const index = sortedMaxDiffs.findIndex((v) => v >= val)
		const p = (index / sortedMaxDiffs.length) * 100
		if (p <= 20) return ImpactLevel.INSIGNIFICANTE
		if (p <= 40) return ImpactLevel.MENOR
		if (p <= 60) return ImpactLevel.MODERADO
		if (p <= 80) return ImpactLevel.MAIOR
		return ImpactLevel.CATASTROFICO
	}

	/** Fração das competências carregadas em que a conta divergiu — não contagem absoluta. */
	const getProbabilityLevel = (months: number): ProbabilityLevel => {
		const ratio = months / periodCount
		if (ratio <= 0.1) return ProbabilityLevel.RARO
		if (ratio <= 0.3) return ProbabilityLevel.OCASIONAL
		if (ratio <= 0.6) return ProbabilityLevel.RECORRENTE
		if (ratio <= 0.85) return ProbabilityLevel.PERSISTENTE
		return ProbabilityLevel.CRONICO
	}

	const riskByKey: Record<string, RiskLevel> = {}
	scores.forEach((s) => {
		riskByKey[s.key] = getRiskLevelFromScore(s.score)
	})

	return data.map((record) => {
		const key = riskKey(record.ug, record.group)
		const s = stats[key]
		return {
			...record,
			impactLevel: getImpactLevel(s.maxDiff),
			probabilityLevel: getProbabilityLevel(s.months.size),
			riskLevel: riskByKey[key],
			monthsWithDivergence: s.months.size,
		}
	})
}

export const parseDateString = (dateStr: string): { month: number; year: number; timestamp: number; sortableDate: string } => {
	try {
		if (!dateStr) return { month: 0, year: 0, timestamp: 0, sortableDate: "0000-00" }

		if (dateStr.includes("T") && dateStr.includes("Z")) {
			const d = new Date(dateStr)
			if (!Number.isNaN(d.getTime())) {
				// Célula de data de planilha representa um DIA, não um instante: o xlsx
				// converte o serial do Excel com arredondamento de sub-segundo e a
				// competência pode aterrissar em 23:59:59.999 do último dia do mês
				// ANTERIOR. Lido cru, isso joga um mês inteiro para a competência errada,
				// em silêncio. Arredonda-se para a meia-noite local mais próxima antes de
				// extrair mês e ano.
				const DAY_MS = 86_400_000
				const asLocalEpoch = d.getTime() - d.getTimezoneOffset() * 60_000
				const snapped = new Date(Math.round(asLocalEpoch / DAY_MS) * DAY_MS)
				const m = snapped.getUTCMonth()
				const y = snapped.getUTCFullYear()
				const monthNum = (m + 1).toString().padStart(2, "0")
				return { month: m, year: y, timestamp: new Date(y, m, 1).getTime(), sortableDate: `${y}-${monthNum}` }
			}
		}

		if (/^\d{4}-\d{2}$/.test(dateStr)) {
			const [y, m] = dateStr.split("-").map(Number)
			return {
				month: m - 1,
				year: y,
				timestamp: new Date(y, m - 1, 1).getTime(),
				sortableDate: dateStr,
			}
		}

		if (/^\d{5}$/.test(dateStr)) {
			const serial = Number.parseInt(dateStr, 10)
			const d = new Date((serial - 25569) * 86400 * 1000)
			if (!Number.isNaN(d.getTime())) {
				const m = d.getMonth()
				const y = d.getFullYear()
				const monthNum = (m + 1).toString().padStart(2, "0")
				return { month: m, year: y, timestamp: d.getTime(), sortableDate: `${y}-${monthNum}` }
			}
		}

		const normalizedStr = dateStr.replace(/-/g, "/")
		const parts = normalizedStr.split("/")

		if (parts.length < 2) {
			const d = new Date(dateStr)
			if (!Number.isNaN(d.getTime())) {
				const m = d.getMonth()
				const y = d.getFullYear()
				const monthNum = (m + 1).toString().padStart(2, "0")
				return { month: m, year: y, timestamp: d.getTime(), sortableDate: `${y}-${monthNum}` }
			}
			return { month: 0, year: 0, timestamp: 0, sortableDate: "0000-00" }
		}

		let monthStr = ""
		let yearStr = ""

		if (/^\d{4}$/.test(parts[0])) {
			yearStr = parts[0]
			monthStr = parts[1]
		} else {
			monthStr = parts[0]
			yearStr = parts[1]
		}

		const months: Record<string, number> = {
			JANEIRO: 0,
			FEVEREIRO: 1,
			MARÇO: 2,
			MARCO: 2,
			ABRIL: 3,
			MAIO: 4,
			JUNHO: 5,
			JULHO: 6,
			AGOSTO: 7,
			SETEMBRO: 8,
			OUTUBRO: 9,
			NOVEMBRO: 10,
			DEZEMBRO: 11,
			JAN: 0,
			FEV: 1,
			MAR: 2,
			ABR: 3,
			MAI: 4,
			JUN: 5,
			JUL: 6,
			AGO: 7,
			SET: 8,
			OUT: 9,
			NOV: 10,
			DEZ: 11,
			"DEZ.": 11,
			"NOV.": 10,
			"OUT.": 9,
			"SET.": 8,
			"AGO.": 7,
			"JUL.": 6,
			"JUN.": 5,
			"MAI.": 4,
			"ABR.": 3,
			"MAR.": 2,
			"FEV.": 1,
			"JAN.": 0,
		}

		const cleanMonth = monthStr.trim().toUpperCase()
		let month = 0

		if (months[cleanMonth] !== undefined) {
			month = months[cleanMonth]
		} else {
			const mNum = Number.parseInt(cleanMonth, 10)
			if (!Number.isNaN(mNum) && mNum >= 1 && mNum <= 12) {
				month = mNum - 1
			}
		}

		let year = Number.parseInt(yearStr, 10) || new Date().getFullYear()
		if (year < 100) year += 2000

		const monthNum = (month + 1).toString().padStart(2, "0")
		const sortableDate = `${year}-${monthNum}`

		return { month, year, timestamp: new Date(year, month, 1).getTime(), sortableDate }
	} catch (_e) {
		return { month: 0, year: 0, timestamp: 0, sortableDate: "0000-00" }
	}
}

export const toShortDate = (dateStr: string): string => {
	const { month, year } = parseDateString(dateStr)
	const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
	const shortYear = year.toString().slice(-2)
	return `${monthNames[month]}/${shortYear}`
}

export const normalizeData = (rawRows: RawInputRow[]): FinancialRecord[] => {
	const normalized: FinancialRecord[] = []
	if (!rawRows || !Array.isArray(rawRows)) return []

	rawRows.forEach((row, index) => {
		if (!row) return

		const { month, year, sortableDate } = parseDateString(row.data)
		const safeCod = row.cod ? String(row.cod).trim() : "000000"
		const safeUg = row.ug ? String(row.ug).trim() : "DESCONHECIDO"

		const processGroup = (groupEnum: AccountGroup, siafi: number, siloms: number, explicitDiff: number) => {
			const finalDiff = arredondarCentavos(explicitDiff !== 0 ? Math.abs(explicitDiff) : Math.abs(siafi - siloms))

			let preponderance: "SIAFI" | "SILOMS" | "EQUAL" = "EQUAL"
			if (siafi > siloms) preponderance = "SIAFI"
			if (siloms > siafi) preponderance = "SILOMS"

			const uniqueId = `${safeCod}-${groupEnum}-${year}${month}-${index}`

			normalized.push({
				id: uniqueId,
				date: sortableDate,
				monthIndex: month,
				year,
				sortableDate,
				cod: safeCod,
				ug: safeUg,
				orgaoSuperior: UG_MAPPING[safeCod]?.orgaoSuperior || "N/A",
				ods: UG_MAPPING[safeCod]?.ods || "N/A",
				group: groupEnum,
				siafiValue: siafi || 0,
				silomsValue: siloms || 0,
				difference: finalDiff || 0,
				preponderance,
				previousDifference: 0,
				previousSiafiValue: 0,
				previousSilomsValue: 0,
				previousDate: "",
				delta: 0,
			})
		}

		processGroup(AccountGroup.CONSUMO, row.g1_siafi, row.g1_siloms, row.g1_diff)
		processGroup(AccountGroup.BMP, row.g2_siafi, row.g2_siloms, row.g2_diff)
		processGroup(AccountGroup.INTANGIVEL, row.g3_siafi, row.g3_siloms, row.g3_diff)
	})

	return normalized.sort((a, b) => a.sortableDate.localeCompare(b.sortableDate))
}

export const recalculateDeltas = (data: FinancialRecord[], timeFilter: TimeFilter): FinancialRecord[] => {
	let monthGap = 1
	if (timeFilter === "TRIMESTRAL") monthGap = 3
	if (timeFilter === "SEMESTRAL") monthGap = 6
	if (timeFilter === "ANUAL") monthGap = 12

	const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]

	// Índice (cod, grupo, ano, mês) — o `data.find` linear original percorria a
	// série inteira para cada registro (8 mil registros ⇒ dezenas de milhões de
	// comparações a cada troca de filtro de período).
	const byKey = new Map<string, FinancialRecord>()
	for (const r of data) {
		byKey.set(`${r.cod}\u0000${r.group}\u0000${r.year}\u0000${r.monthIndex}`, r)
	}

	return data.map((record) => {
		let targetMonth = record.monthIndex - monthGap
		let targetYear = record.year

		while (targetMonth < 0) {
			targetMonth += 12
			targetYear -= 1
		}

		const prevRecord = byKey.get(`${record.cod}\u0000${record.group}\u0000${targetYear}\u0000${targetMonth}`)
		const hasPrevious = prevRecord !== undefined

		const prevDiff = prevRecord ? prevRecord.difference : 0
		const prevSiafi = prevRecord ? prevRecord.siafiValue : 0
		const prevSiloms = prevRecord ? prevRecord.silomsValue : 0

		const shortYear = targetYear.toString().slice(-2)
		const prevDate = `${monthNames[targetMonth]}/${shortYear}`

		// Sem competência anterior carregada não existe variação a declarar. Antes
		// o delta virava a própria diferença corrente — o registro subia no ranking
		// de "maior aumento" por comparação com uma linha que não existe.
		const delta = hasPrevious ? record.difference - prevDiff : 0

		return {
			...record,
			hasPrevious,
			previousDifference: prevDiff,
			previousSiafiValue: prevSiafi,
			previousSilomsValue: prevSiloms,
			previousDate: prevDate,
			delta,
		}
	})
}

// --- PONTE COM O GRÃO PERSISTIDO (sucont.siloms_siafi_balance) ---

/** Arredonda para centavos antes de comparar/gravar — a coluna é numeric(18,2). */
export const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100

/**
 * Converte a saída do parser (linha "larga", 3 grupos por linha) no grão longo que
 * vai para o banco. A competência é normalizada aqui: o mesmo arquivo traz
 * "JANEIRO/2024", "janeiro/2025" e células de data reais, e o banco só aceita
 * o primeiro dia do mês.
 */
export const rawRowsToBalancePayload = (rows: RawInputRow[]): StoredBalanceRow[] => {
	const out: StoredBalanceRow[] = []

	for (const row of rows) {
		if (!row) continue
		const { sortableDate } = parseDateString(row.data)
		if (!/^\d{4}-\d{2}$/.test(sortableDate) || sortableDate === "0000-00") continue

		const ugCodigo = String(row.cod ?? "").trim()
		if (!ugCodigo) continue
		const ugNome = String(row.ug ?? "").trim() || null

		const groups: Array<[AccountGroup, number, number]> = [
			[AccountGroup.CONSUMO, row.g1_siafi, row.g1_siloms],
			[AccountGroup.BMP, row.g2_siafi, row.g2_siloms],
			[AccountGroup.INTANGIVEL, row.g3_siafi, row.g3_siloms],
		]

		for (const [accountGroup, siafi, siloms] of groups) {
			out.push({
				period: sortableDate,
				ugCodigo,
				ugNome,
				accountGroup,
				siafiValue: round2(siafi),
				silomsValue: round2(siloms),
			})
		}
	}

	return out
}

/**
 * Caminho inverso: remonta linhas "largas" a partir do que está no banco, para que
 * o dashboard passe pelo MESMO `normalizeData` do upload. Duas rotas de
 * normalização em paralelo divergiriam na primeira mudança.
 */
export const rawRowsFromStoredBalances = (rows: StoredBalanceRow[]): RawInputRow[] => {
	const byRow = new Map<string, RawInputRow>()

	for (const row of rows) {
		const key = `${row.period}\u0000${row.ugCodigo}`
		let target = byRow.get(key)
		if (!target) {
			target = {
				data: row.period,
				cod: row.ugCodigo,
				ug: row.ugNome ?? row.ugCodigo,
				g1_name: AccountGroup.CONSUMO,
				g1_siafi: 0,
				g1_siloms: 0,
				g1_diff: 0,
				g2_name: AccountGroup.BMP,
				g2_siafi: 0,
				g2_siloms: 0,
				g2_diff: 0,
				g3_name: AccountGroup.INTANGIVEL,
				g3_siafi: 0,
				g3_siloms: 0,
				g3_diff: 0,
			}
			byRow.set(key, target)
		}
		if (row.ugNome) target.ug = row.ugNome

		// g*_diff fica em 0 de propósito: `normalizeData` então recalcula
		// abs(siafi - siloms). O banco também deriva a diferença; nenhum dos dois
		// confia no número que veio na coluna DIF do arquivo.
		if (row.accountGroup === AccountGroup.CONSUMO) {
			target.g1_siafi = row.siafiValue
			target.g1_siloms = row.silomsValue
		} else if (row.accountGroup === AccountGroup.BMP) {
			target.g2_siafi = row.siafiValue
			target.g2_siloms = row.silomsValue
		} else {
			target.g3_siafi = row.siafiValue
			target.g3_siloms = row.silomsValue
		}
	}

	return [...byRow.values()].sort((a, b) => a.data.localeCompare(b.data) || a.cod.localeCompare(b.cod))
}

export const formatCurrency = (value: number) => {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 2,
		minimumFractionDigits: 2,
	}).format(value || 0)
}

export const formatCompactNumber = (value: number) => {
	const absValue = Math.abs(value)
	if (absValue >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00A0Bi`
	}
	if (absValue >= 1_000_000) {
		return `${(value / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00A0Mi`
	}
	if (absValue >= 1_000) {
		return `${(value / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00A0mil`
	}
	return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const formatFinancial = formatCurrency

// --- MESSAGE GENERATORS ---

const getFriendlyGroupName = (group: string) => {
	const groupMap: Record<string, string> = {
		[AccountGroup.CONSUMO]: "BENS DE CONSUMO",
		[AccountGroup.BMP]: "BENS MÓVEIS PERMANENTES",
		[AccountGroup.INTANGIVEL]: "BENS INTANGÍVEIS",
	}
	return groupMap[group] || "CONTA EM ANÁLISE"
}

const getAdministrationAgents = (group: string) => {
	if (group === AccountGroup.CONSUMO) {
		return "Dirigente Máximo, Ordenador de Despesas, Agente de Controle Interno, Gestor de Almoxarifado e demais gestores envolvidos."
	}
	return "Dirigente Máximo, Ordenador de Despesas, Agente de Controle Interno, Gestor de Patrimônio e demais gestores envolvidos."
}

/** Distância em meses entre dois registros já normalizados (a > b ⇒ positivo). */
const monthsApart = (a: { year: number; monthIndex: number }, b: { year: number; monthIndex: number }) => (a.year - b.year) * 12 + (a.monthIndex - b.monthIndex)

/** Marcador único para "não dá para declarar variação" — some do texto como travessão. */
const NO_VARIATION = "—"

/**
 * Variação percentual entre duas competências CONSECUTIVAS.
 *
 * Devolve o travessão quando (a) não há entrada anterior, (b) a entrada anterior
 * não é o período imediatamente anterior — o relatório de origem tem competências
 * em que uma UG simplesmente não aparece, e comparar através do buraco anunciaria
 * como "variação do mês" um salto de vários meses — ou (c) a base anterior é zero,
 * caso em que "+100%" é aritmeticamente vazio.
 */
const consecutiveVariation = (curr: FinancialRecord, prev: FinancialRecord | undefined, expectedGap = 1): string => {
	if (!prev) return NO_VARIATION
	if (monthsApart(curr, prev) !== expectedGap) return NO_VARIATION
	if (prev.difference === 0) return NO_VARIATION
	const v = ((curr.difference - prev.difference) / prev.difference) * 100
	return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`
}

const generateRankingMessage = (
	record: FinancialRecord,
	msgNumber: string,
	deadline: string,
	history: FinancialRecord[] = [],
	timeFilter: TimeFilter = "MENSAL"
): string => {
	const today = new Date()
	const dateStr = today.toLocaleDateString("pt-BR")
	const timeStr = today.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
	const groupText = getFriendlyGroupName(record.group)
	const adminAgents = getAdministrationAgents(record.group)

	const scopeMap: Record<TimeFilter, string> = {
		MENSAL: "mensal",
		TRIMESTRAL: "trimestral",
		SEMESTRAL: "semestral",
		ANUAL: "anual",
	}
	const scopeText = scopeMap[timeFilter] || "mensal"
	const scopeUpper = scopeText.toUpperCase()

	const prevLabel = record.previousDate || "ANTERIOR"
	const currLabel = toShortDate(record.date)

	// `hasPrevious === false` ⇒ a competência anterior não está na base. Não é
	// "divergência anterior de R$ 0,00": é ausência de dado. Declarar variação aqui
	// era afirmar, numa MSG institucional, um aumento contra um mês nunca carregado.
	const hasPrevious = record.hasPrevious === true
	const increase = hasPrevious ? record.delta || 0 : 0
	const variationLabel = !hasPrevious
		? "SEM PERÍODO ANTERIOR"
		: increase > 0
			? "AUMENTO NO PERÍODO"
			: increase < 0
				? "DIMINUIÇÃO NO PERÍODO"
				: "VARIAÇÃO NO PERÍODO"

	const prevDiff = record.previousDifference || 0
	const currDiff = record.difference
	const pctStr =
		!hasPrevious || prevDiff === 0
			? NO_VARIATION
			: `${((currDiff - prevDiff) / prevDiff) * 100 > 0 ? "+" : ""}${(((currDiff - prevDiff) / prevDiff) * 100).toFixed(2)}%`

	const fmt = (val: number) => val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15, " ")
	const padDate = (d: string) => d.padEnd(10, " ")
	const fmtPct = (p: string) => p.padStart(30, " ")

	const headerRow =
		"DATA".padEnd(10) +
		" | " +
		"SIAFI".padStart(15) +
		" | " +
		"SILOMS".padStart(15) +
		" | " +
		"DIFERENÇA".padStart(15) +
		" | " +
		"VAR. EM RELAÇÃO AO MÊS ANTERIOR".padStart(30)

	const sortedHistory = [...history].sort((a, b) => a.year * 100 + a.monthIndex - (b.year * 100 + b.monthIndex))

	const prevDateInfo = parseDateString(record.previousDate ?? "")
	const currDateInfo = parseDateString(record.date)

	const relevantHistory = sortedHistory.filter((h) => {
		const hTime = h.year * 100 + h.monthIndex
		const startTime = prevDateInfo.year * 100 + prevDateInfo.month
		const endTime = currDateInfo.year * 100 + currDateInfo.month
		return hTime >= startTime && hTime <= endTime
	})

	let table = ""
	if (relevantHistory.length > 1) {
		const rows = relevantHistory.map((h, idx) => {
			const d = toShortDate(h.date)
			const s = fmt(h.siafiValue)
			const m = fmt(h.silomsValue)
			const diff = fmt(h.difference)
			// Gap 1 (o default), não o passo do filtro de período: `history` é sempre
			// MENSAL — `handleOpenMessage` monta a série mês a mês da UG — e o cabeçalho
			// desta coluna diz "VAR. EM RELAÇÃO AO MÊS ANTERIOR". Passar 3/6/12 aqui
			// fazia toda a tabela imprimir travessão em TRIMESTRAL/SEMESTRAL/ANUAL.
			const v = fmtPct(consecutiveVariation(h, idx > 0 ? relevantHistory[idx - 1] : undefined))
			return `${padDate(d)} | ${s} | ${m} | ${diff} | ${v}`
		})
		table = `${headerRow}\n${rows.join("\n")}`
	} else {
		const currRow = `${padDate(currLabel)} | ${fmt(record.siafiValue)} | ${fmt(record.silomsValue)} | ${fmt(record.difference)} | ${fmtPct(pctStr)}`
		// Sem competência anterior não se imprime uma linha de zeros: ela seria lida
		// como "no mês passado estava conciliado", que é o oposto do que se sabe.
		table = hasPrevious
			? `${headerRow}\n${padDate(prevLabel)} | ${fmt(record.previousSiafiValue || 0)} | ${fmt(record.previousSilomsValue || 0)} | ${fmt(record.previousDifference || 0)} | ${fmtPct(NO_VARIATION)}\n${currRow}`
			: `${headerRow}\n${currRow}\n\n(Competência anterior — ${prevLabel} — não consta na base carregada; não há variação a declarar.)`
	}

	if (increase < 0) {
		return `${today.getFullYear()}/xxxxxxx Redução de Divergência - ${record.ug} - ${currLabel}

Remetente: xxxxx - SETORIAL DE CONTABILIDADE
Enviado em: ${dateStr} às ${timeStr}
UG destinatárias: ${record.cod} ${record.ug}
Mensagem:

AG DA ADMINISTRAÇÃO: ${adminAgents}

MSG NR ${msgNumber || "XXX"}/SUCONT-4/${today.toLocaleDateString("pt-BR").replace(/\//g, "")}.

Informo que essa Unidade Gestora apresentou redução significativa na divergência de saldos entre os sistemas SIAFI e SILOMS nas contas de ${groupText.toLowerCase()} no escopo ${scopeText}, conforme demonstrado abaixo:

----------------------------------------------------------------------------------------------------------------------------------
EVOLUÇÃO ${scopeUpper} DO SALDO E DIVERGÊNCIA (SIAFI X SILOMS)
----------------------------------------------------------------------------------------------------------------------------------
${table}
----------------------------------------------------------------------------------------------------------------------------------
REDUÇÃO NO PERÍODO   :   ${formatCurrency(Math.abs(increase))} (${pctStr})
----------------------------------------------------------------------------------------------------------------------------------

Diante do exposto, esta Setorial parabeniza essa Unidade Gestora pelos esforços empreendidos na conciliação dos saldos, os quais resultaram na redução expressiva da divergência identificada entre os sistemas.

Ressalta-se a importância da continuidade das ações de análise e regularização, com vistas à plena equalização dos saldos registrados no SIAFI e no SILOMS.

Por fim, coloco à disposição a Divisão de Acompanhamento Patrimonial para interações julgadas oportunas sobre este assunto.

DIREF/SUCONT/SUCONT-4`
	}

	const preponderantSystem = record.siafiValue > record.silomsValue ? "SIAFI" : record.silomsValue > record.siafiValue ? "SILOMS" : "EQUILIBRADO"

	return `${today.getFullYear()}/xxxxxxx Incompatibilidade de saldos nas contas de ${groupText.toLowerCase()} - ${currLabel}

Remetente: xxxxx - SETORIAL DE CONTABILIDADE
Enviado em: ${dateStr} às ${timeStr}
UG destinatárias: ${record.cod} ${record.ug}
Mensagem:

AG DA ADMINISTRAÇÃO: ${adminAgents}

MSG NR ${msgNumber || "XXX"}/SUCONT-4/${today.toLocaleDateString("pt-BR").replace(/\//g, "")}.

Conforme verificação realizada por esta Setorial na data de hoje, informo que essa UG está com divergência significativa de saldos entre os sistemas SIAFI e SILOMS nas contas de ${groupText.toLowerCase()} no escopo ${scopeText}, conforme detalhado abaixo:

----------------------------------------------------------------------------------------------------------------------------------
EVOLUÇÃO ${scopeUpper} DO SALDO E DIVERGÊNCIA (SIAFI X SILOMS)
----------------------------------------------------------------------------------------------------------------------------------
${table}
----------------------------------------------------------------------------------------------------------------------------------
${variationLabel.padEnd(21)}:   ${hasPrevious ? `${formatCurrency(increase)} (${pctStr})` : `não há competência anterior (${prevLabel}) na base carregada`}
----------------------------------------------------------------------------------------------------------------------------------

SISTEMA PREPONDERANTE (MAIOR SALDO): ${preponderantSystem}

Recomendações:

- Proceder com a conciliação analítica entre os registros contábeis no SIAFI (Notas de Lançamento - NL) e os registros correspondentes no SILOMS (ex.: Termos de Recebimento e Exame de Material - TREM, ou documentos equivalentes), conforme a natureza da conta analisada (BMP, Consumo ou Intangível).

- Instaurar força-tarefa integrada entre os setores de Finanças e de Patrimônio (ou área equivalente), com vistas à identificação de registros contabilizados no SIAFI sem a devida correspondência no SILOMS, bem como eventuais registros pendentes de incorporação, baixa ou reclassificação.

- Priorizar a identificação da causa raiz das divergências, evitando a realização de ajustes meramente corretivos sem a devida rastreabilidade e suporte documental.

- Formalizar resposta a esta Diretoria por meio do Sistema de Atendimento ao Usuário (SAU), até ${deadline || "[PREENCHER]"}, contendo obrigatoriamente:
   - Planilha de conciliação detalhada;
   - Justificativa técnica das divergências remanescentes;

- Estabelecer rotina mensal de conferência prévia ao fechamento contábil, contemplando a validação cruzada entre SIAFI e SILOMS, de forma a prevenir o acúmulo de inconsistências em períodos subsequentes.

Por fim, cabe registrar que a persistência da divergência é ocorrência passível de ressalva na conformidade contábil da UG, além de comprometer a evidenciação exigida nos Anexos aplicáveis (Anexo 13 A - BMP, Anexo 13 B - Intangível e Anexo 13 C - Consumo).

${blocoFundamentacao(FUNDAMENTO_CONCILIACAO_SISTEMAS)}

Esta Diretoria reconhece o esforço da gestão na manutenção da conformidade contábil e permanece à disposição para o suporte técnico necessário.

DIREF/SUCONT/SUCONT-4`
}

const generateHeatmapMessage = (record: FinancialRecord, msgNumber: string, deadline: string, history: FinancialRecord[]): string => {
	const today = new Date()
	const dateStr = today.toLocaleDateString("pt-BR")
	const timeStr = today.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
	const groupText = getFriendlyGroupName(record.group)
	const adminAgents = getAdministrationAgents(record.group)
	const separator = "--------------------------------------------------"

	const sortedHistory = [...history].sort((a, b) => a.year * 100 + a.monthIndex - (b.year * 100 + b.monthIndex))

	const relevantHistory = sortedHistory.filter((h) => h.year * 100 + h.monthIndex <= record.year * 100 + record.monthIndex)

	let analysisBlock = ""

	if (relevantHistory.length >= 2) {
		let minIndex = 0
		let minValue = Number.MAX_VALUE

		for (let i = 0; i < relevantHistory.length; i++) {
			if (relevantHistory[i].difference < minValue) {
				minValue = relevantHistory[i].difference
				minIndex = i
			}
		}

		const minRecord = relevantHistory[minIndex]
		const jumpIndex = Math.min(minIndex + 1, relevantHistory.length - 1)
		const jumpRecord = relevantHistory[jumpIndex]

		const baseVal = formatCurrency(minRecord.difference)
		const baseDate = toShortDate(minRecord.date)
		const jumpVal = formatCurrency(jumpRecord.difference)
		const jumpDate = toShortDate(jumpRecord.date)
		const currentVal = formatCurrency(record.difference)
		const currentDate = toShortDate(record.date)

		if (minIndex === relevantHistory.length - 1) {
			analysisBlock = `
PONTO DE ATENÇÃO:
O valor atual de ${currentVal} em ${currentDate} representa o menor patamar identificado no histórico analisado. Acompanha-se a manutenção da tendência de queda.`
		} else {
			analysisBlock = `
PONTO DE ATENÇÃO:
Identificou-se que a divergência evoluiu de ${baseVal} em ${baseDate} (menor valor do período), passando para ${jumpVal} em ${jumpDate}, e chegando ao saldo atual de ${currentVal} em ${currentDate}.

Ressalta-se que, após ${baseDate}, os valores não retornaram ao patamar mínimo identificado, indicando persistência da distorção.`
		}
	} else {
		const singleVal = formatCurrency(record.difference)
		const singleDate = toShortDate(record.date)
		analysisBlock = `
PONTO DE ATENÇÃO:
O saldo atual de divergência é de ${singleVal} em ${singleDate}. Solicita-se análise dos lançamentos para identificar a causa raiz.`
	}

	const evolutionHeader = `${"DATA".padEnd(10)} | ${"SIAFI".padStart(15)} | ${"SILOMS".padStart(15)} | ${"DIFERENÇA".padStart(15)} | ${"VAR. %".padStart(10)}`
	const evolutionTable = `
DETALHAMENTO MÊS A MÊS:
${evolutionHeader}
${sortedHistory
	.map((h, idx) => {
		const d = toShortDate(h.date)
		const s = h.siafiValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15, " ")
		const m = h.silomsValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15, " ")
		const diff = h.difference.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(15, " ")

		const v = consecutiveVariation(h, idx > 0 ? sortedHistory[idx - 1] : undefined).padStart(10, " ")

		return `${d.padEnd(10)} | ${s} | ${m} | ${diff} | ${v}`
	})
	.join("\n")}
`

	return `${today.getFullYear()}/xxxxxxx Regularização Contábil - ${record.ug} - ${groupText}

Remetente: xxxxx - SETORIAL DE CONTABILIDADE
Enviado em: ${dateStr} às ${timeStr}
UG destinatária: ${record.cod} ${record.ug}

AG DA ADMINISTRAÇÃO: ${adminAgents}

MSG NR ${msgNumber || "XXX"}/SUCONT-4/${today.toLocaleDateString("pt-BR").replace(/\//g, "")}.

Em análise da matriz histórica de diferenças desta UG, identificou-se um comportamento atípico nas contas de ${groupText.toLowerCase()}.

${analysisBlock}

${evolutionTable}

${separator}
SISTEMA PREPONDERANTE (MAIOR SALDO): ${record.preponderance}
${separator}

Conclusão:
Diante do exposto, solicita-se ao gestor responsável que providencie a equalização das diferenças até o dia ${deadline || "[PRAZO]"}, considerando o fechamento mensal. Solicita-se, ainda, que seja encaminhada resposta via SAU, apresentando justificativa fundamentada quanto às diferenças identificadas e cronograma de saneamento.

Esta Diretoria reconhece o trabalho realizado pela gestão da Unidade e coloca à disposição a Divisão de Acompanhamento Patrimonial para interações julgadas oportunas.

DIREF/SUCONT/SUCONT-4`
}

export const generateMessage = (
	type: "RANKING" | "HEATMAP",
	record: FinancialRecord,
	msgNumber: string,
	deadline: string,
	history: FinancialRecord[] = [],
	timeFilter: TimeFilter = "MENSAL"
): string => {
	try {
		if (type === "RANKING") {
			return generateRankingMessage(record, msgNumber, deadline, history, timeFilter)
		}
		return generateHeatmapMessage(record, msgNumber, deadline, history)
	} catch (_error) {
		return "ERRO AO GERAR MENSAGEM. VERIFIQUE OS DADOS."
	}
}

export const generateSiafiMessageText = (record: FinancialRecord, msgNumber: string, deadline: string, history?: FinancialRecord[]) =>
	generateHeatmapMessage(record, msgNumber, deadline, history || [])

/**
 * Reescreve o número da MSG num corpo já redigido.
 *
 * O gerador emite `MSG NR <n>/SUCONT-4/<data>`, mas o número real só existe depois
 * do insert — vem da sequência do banco. Substituir aqui garante que o texto
 * gravado seja o mesmo texto que o operador copia; se divergissem, o registro
 * deixaria de servir como prova do que foi enviado.
 */
export const applyMessageNumber = (corpo: string, messageNumber: number): string => {
	const pattern = /MSG NR\s+\S*?\/SUCONT-4\//
	if (!pattern.test(corpo)) return corpo
	return corpo.replace(pattern, `MSG NR ${messageNumber}/SUCONT-4/`)
}

/** Chave do grão persistido: competência + UG + grupo de contas. */
export const balanceGrainKey = (period: string, ugCodigo: string, accountGroup: string) => `${period}|${ugCodigo}|${accountGroup}`

/**
 * Colapsa grãos repetidos dentro do mesmo arquivo, mantendo a última ocorrência.
 *
 * `parseExcelFile` substitui UG sem código por "000000" (linha de total/subtotal do
 * relatório). Dois desses na mesma competência põem o mesmo alvo de conflito duas
 * vezes no upsert, e o Postgres aborta o lote inteiro com 21000 "ON CONFLICT DO
 * UPDATE command cannot affect row a second time" — o upload morre com mensagem de
 * driver, sem nada gravado.
 */
export const dedupeBalanceGrain = <T extends { period: string; ugCodigo: string; accountGroup: string }>(rows: T[]): { rows: T[]; duplicates: number } => {
	const byGrain = new Map<string, T>()
	let duplicates = 0
	for (const row of rows) {
		const key = balanceGrainKey(row.period, row.ugCodigo, row.accountGroup)
		if (byGrain.has(key)) duplicates++
		byGrain.set(key, row)
	}
	return { rows: [...byGrain.values()], duplicates }
}
