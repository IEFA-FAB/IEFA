import { describe, expect, test } from "bun:test"
import { meAccess } from "@/test/access-fixture"
import { resolveLegacyProcessPath } from "./legacy-routes"

describe("resolveLegacyProcessPath", () => {
	test("quem revisa a OM do processo vai à ACI dela", () => {
		expect(resolveLegacyProcessPath(meAccess({ procurement: [26, 100] }), 100, "processos", "abc")).toBe("/aci/100/processos/abc")
	})

	test("global com registro sem OM vai a `todas`", () => {
		expect(resolveLegacyProcessPath(meAccess({ aci: "all" }), null, "relatorio", "run-1")).toBe("/aci/todas/relatorio/run-1")
	})

	test("revisor de OUTRA OM que é requisitante desta vai ao Requisitante", () => {
		expect(resolveLegacyProcessPath(meAccess({ procurement: [10], requester: [26] }), 26, "processos", "abc")).toBe("/requisitante/26/processos/abc")
	})

	test("quem só enviou (sem papel) vai a `minhas`", () => {
		expect(resolveLegacyProcessPath(meAccess(), 26, "processos", "abc")).toBe("/requisitante/minhas/processos/abc")
	})

	test("OM fora da cobertura do requisitante: `minhas` (pode ser o envio dele para outra OM)", () => {
		expect(resolveLegacyProcessPath(meAccess({ requester: [10] }), 26, "processos", "abc")).toBe("/requisitante/minhas/processos/abc")
	})
})
