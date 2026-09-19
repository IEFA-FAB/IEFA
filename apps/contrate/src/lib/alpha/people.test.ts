import { describe, expect, test } from "bun:test"
import type { UnitSupportEdge } from "@iefa/pbac"
import { annotateDenyImpact } from "./admin-access"
import {
	type AlphaGrant,
	type AlphaPerson,
	aggregatePeople,
	auditActionOf,
	civilDaysUntil,
	compareGrants,
	groupAllowsByUnit,
	inheritedDenyUnits,
	isAuditVisible,
	listingUnits,
	normalizeText,
	type PeopleQuery,
	PeopleQuerySchema,
	PeopleSearchSchema,
	type PersonIdentity,
	pageInfo,
	peopleQueryOf,
	personMatches,
	queryPeople,
	sortPeople,
	summarizeStatus,
	supportedUnitsOf,
	toAuditEntry,
	toUnitIdOrNull,
} from "./people"

const NOW = Date.parse("2026-09-19T12:00:00Z")
const DAY = 86_400_000

// GAP-SJ (26) apoia IAE (100) e DCTA (101); DCTA apoia IEFA-SJ (102); GAP-RJ (10) sozinho.
const GRAPH: UnitSupportEdge[] = [
	{ id: 10, supporting_unit_id: null },
	{ id: 26, supporting_unit_id: null },
	{ id: 100, supporting_unit_id: 26 },
	{ id: 101, supporting_unit_id: 26 },
	{ id: 102, supporting_unit_id: 101 },
]
const CODES: Record<number, string> = { 10: "GAP-RJ", 26: "GAP-SJ", 100: "IAE", 101: "DCTA", 102: "IEFA-SJ" }

function grant(partial: Partial<AlphaGrant> & Pick<AlphaGrant, "userId">): AlphaGrant {
	const effect = partial.effect ?? "allow"
	const unitId = partial.unitId === undefined ? 26 : partial.unitId
	return {
		module: "alpha-aci",
		unitId,
		unitCode: unitId === null ? null : (CODES[unitId] ?? null),
		level: effect === "allow" ? 1 : 0,
		effect,
		expiresAt: null,
		source: "inline",
		inherited: false,
		denyImpact: "none",
		...partial,
	}
}

const IDS: Record<string, PersonIdentity> = {
	ana: { email: "ana@fab.mil.br", name: "1T Ána Souza", nrOrdem: "1234567" },
	bia: { email: "bia@fab.mil.br", name: null, nrOrdem: null },
	caio: { email: "caio@fab.mil.br", name: "Cap Caio", nrOrdem: "7654321" },
}

function people(grants: AlphaGrant[], lastChanges: Record<string, string> = {}): AlphaPerson[] {
	return aggregatePeople(annotateDenyImpact(grants, GRAPH, NOW), new Map(Object.entries(IDS)), new Map(Object.entries(lastChanges)), NOW)
}

const BASE_QUERY: PeopleQuery = { sort: "name", dir: "asc", page: 1, size: 25 }

