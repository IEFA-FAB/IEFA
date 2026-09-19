/**
 * Autorização por OM, no nível da ROTA.
 *
 * A regra pura (`decideSubmissionRead`/`decideSubmissionReview`) tem teste próprio em
 * `alpha-access.test.ts`. Aqui a pergunta é outra: a rota APLICA a regra à linha certa? Os
 * dois buracos que o escopo por OM fechou eram exatamente isso — triagem e parecer
 * conferiam o nível do usuário e nunca de quem era o processo.
 *
 * O banco é um PostgREST de memória: filtros `eq/in/is/not/or`, `update` e `rpc`. O que
 * importa verificar é o que a rota PEDE ao banco (os filtros da listagem, o `p_unit_ids` da
 * fila) e o que ela NÃO faz quando nega (nenhum update, nenhum insert).
 */

import { beforeEach, describe, expect, mock, test } from "bun:test"
import { MeAccessSchema, UnitsResponseSchema } from "@iefa/alpha-client/access"
import type { UnitSupportEdge, UserPermission } from "@iefa/pbac"
import { Hono } from "hono"
import { type AlphaAccess, needsUnitGraph, resolveAlphaAccess } from "../lib/alpha-access.ts"

// ─── PostgREST de memória ─────────────────────────────────────────────────────

type Row = Record<string, unknown>

const state: {
	tables: Record<string, Row[]>
	rpcCalls: Array<{ name: string; args: Record<string, unknown> }>
	writes: Array<{ table: string; verb: "update" | "insert"; payload: Row }>
} = { tables: {}, rpcCalls: [], writes: [] }

/** Filtro `or` do PostgREST, no subconjunto que as rotas usam: `a.eq.x,b.in.(1,2)`. */
function parseOr(expression: string): (row: Row) => boolean {
	const clauses = expression.match(/[a-z_]+\.(eq\.[^,]+|in\.\([^)]*\))/g) ?? []
	const tests = clauses.map((clause) => {
		const [column, op, ...rest] = clause.split(".")
		const raw = rest.join(".")
		if (op === "eq") return (row: Row) => String(row[column as string]) === raw
		const values = raw.replace(/[()]/g, "").split(",").filter(Boolean)
		return (row: Row) => values.includes(String(row[column as string]))
	})
	return (row) => tests.some((t) => t(row))
}

