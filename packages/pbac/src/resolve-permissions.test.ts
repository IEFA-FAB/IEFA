import { describe, expect, spyOn, test } from "bun:test"
import { hasPermission } from "./has-permission.ts"
import { NOT_EXPIRED, resolveUserPermissions } from "./resolve-permissions.ts"
import type { UserPermission } from "./types.ts"

type StubError = { message: string; code?: string } | null

type PolicyRow = { id: string; deleted_at: string | null }
type StatementRow = UserPermission & { policy_id: string }

interface StubTables {
	/** Linhas de `access_control.user_permissions` (grants inline). */
	inline?: UserPermission[]
	inlineError?: StubError
	/** Linhas de `access_control.user_policy_attachment`. */
	attachments?: { policy_id: string }[]
	attachmentError?: StubError
	/** Linhas de `access_control.policy`. */
	policies?: PolicyRow[]
	policyError?: StubError
	/** Linhas de `access_control.policy_statement`. */
	statements?: StatementRow[]
	statementError?: StubError
}

/**
 * Dublê de `SupabaseClient` que conhece as quatro tabelas da resolução e registra as
 * tabelas consultadas — é o que permite provar que o caminho de políticas não emite
 * query nenhuma quando o usuário não tem anexo.
 */
function createSupabaseStub(tables: StubTables) {
	const visited: string[] = []
	/** Filtro de expiração recebido por tabela — `undefined` se a origem não o aplicou. */
	const ors: Record<string, string | undefined> = {}

	const client = {
		from(table: string) {
			visited.push(table)

			if (table === "user_permissions") {
				return {
					select(columns: string) {
						expect(columns).toBe("module, level, mess_hall_id, kitchen_id, unit_id")
						return {
							eq(column: string, userId: string) {
								expect(column).toBe("user_id")
								expect(userId).toBe("user-1")
								return {
									or(filter: string) {
										ors.user_permissions = filter
										return { data: tables.inline ?? [], error: tables.inlineError ?? null }
									},
								}
							},
						}
					},
				}
			}

			if (table === "user_policy_attachment") {
				return {
					select(columns: string) {
						expect(columns).toBe("policy_id")
						return {
							eq(column: string, userId: string) {
								expect(column).toBe("user_id")
								expect(userId).toBe("user-1")
								return {
									or(filter: string) {
										ors.user_policy_attachment = filter
										return { data: tables.attachments ?? [], error: tables.attachmentError ?? null }
									},
								}
							},
						}
					},
				}
			}

			if (table === "policy") {
				return {
					select() {
						return {
							in(column: string, ids: string[]) {
								expect(column).toBe("id")
								return {
									is(deletedColumn: string, value: null) {
										expect(deletedColumn).toBe("deleted_at")
										expect(value).toBeNull()
										const rows = (tables.policies ?? []).filter((p) => ids.includes(p.id) && p.deleted_at === null)
										return { data: rows, error: tables.policyError ?? null }
									},
								}
							},
						}
					},
				}
			}

			if (table === "policy_statement") {
				return {
					select(columns: string) {
						expect(columns).toBe("policy_id, module, level, mess_hall_id, kitchen_id, unit_id")
						return {
							in(column: string, ids: string[]) {
								expect(column).toBe("policy_id")
								const rows = (tables.statements ?? []).filter((s) => ids.includes(s.policy_id))
								return { data: rows, error: tables.statementError ?? null }
							},
						}
					},
				}
			}

			throw new Error(`tabela inesperada na resolução: ${table}`)
		},
	}

	return { client: client as never, visited, ors }
}

/** Anexa `policyId` ao usuário e devolve as tabelas de política já consistentes. */
function attachedPolicy(policyId: string, statements: UserPermission[], deletedAt: string | null = null): StubTables {
	return {
		attachments: [{ policy_id: policyId }],
		policies: [{ id: policyId, deleted_at: deletedAt }],
		statements: statements.map((s) => ({ ...s, policy_id: policyId })),
	}
}

