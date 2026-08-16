/**
 * Ordem de escrita da ingestão.
 *
 * O que está sob teste não é o conteúdo gravado — é a **sequência**. Duas
 * invariantes do versionamento só existem na ordem das operações, e as duas já
 * quebraram em produção:
 *
 *  1. `document_current_version_uk` é único por `(source_id, external_id)` entre
 *     documentos vigentes e concluídos. Concluir o novo antes de superseder o
 *     anterior viola o índice, e **toda** reingestão de documento alterado falha
 *     com 23505.
 *  2. Falha no meio da persistência não pode deixar o corpus sem versão vigente:
 *     enquanto o novo documento não está completo, o anterior continua de pé.
 *
 * O fake de Supabase registra as chamadas na ordem em que são resolvidas, que é
 * a ordem em que o pipeline as emite — todas são aguardadas em sequência.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test"

interface Recorded {
	table: string
	verb: "select" | "insert" | "update" | "upsert" | "delete"
	payload?: Record<string, unknown> | Array<Record<string, unknown>>
	filters: Array<[string, unknown]>
}

let log: Recorded[] = []
/** Resultado por `tabela:verbo`; `undefined` cai no default de sucesso vazio. */
let handlers: Record<string, () => { data?: unknown; error?: { message: string } | null }> = {}

function builder(table: string) {
	const rec: Recorded = { table, verb: "select", filters: [] }

	const resolve = () => {
		log.push(rec)
		const handler = handlers[`${table}:${rec.verb}`]
		const result = handler ? handler() : {}
		return { data: result.data ?? null, error: result.error ?? null }
	}

	const api = {
		select: () => api,
		insert: (payload: Recorded["payload"]) => {
			rec.verb = "insert"
			rec.payload = payload
			return api
		},
		upsert: (payload: Recorded["payload"]) => {
			rec.verb = "upsert"
			rec.payload = payload
			return api
		},
		update: (payload: Recorded["payload"]) => {
			rec.verb = "update"
			rec.payload = payload
			return api
		},
		delete: () => {
			rec.verb = "delete"
			return api
		},
		eq: (column: string, value: unknown) => {
			rec.filters.push([column, value])
			return api
		},
		is: (column: string, value: unknown) => {
			rec.filters.push([column, value])
			return api
		},
		not: () => api,
		in: () => api,
		order: () => api,
		limit: () => api,
		single: async () => resolve(),
		maybeSingle: async () => resolve(),
		// O thenable é o contrato que se está imitando: no supabase-js a query só
		// executa quando aguardada, e o pipeline aguarda várias sem terminador.
		// biome-ignore lint/suspicious/noThenProperty: ver acima
		then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
	}

	return api
}

mock.module("../db/supabase.ts", () => ({ supabase: { from: (table: string) => builder(table) } }))
mock.module("../lib/embeddings.ts", () => ({ embeddingModelId: () => "fake:model" }))

const { ingestSource } = await import("./pipeline.ts")

const ITEM = {
	external_id: "https://agu.gov.br/modelo-tr",
	title: "Termo de Referência",
	version_label: "maio/2026",
	fetch_url: "https://agu.gov.br/modelo-tr.docx",
}

function fakeAdapter(contentHash: string) {
	return {
		id: "agu-modelos",
		discover: async () => [ITEM],
		fetch: async () => new Uint8Array(),
		parse: async () => ({
			document_type: "MODELO_AGU" as const,
			title: ITEM.title,
			version_label: ITEM.version_label,
			content_hash: contentHash,
			nodes: [
				{
					path: "1",
					ordinal: 0,
					level: 1,
					title: "OBJETO",
					title_norm: "objeto",
					is_required: true,
					body: "Contratação de serviço contínuo.",
					notes: [],
					placeholders: [],
				},
			],
		}),
	}
}

const embed = async (texts: string[]) => texts.map(() => [0.1, 0.2])

/** Índice da operação, ou -1 — usar posição relativa é o ponto do teste. */
function indexOf(predicate: (rec: Recorded) => boolean): number {
	return log.findIndex(predicate)
}

const isSupersede = (rec: Recorded) => rec.table === "document" && rec.verb === "update" && "superseded_at" in (rec.payload as Record<string, unknown>)
const isComplete = (rec: Recorded) => rec.table === "document" && rec.verb === "update" && "ingested_at" in (rec.payload as Record<string, unknown>)

beforeEach(() => {
	log = []
	handlers = {
		"document:insert": () => ({ data: { id: "novo-doc" } }),
		"structure_node:insert": () => ({ data: [{ id: "no-1", path: "1" }] }),
	}
})

describe("pipeline de ingestão — ordem das escritas", () => {
	test("supersede a versão anterior antes de concluir a nova", async () => {
		handlers["document:select"] = () => ({ data: { id: "doc-antigo", content_hash: "hash-antigo", version_label: "abril/2026" } })

		const report = await ingestSource({ sourceId: "agu-modelos", adapter: fakeAdapter("hash-novo"), embed, apply: true })

		expect(report.items[0].outcome).toBe("superseded")

		const supersede = indexOf(isSupersede)
		const complete = indexOf(isComplete)

		expect(supersede).toBeGreaterThanOrEqual(0)
		expect(complete).toBeGreaterThanOrEqual(0)
		// A inversão desta ordem é o 23505 que quebrava toda reingestão.
		expect(supersede).toBeLessThan(complete)

		expect(log[supersede].filters).toContainEqual(["id", "doc-antigo"])
		expect(log[complete].filters).toContainEqual(["id", "novo-doc"])
	})

	test("primeira ingestão conclui sem superseder nada", async () => {
		handlers["document:select"] = () => ({ data: null })

		const report = await ingestSource({ sourceId: "agu-modelos", adapter: fakeAdapter("hash-novo"), embed, apply: true })

		expect(report.items[0].outcome).toBe("created")
		expect(indexOf(isSupersede)).toBe(-1)
		expect(indexOf(isComplete)).toBeGreaterThanOrEqual(0)
	})

	test("falha no meio da persistência deixa a versão vigente de pé", async () => {
		handlers["document:select"] = () => ({ data: { id: "doc-antigo", content_hash: "hash-antigo", version_label: "abril/2026" } })
		handlers["document_chunk:insert"] = () => ({ error: { message: "conexão perdida" } })

		const report = await ingestSource({ sourceId: "agu-modelos", adapter: fakeAdapter("hash-novo"), embed, apply: true })

		expect(report.items[0].outcome).toBe("failed")
		// Nem supersede nem conclusão: o corpus continua servindo a versão anterior,
		// e a próxima execução limpa o documento incompleto por `ingested_at is null`.
		expect(indexOf(isSupersede)).toBe(-1)
		expect(indexOf(isComplete)).toBe(-1)
	})

	test("conteúdo idêntico não escreve nada", async () => {
		handlers["document:select"] = () => ({ data: { id: "doc-antigo", content_hash: "mesmo-hash", version_label: "maio/2026" } })

		const report = await ingestSource({ sourceId: "agu-modelos", adapter: fakeAdapter("mesmo-hash"), embed, apply: true })

		expect(report.items[0].outcome).toBe("unchanged")
		// Só o heartbeat da fonte é escrito: nenhuma linha de corpus é tocada, e
		// nenhuma chamada de embedding é gasta.
		expect(log.filter((rec) => rec.verb !== "select" && rec.table !== "normative_source")).toEqual([])
	})
})