function from(table: string) {
	const filters: Array<(row: Row) => boolean> = []
	let verb: "select" | "update" | "insert" = "select"
	let payload: Row = {}

	const matched = () => (state.tables[table] ?? []).filter((row) => filters.every((f) => f(row)))
	const run = () => {
		if (verb === "update") {
			const rows = matched()
			for (const row of rows) Object.assign(row, payload)
			if (rows.length > 0) state.writes.push({ table, verb, payload })
			return { data: rows, error: null }
		}
		if (verb === "insert") {
			state.writes.push({ table, verb, payload })
			return { data: [{ id: "new", ...payload }], error: null }
		}
		return { data: matched(), error: null }
	}

	const api = {
		select: () => api,
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
		eq: (column: string, value: unknown) => {
			filters.push((row) => row[column] === value)
			return api
		},
		in: (column: string, values: unknown[]) => {
			filters.push((row) => values.includes(row[column]))
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
		or: (expression: string) => {
			filters.push(parseOr(expression))
			return api
		},
		order: () => api,
		limit: () => api,
		single: async () => ({ data: run().data[0] ?? null, error: null }),
		maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
		// biome-ignore lint/suspicious/noThenProperty: imita o builder do supabase-js, que só executa quando aguardado
		then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(run()).then(onFulfilled),
	}
	return api
}

const storageCalls: string[] = []

const fakeClient = {
	from,
	storage: {
		from: () => ({
			upload: async (path: string) => {
				storageCalls.push(`upload:${path}`)
				return { error: null }
			},
			remove: async (paths: string[]) => {
				storageCalls.push(`remove:${paths.join(",")}`)
				return { error: null }
			},
		}),
	},
	rpc: async (name: string, args: Record<string, unknown>) => {
		state.rpcCalls.push({ name, args })
		return { data: [], error: null }
	},
}

mock.module("../db/supabase.ts", () => ({ supabase: fakeClient, core: fakeClient, accessControl: fakeClient }))
// A extração chama o modelo e lê o `env` do serviço na carga; nenhuma rota testada aqui a usa.
mock.module("../extraction/extract.ts", () => ({
	extractContratacao: async () => {
		throw new Error("não usada neste teste")
	},
}))

const { aciRoutes } = await import("./aci.ts")
const { accessRoutes } = await import("./access.ts")
const { submissionRoutes } = await import("./submissions.ts")
const { requireRole } = await import("../middleware/require-role.ts")

// ─── Cenário ──────────────────────────────────────────────────────────────────

// GAP-SJ (26) apoia IAE (100); GAP-RJ (10) é outra compradora.
const GAP_RJ = 10
const GAP_SJ = 26
const IAE = 100

const GRAPH: UnitSupportEdge[] = [
	{ id: GAP_RJ, supporting_unit_id: null },
	{ id: GAP_SJ, supporting_unit_id: null },
	{ id: IAE, supporting_unit_id: GAP_SJ },
]

const ME = "me"
const AUTHOR = "author"

function grant(module: UserPermission["module"], level: number, unit_id: number | null = null): UserPermission {
	return { module, level, mess_hall_id: null, kitchen_id: null, unit_id }
}

function accessOf(permissions: UserPermission[]): AlphaAccess {
	return resolveAlphaAccess(permissions, needsUnitGraph(permissions) ? GRAPH : null)
}

/** Monta o app como o `routes.ts` monta, com o usuário e o acesso já resolvidos. */
function appAs(permissions: UserPermission[]) {
	const access = accessOf(permissions)
	return new Hono<{ Variables: { user: { id: string }; access: AlphaAccess } }>()
		.use("*", async (c, next) => {
			c.set("user", { id: ME })
			c.set("access", access)
			await next()
		})
		.route("/", accessRoutes as never)
		.route("/", submissionRoutes as never)
		.route("/", aciRoutes as never)
}

beforeEach(() => {
	storageCalls.length = 0
	state.rpcCalls = []
	state.writes = []
	state.tables = {
		units: [
			{ id: GAP_RJ, code: "GAP-RJ", display_name: "GAP-RJ", supporting_unit_id: null, is_training: false, type: "purchase" },
			{ id: GAP_SJ, code: "GAP-SJ", display_name: "GAP-SJ", supporting_unit_id: null, is_training: false, type: "purchase" },
			{ id: IAE, code: "IAE", display_name: "IAE", supporting_unit_id: GAP_SJ, is_training: false, type: "consumption" },
			{ id: 1065, code: "TREINO", display_name: "Unidade de Treinamento", supporting_unit_id: null, is_training: true, type: "consumption" },
			{ id: 5975, code: "[TEST]U", display_name: null, supporting_unit_id: null, is_training: false, type: null },
		],
		submission: [{ id: "sub-iae", user_id: AUTHOR, unit_id: IAE, filename: "tr.docx", doc_kind: "TR", created_at: "2026-09-18T10:00:00Z" }],
		compliance_run: [{ id: "run-iae", submission_id: "sub-iae", status: "succeeded" }],
		compliance_finding: [{ id: "finding-iae", run_id: "run-iae", severity: "MEDIA", triage: null, triage_note: null }],
		compliance_review: [],
		extraction: [],
	}
})

// ─── Triagem e parecer: o buraco que o escopo fechou ─────────────────────────

describe("PATCH /api/v1/compliance/findings/:id", () => {
	const body = { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ triage: "acatado" }) }

	test("ACI de OUTRA OM: 403, e o achado não é tocado", async () => {
		const res = await appAs([grant("alpha-aci", 1, GAP_RJ)]).request("/api/v1/compliance/findings/finding-iae", body)

		expect(res.status).toBe(403)
		expect(state.writes).toEqual([])
		expect(state.tables.compliance_finding?.[0]?.triage).toBeNull()
	})

	test("ACI da APOIADORA do processo: tria", async () => {
		const res = await appAs([grant("alpha-aci", 1, GAP_SJ)]).request("/api/v1/compliance/findings/finding-iae", body)

		expect(res.status).toBe(200)
		expect(state.writes).toHaveLength(1)
	})

	test("licitações da OM (sem ACI): 403 no guard de papel", async () => {
		const res = await appAs([grant("alpha-procurement", 1, IAE)]).request("/api/v1/compliance/findings/finding-iae", body)

		expect(res.status).toBe(403)
		expect(state.writes).toEqual([])
	})
})