describe("aggregatePeople", () => {
	test("uma entrada por pessoa, com as linhas dela em ordem de tela e a identidade do cadastro", () => {
		const list = people([
			grant({ userId: "ana", module: "alpha-admin", level: 3, unitId: 100 }),
			grant({ userId: "bia" }),
			grant({ userId: "ana", unitId: null }),
			grant({ userId: "ana", module: "alpha-requester", unitId: 100 }),
		])
		expect(list.map((p) => p.userId)).toEqual(["ana", "bia"])
		const ana = list[0] as AlphaPerson
		expect(ana.name).toBe("1T Ána Souza")
		// Global primeiro; depois a OM pela sigla; papel na ordem canônica.
		expect(ana.grants.map((g) => [g.unitCode, g.module])).toEqual([
			[null, "alpha-aci"],
			["IAE", "alpha-requester"],
			["IAE", "alpha-admin"],
		])
	})

	test("pessoa sem cadastro aparece pelo id, não some", () => {
		const [ghost] = aggregatePeople([grant({ userId: "ghost" })], new Map(), null, NOW)
		expect(ghost).toMatchObject({ userId: "ghost", email: "", name: null, lastChangeAt: null })
	})

	test("situação: bloqueio global anula o acesso de OM, e a pessoa aparece bloqueada e anulada", () => {
		const [ana] = people([grant({ userId: "ana", unitId: 100 }), grant({ userId: "ana", effect: "deny", unitId: null, inherited: true })])
		expect(ana?.status).toMatchObject({ active: false, blocked: true, annulled: true })
	})

	test("situação: bloqueio na OM apoiada NÃO anula o acesso na apoiadora", () => {
		const [ana] = people([grant({ userId: "ana", unitId: 26 }), grant({ userId: "ana", effect: "deny", unitId: 100 })])
		expect(ana?.status).toMatchObject({ active: true, blocked: true, annulled: false })
	})

	test("situação: prazo — vence em breve, vencido e o prazo mais próximo", () => {
		const soon = new Date(NOW + 10 * DAY).toISOString()
		const later = new Date(NOW + 90 * DAY).toISOString()
		const past = new Date(NOW - DAY).toISOString()
		const [ana] = people([
			grant({ userId: "ana", expiresAt: later }),
			grant({ userId: "ana", module: "alpha-requester", expiresAt: soon }),
			grant({ userId: "ana", module: "alpha-procurement", expiresAt: past }),
		])
		expect(ana?.status).toEqual({ active: true, blocked: false, annulled: false, expiringSoon: true, expired: true, nextExpiry: soon })
	})

	test("bloqueio no copiloto: os quatro papéis sem OM", () => {
		const modules = ["alpha-requester", "alpha-procurement", "alpha-aci", "alpha-admin"] as const
		const [ana] = people([grant({ userId: "ana" }), ...modules.map((module) => grant({ userId: "ana", module, effect: "deny", unitId: null }))])
		expect(ana?.copilotBlock).toBe("blocked")
		const [bia] = people([grant({ userId: "bia" }), grant({ userId: "bia", effect: "deny", unitId: null })])
		expect(bia?.copilotBlock).toBe("partial")
	})
})

describe("groupAllowsByUnit", () => {
	test("fichas por OM: global primeiro, sem bloqueios", () => {
		const groups = groupAllowsByUnit([
			grant({ userId: "ana", unitId: 100, module: "alpha-admin", level: 3 }),
			grant({ userId: "ana", unitId: 100, module: "alpha-requester" }),
			grant({ userId: "ana", unitId: 26 }),
			grant({ userId: "ana", unitId: null }),
			grant({ userId: "ana", unitId: 100, effect: "deny" }),
		])
		expect(groups.map((g) => [g.unitCode, g.grants.map((x) => x.module)])).toEqual([
			[null, ["alpha-aci"]],
			["GAP-SJ", ["alpha-aci"]],
			["IAE", ["alpha-requester", "alpha-admin"]],
		])
	})

	test("compareGrants põe acesso antes de bloqueio", () => {
		const allow = grant({ userId: "a", unitId: 100 })
		const deny = grant({ userId: "a", unitId: null, effect: "deny" })
		expect([deny, allow].sort(compareGrants)).toEqual([allow, deny])
	})
})

