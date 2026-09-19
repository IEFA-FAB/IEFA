/**
 * Forma por forma: cada `target` que as funções auditadas de 20260921130000 gravam, as
 * formas legadas que o app gravava antes delas (e que ficam no log para sempre) e as
 * desconhecidas. O contrato é "forma conhecida vira frase; o resto vira chave/valor;
 * nada lança".
 */

import { describe, expect, test } from "vitest"
import { type AuditEntryDescription, describeAuditEntry, formatBindings, formatExpiry, formatLevel, formatScope, sourceOf, staticTitle } from "./describe-entry"

const USER = "22222222-2222-2222-2222-222222222222"
const OTHER = "33333333-3333-3333-3333-333333333333"
const POLICY = "44444444-4444-4444-4444-444444444444"
const EXPIRY = "2026-12-31T23:59:00-03:00"
const EXPIRY_BEFORE = "2026-10-01T12:00:00-03:00"

function field(description: AuditEntryDescription, label: string): string | undefined {
	return description.fields.find((f) => f.label === label)?.value
}

const scope = { unit_id: null, kitchen_id: null, mess_hall_id: null }

describe("formatadores", () => {
	test("nível: deny é bloqueio, ausente é traço", () => {
		expect(formatLevel(2)).toBe("2")
		expect(formatLevel(0)).toBe("bloqueio")
		expect(formatLevel(-1)).toBe("bloqueio")
		expect(formatLevel(null)).toBe("—")
		expect(formatLevel("x")).toBe("—")
	})

	test("prazo: nulo é sem prazo, data inválida volta crua", () => {
		expect(formatExpiry(null)).toBe("sem prazo")
		expect(formatExpiry(EXPIRY)).toMatch(/31\/12\/2026.*23:59/)
		expect(formatExpiry("amanhã")).toBe("amanhã")
		expect(formatExpiry(undefined)).toBe("—")
	})

	test("escopo: OM, cozinha, refeitório, global — e nada quando a forma não é de concessão", () => {
		expect(formatScope({ ...scope, unit_id: 12 })).toBe("OM 12")
		expect(formatScope({ ...scope, kitchen_id: 3 })).toBe("Cozinha 3")
		expect(formatScope({ ...scope, mess_hall_id: 5 })).toBe("Refeitório 5")
		expect(formatScope(scope)).toBe("Global")
		expect(formatScope({ module: "admin" })).toBeNull()
		expect(formatScope(null)).toBeNull()
	})

	test("recorte do visualizador", () => {
		expect(
			formatBindings([
				{ attribute_key: "om", effect: "allow", value: "12" },
				{ attribute_key: "om", effect: "deny", value: "7" },
			])
		).toBe("OM 12, exceto OM 7")
		expect(formatBindings([])).toBe("nenhuma")
		expect(formatBindings(null)).toBeNull()
	})

	test("origem pelo prefixo da operação", () => {
		expect(sourceOf("createUserPermissionFn")).toBe("sisub")
		expect(sourceOf("contrate.permission.grant")).toBe("contrate")
		expect(sourceOf("rumaer.permission.revoke")).toBe("rumaer")
		expect(sourceOf("sucont.permission.grant")).toBe("sucont")
		expect(sourceOf("forms.viewer.grant")).toBe("forms")
		expect(sourceOf("portal.journal-role.change")).toBe("portal")
		expect(sourceOf("script.add-trainees.attach")).toBe("script")
		expect(sourceOf("desconhecido.algo")).toBe("sisub")
	})
})