describe("POST /api/v1/compliance/runs/:id/reviews", () => {
	const body = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "aprovado" }) }

	test("ACI de OUTRA OM: 403, nenhum parecer gravado", async () => {
		const res = await appAs([grant("alpha-aci", 1, GAP_RJ)]).request("/api/v1/compliance/runs/run-iae/reviews", body)

		expect(res.status).toBe(403)
		expect(state.writes).toEqual([])
	})

	test("ACI escopado na APOIADA não decide processo da apoiadora", async () => {
		state.tables.submission?.push({ id: "sub-sj", user_id: AUTHOR, unit_id: GAP_SJ })
		state.tables.compliance_run?.push({ id: "run-sj", submission_id: "sub-sj", status: "succeeded" })

		const res = await appAs([grant("alpha-aci", 1, IAE)]).request("/api/v1/compliance/runs/run-sj/reviews", body)

		expect(res.status).toBe(403)
		expect(state.writes).toEqual([])
	})

	test("ACI que cobre a OM: grava o parecer", async () => {
		const res = await appAs([grant("alpha-aci", 1, IAE)]).request("/api/v1/compliance/runs/run-iae/reviews", body)

		expect(res.status).toBe(201)
		expect(state.writes.map((w) => `${w.verb}:${w.table}`)).toEqual(["insert:compliance_review"])
	})
})

// ─── Submissões ───────────────────────────────────────────────────────────────

describe("GET /api/v1/submissions", () => {
	beforeEach(() => {
		state.tables.submission = [
			{ id: "mine-rj", user_id: ME, unit_id: GAP_RJ },
			{ id: "colleague-iae", user_id: AUTHOR, unit_id: IAE },
			{ id: "colleague-sj", user_id: AUTHOR, unit_id: GAP_SJ },
			{ id: "colleague-rj", user_id: AUTHOR, unit_id: GAP_RJ },
		]
	})

	async function ids(permissions: UserPermission[], query = "") {
		const body = (await (await appAs(permissions).request(`/api/v1/submissions${query}`)).json()) as { submissions: Array<{ id: string }> }
		return body.submissions.map((s) => s.id).sort()
	}

	test("sem papel: só as próprias", async () => {
		expect(await ids([])).toEqual(["mine-rj"])
	})

	test("requisitante da apoiada: as próprias + TODAS as da OM, nada da apoiadora", async () => {
		expect(await ids([grant("alpha-requester", 1, IAE)])).toEqual(["colleague-iae", "mine-rj"])
	})

	test("licitações da apoiadora: as próprias + as da apoiadora e das apoiadas", async () => {
		expect(await ids([grant("alpha-procurement", 1, GAP_SJ)])).toEqual(["colleague-iae", "colleague-sj", "mine-rj"])
	})

	test("?unit_id= fora da cobertura só filtra as PRÓPRIAS", async () => {
		expect(await ids([grant("alpha-requester", 1, IAE)], `?unit_id=${GAP_RJ}`)).toEqual(["mine-rj"])
		expect(await ids([grant("alpha-requester", 1, IAE)], `?unit_id=${IAE}`)).toEqual(["colleague-iae"])
	})

	test("?mine=true: só as próprias, mesmo com papel que cobre OMs (escopo `minhas` do contrate)", async () => {
		expect(await ids([grant("alpha-procurement", 1, GAP_SJ)], "?mine=true")).toEqual(["mine-rj"])
		expect(await ids([grant("alpha-requester", 1, null)], "?mine=true")).toEqual(["mine-rj"])
	})
})

