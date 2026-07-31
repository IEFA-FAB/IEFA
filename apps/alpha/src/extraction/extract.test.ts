import { describe, expect, test } from "bun:test"
import { applySpans } from "./apply-spans.ts"
import { locateSpan, tokenSimilarity } from "./locate-span.ts"
import { CAMPOS_OBRIGATORIOS, ContratacaoSchema } from "./schema.ts"
import { docxToSubmissionText } from "./to-text.ts"

const DOCUMENT = [
	"1. OBJETO",
	"Contratação de serviços de manutenção predial preventiva e corretiva para a Base Aérea de Anápolis, pelo período de 12 (doze) meses.",
	"2. JUSTIFICATIVA DA NECESSIDADE",
	"A ausência de contrato vigente de manutenção compromete a disponibilidade das instalações operacionais da Unidade.",
	"3. VALOR ESTIMADO",
	"O valor total estimado da contratação é de R$ 1.250.000,00 (um milhão duzentos e cinquenta mil reais).",
].join("\n")

function emptyPayload(): Record<string, unknown> {
	return Object.fromEntries(Object.keys(ContratacaoSchema.shape).map((key) => [key, null]))
}

describe("locateSpan", () => {
	test("localiza citação literal", () => {
		const span = locateSpan(DOCUMENT, "Contratação de serviços de manutenção predial preventiva")
		expect(span).not.toBeNull()
		expect(DOCUMENT.slice(span?.start, span?.end)).toContain("manutenção predial preventiva")
	})

	test("tolera diferença de espaçamento e acentuação na transcrição", () => {
		const span = locateSpan(DOCUMENT, "contratacao   de  servicos de manutencao predial preventiva")
		expect(span).not.toBeNull()
	})

	test("devolve null para citação inexistente", () => {
		expect(locateSpan(DOCUMENT, "cláusula de reajuste anual pelo IPCA acumulado no período")).toBeNull()
	})

	test("devolve null para citação curta demais para identificar posição", () => {
		expect(locateSpan(DOCUMENT, "objeto")).toBeNull()
	})

	test("similaridade por token é simétrica e limitada a 1", () => {
		expect(tokenSimilarity("manutenção predial", "manutenção predial")).toBe(1)
		expect(tokenSimilarity("a b c", "c b a")).toBe(1)
		expect(tokenSimilarity("manutenção", "aeronave")).toBe(0)
	})
})

describe("applySpans", () => {
	test("aceita campo cuja evidência está no documento", () => {
		const result = applySpans(
			{
				...emptyPayload(),
				objeto: { value: "Manutenção predial na BAAN por 12 meses", evidence: "Contratação de serviços de manutenção predial preventiva e corretiva" },
			},
			DOCUMENT
		)

		expect(result.payload.objeto?.value).toContain("Manutenção predial")
		expect(result.spans.objeto).toBeDefined()
		expect(result.dropped).toHaveLength(0)
	})

	test("descarta campo cuja evidência não existe no documento", () => {
		const result = applySpans(
			{
				...emptyPayload(),
				garantia: { value: "Garantia de 5% do valor do contrato", evidence: "Será exigida garantia de 5% (cinco por cento) do valor total do contrato" },
			},
			DOCUMENT
		)

		expect(result.payload.garantia).toBeNull()
		expect(result.dropped).toEqual([{ field: "garantia", reason: "evidencia_nao_localizada" }])
		expect(result.spans.garantia).toBeUndefined()
	})

	test("campo ausente no documento permanece nulo, sem span", () => {
		const result = applySpans(emptyPayload(), DOCUMENT)

		expect(result.payload.justificativa_parcelamento).toBeNull()
		expect(Object.keys(result.spans)).toHaveLength(0)
		expect(result.dropped).toHaveLength(0)
	})

	test("span aponta para o trecho certo do documento", () => {
		const result = applySpans(
			{
				...emptyPayload(),
				valor_estimado: { value: "R$ 1.250.000,00", evidence: "O valor total estimado da contratação é de R$ 1.250.000,00" },
			},
			DOCUMENT
		)

		const span = result.spans.valor_estimado
		expect(span).toBeDefined()
		expect(DOCUMENT.slice(span?.start, span?.end)).toContain("1.250.000,00")
	})

	test("rejeita saída fora do schema em vez de persistir payload inválido", () => {
		expect(() => applySpans({ ...emptyPayload(), objeto: { value: "sem evidência" } }, DOCUMENT)).toThrow()
	})

	test("todos os campos obrigatórios existem no schema", () => {
		for (const campo of CAMPOS_OBRIGATORIOS) {
			expect(Object.keys(ContratacaoSchema.shape)).toContain(campo)
		}
	})
})

const trBytes = new Uint8Array(await Bun.file(new URL("../sources/agu/__fixtures__/modelo-tr-servicos-e-obras-mai-26.docx", import.meta.url)).arrayBuffer())

describe("docxToSubmissionText", () => {
	const submission = docxToSubmissionText(trBytes)

	test("extrai texto corrido do documento", () => {
		expect(submission.text.length).toBeGreaterThan(1000)
	})

	test("deriva seções sem depender dos estilos próprios da AGU", () => {
		expect(submission.nodes.length).toBeGreaterThan(5)
		for (const node of submission.nodes) {
			expect(node.title.length).toBeGreaterThan(0)
			expect(node.path.split(".").length).toBe(node.level)
		}
	})

	test("o texto extraído permite localizar spans", () => {
		const firstTitle = submission.nodes[0]?.title ?? ""
		if (firstTitle.length >= 12) expect(locateSpan(submission.text, firstTitle)).not.toBeNull()
	})
})
