import { describe, expect, it } from "bun:test"
import { judgeEvidence, locateEvidence } from "./evidence.ts"

const BLOCO = "O objeto da contratação é a aquisição de gêneros alimentícios para o rancho da unidade, conforme o planejamento anual aprovado."

const inconforme = (evidence: string | null) => ({ status: "INCONFORME" as const, evidence })

describe("locateEvidence — citação curta", () => {
	it("localiza campo curto citado literalmente", () => {
		// Regressão: o casador reusado da extração recusava citação com menos de 12
		// caracteres. Regra sobre prazo, valor ou modalidade deixaria de gerar QUALQUER
		// achado, porque o campo inteiro é mais curto que o piso.
		expect(locateEvidence(inconforme("12 meses"), "12 meses")?.match).toBe("exact")
		expect(locateEvidence(inconforme("R$ 12.000"), "R$ 12.000")?.match).toBe("exact")
	})

	it("localiza citação parcial dentro de campo curto", () => {
		expect(locateEvidence(inconforme("Pregão"), "Pregão eletrônico")?.match).toBe("exact")
	})

	it("recusa citação que não está no campo curto", () => {
		expect(locateEvidence(inconforme("Concorrência"), "Pregão eletrônico")).toBeNull()
	})
})

describe("locateEvidence — transcrição imperfeita", () => {
	it("absorve espaçamento e quebra de linha", () => {
		expect(locateEvidence(inconforme("aquisição   de gêneros\nalimentícios"), BLOCO)?.match).toBe("exact")
	})

	it("absorve acento e caixa alterados na transcrição", () => {
		expect(locateEvidence(inconforme("AQUISICAO DE GENEROS ALIMENTICIOS"), BLOCO)?.match).toBe("exact")
	})

	it("aceita por similaridade quando a citação cobre quase todo um bloco curto", () => {
		// O caminho aproximado não era exercitado: a janela presa ao tamanho do bloco
		// diluía a similaridade e reprovava citação quase idêntica.
		const bloco = "A vigência do contrato será de 12 meses, prorrogável na forma da lei."
		const span = locateEvidence(inconforme("A vigência do contrato será de 12 meses prorrogável na forma da lei"), bloco)

		expect(span).not.toBeNull()
	})

	it("aceita quando o modelo cita MAIS do que o bloco contém", () => {
		// Bloco menor que a citação: o modelo acrescentou uma palavra ao transcrever. Aqui a
		// comparação é com o bloco inteiro — deslizar uma janela maior que ele só somaria
		// vazio e derrubaria a similaridade.
		expect(locateEvidence(inconforme("vigência de 12 meses prorrogável"), "vigência de 12 meses")).not.toBeNull()
	})

	it("recusa quando o excedente muda o sentido", () => {
		// O mesmo ramo precisa continuar reprovando: citação que só compartilha uma palavra
		// com o bloco não é o bloco.
		expect(locateEvidence(inconforme("vigência de 60 meses com reajuste anual garantido"), "vigência de 12 meses")).toBeNull()
	})

	it("recusa frase ausente do bloco", () => {
		expect(locateEvidence(inconforme("o objeto inclui serviços de engenharia civil"), BLOCO)).toBeNull()
	})
})

describe("locateEvidence — recorte", () => {
	it("devolve o texto do BLOCO, não a transcrição do modelo", () => {
		const span = locateEvidence(inconforme("AQUISICAO DE GENEROS"), BLOCO)
		if (!span) throw new Error("esperava localizar o trecho")

		expect(span.text).toBe("aquisição de gêneros")
		expect(BLOCO.slice(span.start, span.end)).toBe(span.text)
	})
})

describe("judgeEvidence", () => {
	it("deixa passar achado com evidência localizada, devolvendo o trecho", () => {
		const resultado = judgeEvidence(inconforme("aquisição de gêneros alimentícios"), BLOCO)

		expect(resultado.reason).toBeNull()
		expect(resultado.span?.text).toContain("gêneros")
	})

	it("barra evidência inventada", () => {
		expect(judgeEvidence(inconforme("o objeto inclui serviços de engenharia civil"), BLOCO).reason).toBe("evidencia_nao_localizada")
	})

	it("barra inconformidade sem evidência nenhuma", () => {
		// O guard de citação exige referência à NORMA e não cobre este caso: achado que não
		// cita nada do documento não é conferível por quem lê o parecer.
		expect(judgeEvidence(inconforme(null), BLOCO).reason).toBe("sem_evidencia")
		expect(judgeEvidence(inconforme("   "), BLOCO).reason).toBe("sem_evidencia")
	})

	it("não julga veredito que não vira achado", () => {
		expect(judgeEvidence({ status: "CONFORME", evidence: "inventado" }, BLOCO).reason).toBeNull()
		expect(judgeEvidence({ status: "NAO_AVALIADA", evidence: "inventado" }, BLOCO).reason).toBeNull()
	})

	it("não julga quando o chamador não passa o bloco", () => {
		expect(judgeEvidence(inconforme("inventado"), undefined).reason).toBeNull()
	})
})