describe("personMatches (busca e filtros)", () => {
	const list = people([
		grant({ userId: "ana", unitId: 100, module: "alpha-requester" }),
		grant({ userId: "ana", unitId: 26, module: "alpha-aci", expiresAt: new Date(NOW + 5 * DAY).toISOString() }),
		grant({ userId: "bia", unitId: 26, module: "alpha-aci" }),
		grant({ userId: "bia", unitId: 26, module: "alpha-aci", effect: "deny" }),
		grant({ userId: "caio", unitId: null, module: "alpha-admin", level: 3 }),
		grant({ userId: "caio", unitId: 10, module: "alpha-procurement", expiresAt: new Date(NOW - DAY).toISOString() }),
	])
	const ids = (query: Partial<PeopleQuery>) => list.filter((p) => personMatches(p, { ...BASE_QUERY, ...query }, NOW)).map((p) => p.userId)

	test("busca por nome sem acento, e-mail e Nr. de ordem; todos os termos precisam casar", () => {
		expect(ids({ q: "ana souza" })).toEqual(["ana"])
		expect(ids({ q: "SOUZA 1t" })).toEqual(["ana"])
		expect(ids({ q: "bia@" })).toEqual(["bia"])
		expect(ids({ q: "76543" })).toEqual(["caio"])
		expect(ids({ q: "ana caio" })).toEqual([])
		expect(ids({ q: "   " })).toEqual(["ana", "bia", "caio"])
	})

	test("papel e OM recortam as linhas consideradas", () => {
		expect(ids({ role: "aci" })).toEqual(["ana", "bia"])
		expect(ids({ unit: 100 })).toEqual(["ana"])
		expect(ids({ unit: "global" })).toEqual(["caio"])
		expect(ids({ role: "requester", unit: 26 })).toEqual([])
	})

	test("situação é conferida só nas linhas do recorte", () => {
		expect(ids({ status: "anulado" })).toEqual(["bia"])
		expect(ids({ status: "bloqueado" })).toEqual(["bia"])
		expect(ids({ status: "expira" })).toEqual(["ana"])
		// O ACI da Ana expira; o Requisitante dela, não.
		expect(ids({ status: "expira", role: "requester" })).toEqual([])
		expect(ids({ status: "vencido" })).toEqual(["caio"])
		expect(ids({ status: "ativo" })).toEqual(["ana", "caio"])
		expect(ids({ status: "ativo", unit: 10 })).toEqual([])
	})

	test("bloqueio sem OM conta no filtro de OM para 'bloqueado'", () => {
		const [dan] = people([grant({ userId: "ana", unitId: 100 }), grant({ userId: "ana", unitId: null, effect: "deny", inherited: true })])
		expect(personMatches(dan as AlphaPerson, { ...BASE_QUERY, unit: 100, status: "bloqueado" }, NOW)).toBe(true)
	})
})

describe("sortPeople e paginação", () => {
	const list = people([grant({ userId: "caio" }), grant({ userId: "bia" }), grant({ userId: "ana" })], {
		ana: "2026-09-10T10:00:00Z",
		caio: "2026-09-18T10:00:00Z",
	})

	test("por nome (rótulo = nome, ou e-mail sem nome), sem distinguir acento", () => {
		// "1T Ána Souza" < "bia@fab.mil.br" < "Cap Caio"
		expect(sortPeople(list, "name", "asc").map((p) => p.userId)).toEqual(["ana", "bia", "caio"])
		expect(sortPeople(list, "name", "desc").map((p) => p.userId)).toEqual(["caio", "bia", "ana"])
	})

	test("por alteração: mais recente primeiro; sem registro sempre no fim", () => {
		expect(sortPeople(list, "recent", "desc").map((p) => p.userId)).toEqual(["caio", "ana", "bia"])
		expect(sortPeople(list, "recent", "asc").map((p) => p.userId)).toEqual(["ana", "caio", "bia"])
	})

	test("pageInfo prende a página ao intervalo", () => {
		expect(pageInfo(0, 3, 25)).toEqual({ page: 1, size: 25, total: 0, pageCount: 1, from: 0, to: 0 })
		expect(pageInfo(120, 3, 50)).toEqual({ page: 3, size: 50, total: 120, pageCount: 3, from: 101, to: 120 })
		expect(pageInfo(120, 9, 50).page).toBe(3)
		expect(pageInfo(120, 0, 50).page).toBe(1)
	})

	test("queryPeople devolve só a página, com o total filtrado e o do escopo", () => {
		const userIds = Array.from({ length: 130 }, (_, i) => `u${String(i).padStart(3, "0")}`)
		const many = aggregatePeople(
			userIds.map((userId) => grant({ userId })),
			new Map(userIds.map((userId) => [userId, { email: `${userId}@fab.mil.br`, name: null, nrOrdem: null }])),
			null,
			NOW
		)
		const page = queryPeople(many, { ...BASE_QUERY, page: 2, size: 50 }, NOW)
		expect(page.rows).toHaveLength(50)
		expect(page.rows[0]?.userId).toBe("u050")
		expect(page).toMatchObject({ total: 130, grandTotal: 130, page: 2, pageCount: 3, from: 51, to: 100 })
		const filtered = queryPeople(many, { ...BASE_QUERY, q: "u12", size: 25 }, NOW)
		expect(filtered).toMatchObject({ total: 10, grandTotal: 130, pageCount: 1 })
	})
})