describe("grant inline do sisub", () => {
	test("createUserPermissionFn", () => {
		const d = describeAuditEntry("createUserPermissionFn", {
			target_user_id: USER,
			action: "grant",
			permission_id: OTHER,
			module: "kitchen",
			level: 2,
			...scope,
			kitchen_id: 3,
			expires_at: EXPIRY,
			partition: "allow",
			previous: null,
		})
		expect(d.title).toBe("Concedeu acesso")
		expect(d.source).toBe("sisub")
		expect(d.targetUserId).toBe(USER)
		expect(field(d, "Módulo")).toBe("Gestão Cozinha")
		expect(field(d, "Escopo")).toBe("Cozinha 3")
		expect(field(d, "Nível")).toBe("2")
		expect(field(d, "Prazo")).toMatch(/31\/12\/2026/)
	})

	test("createUserPermissionFn com deny é bloqueio", () => {
		const d = describeAuditEntry("createUserPermissionFn", {
			target_user_id: USER,
			module: "admin",
			level: 0,
			...scope,
			expires_at: null,
			partition: "deny",
			previous: null,
		})
		expect(d.title).toBe("Aplicou bloqueio")
		expect(field(d, "Nível")).toBe("bloqueio")
		expect(field(d, "Escopo")).toBe("Global")
		expect(field(d, "Prazo")).toBe("sem prazo")
	})

	test("updateUserPermissionFn mostra antes → depois", () => {
		const d = describeAuditEntry("updateUserPermissionFn", {
			target_user_id: USER,
			action: "change",
			permission_id: OTHER,
			module: "unit",
			level: 2,
			...scope,
			unit_id: 12,
			expires_at: EXPIRY,
			partition: "allow",
			previous: { permission_id: OTHER, module: "unit", level: 1, ...scope, expires_at: null, partition: "allow" },
		})
		expect(d.title).toBe("Alterou acesso")
		expect(field(d, "Nível")).toBe("1 → 2")
		expect(field(d, "Escopo")).toBe("Global → OM 12")
		expect(field(d, "Prazo")).toMatch(/^sem prazo → 31\/12\/2026/)
	})

	test("deleteUserPermissionFn lê o removido em `previous`", () => {
		const d = describeAuditEntry("deleteUserPermissionFn", {
			target_user_id: USER,
			action: "revoke",
			permission_id: OTHER,
			module: "storage",
			level: null,
			partition: "allow",
			...scope,
			mess_hall_id: 5,
			previous: {
				permission_id: OTHER,
				module: "storage",
				level: 2,
				...scope,
				mess_hall_id: 5,
				expires_at: EXPIRY,
				partition: "allow",
				created_at: EXPIRY_BEFORE,
			},
		})
		expect(d.title).toBe("Revogou acesso")
		expect(field(d, "Módulo")).toBe("Estoque")
		expect(field(d, "Escopo")).toBe("Refeitório 5")
		expect(field(d, "Nível")).toBe("2 → removido")
		expect(field(d, "Prazo")).toMatch(/31\/12\/2026/)
	})

	test("deleteUserPermissionFn de um deny é remoção de bloqueio", () => {
		const d = describeAuditEntry("deleteUserPermissionFn", {
			target_user_id: USER,
			action: "revoke",
			module: "admin",
			level: null,
			partition: "deny",
			...scope,
			previous: { module: "admin", level: 0, ...scope, expires_at: null, partition: "deny" },
		})
		expect(d.title).toBe("Removeu bloqueio")
		expect(field(d, "Nível")).toBe("bloqueio → removido")
	})
})

describe("grant por chave (contrate, rumaer, sucont)", () => {
	const grant = {
		target_user_id: USER,
		module: "alpha",
		level: 2,
		...scope,
		unit_id: 31,
		expires_at: EXPIRY,
		partition: "allow",
		previous_level: null,
		previous_expires_at: null,
		permission_id: OTHER,
		deny_present: false,
	}

	test("concessão nova", () => {
		const d = describeAuditEntry("contrate.permission.grant", grant)
		expect(d.title).toBe("Concedeu acesso")
		expect(d.source).toBe("contrate")
		expect(field(d, "Módulo")).toBe("alpha")
		expect(field(d, "Escopo")).toBe("OM 31")
		expect(field(d, "Nível")).toBe("2")
		expect(field(d, "Prazo")).toMatch(/^31\/12\/2026/)
		expect(field(d, "Atenção")).toBeUndefined()
	})

	test("regrant sobre concessão existente é alteração, com o antes", () => {
		const d = describeAuditEntry("rumaer.permission.grant", { ...grant, module: "rumaer", previous_level: 1, previous_expires_at: EXPIRY_BEFORE })
		expect(d.title).toBe("Alterou acesso")
		expect(d.source).toBe("rumaer")
		expect(field(d, "Nível")).toBe("1 → 2")
		expect(field(d, "Prazo")).toMatch(/^01\/10\/2026.* → 31\/12\/2026/)
	})

	test("concessão com bloqueio ativo avisa que o bloqueio prevalece", () => {
		const d = describeAuditEntry("sucont.permission.grant", { ...grant, module: "sucont-1", deny_present: true })
		expect(d.source).toBe("sucont")
		expect(field(d, "Atenção")).toMatch(/bloqueio/)
	})

	test("grant de deny é bloqueio", () => {
		const d = describeAuditEntry("contrate.permission.grant", { ...grant, level: 0, partition: "deny" })
		expect(d.title).toBe("Aplicou bloqueio")
		expect(field(d, "Nível")).toBe("bloqueio")
	})

	test("revogação", () => {
		const d = describeAuditEntry("contrate.permission.revoke", {
			target_user_id: USER,
			module: "alpha",
			level: null,
			...scope,
			partition: "all",
			previous_level: 2,
			removed: [
				{ id: OTHER, level: 2, expires_at: null, created_at: EXPIRY_BEFORE },
				{ id: POLICY, level: 0, expires_at: null, created_at: EXPIRY_BEFORE },
			],
		})
		expect(d.title).toBe("Revogou acesso")
		expect(field(d, "Nível")).toBe("2 → removido")
		expect(field(d, "Concessões removidas")).toBe("2")
		expect(field(d, "Escopo")).toBe("Global")
	})
})

