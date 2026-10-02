import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { hasTenantTags, resolveServerTenant, scopeTags } from "./tenant-scope"

describe("resolveServerTenant", () => {
	test("a variável de runtime do deploy vence o valor do build", () => {
		expect(resolveServerTenant("cinco-s", "forms")).toBe("cinco-s")
	})

	test("sem runtime, usa o build", () => {
		expect(resolveServerTenant(undefined, "cinco-s")).toBe("cinco-s")
	})

	test("valor desconhecido não vira tenant", () => {
		expect(resolveServerTenant("hacker", undefined)).toBe("forms")
		expect(resolveServerTenant("hacker", "cinco-s")).toBe("cinco-s")
	})
})

describe("scopeTags", () => {
	test("5s: a tag do tenant entra mesmo que o cliente não peça", () => {
		expect(scopeTags("cinco-s")).toEqual(["5s"])
		expect(scopeTags("cinco-s", [])).toEqual(["5s"])
	})

	test("o cliente só estreita", () => {
		expect(scopeTags("cinco-s", ["5s", "extra"])).toEqual(["5s", "extra"])
		expect(scopeTags("forms", ["5s"])).toEqual(["5s"])
	})

	test("forms sem pedido: sem recorte", () => {
		expect(scopeTags("forms")).toEqual([])
	})
})

describe("hasTenantTags", () => {
	test("5s exige a tag; forms aceita tudo", () => {
		expect(hasTenantTags("cinco-s", ["5s"])).toBe(true)
		expect(hasTenantTags("cinco-s", [])).toBe(false)
		expect(hasTenantTags("cinco-s", null)).toBe(false)
		expect(hasTenantTags("forms", null)).toBe(true)
	})
})

describe("forms.fn.ts recorta as listas pelo tenant do servidor", () => {
	const source = readFileSync(join(import.meta.dir, "..", "server", "forms.fn.ts"), "utf8")

	test("o tenant vem do processo, não da requisição", () => {
		expect(source).toContain("resolveServerTenant(process.env.VITE_APP_TENANT, env.VITE_APP_TENANT)")
	})

	test("lista própria, compartilhadas e criação passam por scopeTags", () => {
		expect(source).toContain("const scopedTags = scopeTags(serverTenant(), tags)")
		expect(source).toContain("const tags = scopeTags(serverTenant(), requestedTags)")
		expect(source).toContain("tags: scopedTags")
	})

	test("abrir e responder pelo id também respeitam o tenant", () => {
		expect(source).toContain("if (!data || !isInServerTenant(data.tags)) throw notFound()")
		expect(source.match(/isInServerTenant\(data\.tags\)/g)?.length).toBe(2)
	})
})
