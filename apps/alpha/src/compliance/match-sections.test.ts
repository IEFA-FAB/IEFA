import { describe, expect, test } from "bun:test"
import { cosineSimilarity, longestIncreasingSubsequence, matchSections, toComparable, tokenSetRatio } from "./match-sections.ts"

const MODELO = toComparable([
	{ path: "1", ordinal: 0, title: "1. CONDIÇÕES GERAIS DA CONTRATAÇÃO" },
	{ path: "2", ordinal: 1, title: "2. FUNDAMENTAÇÃO DA CONTRATAÇÃO" },
	{ path: "3", ordinal: 2, title: "3. DESCRIÇÃO DA SOLUÇÃO" },
	{ path: "4", ordinal: 3, title: "4. REQUISITOS DA CONTRATAÇÃO" },
	{ path: "5", ordinal: 4, title: "5. CRITÉRIOS DE SUSTENTABILIDADE", is_required: false },
])

describe("tokenSetRatio", () => {
	test("insensível à ordem das palavras", () => {
		expect(tokenSetRatio("da justificativa contratacao", "contratacao da justificativa")).toBe(1)
	})

	test("uma palavra a mais ainda casa acima do limiar", () => {
		// Dice: 2*3/(3+4) ≈ 0,857. Em Jaccard seria 0,75 e a renomeação escaparia.
		expect(tokenSetRatio("requisitos da contratacao", "requisitos da contratacao detalhados")).toBeCloseTo(0.857, 2)
	})

	test("duas palavras a mais já ficam abaixo do limiar", () => {
		expect(tokenSetRatio("requisitos da contratacao", "requisitos da contratacao detalhados pela unidade")).toBeLessThan(0.85)
	})

	test("zero para conjuntos disjuntos", () => {
		expect(tokenSetRatio("objeto", "vigencia")).toBe(0)
	})
})

describe("longestIncreasingSubsequence", () => {
	test("mantém tudo quando já está em ordem", () => {
		expect(longestIncreasingSubsequence([0, 1, 2, 3]).size).toBe(4)
	})

	test("marca apenas um lado da inversão", () => {
		// [0,2,1,3]: a subsequência máxima tem 3 elementos, então só 1 fica fora.
		expect(longestIncreasingSubsequence([0, 2, 1, 3]).size).toBe(3)
	})

	test("lista vazia não quebra", () => {
		expect(longestIncreasingSubsequence([]).size).toBe(0)
	})
})

describe("cosineSimilarity", () => {
	test("vetores idênticos", () => {
		expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1, 6)
	})

	test("vetores ortogonais", () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBe(0)
	})

	test("vetor nulo não gera NaN", () => {
		expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
	})
})