describe("políticas", () => {
	const members = { affected_user_ids: [USER, OTHER], affected_members: [{ user_id: USER, expires_at: null }], affected_member_count: 2 }
	const statement = { statement_id: OTHER, module: "kitchen", level: 2, ...scope, kitchen_id: 3 }

	test("createPolicyFn", () => {
		const d = describeAuditEntry("createPolicyFn", { action: "create", policy_id: POLICY, policy_name: "Nutricionistas", description: null })
		expect(d.title).toBe("Criou política")
		expect(field(d, "Política")).toBe("Nutricionistas")
		expect(d.targetUserId).toBeNull()
	})

	test("updatePolicyFn mostra a renomeação", () => {
		const d = describeAuditEntry("updatePolicyFn", {
			action: "change",
			policy_id: POLICY,
			policy_name: "Nutricionistas",
			description: "nova",
			previous: { policy_name: "Nutris", description: "velha" },
		})
		expect(d.title).toBe("Alterou política")
		expect(field(d, "Política")).toBe("Nutris → Nutricionistas")
		expect(field(d, "Descrição")).toBe("alterada")
	})

	test("deletePolicyFn e restorePolicy contam quem foi alcançado", () => {
		const target = { action: "revoke", policy_id: POLICY, policy_name: "Nutricionistas", statements: [statement], ...members }
		const removed = describeAuditEntry("deletePolicyFn", target)
		expect(removed.title).toBe("Removeu política")
		expect(field(removed, "Regras")).toBe("1")
		expect(field(removed, "Pessoas alcançadas")).toBe("2")

		const restored = describeAuditEntry("restorePolicy", { ...target, action: "grant" })
		expect(restored.title).toBe("Restaurou política")
		expect(field(restored, "Pessoas alcançadas")).toBe("2")
	})

	test("addPolicyStatementFn", () => {
		const d = describeAuditEntry("addPolicyStatementFn", {
			action: "grant",
			policy_id: POLICY,
			policy_name: "Nutricionistas",
			statement,
			previous: null,
			...members,
		})
		expect(d.title).toBe("Adicionou regra à política")
		expect(field(d, "Módulo")).toBe("Gestão Cozinha")
		expect(field(d, "Escopo")).toBe("Cozinha 3")
		expect(field(d, "Nível")).toBe("2")
		expect(field(d, "Pessoas alcançadas")).toBe("2")
	})

	test("updatePolicyStatementFn", () => {
		const d = describeAuditEntry("updatePolicyStatementFn", {
			action: "change",
			policy_id: POLICY,
			policy_name: "Nutricionistas",
			statement: { ...statement, level: 3 },
			previous: { ...statement, level: 1, kitchen_id: null },
			...members,
		})
		expect(d.title).toBe("Alterou regra da política")
		expect(field(d, "Nível")).toBe("1 → 3")
		expect(field(d, "Escopo")).toBe("Global → Cozinha 3")
	})

	test("removePolicyStatementFn", () => {
		const d = describeAuditEntry("removePolicyStatementFn", {
			action: "revoke",
			policy_id: POLICY,
			policy_name: "Nutricionistas",
			statement: null,
			previous: statement,
			...members,
		})
		expect(d.title).toBe("Removeu regra da política")
		expect(field(d, "Módulo")).toBe("Gestão Cozinha")
		expect(field(d, "Escopo")).toBe("Cozinha 3")
		expect(field(d, "Nível")).toBe("2 → removido")
	})
})

