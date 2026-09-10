import { describe, expect, it } from "bun:test"
import { evidenceGuardReason, locateEvidence } from "./evidence.ts"

const BLOCO = "O objeto da contratação é a aquisição de gêneros alimentícios para o rancho da unidade, conforme o planejamento anual aprovado."

const inconforme = (evidence: string | null) => ({ status: "INCONFORME" as const, evidence })

describe("locateEvidence", () => {
	it("encontra a citação literal no bloco", () => {
		expect(locateEvidence(inconforme("aquisição de gêneros alimentícios para o rancho"), BLOCO)).not.toBeNull()
	})

	it("tolera espaçamento e quebra de linha introduzidos na transcrição", () => {
		expect(locateEvidence(inconforme("aquisição   de gêneros\nalimentícios para o rancho"), BLOCO)).not.toBeNull()
	})

	it("devolve null quando a frase não está no bloco", () => {
		expect(locateEvidence(inconforme("o objeto inclui serviços de engenharia civil"), BLOCO)).toBeNull()
	})

	it("devolve null sem evidência", () => {
		expect(locateEvidence(inconforme(null), BLOCO)).toBeNull()
	})
})

describe("evidenceGuardReason", () => {
	it("deixa passar o achado cuja evidência está no bloco", () => {
		expect(evidenceGuardReason(inconforme("aquisição de gêneros alimentícios"), BLOCO)).toBeNull()
	})

	it("barra o achado cuja evidência foi inventada", () => {
		// É o modo de falha que o guard existe para impedir: inconformidade apontada citando
		// frase que o documento não contém, e que parece do documento para quem lê o parecer.
		expect(evidenceGuardReason(inconforme("o objeto inclui serviços de engenharia civil"), BLOCO)).toBe("evidencia_nao_localizada")
	})

	it("não julga veredito que não é inconformidade", () => {
		// CONFORME não vira achado; barrar ali só gastaria busca.
		expect(evidenceGuardReason({ status: "CONFORME", evidence: "inventado" }, BLOCO)).toBeNull()
		expect(evidenceGuardReason({ status: "NAO_AVALIADA", evidence: "inventado" }, BLOCO)).toBeNull()
	})

	it("não julga quando o chamador não passa o bloco", () => {
		expect(evidenceGuardReason(inconforme("inventado mas ninguém confere"), undefined)).toBeNull()
	})

	it("veredito sem evidência é assunto do guard de citação, não deste", () => {
		expect(evidenceGuardReason(inconforme(null), BLOCO)).toBeNull()
	})
})
