/**
 * Rotas do chat sobre documento, no nível da ROTA: quem pode abrir, ler, continuar e apagar
 * uma conversa, e o que a rota NÃO faz quando nega (nenhuma escrita, nenhum modelo chamado).
 *
 * O banco é um PostgREST de memória; o modelo e as fontes são falsos. O `mock.module` do bun
 * vale para o PROCESSO: cada mock aqui declara TODOS os exports do módulo real, para não
 * quebrar outro arquivo que rode depois (#384).
 */

import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { UnitSupportEdge, UserPermission } from "@iefa/pbac"
import { AIMessageChunk } from "@langchain/core/messages"
import { Hono } from "hono"
import { type AlphaAccess, needsUnitGraph, resolveAlphaAccess } from "../lib/alpha-access.ts"

// ─── PostgREST de memória ─────────────────────────────────────────────────────

type Row = Record<string, unknown>

const state: {
	tables: Record<string, Row[]>
	writes: Array<{ table: string; verb: "update" | "insert" | "delete"; payload: Row }>
	storage: { failRemove: boolean; removed: string[]; uploaded: string[] }
	modelCalls: number
	nextId: number
} = { tables: {}, writes: [], storage: { failRemove: false, removed: [], uploaded: [] }, modelCalls: 0, nextId: 1 }

function from(table: string) {
	const filters: Array<(row: Row) => boolean> = []
	let verb: "select" | "update" | "insert" | "delete" = "select"
	let payload: Row = {}
	let head = false
	let limit = Number.POSITIVE_INFINITY

	const matched = () => (state.tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
	const run = () => {
		if (verb === "update") {
			const rows = matched()
			for (const row of rows) Object.assign(row, payload)
			if (rows.length > 0) state.writes.push({ table, verb, payload })
			return { data: rows, error: null, count: rows.length }
		}
		if (verb === "insert") {
			const row = { id: `${table}-${state.nextId++}`, created_at: new Date(Date.now() + state.nextId).toISOString(), ...payload }
			state.tables[table] = [...(state.tables[table] ?? []), row]
			state.writes.push({ table, verb, payload })
			return { data: [row], error: null, count: 1 }
		}
		if (verb === "delete") {
			const rows = matched()
			state.tables[table] = (state.tables[table] ?? []).filter((row) => !rows.includes(row))
			if (table === "chat_thread") {
				const ids = rows.map((row) => row.id)
				for (const child of ["chat_message", "chat_attachment"]) state.tables[child] = (state.tables[child] ?? []).filter((row) => !ids.includes(row.thread_id))
			}
			state.writes.push({ table, verb, payload: {} })
			return { data: rows, error: null, count: rows.length }
		}
		const rows = matched()
		return { data: head ? null : rows.slice(0, limit), error: null, count: rows.length }
	}

	const api = {
		select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
			head = options?.head ?? false
			return api
		},
		update: (patch: Row) => {
			verb = "update"
			payload = patch
			return api
		},
		insert: (row: Row) => {
			verb = "insert"
			payload = row
			return api
		},
		delete: () => {
			verb = "delete"
			return api
		},
		eq: (column: string, value: unknown) => {
			filters.push((row) => row[column] === value)
			return api
		},
		is: (column: string, value: unknown) => {
			filters.push((row) => (row[column] ?? null) === value)
			return api
		},
		not: (column: string, _op: string, value: unknown) => {
			filters.push((row) => (row[column] ?? null) !== value)
			return api
		},
		gt: (column: string, value: string) => {
			filters.push((row) => String(row[column]) > value)
			return api
		},
		lte: (column: string, value: string) => {
			filters.push((row) => String(row[column]) <= value)
			return api
		},
		in: (column: string, values: unknown[]) => {
			filters.push((row) => values.includes(row[column]))
			return api
		},
		order: () => api,
		limit: (n: number) => {
			limit = n
			return api
		},
		single: async () => ({ data: run().data?.[0] ?? null, error: null }),
		maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
		// biome-ignore lint/suspicious/noThenProperty: imita o builder do supabase-js, que só executa quando aguardado
		then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(run()).then(onFulfilled),
	}
	return api
}