describe("anexos de política", () => {
	test("attachPolicyFn — anexo novo", () => {
		const d = describeAuditEntry("attachPolicyFn", {
			target_user_id: USER,
			action: "grant",
			change: "attach",
			policy_id: POLICY,
			policy_name: "Conjunto Treino",
			expires_at: EXPIRY,
			previous: null,
		})
		expect(d.title).toBe("Anexou política")
		expect(d.targetUserId).toBe(USER)
		expect(field(d, "Política")).toBe("Conjunto Treino")
		expect(field(d, "Prazo")).toMatch(/^31\/12\/2026/)
	})

	test("attachPolicyFn — só o prazo mudou", () => {
		const d = describeAuditEntry("attachPolicyFn", {
			target_user_id: USER,
			action: "change",
			change: "expiry",
			policy_id: POLICY,
			policy_name: "Conjunto Treino",
			expires_at: null,
			previous: { expires_at: EXPIRY, created_at: EXPIRY_BEFORE, created_by: OTHER },
		})
		expect(d.title).toBe("Alterou prazo do anexo")
		expect(field(d, "Prazo")).toMatch(/^31\/12\/2026.* → sem prazo$/)
	})

	test("script.add-trainees.attach tem a mesma forma, origem script", () => {
		const d = describeAuditEntry("script.add-trainees.attach", {
			target_user_id: USER,
			action: "grant",
			change: "attach",
			policy_id: POLICY,
			policy_name: "Conjunto Treino",
			expires_at: null,
			previous: null,
		})
		expect(d.title).toBe("Anexou política")
		expect(d.source).toBe("script")
	})

	test("detachPolicyFn", () => {
		const d = describeAuditEntry("detachPolicyFn", {
			target_user_id: USER,
			action: "revoke",
			policy_id: POLICY,
			policy_name: "Conjunto Treino",
			previous: { expires_at: null, created_at: EXPIRY_BEFORE, created_by: OTHER },
		})
		expect(d.title).toBe("Desanexou política")
		expect(field(d, "Prazo do anexo")).toBe("sem prazo")
	})
})

describe("chaves MCP", () => {
	const key = { target_user_id: USER, key_id: OTHER, key_prefix: "sisub_ab12", label: "Claude Desktop", expires_at: EXPIRY }

	test.each([
		["createMcpKeyFn", "Chave MCP criada"],
		["revokeMcpKeyFn", "Chave MCP revogada"],
	])("%s", (operation, title) => {
		const d = describeAuditEntry(operation, { ...key, action: operation === "createMcpKeyFn" ? "grant" : "revoke" })
		expect(d.title).toBe(title)
		expect(field(d, "Chave")).toBe("Claude Desktop (sisub_ab12…)")
		expect(field(d, "Prazo")).toMatch(/^31\/12\/2026/)
	})

	test("deleteMcpKeyFn lê o prazo em `previous`", () => {
		const d = describeAuditEntry("deleteMcpKeyFn", {
			target_user_id: USER,
			action: "revoke",
			key_id: OTHER,
			key_prefix: "sisub_ab12",
			label: "Claude Desktop",
			previous: { is_active: false, expires_at: null, created_at: EXPIRY_BEFORE, last_used_at: null },
		})
		expect(d.title).toBe("Chave MCP apagada")
		expect(field(d, "Prazo")).toBe("sem prazo")
	})
})

