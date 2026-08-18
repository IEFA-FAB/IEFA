/**
 * Auditor SIAFI x SILOMS — contrato de parsing, normalização e classificação.
 *
 * Cada bloco abaixo trava um defeito observado ao processar o relatório real de
 * importação (32 competências, 84 UGs). A fixture reproduz as patologias do
 * arquivo sem carregar dado financeiro institucional para o repositório.
 */

import { beforeAll, describe, expect, it } from "bun:test"
import { AccountGroup, ImpactLevel, ProbabilityLevel, type RawInputRow, RiskLevel, type StoredBalanceRow } from "../types"
import { buildFixtureFile, installFileReaderPolyfill } from "./__fixtures__/report"
import {
	applyMessageNumber,
	applyRiskClassification,
	generateMessage,
	normalizeData,
	parseDateString,
	rawRowsFromStoredBalances,
	rawRowsToBalancePayload,
	recalculateDeltas,
} from "./dataProcessor"
import { parseExcelFile } from "./excelParser"

let rawRows: RawInputRow[]

beforeAll(async () => {
	installFileReaderPolyfill()
	rawRows = await parseExcelFile(buildFixtureFile())
})

describe("parseExcelFile", () => {
	it("detecta o cabeçalho 'MÊS' e lê todas as linhas de dado", () => {
		expect(rawRows).toHaveLength(5)
	})

	it("mapeia as colunas dos três grupos sem deslocamento", () => {
		const first = rawRows[0]
		expect(first.cod).toBe("120001")
		expect(first.ug).toBe("ALFA")
		expect(first.g1_siafi).toBe(1000)
		expect(first.g1_siloms).toBe(900)
		expect(first.g2_siafi).toBe(500)
		expect(first.g3_siafi).toBe(10)
	})
})

describe("parseDateString", () => {
	// O mesmo arquivo traz caixa alta, caixa baixa e célula de data de verdade.
	it("normaliza os três formatos de competência do arquivo para YYYY-MM", () => {
		expect(parseDateString("JANEIRO/2024").sortableDate).toBe("2024-01")
		expect(parseDateString("março/2025").sortableDate).toBe("2025-03")
		expect(parseDateString(new Date(2025, 3, 1).toISOString()).sortableDate).toBe("2025-04")
	})

	it("reconhece as competências das três formas dentro do arquivo parseado", () => {
		const periods = [...new Set(rawRows.map((r) => parseDateString(r.data).sortableDate))].sort()
		expect(periods).toEqual(["2024-01", "2025-03", "2025-04"])
	})
})

describe("normalizeData — a coluna DIF do arquivo nunca é fonte", () => {
	it("deriva a diferença de |SIAFI - SILOMS| mesmo com o sinal do arquivo invertido", () => {
		const records = normalizeData(rawRows)
		for (const r of records) {
			expect(r.difference).toBeCloseTo(Math.abs(r.siafiValue - r.silomsValue), 2)
		}
	})

	it("ignora DIF zerado quando os saldos divergem de fato", () => {
		// Fixture: JAN/2024, UG 120002, BMP — SIAFI 800 x SILOMS 600, DIF gravado 0.
		const records = normalizeData(rawRows)
		const mentiroso = records.find((r) => r.cod === "120002" && r.group === AccountGroup.BMP && r.date === "2024-01")
		expect(mentiroso?.difference).toBe(200)
	})

	it("marca o sistema preponderante pelos saldos, não pelo sinal da coluna DIF", () => {
		const records = normalizeData(rawRows)
		const alfa = records.find((r) => r.cod === "120001" && r.group === AccountGroup.CONSUMO && r.date === "2024-01")
		expect(alfa?.preponderance).toBe("SIAFI")
	})
})