describe("POST /api/v1/submissions", () => {
	function form(fields: Record<string, string>) {
		const data = new FormData()
		data.set("file", new File([new Uint8Array([1, 2, 3])], "tr.pdf", { type: "application/pdf" }))
		data.set("doc_kind", "TR")
		for (const [key, value] of Object.entries(fields)) data.set(key, value)
		return { method: "POST", body: data }
	}

	test("qualquer autenticado envia, atribuindo a uma OM", async () => {
		const res = await appAs([]).request("/api/v1/submissions", form({ unit_id: String(IAE) }))

		expect(res.status).toBe(201)
		expect(state.writes).toEqual([
			expect.objectContaining({ table: "submission", verb: "insert", payload: expect.objectContaining({ user_id: ME, unit_id: IAE }) }),
		])
	})

	test("sem OM: 400 do validador, nada enviado ao Storage", async () => {
		const res = await appAs([]).request("/api/v1/submissions", form({}))

		expect(res.status).toBe(400)
		expect(storageCalls).toEqual([])
	})

	test("OM inexistente ou de treino: 422 ANTES do upload", async () => {
		for (const unit of ["999999", "1065"]) {
			const res = await appAs([]).request("/api/v1/submissions", form({ unit_id: unit }))
			expect(res.status).toBe(422)
			expect(((await res.json()) as { code: string }).code).toBe("UNIT_NOT_FOUND")
		}
		expect(storageCalls).toEqual([])
	})

	test("deny sem escopo em alpha-requester fecha o envio", async () => {
		const res = await appAs([grant("alpha-requester", 0)]).request("/api/v1/submissions", form({ unit_id: String(IAE) }))

		expect(res.status).toBe(403)
		expect(state.writes).toEqual([])
		expect(storageCalls).toEqual([])
	})
})

// ─── Fila ─────────────────────────────────────────────────────────────────────

describe("GET /api/v1/aci/queue", () => {
	test("escopado: a RPC recebe a cobertura EXPANDIDA pelo apoio", async () => {
		const res = await appAs([grant("alpha-procurement", 1, GAP_SJ)]).request("/api/v1/aci/queue")

		expect(res.status).toBe(200)
		expect(state.rpcCalls).toEqual([{ name: "aci_queue", args: { p_limit: 200, p_unit_ids: [GAP_SJ, IAE] } }])
	})

	test("global sem filtro: sem recorte (null)", async () => {
		await appAs([grant("alpha-aci", 1)]).request("/api/v1/aci/queue")

		expect(state.rpcCalls[0]?.args.p_unit_ids).toBeNull()
	})

	test("?unit_id= dentro da cobertura recorta para ela", async () => {
		await appAs([grant("alpha-aci", 1, GAP_SJ)]).request(`/api/v1/aci/queue?unit_id=${IAE}`)

		expect(state.rpcCalls[0]?.args.p_unit_ids).toEqual([IAE])
	})

	test("?unit_id= fora da cobertura: 403, e a RPC nem é chamada", async () => {
		const res = await appAs([grant("alpha-aci", 1, IAE)]).request(`/api/v1/aci/queue?unit_id=${GAP_SJ}`)

		expect(res.status).toBe(403)
		expect(state.rpcCalls).toEqual([])
	})

	test("só requisitante (ou nada): 403", async () => {
		expect((await appAs([grant("alpha-requester", 1)]).request("/api/v1/aci/queue")).status).toBe(403)
		expect((await appAs([]).request("/api/v1/aci/queue")).status).toBe(403)
	})
})

// ─── Processo ─────────────────────────────────────────────────────────────────

describe("GET /api/v1/aci/processes/:id", () => {
	test("devolve a OM e o `can_decide` calculado no servidor", async () => {
		const aci = await (await appAs([grant("alpha-aci", 1, GAP_SJ)]).request("/api/v1/aci/processes/sub-iae")).json()
		expect(aci).toMatchObject({ unit_id: IAE, can_decide: true })

		const procurement = await (await appAs([grant("alpha-procurement", 1, IAE)]).request("/api/v1/aci/processes/sub-iae")).json()
		expect(procurement).toMatchObject({ unit_id: IAE, can_decide: false })
	})

	test("papel de outra OM: 403", async () => {
		expect((await appAs([grant("alpha-procurement", 1, GAP_RJ)]).request("/api/v1/aci/processes/sub-iae")).status).toBe(403)
	})
})