describe("forms", () => {
	const bindings = [{ attribute_key: "om", effect: "allow", value: "12" }]

	test("forms.viewer.grant", () => {
		const d = describeAuditEntry("forms.viewer.grant", {
			target_user_id: USER,
			action: "grant",
			questionnaire_id: POLICY,
			viewer_row_id: OTHER,
			scope_mode: "scoped",
			bindings,
			previous: null,
		})
		expect(d.title).toBe("Visualizador de respostas concedido")
		expect(d.source).toBe("forms")
		expect(field(d, "Questionário")).toBe("44444444…")
		expect(field(d, "Respostas visíveis")).toBe("com recorte")
		expect(field(d, "Recorte")).toBe("OM 12")
	})

	test("forms.viewer.change mostra o recorte antes → depois", () => {
		const d = describeAuditEntry("forms.viewer.change", {
			target_user_id: USER,
			action: "change",
			questionnaire_id: POLICY,
			viewer_row_id: OTHER,
			scope_mode: "global",
			bindings: [],
			previous: { scope_mode: "scoped", bindings },
		})
		expect(d.title).toBe("Recorte do visualizador alterado")
		expect(field(d, "Respostas visíveis")).toBe("com recorte → todas as respostas")
		expect(field(d, "Recorte")).toBe("OM 12 → nenhuma")
	})

	test("forms.viewer.revoke lê o antes", () => {
		const d = describeAuditEntry("forms.viewer.revoke", {
			target_user_id: USER,
			action: "revoke",
			questionnaire_id: POLICY,
			viewer_row_id: OTHER,
			previous: { scope_mode: "scoped", bindings, added_by: OTHER, created_at: EXPIRY_BEFORE },
		})
		expect(d.title).toBe("Visualizador de respostas revogado")
		expect(field(d, "Respostas visíveis")).toBe("com recorte")
		expect(field(d, "Recorte")).toBe("OM 12")
	})

	test.each([
		["forms.editor.grant", "Editor de questionário concedido"],
		["forms.editor.revoke", "Editor de questionário revogado"],
	])("%s", (operation, title) => {
		const d = describeAuditEntry(operation, { target_user_id: USER, action: "grant", questionnaire_id: POLICY, editor_row_id: OTHER })
		expect(d.title).toBe(title)
		expect(d.targetUserId).toBe(USER)
		expect(field(d, "Questionário")).toBe("44444444…")
		expect(field(d, "Recorte")).toBeUndefined()
	})
})

describe("portal", () => {
	test("portal.journal-role.change", () => {
		const d = describeAuditEntry("portal.journal-role.change", { target_user_id: USER, action: "change", role: "editor", previous: { role: "author" } })
		expect(d.title).toBe("Papel no journal alterado")
		expect(d.source).toBe("portal")
		expect(field(d, "Papel")).toBe("autor → editor")
	})
})

describe("linhas legadas (gravadas pelo app antes das funções auditadas)", () => {
	test("createUserPermissionFn com `userId`", () => {
		const d = describeAuditEntry("createUserPermissionFn", { userId: USER, module: "kitchen", level: 1, ...scope, kitchen_id: 4, expires_at: null })
		expect(d.targetUserId).toBe(USER)
		expect(d.title).toBe("Concedeu acesso")
		expect(field(d, "Escopo")).toBe("Cozinha 4")
		expect(field(d, "Nível")).toBe("1")
	})

	test("updateUserPermissionFn legado sem prazo não inventa 'sem prazo'", () => {
		const d = describeAuditEntry("updateUserPermissionFn", { permissionId: OTHER, level: 2, ...scope })
		expect(d.title).toBe("Alterou acesso")
		expect(field(d, "Nível")).toBe("2")
		expect(field(d, "Prazo")).toBeUndefined()
		expect(d.targetUserId).toBeNull()
	})

	test("deleteUserPermissionFn legado grava o nível removido em `level`", () => {
		const d = describeAuditEntry("deleteUserPermissionFn", { permissionId: OTHER, userId: USER, module: "unit", level: 2 })
		expect(d.title).toBe("Revogou acesso")
		expect(field(d, "Nível")).toBe("2 → removido")
		expect(d.targetUserId).toBe(USER)
	})

	test("política legada com `policyId` e `name`", () => {
		expect(field(describeAuditEntry("createPolicyFn", { policyId: POLICY, name: "Nutricionistas" }), "Política")).toBe("Nutricionistas")
		expect(field(describeAuditEntry("deletePolicyFn", { policyId: POLICY }), "Política")).toBe("44444444…")
	})

	test("statement legado com módulo e nível soltos", () => {
		const d = describeAuditEntry("addPolicyStatementFn", { policyId: POLICY, statementId: OTHER, module: "storage", level: 1 })
		expect(field(d, "Módulo")).toBe("Estoque")
		expect(field(d, "Nível")).toBe("1")
	})

	test("attachPolicyFn legado", () => {
		const d = describeAuditEntry("attachPolicyFn", { userId: USER, policyId: POLICY, expires_at: null })
		expect(d.title).toBe("Anexou política")
		expect(d.targetUserId).toBe(USER)
		expect(field(d, "Prazo")).toBe("sem prazo")
	})

	test("chave MCP legada em camelCase", () => {
		const d = describeAuditEntry("createMcpKeyFn", { keyId: OTHER, label: "CLI", keyPrefix: "sisub_zz", expiresAt: null })
		expect(field(d, "Chave")).toBe("CLI (sisub_zz…)")
		expect(field(d, "Prazo")).toBe("sem prazo")
	})

	test("reset de MFA pelo admin usa `targetUserId`", () => {
		const d = describeAuditEntry("resetUserMfaFn", { method: "admin-reset", targetUserId: USER, removedFactors: 2, revokedRecoveryCodes: 8 })
		expect(d.targetUserId).toBe(USER)
		expect(d.title).toBeNull()
		expect(d.details).toContainEqual({ label: "removedFactors", value: "2" })
	})
})