const KITCHEN_WRITE: UserPermission = { module: "kitchen", level: 2, kitchen_id: 11, mess_hall_id: null, unit_id: null }
const DINER_IMPLICIT: UserPermission = { module: "diner", level: 1, kitchen_id: null, mess_hall_id: null, unit_id: null }

describe("resolveUserPermissions — grants inline", () => {
	test("injeta diner level 1 quando não há regra explícita de diner", async () => {
		const { client } = createSupabaseStub({ inline: [KITCHEN_WRITE] })

		const permissions = await resolveUserPermissions("user-1", client)

		expect(permissions).toContainEqual(DINER_IMPLICIT)
		expect(permissions).toContainEqual(KITCHEN_WRITE)
	})

	test("deny explícito não concede, e permanece para o guard poder negar", async () => {
		const inline: UserPermission[] = [
			{ module: "kitchen", level: 0, kitchen_id: 11, mess_hall_id: null, unit_id: null },
			{ module: "unit", level: 2, unit_id: 3, kitchen_id: null, mess_hall_id: null },
		]
		const { client } = createSupabaseStub({ inline })

		const permissions = await resolveUserPermissions("user-1", client)

		// O deny fica no conjunto — é o que permite negar a cozinha 11 mesmo quando um allow
		// SEM escopo existe. Com level 0 ele nunca satisfaz `level >= minLevel`.
		expect(hasPermission(permissions, "kitchen", 1, { type: "kitchen", id: 11 })).toBe(false)
		expect(permissions).toContainEqual(inline[1] as UserPermission)
	})

	test("não injeta diner implícito quando existe regra explícita de diner", async () => {
		const inline: UserPermission[] = [{ module: "diner", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }]
		const { client } = createSupabaseStub({ inline })

		expect(await resolveUserPermissions("user-1", client)).toEqual(inline)
	})

	test("sem anexo de política o resultado é o mesmo de antes, e nenhuma outra tabela é lida", async () => {
		// Requisito duro: quem não tem política anexada — o caso de todo usuário de rumaer e
		// sucont hoje — não pode ver diferença nenhuma, nem no conjunto devolvido, nem em
		// query extra além do sondar do anexo.
		const { client, visited } = createSupabaseStub({ inline: [KITCHEN_WRITE] })

		const permissions = await resolveUserPermissions("user-1", client)

		expect(permissions).toEqual([KITCHEN_WRITE, DINER_IMPLICIT])
		expect(visited.sort()).toEqual(["user_permissions", "user_policy_attachment"])
	})

	test("propaga erro de consulta com mensagem sanitizada", async () => {
		const { client } = createSupabaseStub({ inlineError: { message: "database unavailable" } })

		await expect(resolveUserPermissions("user-1", client)).rejects.toThrow("Falha ao buscar permissões: database unavailable")
	})
})

