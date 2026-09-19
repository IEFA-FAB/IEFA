/**
 * Contrato da auditoria das server functions de acesso: o ATOR de toda concessão e revogação
 * é a sessão.
 *
 * A função SQL (`access_control.change_module_permission`) é SECURITY INVOKER da service role
 * e grava o `p_actor` que receber — ela não tem como saber quem é a pessoa. A garantia é
 * daqui: as entradas não têm campo de ator, e o `actorId` que chega ao helper é o `userId`
 * do guard. Lê o fonte, sem importar a server function (que puxa o env do servidor).
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { GrantAlphaRoleSchema, GrantAlphaRolesSchema, RevokeAlphaRoleSchema, SetCopilotBlockSchema } from "@/lib/alpha/admin-access"

const SOURCE = readFileSync(join(import.meta.dir, "access.fn.ts"), "utf8")
const READS = readFileSync(join(import.meta.dir, "../lib/alpha/access-read.server.ts"), "utf8")
const ACTOR_KEY = /actor|p_actor|grantedBy|granted_by|createdBy|performedBy/i

/** Os handlers de mutação: do `createServerFn({ method: "POST" })` até o próximo `export`. */
function postHandlers(): string[] {
	return SOURCE.split(/\nexport /).filter((chunk) => chunk.includes('createServerFn({ method: "POST" })'))
}

describe("entradas de grant/revoke sem ator", () => {
	test.each([
		["GrantAlphaRoleSchema", GrantAlphaRoleSchema],
		["GrantAlphaRolesSchema", GrantAlphaRolesSchema],
		["RevokeAlphaRoleSchema", RevokeAlphaRoleSchema],
	])("%s não tem campo de ator", (_name, schema) => {
		for (const key of Object.keys(schema.shape)) expect(key).not.toMatch(ACTOR_KEY)
	})

	test("um actorId mandado pelo cliente é descartado pelo validator", () => {
		const parsed = GrantAlphaRoleSchema.parse({ userId: "00000000-0000-4000-8000-00000000000b", role: "aci", unitId: 26, actorId: "forjado" })
		expect(parsed).not.toHaveProperty("actorId")
	})
})

describe("handlers de mutação", () => {
	const handlers = postHandlers()
	const nameOf = (chunk: string) => chunk.match(/^const (\w+)/)?.[1]
	const chunkOf = (name: string) => handlers.find((chunk) => nameOf(chunk) === name) ?? ""

	test("são exatamente os três: conceder (vários papéis), revogar e bloquear no copiloto", () => {
		expect(handlers.map(nameOf)).toEqual(["grantAlphaRolesFn", "revokeAlphaPermissionFn", "setAlphaCopilotBlockFn"])
	})

	test("conceder: guard primeiro, ator do guard, política conferida para todos os papéis, escrita pelo helper auditado", () => {
		const body = chunkOf("grantAlphaRolesFn")
		expect(body).toMatch(/\.validator\(GrantAlphaRolesSchema\)/)
		expect(body).toMatch(/const \{ ctx, coverage \} = await requireAlphaAdmin\(\)/)
		// O plano (e a recusa de política) sai inteiro ANTES do laço de gravação.
		expect(body).toMatch(/planAlphaRoleGrants\(\{ actorId: ctx\.userId, coverage \}, data\)/)
		expect(body.indexOf("planAlphaRoleGrants(")).toBeLessThan(body.indexOf("changeModulePermission("))
		expect(body).not.toMatch(/actorId:\s*data\./)
		// Um papel por chamada ao helper atômico (grant + log numa transação), nunca escrita direta.
		expect(body).toMatch(/for \(const \{ role, change \} of planned\)/)
		expect(body).toMatch(/changeModulePermission\(getAccessControlClient\(\), change\)/)
		expect(body).not.toMatch(/\.from\("user_permissions"\)\s*\.(insert|update|delete|upsert)/)
		// Falha de um papel vira desfecho daquele papel — não derruba o relato dos que entraram.
		expect(body).toMatch(/status: "failed"/)
	})

	test("revogar: guard primeiro, ator do guard, escrita pelo helper auditado", () => {
		const body = chunkOf("revokeAlphaPermissionFn")
		expect(body).toMatch(/const \{ ctx, coverage \} = await requireAlphaAdmin\(\)/)
		expect(body).toMatch(/buildAlphaPermissionChange\(\{ actorId: ctx\.userId, coverage \}, data\)/)
		expect(body).not.toMatch(/actorId:\s*data\./)
		expect(body).toMatch(/changeModulePermission\(getAccessControlClient\(\), change\)/)
	})
})