describe("formas desconhecidas", () => {
	test("operação fora do mapa vira chave/valor compacto, sem JSON cru", () => {
		const d = describeAuditEntry("createEmpenhoFn", {
			empenhoId: OTHER,
			valor: 1234.5,
			itens: [{ a: 1 }, { a: 2 }],
			meta: { ug: "120001", ok: true },
			nada: null,
		})
		expect(d.title).toBeNull()
		expect(d.fields).toEqual([])
		expect(d.details).toEqual([
			{ label: "empenhoId", value: OTHER },
			{ label: "valor", value: "1234.5" },
			{ label: "itens", value: "2 itens" },
			{ label: "meta", value: "ug: 120001; ok: sim" },
			{ label: "nada", value: "—" },
		])
		for (const { value } of d.details) expect(value).not.toMatch(/[{}]/)
	})

	test("alvo que é só um id", () => {
		const d = describeAuditEntry("verifyMfaEnrollmentFn", "factor-123")
		expect(d.details).toEqual([{ label: "alvo", value: "factor-123" }])
		expect(d.targetUserId).toBeNull()
	})

	test("alvo nulo", () => {
		const d = describeAuditEntry("generateRecoveryCodesFn", null)
		expect(d.details).toEqual([])
		expect(d.fields).toEqual([])
		expect(d.title).toBeNull()
	})

	test("operação conhecida com alvo de tipo errado não lança", () => {
		const weird: unknown[] = [42, "texto", [1, 2], { previous: "não é objeto", level: "abc", statement: 7, bindings: "x", removed: 3 }]
		const operations = [
			"createUserPermissionFn",
			"updateUserPermissionFn",
			"deleteUserPermissionFn",
			"contrate.permission.grant",
			"contrate.permission.revoke",
			"deletePolicyFn",
			"updatePolicyStatementFn",
			"attachPolicyFn",
			"detachPolicyFn",
			"deleteMcpKeyFn",
			"forms.viewer.change",
			"portal.journal-role.change",
		]
		for (const operation of operations) {
			for (const target of weird) {
				expect(() => describeAuditEntry(operation, target)).not.toThrow()
			}
		}
	})

	test("valor longo é truncado", () => {
		const d = describeAuditEntry("algoFn", { texto: "x".repeat(200) })
		expect(d.details[0]?.value.length).toBeLessThanOrEqual(80)
	})
})

describe("staticTitle — opções do filtro", () => {
	test("rótulos por nome, sem depender do alvo", () => {
		expect(staticTitle("createUserPermissionFn")).toBe("Concedeu acesso")
		expect(staticTitle("contrate.permission.grant")).toBe("Concedeu ou alterou acesso")
		expect(staticTitle("sucont.permission.revoke")).toBe("Revogou acesso")
		expect(staticTitle("attachPolicyFn")).toBe("Anexou política ou alterou prazo do anexo")
		expect(staticTitle("script.add-trainees.attach")).toBe("Anexou política ou alterou prazo do anexo")
		expect(staticTitle("restorePolicy")).toBe("Restaurou política")
		expect(staticTitle("forms.editor.revoke")).toBe("Editor de questionário revogado")
		expect(staticTitle("portal.journal-role.change")).toBe("Papel no journal alterado")
		expect(staticTitle("createEmpenhoFn")).toBeNull()
		expect(staticTitle("contrate.permission.block")).toBeNull()
	})
})