describe("OMs listadas", () => {
	test("supportedUnitsOf desce a hierarquia de apoio, transitivamente", () => {
		expect(supportedUnitsOf(26, GRAPH).sort((a, b) => a - b)).toEqual([100, 101, 102])
		expect(supportedUnitsOf(101, GRAPH)).toEqual([102])
		expect(supportedUnitsOf(10, GRAPH)).toEqual([])
	})

	test("supportedUnitsOf não entra em laço com ciclo", () => {
		expect(
			supportedUnitsOf(1, [
				{ id: 1, supporting_unit_id: 2 },
				{ id: 2, supporting_unit_id: 1 },
			])
		).toEqual([2])
	})

	test("a página de uma OM lista ela e as apoiadas, dentro da cobertura", () => {
		expect(listingUnits(26, "all", GRAPH)).toEqual([26, 100, 101, 102])
		// Admin escopado do DCTA: cobertura [101, 102].
		expect(listingUnits(101, [101, 102], GRAPH)).toEqual([101, 102])
		// Cobertura que não inclui uma apoiada: ela fica de fora.
		expect(listingUnits(26, [26, 100], GRAPH)).toEqual([26, 100])
		expect(listingUnits(null, "all", GRAPH)).toBe("all")
	})

	test("bloqueios herdados vêm das apoiadoras que não estão na lista", () => {
		expect(inheritedDenyUnits([102], GRAPH)).toEqual([26, 101])
		expect(inheritedDenyUnits([101, 102], GRAPH)).toEqual([26])
		expect(inheritedDenyUnits([26, 100, 101, 102], GRAPH)).toEqual([])
	})
})

describe("parâmetros da URL", () => {
	test("?q=5 chega NÚMERO e vira texto; nada derruba a rota", () => {
		expect(PeopleSearchSchema.parse({ q: 5 })).toMatchObject({ q: "5" })
		expect(PeopleSearchSchema.parse({ q: "" }).q).toBeUndefined()
		expect(PeopleSearchSchema.parse({ unit: 26 }).unit).toBe("26")
		expect(PeopleSearchSchema.parse({ unit: "global" }).unit).toBe("global")
		const junk = PeopleSearchSchema.parse({ role: 5, unit: "abc", status: "x", sort: 1, dir: "up", page: "-2", size: 30 })
		expect(junk).toEqual({
			q: undefined,
			role: undefined,
			unit: undefined,
			status: undefined,
			sort: undefined,
			dir: undefined,
			page: undefined,
			size: undefined,
			person: undefined,
		})
		expect(PeopleSearchSchema.parse({ person: "00000000-0000-4000-8000-000000000001" }).person).toBe("00000000-0000-4000-8000-000000000001")
		expect(PeopleSearchSchema.parse({ person: 12 }).person).toBeUndefined()
	})

	test("os padrões: nome A–Z, página 1, 50 por página; alteração começa pela mais recente", () => {
		expect(peopleQueryOf(PeopleSearchSchema.parse({}))).toEqual({
			q: undefined,
			role: undefined,
			unit: undefined,
			status: undefined,
			sort: "name",
			dir: "asc",
			page: 1,
			size: 50,
		})
		expect(peopleQueryOf(PeopleSearchSchema.parse({ sort: "recent", page: "3", size: "100", unit: "26" }))).toMatchObject({
			sort: "recent",
			dir: "desc",
			page: 3,
			size: 100,
			unit: 26,
		})
	})

	test("o pedido montado da URL passa no validator do servidor", () => {
		const query = peopleQueryOf(PeopleSearchSchema.parse({ q: 5, role: "aci", unit: "global", status: "anulado", sort: "recent" }))
		expect(PeopleQuerySchema.safeParse({ scopeUnitId: null, ...query }).success).toBe(true)
		expect(PeopleQuerySchema.safeParse({ scopeUnitId: null, ...query, size: 1000 }).success).toBe(false)
	})

	test("normalizeText tira acento e caixa", () => {
		expect(normalizeText("JOÃO Ávila")).toBe("joao avila")
	})
})