describe("recalculateDeltas — ausência de competência anterior não é divergência zero", () => {
	const build = () => recalculateDeltas(normalizeData(rawRows), "MENSAL")

	it("marca hasPrevious=false quando o mês anterior não está na base", () => {
		// 2024-01 é a primeira competência do recorte: dez/2023 não existe.
		const first = build().filter((r) => r.date === "2024-01")
		expect(first.length).toBeGreaterThan(0)
		for (const r of first) expect(r.hasPrevious).toBe(false)
	})

	it("zera o delta quando não há linha de comparação", () => {
		const first = build().find((r) => r.date === "2024-01" && r.group === AccountGroup.CONSUMO)
		expect(first?.difference).toBe(100)
		// Sem baseline o delta não pode carregar a própria diferença corrente,
		// senão o registro sobe no ranking de "maior aumento" contra um mês fantasma.
		expect(first?.delta).toBe(0)
	})

	it("marca hasPrevious=true e calcula o delta quando o mês anterior existe", () => {
		// 120001/CONSUMO: 2025-03 diferença 200, 2025-04 diferença 300.
		const abril = build().find((r) => r.cod === "120001" && r.group === AccountGroup.CONSUMO && r.date === "2025-04")
		expect(abril?.hasPrevious).toBe(true)
		expect(abril?.previousDifference).toBe(200)
		expect(abril?.delta).toBe(100)
	})

	it("não inventa baseline quando a UG some de uma competência", () => {
		// 120002 não aparece em 2025-03; abril não tem anterior imediato.
		const abril = build().find((r) => r.cod === "120002" && r.group === AccountGroup.BMP && r.date === "2025-04")
		expect(abril?.hasPrevious).toBe(false)
		expect(abril?.delta).toBe(0)
	})
})

describe("applyRiskClassification — probabilidade relativa à janela observada", () => {
	it("não estoura 100% de probabilidade quando a série tem mais de 12 competências", () => {
		// 24 competências para uma UG que diverge em todas: com o denominador fixo
		// de 12 o score ia a 200% e o eixo parava de separar qualquer coisa.
		const rows: RawInputRow[] = []
		for (let i = 0; i < 24; i++) {
			const year = 2024 + Math.floor(i / 12)
			const month = (i % 12) + 1
			rows.push({
				data: `${year}-${String(month).padStart(2, "0")}`,
				cod: "120001",
				ug: "ALFA",
				g1_name: "CONSUMO",
				g1_siafi: 1000 + i,
				g1_siloms: 900,
				g1_diff: 0,
				g2_name: "BMP",
				g2_siafi: 0,
				g2_siloms: 0,
				g2_diff: 0,
				g3_name: "INTANGIVEL",
				g3_siafi: 0,
				g3_siloms: 0,
				g3_diff: 0,
			})
		}
		const classified = applyRiskClassification(recalculateDeltas(normalizeData(rows), "MENSAL"))
		const consumo = classified.filter((r) => r.group === AccountGroup.CONSUMO)
		expect(consumo[0].monthsWithDivergence).toBe(24)
		// Divergiu em 100% das competências ⇒ o topo do eixo, sem extrapolar.
		expect(consumo[0].probabilityLevel).toBe(ProbabilityLevel.CRONICO)
	})

	it("separa os níveis de probabilidade dentro da mesma janela", () => {
		const rows: RawInputRow[] = []
		for (let i = 0; i < 20; i++) {
			const month = (i % 12) + 1
			const year = 2024 + Math.floor(i / 12)
			rows.push({
				data: `${year}-${String(month).padStart(2, "0")}`,
				cod: "120001",
				ug: "ALFA",
				g1_name: "CONSUMO",
				// diverge em todas as 20
				g1_siafi: 1000,
				g1_siloms: 900,
				g1_diff: 0,
				g2_name: "BMP",
				// diverge só na primeira
				g2_siafi: i === 0 ? 500 : 100,
				g2_siloms: 100,
				g2_diff: 0,
				g3_name: "INTANGIVEL",
				g3_siafi: 0,
				g3_siloms: 0,
				g3_diff: 0,
			})
		}
		const classified = applyRiskClassification(recalculateDeltas(normalizeData(rows), "MENSAL"))
		const consumo = classified.find((r) => r.group === AccountGroup.CONSUMO)
		const bmp = classified.find((r) => r.group === AccountGroup.BMP)
		expect(consumo?.probabilityLevel).toBe(ProbabilityLevel.CRONICO)
		expect(bmp?.probabilityLevel).toBe(ProbabilityLevel.RARO)
	})
})