describe("leituras", () => {
	const handlers = SOURCE.split(/\nexport /).filter((chunk) => chunk.includes("createServerFn("))
	const nameOf = (chunk: string) => chunk.match(/^const (\w+)/)?.[1]

	test.each(handlers.map((chunk) => [nameOf(chunk), chunk]))("%s passa pelo guard de administração", (_name, chunk) => {
		expect(chunk as string).toMatch(/await requireAlphaAdmin\(\)/)
	})

	test("lista e prévia conferem a OM pedida contra a cobertura antes de ler", () => {
		for (const name of ["listAlphaPeopleFn", "previewAlphaGrantFn"]) {
			const chunk = handlers.find((c) => nameOf(c) === name) ?? ""
			expect(chunk).toMatch(/if \(!canListGrants\(coverage, data\.(scopeUnitId|unitId)\)\) forbidden\(/)
			expect(chunk.indexOf("canListGrants(")).toBeLessThan(chunk.search(/fetch(Grants|UnitSupportGraph)\(|resolveUserPermissions\(|loadAnnotatedGrants\(/))
		}
	})

	test("a lista devolve só a página, nunca todas as linhas", () => {
		const chunk = handlers.find((c) => nameOf(c) === "listAlphaPeopleFn") ?? ""
		expect(chunk).toMatch(/queryPeople\(aggregatePeople\(grants, identities, allChanges, now\), data, graph, now\)/)
		expect(chunk).toMatch(/return \{ \.\.\.page, units \}/)
	})

	// O GoTrue (e-mail de quem não tem `core.user_data`) não é consultado para a lista inteira a
	// cada tecla, filtro ou página: só com busca (o e-mail é texto buscado), e senão só na página.
	test("a lista só resolve e-mail no GoTrue para a página, salvo quando há busca", () => {
		const chunk = handlers.find((c) => nameOf(c) === "listAlphaPeopleFn") ?? ""
		expect(chunk).toMatch(/fetchIdentities\(getCoreReadClient\(\), userIds, \{ resolveMissingEmails: searchesEmails \}\)/)
		expect(chunk).toMatch(/if \(!searchesEmails\) page\.rows = await withAuthEmails\(getCoreReadClient\(\), page\.rows\)/)
		expect(READS).toMatch(/mapWithConcurrency\(pending, AUTH_LOOKUP_CONCURRENCY/)
	})

	test("a trilha de auditoria é recortada à administração de quem pede", () => {
		expect(SOURCE).toMatch(/auditRows\s*\.filter\(\(row\) => isAuditVisible\(/)
		expect(READS).toMatch(/if \(!isAuditVisible\(/)
	})

	test("as leituras são paginadas contra o teto de linhas do PostgREST", () => {
		// Sem isso, 4 mil linhas chegavam como mil, caladas.
		expect(READS).toMatch(/export const MAX_ROWS = 1000/)
		expect(READS.match(/readAllPages</g)?.length ?? 0).toBeGreaterThanOrEqual(4)
	})
})

/**
 * "Bloquear no copiloto": deny sem OM nos quatro papéis, numa transação, com log por papel. O
 * ator é a sessão, a escrita é da função SQL, e as regras de quem pode (só o global, nunca
 * sobre si mesmo) passam por `buildAlphaBlockChange` — testado em `admin-access.test.ts`.
 */
describe("bloqueio no copiloto", () => {
	const chunk = postHandlers().find((c) => c.startsWith("const setAlphaCopilotBlockFn")) ?? ""

	test("a entrada não tem campo de ator, e o ator forjado é descartado", () => {
		for (const key of Object.keys(SetCopilotBlockSchema.shape)) expect(key).not.toMatch(ACTOR_KEY)
		const parsed = SetCopilotBlockSchema.parse({ userId: "00000000-0000-4000-8000-00000000000b", blocked: true, actorId: "forjado" })
		expect(parsed).not.toHaveProperty("actorId")
	})

	test("guard primeiro, ator do guard, regra pura, escrita pela função SQL auditada", () => {
		expect(chunk).toMatch(/\.validator\(SetCopilotBlockSchema\)/)
		expect(chunk).toMatch(/const \{ ctx, coverage \} = await requireAlphaAdmin\(\)/)
		expect(chunk).toMatch(/buildAlphaBlockChange\(\{ actorId: ctx\.userId, coverage \}, data\)/)
		expect(chunk).not.toMatch(/actorId:\s*data\./)
		expect(chunk).toMatch(/setModuleBlock\(getAccessControlClient\(\), change\)/)
		// Nada de quatro chamadas avulsas: um bloqueio pela metade é o estado que a função evita.
		expect(chunk).not.toMatch(/changeModulePermission/)
		expect(chunk).not.toMatch(/\.from\("user_permissions"\)/)
	})
})

describe("nenhum arquivo de acesso escreve por fora do helper", () => {
	test.each([
		["access.fn.ts", SOURCE],
		["access-read.server.ts", READS],
	])("%s: nenhum insert/update/delete/upsert direto", (_name, source) => {
		expect(source).not.toMatch(/\.(insert|update|delete|upsert)\(/)
		expect(source).not.toMatch(/grantModulePermission|revokeModulePermission|grantUnscopedModulePermission/)
	})

	test("as leituras não chamam função SQL de escrita", () => {
		expect(READS).not.toMatch(/\.rpc\(/)
		// Fora dos comentários (o cabeçalho cita as funções de escrita para dizer que não moram ali).
		const code = READS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
		expect(code).not.toMatch(/changeModulePermission|setModuleBlock/)
	})
})

/**
 * O aviso de "acesso gravado, mas bloqueado" e o selo "Anulado por bloqueio" saem da MESMA
 * conta da API do α — permissões resolvidas pelo `@iefa/pbac` (inline + política) e cobertura
 * expandida pela hierarquia de apoio. O `deny_present` da função SQL só vê a mesma chave, e
 * foi com ele sozinho que a tela dizia "concedido" para acesso anulado por bloqueio global,
 * de política ou na OM apoiadora.
 */
describe("conferência de bloqueio", () => {
	test("a concessão resolve as permissões da pessoa como o α e confere a cobertura", () => {
		expect(SOURCE).toMatch(/resolveUserPermissions\(userId, getAccessControlClient\(\)\)/)
		expect(SOURCE).toMatch(/denyImpactOnAllow\(allow, permissions, graph\)/)
		expect(SOURCE).not.toMatch(/blockedByDeny/)
	})

	test("a lista traz os bloqueios herdados e marca cada acesso com a conta do α", () => {
		expect(SOURCE).toMatch(/kind: "inheritedDenies", unitIds: inheritedDenyUnits\(units, graph\)/)
		expect(SOURCE).toMatch(/annotateDenyImpact\(all, graph\)/)
	})
})

/**
 * A tela que chama estas server functions. Lida como fonte pelo mesmo motivo: montar a rota
 * pediria o router e o servidor inteiros.
 */
describe("tela de acessos", () => {
	const PAGE = readFileSync(join(import.meta.dir, "../routes/admin/$unitId/acessos.tsx"), "utf8")
	const PANEL = readFileSync(join(import.meta.dir, "../components/access/PersonPanel.tsx"), "utf8")
	const FORM = readFileSync(join(import.meta.dir, "../components/access/GrantRolesForm.tsx"), "utf8")

	// Sem partir da OM da página, a concessão podia sair para a OM que já não está na tela; em
	// "todas", nada é pré-escolhido (grant global às cegas é o erro caro).
	test("a concessão parte da OM da página", () => {
		expect(PAGE).toMatch(/const defaultUnit = initialGrantUnit\(scopeContext\)/)
		expect(PAGE).toMatch(/initialUnit=\{defaultUnit\}/)
	})

	// Revogar sem o lado apagaria a chave inteira — acesso E bloqueio.
	test("a revogação manda o lado da linha clicada", () => {
		expect(PANEL).toMatch(/revokeAlphaPermissionFn\(\{ data: \{[^}]*effect: grant\.effect/)
	})

	test("o painel é remontado a cada pessoa (nada do formulário de uma vaza para a outra)", () => {
		expect(PANEL).toMatch(/<PersonPanelBody\s+key=\{userId\}/)
	})

	test("a concessão manda os papéis e o prazo numa chamada só, e o aviso sai do desfecho por papel", () => {
		expect(FORM).toMatch(/grantAlphaRolesFn\(\{ data \}\)/)
		expect(FORM).toMatch(/summarizeGrantOutcomes\(result\.outcomes\)/)
	})

	test("a lista pede ao servidor só a página (busca, filtros e ordem vão na chamada)", () => {
		expect(PAGE).toMatch(/listAlphaPeopleFn\(\{ data: \{ scopeUnitId, \.\.\.query \} \}\)/)
		expect(PAGE).toMatch(/validateSearch: \(search: Record<string, unknown>\): PeopleSearch => PeopleSearchSchema\.parse\(search\)/)
	})
})