describe("trilha de auditoria", () => {
	test("só as operações de acesso do contrate", () => {
		expect(auditActionOf("contrate.permission.grant")).toBe("grant")
		expect(auditActionOf("contrate.permission.unblock")).toBe("unblock")
		expect(auditActionOf("sisub.permission.grant")).toBeNull()
		expect(auditActionOf("contrate.mfa.reset")).toBeNull()
	})

	test("o escopado vê as OMs dele e os bloqueios no copiloto, não a concessão global", () => {
		const coverage = [26, 100]
		expect(isAuditVisible({ operation: "contrate.permission.grant", unitId: 100 }, coverage)).toBe(true)
		expect(isAuditVisible({ operation: "contrate.permission.grant", unitId: 10 }, coverage)).toBe(false)
		expect(isAuditVisible({ operation: "contrate.permission.grant", unitId: null }, coverage)).toBe(false)
		expect(isAuditVisible({ operation: "contrate.permission.block", unitId: null }, coverage)).toBe(true)
		expect(isAuditVisible({ operation: "contrate.permission.grant", unitId: null }, "all")).toBe(true)
		expect(isAuditVisible({ operation: "sisub.permission.grant", unitId: 26 }, "all")).toBe(false)
	})

	test("toAuditEntry lê o alvo do log (unit_id número ou texto)", () => {
		expect(toUnitIdOrNull("26")).toBe(26)
		expect(toUnitIdOrNull(null)).toBeNull()
		expect(toUnitIdOrNull("x")).toBeNull()
		const entry = toAuditEntry(
			{
				id: "l1",
				created_at: "2026-09-18T10:00:00Z",
				operation: "contrate.permission.grant",
				actor_id: "adm",
				target: { module: "alpha-aci", unit_id: 26, partition: "allow", expires_at: "2026-12-31T23:59:59.999-03:00" },
			},
			{ actor: (id) => (id === "adm" ? "Maj Admin" : id), unitCode: (id) => CODES[id] ?? null }
		)
		expect(entry).toEqual({
			id: "l1",
			at: "2026-09-18T10:00:00Z",
			action: "grant",
			module: "alpha-aci",
			unitId: 26,
			unitCode: "GAP-SJ",
			partition: "allow",
			expiresAt: "2026-12-31T23:59:59.999-03:00",
			actorId: "adm",
			actorLabel: "Maj Admin",
		})
		expect(toAuditEntry({ id: "x", created_at: "", operation: "other", actor_id: "a", target: null }, { actor: String, unitCode: () => null })).toBeNull()
	})
})

describe("summarizeStatus", () => {
	test("bloqueio vencido não bloqueia; acesso vencido não é ativo", () => {
		const past = new Date(NOW - DAY).toISOString()
		expect(summarizeStatus([grant({ userId: "a", effect: "deny", expiresAt: past }), grant({ userId: "a", expiresAt: past })], NOW)).toMatchObject({
			active: false,
			blocked: false,
			expired: true,
		})
	})
})

describe("civilDaysUntil", () => {
	test("conta dias civis de Brasília até o último dia do prazo", () => {
		// 19/09 às 22:30 em Brasília (já 20/09 em UTC); prazo até o fim de 09/10.
		const lateEvening = Date.parse("2026-09-20T01:30:00Z")
		expect(civilDaysUntil("2026-10-09T23:59:59.999-03:00", lateEvening)).toBe(20)
		expect(civilDaysUntil("2026-09-19T23:59:59.999-03:00", lateEvening)).toBe(0)
		expect(civilDaysUntil("2026-09-20T23:59:59.999-03:00", lateEvening)).toBe(1)
	})
})
