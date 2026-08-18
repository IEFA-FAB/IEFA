import { describe, expect, it } from "bun:test"
import { CHECKLIST_QUESTIONS } from "#/sacdgc/checklist"
import { DgcAnalysisShapeError, normalizeDgcAnalysis } from "#/sacdgc/schema"

const CTX = { ugCode: "120006", ugName: "120006 - GRUPAMENTO DE APOIO DE BRASILIA", competence: "JULHO/2026" }

function raw(overrides: Record<string, unknown> = {}) {
	return {
		identificacao: { codigoUg: "120006", nomeUg: "GAP-BR", anoReferencia: "2026", mesReferencia: "JULHO" },
		analisePainel1: "ok",
		analisePainel2: "ok",
		analisePainel3: "ok",
		analisePainel4: "ok",
		alertasDeCriticidade: [],
		checklistAec: { perguntas: [] },
		...overrides,
	}
}

describe("normalizeDgcAnalysis", () => {
	// O modelo entrega o checklist pela metade quando a resposta fica longa. Sem
	// completar, a tela exibia "11 itens avaliados" e o gestor lia isso como o
	// checklist inteiro.
	it("completa as 20 perguntas quando o modelo devolve menos", () => {
		const result = normalizeDgcAnalysis(raw({ checklistAec: { perguntas: [{ id: 1, pergunta: "x", resposta: "SIM", fundamentacaoTecnica: "f" }] } }), CTX)
		expect(result.checklistAec.perguntas).toHaveLength(CHECKLIST_QUESTIONS.length)
		expect(result.checklistAec.perguntas.map((p) => p.id)).toEqual(CHECKLIST_QUESTIONS.map((q) => q.id))
		expect(result.checklistAec.perguntas[19].resposta).toBe("NÃO")
	})

	// Contar 20 itens é tarefa de código, não de modelo.
	it("recalcula os indicadores em vez de aceitar a contagem do modelo", () => {
		const perguntas = [
			{ id: 1, pergunta: "x", resposta: "SIM", fundamentacaoTecnica: "f" },
			{ id: 2, pergunta: "x", resposta: "SIM", fundamentacaoTecnica: "f" },
		]
		const result = normalizeDgcAnalysis(raw({ checklistAec: { indicadores: { total: 99, comApontamento: 7, semApontamento: 92 }, perguntas } }), CTX)
		expect(result.checklistAec.indicadores).toEqual({ total: 20, comApontamento: 2, semApontamento: 18 })
	})

	it("usa o enunciado oficial da SUCONT, não o que o modelo reescreveu", () => {
		const result = normalizeDgcAnalysis(raw({ checklistAec: { perguntas: [{ id: 4, pergunta: "Tem militar sobrando?", resposta: "NÃO" }] } }), CTX)
		expect(result.checklistAec.perguntas[3].pergunta).toBe(CHECKLIST_QUESTIONS[3].pergunta)
	})

	// Texto anexado a um "NÃO" descreve o que NÃO foi achado; exibido no lugar da
	// justificativa, vira um achado que não existe.
	it("descarta justificativa colada num 'NÃO'", () => {
		const perguntas = [{ id: 6, pergunta: "x", resposta: "NÃO", fundamentacaoTecnica: "Não há indício de ausência de fatura.", recomendacao: "Nenhuma." }]
		const item = normalizeDgcAnalysis(raw({ checklistAec: { perguntas } }), CTX).checklistAec.perguntas[5]
		expect(item.resposta).toBe("NÃO")
		expect(item.fundamentacaoTecnica).toBeUndefined()
		expect(item.recomendacao).toBeUndefined()
	})

	it("mantém a justificativa do 'SIM'", () => {
		const perguntas = [
			{ id: 6, pergunta: "x", resposta: "SIM", fundamentacaoTecnica: "Sem fatura em julho.", evidenciasEncontradas: ["Painel 4"], recomendacao: "Conferir." },
		]
		const item = normalizeDgcAnalysis(raw({ checklistAec: { perguntas } }), CTX).checklistAec.perguntas[5]
		expect(item.fundamentacaoTecnica).toBe("Sem fatura em julho.")
		expect(item.evidenciasEncontradas).toEqual(["Painel 4"])
	})

	it("aceita 'Nao', 'Sim' e variações de caixa", () => {
		const perguntas = [
			{ id: 1, pergunta: "x", resposta: "Sim" },
			{ id: 2, pergunta: "x", resposta: "nao" },
			{ id: 3, pergunta: "x", resposta: "Não" },
		]
		const result = normalizeDgcAnalysis(raw({ checklistAec: { perguntas } }), CTX)
		expect(result.checklistAec.perguntas.slice(0, 3).map((p) => p.resposta)).toEqual(["SIM", "NÃO", "NÃO"])
	})

	it("ignora id de pergunta que não existe no checklist", () => {
		const result = normalizeDgcAnalysis(raw({ checklistAec: { perguntas: [{ id: 47, pergunta: "inventada", resposta: "SIM" }] } }), CTX)
		expect(result.checklistAec.indicadores.comApontamento).toBe(0)
		expect(result.checklistAec.perguntas.some((p) => p.id === 47)).toBe(false)
	})

	// O modelo às vezes copia a UG beneficiada de uma linha do Painel 4. Quem sabe
	// qual UG foi analisada é o recorte que foi enviado.
	it("sobrescreve a identificação da UG com a do recorte", () => {
		const result = normalizeDgcAnalysis(raw({ identificacao: { codigoUg: "120132", nomeUg: "DIRETORIA DE ENSINO" } }), CTX)
		expect(result.identificacao.codigoUg).toBe("120006")
		expect(result.identificacao.nomeUg).toBe("120006 - GRUPAMENTO DE APOIO DE BRASILIA")
	})

	it("cai na competência da carga quando o modelo não identifica mês e ano", () => {
		const result = normalizeDgcAnalysis(raw({ identificacao: {} }), CTX)
		expect(result.identificacao.mesReferencia).toBe("JULHO")
		expect(result.identificacao.anoReferencia).toBe("2026")
	})

	it("preserva os alertas", () => {
		const alertas = [{ titulo: "t", origemAnalise: ["Painel 1 – Distribuição dos Custos"], evidencia: "e", acaoRecomendada: "a" }]
		expect(normalizeDgcAnalysis(raw({ alertasDeCriticidade: alertas }), CTX).alertasDeCriticidade).toEqual(alertas)
	})

	it("rejeita retorno que não tem a forma da análise", () => {
		expect(() => normalizeDgcAnalysis("não sou um objeto", CTX)).toThrow(DgcAnalysisShapeError)
		expect(() => normalizeDgcAnalysis(null, CTX)).toThrow(DgcAnalysisShapeError)
	})
})