describe("resolveUserPermissions — políticas anexadas", () => {
	test("permissão que só existe em política entra no conjunto efetivo", async () => {
		// O buraco que esta função tinha: quem recebia acesso pelo "Conjunto Treino" era
		// invisível para o sisub-mcp, embora o app o enxergasse.
		const training: UserPermission = { module: "global", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }
		const { client } = createSupabaseStub({ inline: [], ...attachedPolicy("policy-training", [training]) })

		const permissions = await resolveUserPermissions("user-1", client)

		expect(permissions).toContainEqual(training)
		expect(hasPermission(permissions, "global", 2)).toBe(true)
	})

	test("une as duas origens e mantém o maior nível do mesmo par (módulo, escopo)", async () => {
		const { client } = createSupabaseStub({
			inline: [{ module: "kitchen", level: 1, kitchen_id: 11, mess_hall_id: null, unit_id: null }],
			...attachedPolicy("policy-1", [
				{ module: "kitchen", level: 3, kitchen_id: 11, mess_hall_id: null, unit_id: null },
				{ module: "storage", level: 1, kitchen_id: null, mess_hall_id: null, unit_id: null },
			]),
		})

		const permissions = await resolveUserPermissions("user-1", client)

		expect(permissions.filter((p) => p.module === "kitchen")).toEqual([{ module: "kitchen", level: 3, kitchen_id: 11, mess_hall_id: null, unit_id: null }])
		expect(hasPermission(permissions, "storage", 1)).toBe(true)
	})

	test("deny de política vence allow inline", async () => {
		const { client } = createSupabaseStub({
			inline: [KITCHEN_WRITE],
			...attachedPolicy("policy-deny", [{ module: "kitchen", level: 0, kitchen_id: 11, mess_hall_id: null, unit_id: null }]),
		})

		const permissions = await resolveUserPermissions("user-1", client)

		expect(hasPermission(permissions, "kitchen", 1, { type: "kitchen", id: 11 })).toBe(false)
		expect(permissions.filter((p) => p.module === "kitchen" && p.level > 0)).toEqual([])
	})

	test("deny inline vence allow de política", async () => {
		const { client } = createSupabaseStub({
			inline: [{ module: "kitchen", level: 0, kitchen_id: null, mess_hall_id: null, unit_id: null }],
			...attachedPolicy("policy-allow", [KITCHEN_WRITE]),
		})

		const permissions = await resolveUserPermissions("user-1", client)

		// Deny sem escopo cobre o módulo inteiro — inclusive o allow escopado da política.
		expect(hasPermission(permissions, "kitchen", 1, { type: "kitchen", id: 11 })).toBe(false)
		expect(permissions.filter((p) => p.module === "kitchen" && p.level > 0)).toEqual([])
	})

	test("deny de diner vindo de política remove o comensal implícito", async () => {
		const { client } = createSupabaseStub({
			inline: [],
			...attachedPolicy("policy-no-diner", [{ module: "diner", level: 0, kitchen_id: null, mess_hall_id: null, unit_id: null }]),
		})

		const permissions = await resolveUserPermissions("user-1", client)

		expect(permissions.filter((p) => p.module === "diner" && p.level > 0)).toEqual([])
	})

	test("política com soft delete não concede nada", async () => {
		const { client } = createSupabaseStub({
			inline: [],
			...attachedPolicy("policy-removed", [{ module: "global", level: 2, kitchen_id: null, mess_hall_id: null, unit_id: null }], "2026-09-01T00:00:00Z"),
		})

		const permissions = await resolveUserPermissions("user-1", client)

		expect(permissions).toEqual([DINER_IMPLICIT])
	})

	test("statement de política não anexada ao usuário não vaza", async () => {
		const { client } = createSupabaseStub({
			inline: [],
			attachments: [{ policy_id: "policy-mine" }],
			policies: [
				{ id: "policy-mine", deleted_at: null },
				{ id: "policy-alheia", deleted_at: null },
			],
			statements: [
				{ module: "storage", level: 1, kitchen_id: null, mess_hall_id: null, unit_id: null, policy_id: "policy-mine" },
				{ module: "admin", level: 3, kitchen_id: null, mess_hall_id: null, unit_id: null, policy_id: "policy-alheia" },
			],
		})

		const permissions = await resolveUserPermissions("user-1", client)

		expect(hasPermission(permissions, "storage", 1)).toBe(true)
		expect(hasPermission(permissions, "admin", 1)).toBe(false)
	})
})