describe("applyRiskClassification — risco por (UG, grupo), não por UG", () => {
	it("não contamina um grupo conciliado com o risco de outro grupo da mesma UG", () => {
		const rows: RawInputRow[] = Array.from({ length: 6 }, (_, i) => ({
			data: `2024-${String(i + 1).padStart(2, "0")}`,
			cod: "120001",
			ug: "ALFA",
			g1_name: "CONSUMO",
			g1_siafi: 0,
			g1_siloms: 0,
			g1_diff: 0,
			g2_name: "BMP",
			// BMP diverge em centenas de milhões, todo mês
			g2_siafi: 500_000_000,
			g2_siloms: 1_000,
			g2_diff: 0,
			g3_name: "INTANGIVEL",
			// Intangível perfeitamente conciliado
			g3_siafi: 10,
			g3_siloms: 10,
			g3_diff: 0,
		}))

		const classified = applyRiskClassification(recalculateDeltas(normalizeData(rows), "MENSAL"))
		const bmp = classified.find((r) => r.group === AccountGroup.BMP)
		const intangivel = classified.find((r) => r.group === AccountGroup.INTANGIVEL)

		expect(bmp?.difference).toBeGreaterThan(0)
		expect(intangivel?.difference).toBe(0)

		// O grão certo é a conta. O que importa é a ORDEM: um Intangível zerado não
		// pode receber a mesma classificação do BMP da mesma UG — antes recebia,
		// porque a estatística era por unidade e carimbada em todos os registros.
		const ordem = [RiskLevel.BAIXO, RiskLevel.MEDIO, RiskLevel.ALTO, RiskLevel.CRITICO]
		const rank = (level?: RiskLevel) => ordem.indexOf(level ?? RiskLevel.BAIXO)
		expect(rank(bmp?.riskLevel)).toBeGreaterThan(rank(intangivel?.riskLevel))
		expect(intangivel?.impactLevel).toBe(ImpactLevel.INSIGNIFICANTE)
		const escalaImpacto = [ImpactLevel.INSIGNIFICANTE, ImpactLevel.MENOR, ImpactLevel.MODERADO, ImpactLevel.MAIOR, ImpactLevel.CATASTROFICO]
		expect(escalaImpacto.indexOf(bmp?.impactLevel ?? ImpactLevel.INSIGNIFICANTE)).toBeGreaterThan(
			escalaImpacto.indexOf(intangivel?.impactLevel ?? ImpactLevel.INSIGNIFICANTE)
		)
		expect(intangivel?.monthsWithDivergence).toBe(0)
		expect(bmp?.monthsWithDivergence).toBe(6)
	})
})

describe("generateMessage", () => {
	const build = () => applyRiskClassification(recalculateDeltas(normalizeData(rawRows), "MENSAL"))

	it("não declara aumento percentual contra uma competência que não existe", () => {
		const data = build()
		const primeiro = data.find((r) => r.date === "2024-01" && r.group === AccountGroup.CONSUMO && r.cod === "120001")
		if (!primeiro) throw new Error("fixture sem o registro esperado")

		const msg = generateMessage("RANKING", primeiro, "123", "30/09/2026", [], "MENSAL")

		expect(msg).not.toContain("+100.00%")
		expect(msg).not.toContain("AUMENTO NO PERÍODO")
		expect(msg).toContain("SEM PERÍODO ANTERIOR")
		expect(msg).toContain("não consta na base carregada")
	})

	it("declara a variação quando a competência anterior existe", () => {
		const data = build()
		const historico = data.filter((r) => r.cod === "120001" && r.group === AccountGroup.CONSUMO)
		const abril = historico.find((r) => r.date === "2025-04")
		if (!abril) throw new Error("fixture sem o registro esperado")

		const msg = generateMessage("RANKING", abril, "123", "30/09/2026", historico, "MENSAL")
		expect(msg).toContain("AUMENTO NO PERÍODO")
	})

	it("não compara através de um buraco na série", () => {
		// 120002/BMP existe em JAN/24 e ABR/25; entre eles faltam competências.
		// A coluna de variação não pode tratar JAN/24 como "mês anterior" de ABR/25.
		const data = build()
		const historico = data.filter((r) => r.cod === "120002" && r.group === AccountGroup.BMP)
		const abril = historico.find((r) => r.date === "2025-04")
		if (!abril) throw new Error("fixture sem o registro esperado")

		const msg = generateMessage("HEATMAP", abril, "123", "30/09/2026", historico)
		// Linhas de dado da tabela de evolução: "ABR/25 | ... | ... | ... | ..."
		const linhas = msg.split("\n").filter((l) => /^[A-Z]{3}\/\d{2}\s*\|/.test(l))
		expect(linhas).toHaveLength(2)
		// Nenhuma linha pode anunciar percentual: entre JAN/24 e ABR/25 há um buraco,
		// e tratar um salto de 15 meses como "variação do mês" é inventar dado.
		expect(linhas.every((l) => l.includes("—"))).toBe(true)
		expect(linhas.some((l) => l.includes("%"))).toBe(false)
	})

	it("nunca devolve o texto de erro genérico para registros válidos", () => {
		for (const record of build()) {
			expect(generateMessage("HEATMAP", record, "1", "01/01/2027", [record])).not.toContain("ERRO AO GERAR")
		}
	})
})

