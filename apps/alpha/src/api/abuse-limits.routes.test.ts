/**
 * Freios de custo e de abuso, no nível da ROTA (revisão de segurança de 2026-10-01):
 *
 *   - sessão do ChatRADA com dono desde `POST /sessions`; sessão sem dono é recusada;
 *   - teto diário em toda rota que chama modelo (ChatRADA, extração, conformidade);
 *   - reexecução da conformidade: uma por vez, só o ACI repete, nada depois do parecer.
 *
 * O banco é um PostgREST de memória; o grafo, a extração e a verificação são falsos. O
 * `mock.module` do bun vale para o PROCESSO (#384): cada mock declara todos os exports do
 * módulo real.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test"
import type { UnitSupportEdge, UserPermission } from "@iefa/pbac"
import { strToU8, zipSync } from "fflate"
import type { Context, Next } from "hono"
import { ComplianceRunConflictError } from "../compliance/run-policy.ts"
import { applySpans } from "../extraction/apply-spans.ts"
import { type AlphaAccess, needsUnitGraph, resolveAlphaAccess } from "../lib/alpha-access.ts"
import { testEnv } from "../lib/test-env.test-helpers.ts"
import { fakeClaimUsage } from "../lib/usage-limit.test-helpers.ts"

// ─── PostgREST de memória ─────────────────────────────────────────────────────

type Row = Record<string, unknown>

const state: {
	tables: Record<string, Row[]>
	writes: Array<{ table: string; verb: "update" | "insert"; payload: Row }>
	failInsert: string | null
	graphCalls: number
	extractCalls: number
	complianceCalls: number
	complianceError: Error | null
	nextId: number
} = { tables: {}, writes: [], failInsert: null, graphCalls: 0, extractCalls: 0, complianceCalls: 0, complianceError: null, nextId: 1 }

function from(table: string) {
	const filters: Array<(row: Row) => boolean> = []
	let verb: "select" | "update" | "insert" = "select"
	let payload: Row = {}
	let limit = Number.POSITIVE_INFINITY

	const matched = () => (state.tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
	const run = () => {
		if (verb === "insert") {
			if (state.failInsert === table) return { data: null, error: { message: "falha simulada", code: "XX000" } }
			const row = { id: `${table}-${state.nextId++}`, created_at: new Date().toISOString(), ...payload }
			state.tables[table] = [...(state.tables[table] ?? []), row]
			state.writes.push({ table, verb, payload })
			return { data: [row], error: null }
		}
		if (verb === "update") {
			const rows = matched()
			for (const row of rows) Object.assign(row, payload)
			if (rows.length > 0) state.writes.push({ table, verb, payload })
			return { data: rows, error: null }
		}
		return { data: matched().slice(0, limit), error: null }
	}

	const api = {
		select: () => api,
		insert: (row: Row) => {
			verb = "insert"
			payload = row
			return api
		},
		update: (patch: Row) => {
			verb = "update"
			payload = patch
			return api
		},
		eq: (column: string, value: unknown) => {
			filters.push((row) => row[column] === value)
			return api
		},
		in: (column: string, values: unknown[]) => {
			filters.push((row) => values.includes(row[column]))
			return api
		},
		not: (column: string, _op: string, value: unknown) => {
			filters.push((row) => String(value).includes(String(row[column])) === false)
			return api
		},
		order: () => api,
		limit: (n: number) => {
			limit = n
			return api
		},
		single: async () => {
			const result = run()
			return { data: result.data?.[0] ?? null, error: result.error }
		},
		maybeSingle: async () => {
			const result = run()
			return { data: result.data?.[0] ?? null, error: result.error }
		},
		// biome-ignore lint/suspicious/noThenProperty: imita o builder do supabase-js, que só executa quando aguardado
		then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(run()).then(onFulfilled),
	}
	return api
}

/** O .docx mínimo que `toSubmissionText` lê — sem subprocesso de PDF neste teste. */
const DOCX = zipSync({ "word/document.xml": strToU8("<w:document><w:body><w:p><w:r><w:t>1. OBJETO</w:t></w:r></w:p></w:body></w:document>") })