describe("resolveUserPermissions — bancos sem o modelo de políticas", () => {
	// Um consumidor novo pode passar um cliente apontado para um banco sem as tabelas de
	// política. Faltar a tabela é "não há política", não indisponibilidade — mas como a
	// degradação é fail-open (descarta também os DENY da política), ela precisa deixar rastro.
	// Os apps de hoje (sisub, sisub-mcp, rumaer, sucont) compartilham o MESMO schema
	// `access_control`, onde as tabelas existem: aqui ninguém deveria cair.
	test.each([["PGRST205"], ["42P01"]])("código %s degrada para 'sem políticas', e avisa", async (code) => {
		const { client } = createSupabaseStub({
			inline: [KITCHEN_WRITE],
			attachmentError: { message: "Could not find the table 'access_control.user_policy_attachment'", code },
		})
		const warn = spyOn(console, "warn").mockImplementation(() => {})

		try {
			expect(await resolveUserPermissions("user-1", client)).toEqual([KITCHEN_WRITE, DINER_IMPLICIT])
			// Fail-open sem rastro é indistinguível de "este usuário não tem política nenhuma".
			expect(warn).toHaveBeenCalledTimes(1)
			expect(warn.mock.calls[0]?.[0]).toContain(code)
		} finally {
			warn.mockRestore()
		}
	})

	test("o caminho normal — sem anexo — não avisa nada", async () => {
		const { client } = createSupabaseStub({ inline: [KITCHEN_WRITE] })
		const warn = spyOn(console, "warn").mockImplementation(() => {})

		try {
			await resolveUserPermissions("user-1", client)
			expect(warn).not.toHaveBeenCalled()
		} finally {
			warn.mockRestore()
		}
	})

	test("erro real na busca de anexos propaga em vez de virar conjunto vazio", async () => {
		// Estado vazio que mente sobre falha: uma queda de rede viraria deny silencioso.
		const { client } = createSupabaseStub({
			inline: [KITCHEN_WRITE],
			attachmentError: { message: "fetch failed", code: "ECONNRESET" },
		})

		await expect(resolveUserPermissions("user-1", client)).rejects.toThrow("Falha ao buscar políticas do usuário: fetch failed")
	})

	test("erro sem código propaga", async () => {
		const { client } = createSupabaseStub({ inline: [], attachmentError: { message: "timeout" } })

		await expect(resolveUserPermissions("user-1", client)).rejects.toThrow("Falha ao buscar políticas do usuário: timeout")
	})

	test("erro ao ler as políticas anexadas propaga — o anexo existe, o resto tem que existir", async () => {
		const { client } = createSupabaseStub({
			inline: [],
			attachments: [{ policy_id: "policy-1" }],
			policyError: { message: "connection reset", code: "PGRST205" },
		})

		await expect(resolveUserPermissions("user-1", client)).rejects.toThrow("Falha ao buscar políticas do usuário: connection reset")
	})

	test("erro ao ler os statements propaga", async () => {
		const { client } = createSupabaseStub({
			inline: [],
			attachments: [{ policy_id: "policy-1" }],
			policies: [{ id: "policy-1", deleted_at: null }],
			statementError: { message: "statement timeout", code: "57014" },
		})

		await expect(resolveUserPermissions("user-1", client)).rejects.toThrow("Falha ao buscar permissões de política: statement timeout")
	})
})

describe("filtro de expiração", () => {
	test("as DUAS origens pedem só as linhas sem prazo ou com prazo no futuro", async () => {
		// Filtrar só os grants inline deixaria o anexo de política vencido emprestando os
		// statements dela — o acesso teria prazo na tela e nenhum no efeito.
		const { client, ors } = createSupabaseStub({ inline: [], attachments: [] })

		await resolveUserPermissions("user-1", client)

		expect(ors.user_permissions).toBe("expires_at.is.null,expires_at.gt.now()")
		expect(ors.user_permissions).toBe(NOT_EXPIRED)
		expect(ors.user_policy_attachment).toBe(NOT_EXPIRED)
	})

	test("o corte usa now() do BANCO, não um instante calculado em JS", () => {
		// Um ISO calculado aqui viria do relógio do processo, e um container com clock torto
		// concederia acesso vencido (ou revogaria acesso vivo). O valor precisa ser a string
		// literal que o Postgres resolve na própria transação.
		expect(NOT_EXPIRED).toContain("now()")
		expect(NOT_EXPIRED).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
	})

	test("o filtro é OR com IS NULL: sem prazo continua valendo para sempre", () => {
		// Só `gt.now()` derrubaria TODA linha com `expires_at` nulo — isto é, todo grant que
		// existe hoje. O `is.null` é o que torna a migration retrocompatível.
		expect(NOT_EXPIRED.split(",")).toEqual(["expires_at.is.null", "expires_at.gt.now()"])
	})
})