describe("applyMessageNumber", () => {
	it("substitui o marcador pelo número atribuído pela sequência", () => {
		const corpo = "linha\n\nMSG NR XXX/SUCONT-4/18082026.\n\nresto"
		expect(applyMessageNumber(corpo, 42)).toContain("MSG NR 42/SUCONT-4/18082026.")
		expect(applyMessageNumber(corpo, 42)).not.toContain("XXX")
	})

	it("é idempotente sobre um corpo já numerado", () => {
		const corpo = "MSG NR 42/SUCONT-4/18082026."
		expect(applyMessageNumber(corpo, 42)).toBe(corpo)
	})

	it("devolve o corpo intacto quando o operador apagou a linha da MSG", () => {
		const corpo = "sem cabeçalho de mensagem"
		expect(applyMessageNumber(corpo, 7)).toBe(corpo)
	})
})

describe("ponte com o grão persistido", () => {
	it("converte a linha larga do parser em um registro por grupo de contas", () => {
		const payload = rawRowsToBalancePayload(rawRows)
		expect(payload).toHaveLength(rawRows.length * 3)
		expect(new Set(payload.map((p) => p.accountGroup))).toEqual(new Set([AccountGroup.CONSUMO, AccountGroup.BMP, AccountGroup.INTANGIVEL]))
		expect(payload.every((p) => /^\d{4}-\d{2}$/.test(p.period))).toBe(true)
	})

	it("normaliza a competência de qualquer um dos formatos do arquivo", () => {
		const periods = [...new Set(rawRowsToBalancePayload(rawRows).map((p) => p.period))].sort()
		expect(periods).toEqual(["2024-01", "2025-03", "2025-04"])
	})

	it("volta do grão persistido para os mesmos saldos, pelo mesmo normalizeData", () => {
		const doArquivo = normalizeData(rawRows)
		const stored: StoredBalanceRow[] = rawRowsToBalancePayload(rawRows)
		const doBanco = normalizeData(rawRowsFromStoredBalances(stored))

		expect(doBanco).toHaveLength(doArquivo.length)

		const chave = (r: { sortableDate: string; cod: string; group: string }) => `${r.sortableDate}|${r.cod}|${r.group}`
		const mapa = new Map(doArquivo.map((r) => [chave(r), r]))
		for (const r of doBanco) {
			const original = mapa.get(chave(r))
			expect(original).toBeDefined()
			expect(r.siafiValue).toBeCloseTo(original?.siafiValue ?? -1, 2)
			expect(r.silomsValue).toBeCloseTo(original?.silomsValue ?? -1, 2)
			expect(r.difference).toBeCloseTo(original?.difference ?? -1, 2)
		}
	})

	it("descarta linhas sem competência reconhecível em vez de gravar lixo", () => {
		const quebrada: RawInputRow[] = [
			{ ...rawRows[0], data: "" },
			{ ...rawRows[0], data: "sem data nenhuma" },
		]
		expect(rawRowsToBalancePayload(quebrada)).toHaveLength(0)
	})
})