// ─── Contrato de /me/access e /units ─────────────────────────────────────────

describe("GET /api/v1/me/access (contrato com o contrate)", () => {
	test("papéis por OM já expandidos e as OMs para os seletores", async () => {
		const res = await appAs([grant("alpha-procurement", 1, GAP_SJ), grant("alpha-admin", 3, IAE)]).request("/api/v1/me/access")
		const body = MeAccessSchema.parse(await res.json())

		expect(body.roles).toEqual({ requester: [], procurement: [GAP_SJ, IAE], aci: [], admin: [IAE] })
		expect(body.units.map((u) => u.id).sort((a, b) => a - b)).toEqual([GAP_SJ, IAE])
		expect(body.can_submit).toBe(true)
	})

	// Os campos do formato por nível saíram no PR de limpeza: o corpo é SÓ o contrato novo.
	test("os campos legados (level, can_see_all, can_decide, can_manage_access) não voltam", async () => {
		const raw = (await (await appAs([grant("alpha-aci", 1), grant("alpha-admin", 3)]).request("/api/v1/me/access")).json()) as Record<string, unknown>
		expect(Object.keys(raw).sort()).toEqual(["can_submit", "roles", "units"])
	})

	test("quatro papéis globais: 'all' em todos, e as OMs reais", async () => {
		const res = await appAs([grant("alpha-requester", 1), grant("alpha-procurement", 1), grant("alpha-aci", 1), grant("alpha-admin", 3)]).request(
			"/api/v1/me/access"
		)
		const body = MeAccessSchema.parse(await res.json())

		expect(body.roles).toEqual({ requester: "all", procurement: "all", aci: "all", admin: "all" })
		// "all" lista as OMs reais: nem a sentinela de treino, nem a sobra de teste sem tipo.
		expect(body.units.map((u) => u.code).sort()).toEqual(["GAP-RJ", "GAP-SJ", "IAE"])
	})

	test("sem papel: nenhuma OM, envio aberto", async () => {
		const body = MeAccessSchema.parse(await (await appAs([]).request("/api/v1/me/access")).json())
		expect(body).toMatchObject({ units: [], can_submit: true })
	})
})

// ─── Acúmulo de papéis: sem segregação de funções ────────────────────────────
//
// Decisão do mantenedor (2026-09-19): a mesma pessoa pode ter os quatro papéis na MESMA OM
// — e, sendo ACI dela, tria e emite parecer no processo que ELA MESMA enviou. Nenhuma rota
// pode recusar por "é o autor". Ver `alpha-access.ts`, "Papéis se acumulam".

