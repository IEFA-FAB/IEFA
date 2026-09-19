import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { ASSURANCE_REGISTRY } from "@/server/assurance-registry"
import { describeRequirement } from "./requirement-label"

describe("describeRequirement — o grau GRAVADO é o fato", () => {
	test("fresh gravado → elevação recente, de qualquer app", () => {
		expect(describeRequirement("createUserPermissionFn", "fresh")).toEqual({ label: "Exige elevação recente", tone: "warning" })
		expect(describeRequirement("app.qualquer", "fresh").label).toBe("Exige elevação recente")
	})

	test("session gravado nunca afirma elevação — nem para operação que hoje o registro classifica como session", () => {
		expect(ASSURANCE_REGISTRY.createEmpenhoFn.require).toBe("session")
		expect(describeRequirement("createEmpenhoFn", "session").label).toBe("Sessão autenticada")
		expect(describeRequirement("revokeMcpKeyFn", "session").label).toBe("Sessão autenticada")
		for (const operation of [
			"forms.viewer.grant",
			"portal.journal-role.change",
			"rumaer.permission.grant",
			"sucont.permission.revoke",
			"contrate.permission.block",
		]) {
			expect(describeRequirement(operation, "session").label).toBe("Sessão autenticada")
		}
	})

	test("linha antiga mantém o rótulo se o registro mudar: a frase não depende dele", () => {
		// `createUserPermissionFn` é `fresh` hoje; uma linha gravada quando era `session` continua
		// dizendo "Sessão autenticada" — e uma `fresh` antiga continua "elevação recente" mesmo
		// que a operação deixe de exigir. A função nem recebe o registro.
		expect(ASSURANCE_REGISTRY.createUserPermissionFn.require).toBe("fresh")
		expect(describeRequirement("createUserPermissionFn", "session").label).toBe("Sessão autenticada")
		expect(ASSURANCE_REGISTRY.revokeMcpKeyFn.require).toBe("none")
		expect(describeRequirement("revokeMcpKeyFn", "fresh").label).toBe("Exige elevação recente")
		const source = readFileSync(join(__dirname, "requirement-label.ts"), "utf8")
		expect(source).not.toMatch(/^import .*assurance-registry/m)
	})

	test("o nome só refina session: script não teve sessão", () => {
		expect(describeRequirement("script.add-trainees.attach", "session").label).toBe("Script (sem sessão)")
		expect(describeRequirement("script.add-trainees.attach", "fresh").label).toBe("Exige elevação recente")
	})
})