const fakeClient = {
	from,
	storage: {
		from: () => ({
			upload: async (path: string) => {
				state.storage.uploaded.push(path)
				return { error: null }
			},
			remove: async (paths: string[]) => {
				if (state.storage.failRemove) return { error: { message: "storage fora do ar" } }
				state.storage.removed.push(...paths)
				return { error: null }
			},
			download: async () => ({ data: null, error: { message: "não usado" } }),
		}),
	},
	rpc: async () => ({ data: [], error: null }),
}

mock.module("../db/supabase.ts", () => ({ supabase: fakeClient, core: fakeClient, accessControl: fakeClient }))

const PROCESS_SOURCES = {
	mode: "processo" as const,
	meta: { doc_kind: "TR", modalidade: null, objeto: null, filename: "tr.docx" },
	documents: [
		{
			label: "D1",
			name: "tr.docx",
			text: "3 GARANTIA\nA garantia será de 12 meses.",
			nodes: [{ path: "3", level: 1, title: "GARANTIA", body: "A garantia será de 12 meses." }],
		},
	],
	verification: { kind: "succeeded" as const, finished_at: null, rules_not_assessed: 0 },
	findings: [],
	review: null,
}

class FakeSourceLoadError extends Error {}

mock.module("../chat/load-sources.ts", () => ({
	SourceLoadError: FakeSourceLoadError,
	loadProcessSources: async () => PROCESS_SOURCES,
	loadAttachmentSources: async () => ({ mode: "avulso", documents: [] }),
	rememberDocument: () => {},
	toSections: (value: { text: string; nodes: unknown[] }) => ({ text: value.text, nodes: [] }),
}))

/** O modelo responde citando uma seção que existe e um trecho de norma que NÃO foi buscado. */
mock.module("../chat/models.ts", () => ({
	chatModels: () => ({
		primary: {
			id: "fake-model",
			supportsCachePoint: false,
			async stream() {
				state.modelCalls += 1
				async function* chunks() {
					yield new AIMessageChunk({ content: "A garantia é de 12 meses [D1:3]" })
					yield new AIMessageChunk({ content: ", conforme o art. 99 [N4]." })
				}
				return chunks()
			},
		},
		fallback: null,
	}),
}))

mock.module("../chat/norm-search.ts", () => ({ searchNorms: async () => ({ hits: [], unavailable: false }) }))

mock.module("../env.ts", () => ({
	env: { ALPHA_CHAT_MAX_TURNS_PER_DAY: 2, ALPHA_CHAT_DOC_MAX_CHARS: 150_000, ALPHA_CHAT_PURGE_ENABLED: false, ALPHA_FALLBACK_AI_MODEL: "" },
}))

const { chatRoutes } = await import("./chats.ts")

// ─── Cenário ──────────────────────────────────────────────────────────────────

const GAP_RJ = 10
const GAP_SJ = 26
const IAE = 100
const GRAPH: UnitSupportEdge[] = [
	{ id: GAP_RJ, supporting_unit_id: null },
	{ id: GAP_SJ, supporting_unit_id: null },
	{ id: IAE, supporting_unit_id: GAP_SJ },
]

const ME = "me"
const OTHER = "other"

function grant(module: UserPermission["module"], level: number, unit_id: number | null = null): UserPermission {
	return { module, level, mess_hall_id: null, kitchen_id: null, unit_id }
}

function appAs(permissions: UserPermission[], userId = ME) {
	const access: AlphaAccess = resolveAlphaAccess(permissions, needsUnitGraph(permissions) ? GRAPH : null)
	return new Hono<{ Variables: { user: { id: string }; access: AlphaAccess } }>()
		.use("*", async (c, next) => {
			c.set("user", { id: userId })
			c.set("access", access)
			await next()
		})
		.route("/", chatRoutes as never)
}

type ResponseBody = { code?: string; kind?: string; can_continue?: boolean; saved_at?: string | null; purge_at?: string; retry_after?: string }

const readJson = (res: Response) => res.json() as Promise<ResponseBody>

const json = (method: string, body: unknown) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

const REQUESTER_IAE = [grant("alpha-requester", 1, IAE)]

