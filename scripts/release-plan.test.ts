import { describe, expect, test } from "bun:test"
import { manifest } from "./generate-deploy-artifacts"
import { planOf, resolveApps } from "./release-plan"

describe("resolveApps", () => {
	test("push: os filtros que casaram viram chaves do manifesto, na ordem dele", () => {
		// `mcp` é o filtro do sisub-mcp; `5s` começa por dígito.
		expect(resolveApps({ event: "push", changed: '["mcp","5s","api"]' })).toEqual(["api", "sisub-mcp", "5s"])
	})

	test("push sem filtro casado não publica nada", () => {
		expect(resolveApps({ event: "push", changed: "[]" })).toEqual([])
		expect(resolveApps({ event: "push", changed: "" })).toEqual([])
	})

	test("dispatch: `all` é o manifesto inteiro", () => {
		expect(resolveApps({ event: "workflow_dispatch", dispatch: " all " })).toEqual(manifest.apps.map((app) => app.key))
	})

	test("dispatch: lista separada por vírgula, com espaço, ignorando o filtro", () => {
		expect(resolveApps({ event: "workflow_dispatch", dispatch: "portal, sisub", changed: '["api"]' })).toEqual(["portal", "sisub"])
	})

	test("dispatch com chave desconhecida falha em vez de publicar menos do que se pediu", () => {
		expect(() => resolveApps({ event: "workflow_dispatch", dispatch: "sisub,mcp" })).toThrow(/desconhecido.*mcp/)
	})
})

describe("planOf", () => {
	test("warm-deps só quando algum app sai do Dockerfile raiz", () => {
		expect(planOf(["pdf"]).monorepo).toBe(false)
		expect(planOf(["docs"]).monorepo).toBe(false)
		expect(planOf(["pdf", "5s"]).monorepo).toBe(true)
		expect(planOf([]).monorepo).toBe(false)
	})
})
