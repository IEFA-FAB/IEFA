import { describe, expect, test } from "bun:test"
import type { LegalClient } from "./client.ts"
import { fetchLegalDocument, fetchLegalDocuments } from "./documents.ts"

type Row = Record<string, string | null>

/** Builder encadeável mínimo: `.select().eq().eq().maybeSingle()` e `.select().eq().in()`. */
function fakeClient(result: { data: Row | Row[] | null; error?: { message: string } | null }): LegalClient {
	const builder = {
		select: () => builder,
		eq: () => builder,
		in: () => builder,
		maybeSingle: () => Promise.resolve({ data: result.data, error: result.error ?? null }),
		// O builder do PostgREST É um thenable: `fetchLegalDocuments` faz `await query`
		// depois de `.eq()`/`.in()`, sem chamar método terminal. Sem o `then` aqui o
		// dublê não reproduz o contrato que ele dubla.
		// biome-ignore lint/suspicious/noThenProperty: dublê de query builder thenable
		then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: result.data, error: result.error ?? null }).then(resolve),
	}
	return { from: () => builder } as unknown as LegalClient
}

const COMPLETE: Row = {
	id: "11111111-1111-1111-1111-111111111111",
	doc_type: "privacy_policy",
	version: "2.0.0",
	locale: "pt-BR",
	content_md: "# Política de Privacidade",
	effective_date: "2026-08-16",
	published_at: "2026-08-16T00:00:00Z",
}

describe("fetchLegalDocument", () => {
	test("devolve o documento quando a linha está completa", async () => {
		const doc = await fetchLegalDocument({ url: "u", secretKey: "k", docType: "privacy_policy", client: fakeClient({ data: COMPLETE }) })
		expect(doc?.version).toBe("2.0.0")
		expect(doc?.doc_type).toBe("privacy_policy")
	})

	test("devolve null quando não há versão publicada", async () => {
		const doc = await fetchLegalDocument({ url: "u", secretKey: "k", docType: "cookie_policy", client: fakeClient({ data: null }) })
		expect(doc).toBeNull()
	})

	test("descarta a linha com content_md vazio em vez de renderizar página em branco", async () => {
		// Uma política de privacidade em branco é indistinguível, para o usuário, de
		// uma que não existe — mas passaria por "documento carregado" na UI.
		const doc = await fetchLegalDocument({ url: "u", secretKey: "k", docType: "privacy_policy", client: fakeClient({ data: { ...COMPLETE, content_md: "" } }) })
		expect(doc).toBeNull()
	})

	test("descarta doc_type que não é um tipo conhecido", async () => {
		const doc = await fetchLegalDocument({
			url: "u",
			secretKey: "k",
			docType: "privacy_policy",
			client: fakeClient({ data: { ...COMPLETE, doc_type: "eula" } }),
		})
		expect(doc).toBeNull()
	})

	test("propaga erro do PostgREST em vez de virar 'documento não encontrado'", async () => {
		// Estado vazio que mente sobre falha: sem o throw, uma queda de conexão
		// renderizaria a mesma tela de "não encontrado" de um documento não publicado.
		const call = fetchLegalDocument({
			url: "u",
			secretKey: "k",
			docType: "privacy_policy",
			client: fakeClient({ data: null, error: { message: "connection reset" } }),
		})
		await expect(call).rejects.toThrow(/connection reset/)
	})
})

describe("fetchLegalDocuments", () => {
	test("filtra as linhas incompletas e mantém as válidas", async () => {
		const docs = await fetchLegalDocuments({
			url: "u",
			secretKey: "k",
			client: fakeClient({ data: [COMPLETE, { ...COMPLETE, id: null, doc_type: "terms_of_use" }] }),
		})
		expect(docs).toHaveLength(1)
		expect(docs[0]?.doc_type).toBe("privacy_policy")
	})

	test("lista vazia não vira erro", async () => {
		const docs = await fetchLegalDocuments({ url: "u", secretKey: "k", client: fakeClient({ data: [] }) })
		expect(docs).toEqual([])
	})
})