beforeEach(() => {
	state.writes = []
	state.storage = { failRemove: false, removed: [], uploaded: [] }
	state.modelCalls = 0
	state.tables = {
		submission: [{ id: "00000000-0000-4000-8000-000000000001", user_id: "author", unit_id: IAE }],
		chat_thread: [
			{
				id: "thread-process",
				user_id: ME,
				submission_id: "00000000-0000-4000-8000-000000000001",
				title: null,
				saved_at: null,
				created_at: "2026-09-20T10:00:00Z",
				last_activity_at: "2026-09-20T10:00:00Z",
			},
			{
				id: "thread-loose",
				user_id: ME,
				submission_id: null,
				title: "TR",
				saved_at: null,
				created_at: "2026-09-20T10:00:00Z",
				last_activity_at: "2026-09-20T10:00:00Z",
			},
		],
		chat_message: [],
		chat_attachment: [{ id: "att-1", thread_id: "thread-loose", storage_path: "me/thread-loose/a.pdf", filename: "a.pdf", mime_type: "application/pdf" }],
	}
})

describe("dono ou ninguém", () => {
	test("conversa de outra pessoa responde 404, igual à inexistente", async () => {
		const other = await appAs(REQUESTER_IAE, OTHER).request("/api/v1/chats/thread-loose")
		const missing = await appAs(REQUESTER_IAE, OTHER).request("/api/v1/chats/nao-existe")

		expect(other.status).toBe(404)
		expect(await readJson(other)).toEqual(await readJson(missing))
	})

	test("outra pessoa não continua a conversa, e nada é gravado nem o modelo chamado", async () => {
		const res = await appAs(REQUESTER_IAE, OTHER).request("/api/v1/chats/thread-loose/messages/stream", json("POST", { message: "oi" }))

		expect(res.status).toBe(404)
		expect(state.writes).toEqual([])
		expect(state.modelCalls).toBe(0)
	})

	test("outra pessoa não apaga", async () => {
		const res = await appAs(REQUESTER_IAE, OTHER).request("/api/v1/chats/thread-loose", { method: "DELETE" })
		expect(res.status).toBe(404)
		expect(state.tables.chat_thread).toHaveLength(2)
	})
})