const fakeClient = {
	from,
	storage: {
		from: () => ({
			download: async () => ({ data: new Blob([DOCX]), error: null }),
			upload: async () => ({ error: null }),
			remove: async () => ({ error: null }),
		}),
	},
	rpc: async (name: string, args: Record<string, unknown>) => {
		if (name !== "claim_usage") return { data: [], error: null }
		const { reply, inserted } = fakeClaimUsage(state.tables.chat_turn_usage ?? [], args)
		if (inserted) {
			state.tables.chat_turn_usage = [...(state.tables.chat_turn_usage ?? []), inserted]
			state.writes.push({ table: "chat_turn_usage", verb: "insert", payload: inserted })
		}
		return { data: [reply], error: null }
	},
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

let currentUser = "me"
let currentAccess: AlphaAccess

mock.module("../db/supabase.ts", () => ({ supabase: fakeClient, core: fakeClient, accessControl: fakeClient }))
mock.module("../env.ts", () => ({
	env: testEnv({
		ALPHA_RADA_MAX_TURNS_PER_DAY: 2,
		ALPHA_EXTRACTIONS_MAX_PER_DAY: 1,
		ALPHA_COMPLIANCE_RUNS_MAX_PER_DAY: 3,
		ALPHA_COMPLIANCE_MAX_RUNS_PER_SUBMISSION: 2,
	}),
}))
mock.module("../middleware/auth.ts", () => ({
	authMiddleware: async (c: Context, next: Next) => {
		c.set("user", { id: currentUser })
		c.set("access", currentAccess)
		await next()
	},
}))
mock.module("../graph/index.ts", () => ({
	GRAPH_INVOKE_CONFIG: { recursionLimit: 25 },
	graph: {
		invoke: async () => {
			state.graphCalls += 1
			return { final_response: "resposta", cited_documents: [], termination_reason: "success" }
		},
		stream: async () => {
			state.graphCalls += 1
			return (async function* () {
				yield { router: {} }
			})()
		},
		getState: async () => ({ values: { messages: [], final_response: "resposta", cited_documents: [], termination_reason: "success" } }),
	},
}))
mock.module("../extraction/extract.ts", () => ({
	applySpans,
	extractContratacao: async () => {
		state.extractCalls += 1
		return { payload: {}, spans: {}, model: "fake", truncated: false, dropped: [] }
	},
}))
mock.module("../compliance/run.ts", () => ({
	runCompliance: async (submissionId: string) => {
		state.complianceCalls += 1
		if (state.complianceError) throw state.complianceError
		return {
			run_id: `run-${submissionId}-new`,
			rules_applied: 0,
			rules_not_assessed: 0,
			discarded_findings: 0,
			model_document_id: null,
			law_document_ids: [],
			findings: [],
		}
	},
}))

const { default: apiRoutes } = await import("./routes.ts")

// ─── Cenário ──────────────────────────────────────────────────────────────────

const GAP_SJ = 26
const IAE = 100
const GRAPH: UnitSupportEdge[] = [
	{ id: GAP_SJ, supporting_unit_id: null },
	{ id: IAE, supporting_unit_id: GAP_SJ },
]

const SUBMISSION = "00000000-0000-4000-8000-000000000001"
const EXTRACTION = "00000000-0000-4000-8000-0000000000e1"

function grant(module: UserPermission["module"], level: number, unit_id: number | null = null): UserPermission {
	return { module, level, mess_hall_id: null, kitchen_id: null, unit_id }
}

function as(userId: string, permissions: UserPermission[] = []) {
	currentUser = userId
	currentAccess = resolveAlphaAccess(permissions, needsUnitGraph(permissions) ? GRAPH : null)
	return apiRoutes
}

const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code

const ACI = [grant("alpha-aci", 1, GAP_SJ)]

beforeEach(() => {
	state.writes = []
	state.failInsert = null
	state.graphCalls = 0
	state.extractCalls = 0
	state.complianceCalls = 0
	state.complianceError = null
	state.tables = {
		rada_session: [{ id: "11111111-1111-4111-8111-111111111111", user_id: "other", created_at: "2026-09-30T10:00:00Z" }],
		query_log: [],
		chat_turn_usage: [],
		submission: [
			{
				id: SUBMISSION,
				user_id: "author",
				unit_id: IAE,
				storage_path: "author/x.docx",
				mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				doc_kind: "TR",
			},
		],
		extraction: [{ id: EXTRACTION, submission_id: SUBMISSION }],
		compliance_run: [],
		compliance_review: [],
	}
})

// ─── ChatRADA ─────────────────────────────────────────────────────────────────

describe("sessão do ChatRADA", () => {
	test("POST /sessions grava o dono antes de qualquer turno", async () => {
		const res = await as("me").request("/api/v1/sessions", { method: "POST" })
		expect(res.status).toBe(201)
		const { session_id } = (await res.json()) as { session_id: string }
		expect(state.tables.rada_session).toContainEqual(expect.objectContaining({ id: session_id, user_id: "me" }))
	})

	test("sem gravar o dono, não há sessão", async () => {
		state.failInsert = "rada_session"
		const res = await as("me").request("/api/v1/sessions", { method: "POST" })
		expect(res.status).toBe(500)
		expect(await codeOf(res)).toBe("SESSION_CREATE_FAILED")
	})

	test("sessão de outra pessoa: 403, sem grafo e sem cobrar o teto", async () => {
		const res = await as("me").request("/api/v1/sessions/11111111-1111-4111-8111-111111111111/messages", json({ message: "oi" }))
		expect(res.status).toBe(403)
		expect(state.graphCalls).toBe(0)
		expect(state.tables.chat_turn_usage).toEqual([])
	})

	test("sessão sem dono registrado (id cunhado pelo cliente): 403 — antes era aberta a qualquer um", async () => {
		const res = await as("me").request("/api/v1/sessions/22222222-2222-4222-8222-222222222222/messages", json({ message: "oi" }))
		expect(res.status).toBe(403)
		expect(state.graphCalls).toBe(0)
	})

	test("o dono conversa até o teto diário; depois, 429 sem chamar o grafo (também no SSE)", async () => {
		const app = as("other")
		const path = "/api/v1/sessions/11111111-1111-4111-8111-111111111111/messages"
		expect((await app.request(path, json({ message: "um" }))).status).toBe(200)
		expect((await app.request(path, json({ message: "dois" }))).status).toBe(200)
		expect(state.graphCalls).toBe(2)

		const blocked = await app.request(path, json({ message: "três" }))
		expect(blocked.status).toBe(429)
		expect(await codeOf(blocked)).toBe("RADA_DAILY_LIMIT")

		const stream = await app.request(`${path}/stream`, json({ message: "quatro" }))
		expect(stream.status).toBe(429)
		expect(state.graphCalls).toBe(2)
		expect(state.tables.chat_turn_usage?.every((row) => row.kind === "rada")).toBe(true)
	})
})

// ─── Cabeçalhos de segurança ──────────────────────────────────────────────────

describe("cabeçalhos de segurança", () => {
	test("JSON e SSE saem com HSTS, nosniff, frame-options e referrer", async () => {
		const app = as("other")
		const list = await app.request("/api/v1/sessions")
		const stream = await app.request("/api/v1/sessions/11111111-1111-4111-8111-111111111111/messages/stream", json({ message: "oi" }))
		await stream.text()

		expect(stream.headers.get("content-type")).toContain("text/event-stream")
		for (const res of [list, stream]) {
			expect(res.headers.get("strict-transport-security")).toContain("max-age=")
			expect(res.headers.get("x-content-type-options")).toBe("nosniff")
			expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN")
			expect(res.headers.get("referrer-policy")).toBe("no-referrer")
		}
	})
})

// ─── Extração ─────────────────────────────────────────────────────────────────

describe("POST /api/v1/submissions/:id/extractions", () => {
	test("teto diário: a segunda extração do dia é recusada sem chamar o modelo", async () => {
		const app = as("author")
		expect((await app.request(`/api/v1/submissions/${SUBMISSION}/extractions`, { method: "POST" })).status).toBe(201)

		const res = await app.request(`/api/v1/submissions/${SUBMISSION}/extractions`, { method: "POST" })
		expect(res.status).toBe(429)
		expect(await codeOf(res)).toBe("EXTRACTION_DAILY_LIMIT")
		expect(state.extractCalls).toBe(1)
	})
})

// ─── Conformidade ─────────────────────────────────────────────────────────────

describe("POST /api/v1/compliance/runs", () => {
	const body = json({ submission_id: SUBMISSION, extraction_id: EXTRACTION })
	const succeeded = (id: string) => ({ id, submission_id: SUBMISSION, status: "succeeded", started_at: "2026-10-01T10:00:00Z" })

	test("autor faz a primeira verificação, e ela cobra o teto", async () => {
		const res = await as("author").request("/api/v1/compliance/runs", body)
		expect(res.status).toBe(201)
		expect(state.complianceCalls).toBe(1)
		expect(state.tables.chat_turn_usage).toEqual([expect.objectContaining({ user_id: "author", kind: "compliance" })])
	})

	test("depois de uma verificação concluída, o autor não repete: 409, sem cobrar nem chamar o modelo", async () => {
		state.tables.compliance_run?.push(succeeded("run-1"))
		const res = await as("author").request("/api/v1/compliance/runs", body)
		expect(res.status).toBe(409)
		expect(await codeOf(res)).toBe("COMPLIANCE_RERUN_ACI_ONLY")
		expect(state.complianceCalls).toBe(0)
		expect(state.tables.chat_turn_usage).toEqual([])
	})

	test("o ACI que cobre a OM repete, até o teto por submissão", async () => {
		state.tables.compliance_run?.push(succeeded("run-1"))
		expect((await as("aci", ACI).request("/api/v1/compliance/runs", body)).status).toBe(201)

		state.tables.compliance_run?.push(succeeded("run-2"))
		const res = await as("aci", ACI).request("/api/v1/compliance/runs", body)
		expect(res.status).toBe(409)
		expect(await codeOf(res)).toBe("COMPLIANCE_RUN_LIMIT")
		expect(state.complianceCalls).toBe(1)
	})

	test("com parecer emitido, ninguém reexecuta", async () => {
		state.tables.compliance_run?.push(succeeded("run-1"))
		state.tables.compliance_review?.push({ id: "rev-1", run_id: "run-1" })
		const res = await as("aci", ACI).request("/api/v1/compliance/runs", body)
		expect(res.status).toBe(409)
		expect(await codeOf(res)).toBe("COMPLIANCE_FROZEN")
		expect(state.complianceCalls).toBe(0)
	})

	test("execução em andamento segura a submissão; a presa além do prazo é encerrada e não segura", async () => {
		state.tables.compliance_run?.push({ id: "run-live", submission_id: SUBMISSION, status: "running", started_at: new Date().toISOString() })
		const live = await as("author").request("/api/v1/compliance/runs", body)
		expect(live.status).toBe(409)
		expect(await codeOf(live)).toBe("COMPLIANCE_RUN_IN_PROGRESS")

		state.tables.compliance_run = [
			{ id: "run-stuck", submission_id: SUBMISSION, status: "running", started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
		]
		const res = await as("author").request("/api/v1/compliance/runs", body)
		expect(res.status).toBe(201)
		expect(state.tables.compliance_run?.[0]?.status).toBe("failed")
	})

	test("a trava do banco vence a corrida: o conflito no insert vira 409", async () => {
		state.complianceError = new ComplianceRunConflictError("COMPLIANCE_RUN_IN_PROGRESS")
		const res = await as("author").request("/api/v1/compliance/runs", body)
		expect(res.status).toBe(409)
		expect(await codeOf(res)).toBe("COMPLIANCE_RUN_IN_PROGRESS")
	})

	test("teto diário de verificações: 429 sem chamar o modelo", async () => {
		const now = Date.now()
		state.tables.chat_turn_usage = [1, 2, 3].map((n) => ({ user_id: "author", kind: "compliance", created_at: new Date(now - n * 60_000).toISOString() }))
		const res = await as("author").request("/api/v1/compliance/runs", body)
		expect(res.status).toBe(429)
		expect(await codeOf(res)).toBe("COMPLIANCE_DAILY_LIMIT")
		expect(state.complianceCalls).toBe(0)
	})
})