describe("matchSections", () => {
	test("documento aderente não gera achado de divergência", async () => {
		const documento = toComparable([
			{ path: "1", ordinal: 0, title: "1 - CONDIÇÕES GERAIS DA CONTRATAÇÃO" },
			{ path: "2", ordinal: 1, title: "2 - FUNDAMENTAÇÃO DA CONTRATAÇÃO" },
			{ path: "3", ordinal: 2, title: "3 - DESCRIÇÃO DA SOLUÇÃO" },
			{ path: "4", ordinal: 3, title: "4 - REQUISITOS DA CONTRATAÇÃO" },
			{ path: "5", ordinal: 4, title: "5 - CRITÉRIOS DE SUSTENTABILIDADE" },
		])

		const findings = await matchSections(MODELO, documento)
		expect(findings.every((finding) => finding.status === "MATCHED")).toBe(true)
	})

	test("seção obrigatória ausente vira MISSING marcada como obrigatória", async () => {
		const documento = toComparable([
			{ path: "1", ordinal: 0, title: "CONDIÇÕES GERAIS DA CONTRATAÇÃO" },
			{ path: "2", ordinal: 1, title: "DESCRIÇÃO DA SOLUÇÃO" },
		])

		const findings = await matchSections(MODELO, documento)
		const missing = findings.filter((finding) => finding.status === "MISSING")

		expect(missing.map((finding) => finding.model_title)).toContain("2. FUNDAMENTAÇÃO DA CONTRATAÇÃO")
		expect(missing.find((finding) => finding.model_title?.includes("SUSTENTABILIDADE"))?.is_required).toBe(false)
	})

	test("seção do documento sem correspondente vira EXTRA", async () => {
		const documento = toComparable([
			{ path: "1", ordinal: 0, title: "CONDIÇÕES GERAIS DA CONTRATAÇÃO" },
			{ path: "2", ordinal: 1, title: "ANEXO — PLANILHA DE CUSTOS UNITÁRIOS" },
		])

		const findings = await matchSections(MODELO, documento)
		expect(findings.find((finding) => finding.status === "EXTRA")?.document_title).toContain("PLANILHA")
	})

	test("título reescrito casa por similaridade e é classificado como RENAMED", async () => {
		const documento = toComparable([{ path: "1", ordinal: 0, title: "4. REQUISITOS DA CONTRATAÇÃO PRETENDIDA" }])

		const findings = await matchSections(MODELO, documento)
		const renamed = findings.find((finding) => finding.status === "RENAMED")

		expect(renamed?.model_title).toBe("4. REQUISITOS DA CONTRATAÇÃO")
		expect(renamed?.matched_by).toBe("fuzzy")
	})

	test("inversão marca só a seção deslocada, não as duas", async () => {
		const documento = toComparable([
			{ path: "1", ordinal: 0, title: "CONDIÇÕES GERAIS DA CONTRATAÇÃO" },
			{ path: "2", ordinal: 1, title: "DESCRIÇÃO DA SOLUÇÃO" },
			{ path: "3", ordinal: 2, title: "FUNDAMENTAÇÃO DA CONTRATAÇÃO" },
			{ path: "4", ordinal: 3, title: "REQUISITOS DA CONTRATAÇÃO" },
		])

		const findings = await matchSections(MODELO, documento)
		expect(findings.filter((finding) => finding.status === "OUT_OF_ORDER")).toHaveLength(1)
	})

	test("resultado é idêntico entre execuções", async () => {
		const documento = toComparable([
			{ path: "1", ordinal: 0, title: "REQUISITOS DA CONTRATAÇÃO" },
			{ path: "2", ordinal: 1, title: "CONDIÇÕES GERAIS DA CONTRATAÇÃO" },
			{ path: "3", ordinal: 2, title: "OUTRA COISA QUALQUER" },
		])

		const first = await matchSections(MODELO, documento)
		const second = await matchSections(MODELO, documento)
		expect(JSON.stringify(first)).toBe(JSON.stringify(second))
	})

	test("uma seção do documento não casa com dois nós do modelo", async () => {
		const documento = toComparable([{ path: "1", ordinal: 0, title: "CONTRATAÇÃO" }])

		const findings = await matchSections(MODELO, documento)
		const matched = findings.filter((finding) => finding.document_path !== undefined)
		expect(matched.length).toBeLessThanOrEqual(1)
	})

	test("passada semântica só é usada para o que sobra das anteriores", async () => {
		const documento = toComparable([
			{ path: "1", ordinal: 0, title: "1. CONDIÇÕES GERAIS DA CONTRATAÇÃO" },
			{ path: "2", ordinal: 1, title: "DO QUE SE PRETENDE ADQUIRIR" },
		])

		let embedCalls = 0
		const embed = async (titles: string[]) => {
			embedCalls += 1
			// Vetor determinístico: dimensão 0 marca "pretende adquirir".
			return titles.map((title) => (/pretende|solu/i.test(title) ? [1, 0] : [0, 1]))
		}

		const findings = await matchSections(MODELO, documento, embed)
		const semantic = findings.find((finding) => finding.matched_by === "semantic")

		expect(embedCalls).toBe(1)
		expect(semantic?.model_title).toBe("3. DESCRIÇÃO DA SOLUÇÃO")
	})

	test("sem embedder, o que sobra vira MISSING em vez de casar errado", async () => {
		const documento = toComparable([{ path: "1", ordinal: 0, title: "DO QUE SE PRETENDE ADQUIRIR" }])

		const findings = await matchSections(MODELO, documento)
		expect(findings.filter((finding) => finding.status === "MISSING")).toHaveLength(5)
		expect(findings.filter((finding) => finding.status === "EXTRA")).toHaveLength(1)
	})
})