describe("conversa de processo", () => {
	test("requisitante de outra OM não abre conversa sobre o processo", async () => {
		const res = await appAs([grant("alpha-requester", 1, GAP_RJ)]).request(
			"/api/v1/chats",
			json("POST", { submission_id: "00000000-0000-4000-8000-000000000001" })
		)

		expect(res.status).toBe(403)
		expect(state.writes).toEqual([])
	})

	test("licitações da APOIADORA abre", async () => {
		const res = await appAs([grant("alpha-procurement", 1, GAP_SJ)]).request(
			"/api/v1/chats",
			json("POST", { submission_id: "00000000-0000-4000-8000-000000000001" })
		)

		expect(res.status).toBe(201)
		expect((await readJson(res)).kind).toBe("processo")
	})

	test("acesso revogado: o turno responde 403 sem chamar o modelo, e o histórico continua legível", async () => {
		const noLongerCovered = [grant("alpha-requester", 1, GAP_RJ)]
		const turn = await appAs(noLongerCovered).request("/api/v1/chats/thread-process/messages/stream", json("POST", { message: "e agora?" }))

		expect(turn.status).toBe(403)
		expect((await readJson(turn)).code).toBe("SUBMISSION_ACCESS_REVOKED")
		expect(state.modelCalls).toBe(0)
		expect(state.writes).toEqual([])

		const read = await appAs(noLongerCovered).request("/api/v1/chats/thread-process")
		expect(read.status).toBe(200)
		expect((await readJson(read)).can_continue).toBe(false)
	})

	test("envio bloqueado depois de aberta a conversa: o anexo é recusado", async () => {
		const blocked = [grant("alpha-requester", 0)]
		const form = new FormData()
		form.append("file", new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" }))
		const res = await appAs(blocked).request("/api/v1/chats/thread-loose/attachments", { method: "POST", body: form })

		expect(res.status).toBe(403)
		expect((await readJson(res)).code).toBe("SUBMIT_DENIED")
		expect(state.storage.uploaded).toEqual([])
	})

	test("anexo em conversa de processo é recusado", async () => {
		const form = new FormData()
		form.append("file", new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" }))
		const res = await appAs(REQUESTER_IAE).request("/api/v1/chats/thread-process/attachments", { method: "POST", body: form })

		expect(res.status).toBe(409)
		expect((await readJson(res)).code).toBe("CHAT_ATTACHMENTS_NOT_ALLOWED")
		expect(state.storage.uploaded).toEqual([])
	})
})

describe("turno", () => {
	test("transmite, grava a pergunta antes da resposta e só devolve a citação que tem fonte", async () => {
		const res = await appAs(REQUESTER_IAE).request("/api/v1/chats/thread-process/messages/stream", json("POST", { message: "Qual a garantia?" }))
		expect(res.status).toBe(200)

		const body = await res.text()
		expect(body).toContain("event: delta")
		const complete = JSON.parse(body.split("event: complete\ndata: ")[1].split("\n")[0])
		expect(complete.content).toBe("A garantia é de 12 meses [D1:3], conforme o art. 99.")
		expect(complete.citations.map((citation: { label: string }) => citation.label)).toEqual(["D1:3"])
		expect(complete.dropped_citations).toBe(1)

		const inserted = state.writes.filter((write) => write.verb === "insert").map((write) => write.payload.role)
		expect(inserted).toEqual(["user", "assistant"])
		// A conversa ganha título da primeira pergunta.
		expect(state.tables.chat_thread?.[0]?.title).toBe("Qual a garantia?")
	})

	test("teto diário: 429 antes do SSE, sem gravar a pergunta nem chamar o modelo", async () => {
		const now = Date.now()
		state.tables.chat_message = [
			{ id: "m1", thread_id: "thread-loose", user_id: ME, role: "user", content: "a", status: "complete", created_at: new Date(now - 60_000).toISOString() },
			{ id: "m2", thread_id: "thread-loose", user_id: ME, role: "user", content: "b", status: "complete", created_at: new Date(now - 120_000).toISOString() },
		]
		const res = await appAs(REQUESTER_IAE).request("/api/v1/chats/thread-process/messages/stream", json("POST", { message: "mais uma" }))

		expect(res.status).toBe(429)
		const body = await readJson(res)
		expect(body.code).toBe("CHAT_DAILY_LIMIT")
		expect(new Date(body.retry_after ?? 0).getTime()).toBe(now - 120_000 + 24 * 60 * 60 * 1000)
		expect(state.writes).toEqual([])
		expect(state.modelCalls).toBe(0)
	})
})

describe("salvar e apagar", () => {
	test("deixar de salvar reinicia o prazo de expurgo", async () => {
		const thread = state.tables.chat_thread?.[1] as Row
		thread.saved_at = "2026-01-01T00:00:00Z"
		thread.last_activity_at = "2026-01-01T00:00:00Z"

		const res = await appAs(REQUESTER_IAE).request("/api/v1/chats/thread-loose", json("PATCH", { saved: false }))
		const body = await readJson(res)

		expect(res.status).toBe(200)
		expect(body.saved_at).toBeNull()
		expect(new Date(body.purge_at ?? 0).getTime()).toBeGreaterThan(Date.now() + 179 * 24 * 60 * 60 * 1000)
	})

	test("Storage fora do ar: 502 e a conversa continua listada", async () => {
		state.storage.failRemove = true
		const res = await appAs(REQUESTER_IAE).request("/api/v1/chats/thread-loose", { method: "DELETE" })

		expect(res.status).toBe(502)
		expect(state.tables.chat_thread?.map((row) => row.id)).toContain("thread-loose")
		expect(state.tables.chat_attachment).toHaveLength(1)
	})

	test("apagar remove o arquivo antes da linha", async () => {
		const res = await appAs(REQUESTER_IAE).request("/api/v1/chats/thread-loose", { method: "DELETE" })

		expect(res.status).toBe(204)
		expect(state.storage.removed).toEqual(["me/thread-loose/a.pdf"])
		expect(state.tables.chat_thread?.map((row) => row.id)).toEqual(["thread-process"])
		expect(state.tables.chat_attachment).toEqual([])
	})
})
