import { describe, expect, test } from "vitest"
import { assuranceFor } from "@/server/assurance-registry"
import { describeRequirement, type RegistryLookup } from "./requirement-label"

/** O registro real — a frase tem de sair dele, e não de uma cópia no teste. */
const registry: RegistryLookup = (operation) => assuranceFor(operation as never)?.require ?? null

describe("describeRequirement", () => {
	test("operação do sisub: a frase é a do REGISTRO, não a do grau gravado", () => {
		expect(describeRequirement("createUserPermissionFn", "fresh", registry)).toEqual({ label: "Exige elevação recente", tone: "warning" })
		expect(describeRequirement("createEmpenhoFn", "session", registry)).toEqual({ label: "Exige sessão elevada", tone: "secondary" })
	})

	test("chave MCP revogada/apagada é gravada como session, mas não exige nada", () => {
		expect(registry("revokeMcpKeyFn")).toBe("none")
		expect(describeRequirement("revokeMcpKeyFn", "session", registry).label).toBe("Sessão autenticada")
		expect(describeRequirement("deleteMcpKeyFn", "session", registry).label).toBe("Sessão autenticada")
	})

	test("outros apps: session é só sessão autenticada — nunca 'elevada'", () => {
		for (const operation of [
			"forms.viewer.grant",
			"portal.journal-role.change",
			"rumaer.permission.grant",
			"sucont.permission.revoke",
			"contrate.permission.grant",
		]) {
			expect(describeRequirement(operation, "session", registry).label).toBe("Sessão autenticada")
		}
	})

	test("fresh gravado fora do registro continua dizendo o que foi exigido", () => {
		expect(describeRequirement("app.qualquer", "fresh", registry).label).toBe("Exige elevação recente")
	})

	test("script não teve sessão", () => {
		expect(describeRequirement("script.add-trainees.attach", "session", registry).label).toBe("Script (sem sessão)")
	})
})
