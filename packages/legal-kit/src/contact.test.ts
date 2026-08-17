import { describe, expect, test } from "bun:test"
import { LEGAL_CONTACT_EMAIL, LEGAL_DATA_PROTECTION_OFFICER, LEGAL_RESPONSE_DAYS } from "./contact.ts"
import { LEGAL_DOC_PATHS, LEGAL_DOC_TITLES, LEGAL_DOC_TYPES, LEGAL_LOCALES } from "./types.ts"

/**
 * O canal de exercício de direitos vive em dois lugares: nestas constantes (que a
 * UI e as APIs renderizam) e no texto dos documentos legais (que é o que tem valor
 * jurídico). Divergência entre os dois é o pior caso — o usuário lê um endereço no
 * rodapé, outro na política, e o pedido de exclusão vai para uma caixa que ninguém
 * lê enquanto o prazo corre. Este teste amarra os dois.
 */
const SEED = await Bun.file(new URL("../../database/supabase/migrations/20260816120000_legal_documents_v2.sql", import.meta.url)).text()

describe("contato do encarregado", () => {
	test("o e-mail das constantes aparece no texto dos documentos", () => {
		expect(SEED).toContain(LEGAL_CONTACT_EMAIL)
	})

	test("o encarregado é identificado por cargo, não por nome de pessoa", () => {
		expect(LEGAL_DATA_PROTECTION_OFFICER).toBe("Secretaria do IEFA")
		expect(SEED).toContain(LEGAL_DATA_PROTECTION_OFFICER)
	})

	test("o prazo declarado no texto bate com a constante", () => {
		expect(LEGAL_RESPONSE_DAYS).toBe(7)
		expect(SEED).toContain(`${LEGAL_RESPONSE_DAYS} (sete) dias corridos`)
		expect(SEED).toContain(`${LEGAL_RESPONSE_DAYS} (seven) calendar days`)
	})

	test("a política afirma que não há autoexclusão", () => {
		// Não é detalhe de redação: é a diferença entre o titular procurar um botão
		// que não existe e mandar o e-mail que efetivamente inicia o procedimento.
		expect(SEED).toContain("Não existe botão de autoexclusão")
		expect(SEED).toContain("processada manualmente")
	})

	test("a política declara a retenção real, sem prometer expurgo inexistente", () => {
		expect(SEED).toContain("Não existe rotina de expurgo automático")
		expect(SEED).toContain("a expectativa é que seja permanente")
	})
})

describe("catálogo de documentos", () => {
	test("todo tipo tem rota e título nos dois locales", () => {
		for (const locale of LEGAL_LOCALES) {
			for (const docType of LEGAL_DOC_TYPES) {
				expect(LEGAL_DOC_PATHS[locale][docType]).toStartWith("/")
				expect(LEGAL_DOC_TITLES[locale][docType].length).toBeGreaterThan(0)
			}
		}
	})

	test("todo tipo é publicado nos dois locales pela migration", () => {
		for (const docType of LEGAL_DOC_TYPES) {
			for (const locale of LEGAL_LOCALES) {
				expect(SEED).toContain(`'${docType}',`)
				expect(SEED).toContain(`'${locale}',`)
			}
		}
	})

	test("rotas são únicas dentro de cada locale", () => {
		for (const locale of LEGAL_LOCALES) {
			const paths = LEGAL_DOC_TYPES.map((docType) => LEGAL_DOC_PATHS[locale][docType])
			expect(new Set(paths).size).toBe(paths.length)
		}
	})
})
