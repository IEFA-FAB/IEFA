import { describe, expect, it } from "bun:test"
import { CHECKLIST_QUESTIONS } from "#/sacdgc/checklist"
import { buildDgcUserPrompt, DGC_SYSTEM_PROMPT } from "#/sacdgc/prompt"
import type { PanelId, UgDataset } from "#/sacdgc/types"

const DATASET: UgDataset = {
	ugCode: "120006",
	ugName: "120006 - GRUPAMENTO DE APOIO DE BRASILIA",
	group: "GAP",
	rowCount: { 1: 47, 2: 21, 3: 48, 4: 7 },
	consolidated: "Painel 1 - UG Beneficiada;...\n120006;SISADM (31.YY.ZZ);2026;JULHO;Diárias (XX.YY.00);1.355,00",
	truncated: false,
}

const ALL_PANELS: PanelId[] = [1, 2, 3, 4]

describe("DGC_SYSTEM_PROMPT", () => {
	// O prompt herdado exemplificava valor como "1,355.00" (padrão inglês) sobre uma
	// base pt-BR: o modelo lia mil trezentos e cinquenta e cinco onde havia um vírgula
	// trinta e cinco e reportava valores 1000x errados.
	it("declara o formato numérico pt-BR com exemplo", () => {
		expect(DGC_SYSTEM_PROMPT).toContain("1.355,00")
		expect(DGC_SYSTEM_PROMPT).toMatch(/ponto é separador de MILHAR/i)
		expect(DGC_SYSTEM_PROMPT).not.toContain("1,355.00")
	})

	it("avisa que a coluna de valor do Painel 2 é efetivo, não dinheiro", () => {
		expect(DGC_SYSTEM_PROMPT).toMatch(/PAINEL NÃO É DINHEIRO/i)
		expect(DGC_SYSTEM_PROMPT).toMatch(/QUANTITATIVO DE MILITARES/i)
	})

	it("proíbe somar valores entre painéis", () => {
		expect(DGC_SYSTEM_PROMPT).toMatch(/Sem soma entre painéis/i)
	})

	it("carrega a base normativa e os sistemas do COMAER", () => {
		for (const marker of ["Módulo 19", "Módulo 22", "SISUB", "SISHT", "SISPNR", "SISTRAN", "99.03.ZZ", "33903007", "P_020"]) {
			expect(DGC_SYSTEM_PROMPT).toContain(marker)
		}
	})

	it("mantém a exceção do SISTRAN (não alertar UG fora da estrutura)", () => {
		expect(DGC_SYSTEM_PROMPT).toMatch(/NÃO gere alerta para UG não integrante que possua custo SISTRAN/i)
	})

	it("é o mesmo texto entre chamadas (a parte cara do prompt não varia por UG)", () => {
		expect(DGC_SYSTEM_PROMPT).toBe(DGC_SYSTEM_PROMPT)
		expect(DGC_SYSTEM_PROMPT).not.toContain("120006")
	})
})

describe("buildDgcUserPrompt", () => {
	it("fixa a identidade da UG analisada", () => {
		const prompt = buildDgcUserPrompt({ dataset: DATASET, panelsFound: ALL_PANELS, competence: "JULHO/2026" })
		expect(prompt).toContain("Código: 120006")
		expect(prompt).toContain("120006 - GRUPAMENTO DE APOIO DE BRASILIA")
		expect(prompt).toContain("Competência da base: JULHO/2026")
	})

	it("leva as 20 perguntas do checklist", () => {
		const prompt = buildDgcUserPrompt({ dataset: DATASET, panelsFound: ALL_PANELS })
		for (const q of CHECKLIST_QUESTIONS) expect(prompt).toContain(q.pergunta)
	})

	it("leva o recorte da UG", () => {
		expect(buildDgcUserPrompt({ dataset: DATASET, panelsFound: ALL_PANELS })).toContain(DATASET.consolidated)
	})

	// Painel não carregado não é painel zerado: sem essa distinção o modelo assinava
	// "ausência de apropriação" sobre um dado que ninguém enviou.
	it("distingue painel não enviado de painel sem linha da UG", () => {
		const prompt = buildDgcUserPrompt({
			dataset: { ...DATASET, rowCount: { 1: 47, 2: 0, 3: 48, 4: 0 } },
			panelsFound: [1, 2, 3],
		})
		expect(prompt).toContain("Painéis NÃO enviados: Painel 4")
		expect(prompt).toMatch(/Painéis enviados em que ESTA UG não tem nenhuma linha: Painel 2/)
		expect(prompt).toMatch(/não foi carregado/i)
	})

	it("não inventa aviso quando os quatro painéis vieram completos", () => {
		const prompt = buildDgcUserPrompt({ dataset: DATASET, panelsFound: ALL_PANELS })
		expect(prompt).toContain("Todos os quatro painéis foram enviados.")
		expect(prompt).not.toContain("Painéis NÃO enviados")
	})

	it("declara o corte do recorte", () => {
		const prompt = buildDgcUserPrompt({ dataset: { ...DATASET, truncated: true }, panelsFound: ALL_PANELS })
		expect(prompt).toMatch(/foi cortado por exceder o limite/i)
	})

	it("não declara corte quando não houve", () => {
		expect(buildDgcUserPrompt({ dataset: DATASET, panelsFound: ALL_PANELS })).not.toMatch(/foi cortado por exceder/i)
	})

	it("só abre o bloco de grupo quando há contexto, e o marca como referência", () => {
		expect(buildDgcUserPrompt({ dataset: DATASET, panelsFound: ALL_PANELS })).not.toContain("APENAS PARA COMPARAÇÃO")
		const withPeers = buildDgcUserPrompt({ dataset: DATASET, panelsFound: ALL_PANELS, groupContext: "[DADOS DA UG: 120039 - ...]" })
		expect(withPeers).toContain("APENAS PARA COMPARAÇÃO")
		expect(withPeers).toMatch(/se referem estritamente à UG 120006/)
	})
})