describe("uma pessoa com os quatro papéis na mesma OM", () => {
	const allFour = () => [grant("alpha-requester", 1, IAE), grant("alpha-procurement", 1, IAE), grant("alpha-aci", 1, IAE), grant("alpha-admin", 3, IAE)]

	beforeEach(() => {
		// O processo é DELA: autora e ACI da mesma OM.
		state.tables.submission?.push({ id: "sub-own", user_id: ME, unit_id: IAE, filename: "tr.docx", doc_kind: "TR", created_at: "2026-09-19T10:00:00Z" })
		state.tables.compliance_run?.push({ id: "run-own", submission_id: "sub-own", status: "succeeded" })
		state.tables.compliance_finding?.push({ id: "finding-own", run_id: "run-own", severity: "ALTA", triage: null, triage_note: null })
	})

	test("/me/access lista os quatro papéis na OM", async () => {
		const body = MeAccessSchema.parse(await (await appAs(allFour()).request("/api/v1/me/access")).json())
		expect(body.roles).toEqual({ requester: [IAE], procurement: [IAE], aci: [IAE], admin: [IAE] })
		expect(body.units.map((u) => u.code)).toEqual(["IAE"])
	})

	test("envia para a OM", async () => {
		const data = new FormData()
		data.set("file", new File([new Uint8Array([1])], "tr.pdf", { type: "application/pdf" }))
		data.set("doc_kind", "TR")
		data.set("unit_id", String(IAE))
		expect((await appAs(allFour()).request("/api/v1/submissions", { method: "POST", body: data })).status).toBe(201)
	})

	test("vê o próprio processo com `can_decide: true`", async () => {
		const body = await (await appAs(allFour()).request("/api/v1/aci/processes/sub-own")).json()
		expect(body).toMatchObject({ unit_id: IAE, can_decide: true })
	})

	test("tria achado do PRÓPRIO processo (e desfaz a triagem)", async () => {
		const patch = (triage: string | null) => ({
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ triage }),
		})
		expect((await appAs(allFour()).request("/api/v1/compliance/findings/finding-own", patch("acatado"))).status).toBe(200)
		expect(state.tables.compliance_finding?.find((f) => f.id === "finding-own")?.triage).toBe("acatado")
		expect((await appAs(allFour()).request("/api/v1/compliance/findings/finding-own", patch(null))).status).toBe(200)
		expect(state.tables.compliance_finding?.find((f) => f.id === "finding-own")?.triage).toBeNull()
	})

	test("emite parecer no PRÓPRIO processo", async () => {
		const res = await appAs(allFour()).request("/api/v1/compliance/runs/run-own/reviews", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ decision: "aprovado_com_ressalvas", notes: "acúmulo de papéis" }),
		})
		expect(res.status).toBe(201)
		expect(state.writes.map((w) => `${w.verb}:${w.table}`)).toEqual(["insert:compliance_review"])
	})

	test("a fila recorta para a OM, e o processo do colega da OM também é decidido", async () => {
		await appAs(allFour()).request("/api/v1/aci/queue")
		expect(state.rpcCalls[0]?.args.p_unit_ids).toEqual([IAE])

		const res = await appAs(allFour()).request("/api/v1/compliance/runs/run-iae/reviews", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ decision: "aprovado" }),
		})
		expect(res.status).toBe(201)
	})

	test("fora da OM, acumular papéis não abre nada", async () => {
		state.tables.submission?.push({ id: "sub-rj", user_id: AUTHOR, unit_id: GAP_RJ })
		state.tables.compliance_run?.push({ id: "run-rj", submission_id: "sub-rj", status: "succeeded" })
		expect((await appAs(allFour()).request("/api/v1/aci/processes/sub-rj")).status).toBe(403)
		const res = await appAs(allFour()).request("/api/v1/compliance/runs/run-rj/reviews", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ decision: "aprovado" }),
		})
		expect(res.status).toBe(403)
	})
})

describe("GET /api/v1/units", () => {
	test("qualquer autenticado; sem treino e sem linha sem tipo; com a apoiadora", async () => {
		const res = await appAs([]).request("/api/v1/units")
		const body = UnitsResponseSchema.parse(await res.json())

		expect(body.units.map((u) => u.code).sort()).toEqual(["GAP-RJ", "GAP-SJ", "IAE"])
		expect(body.units.find((u) => u.code === "IAE")?.supporting_unit_id).toBe(GAP_SJ)
	})
})

// ─── Curadoria: ACI global ───────────────────────────────────────────────────

describe("requireRole(..., { global: true })", () => {
	function curation(permissions: UserPermission[]) {
		const access = accessOf(permissions)
		return new Hono<{ Variables: { access: AlphaAccess } }>()
			.use("*", async (c, next) => {
				c.set("access", access)
				await next()
			})
			.patch("/api/v1/rules/:id", requireRole("aci", { global: true }), (c) => c.json({ ok: true }))
	}

	test("ACI escopado não promove regra do catálogo compartilhado", async () => {
		expect((await curation([grant("alpha-aci", 1, GAP_SJ)]).request("/api/v1/rules/r1", { method: "PATCH" })).status).toBe(403)
	})

	test("ACI global promove; deny escopado tira o 'global'", async () => {
		expect((await curation([grant("alpha-aci", 1)]).request("/api/v1/rules/r1", { method: "PATCH" })).status).toBe(200)
		expect((await curation([grant("alpha-aci", 1), grant("alpha-aci", 0, GAP_RJ)]).request("/api/v1/rules/r1", { method: "PATCH" })).status).toBe(403)
	})
})
