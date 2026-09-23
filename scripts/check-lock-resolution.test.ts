import { describe, expect, test } from "bun:test"
import { findViolations, isForced, resolveFrom } from "./check-lock-resolution"
import type { LockPkg } from "./lock-registry"

type Meta = { dependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalPeers?: string[] }
const pkg = (spec: string, meta: Meta = {}): LockPkg => [spec, "", meta, "sha512-x"]

describe("resolveFrom — imita a resolução do Node", () => {
	const packages = {
		"@babel/types": pkg("@babel/types@7.29.8"),
		"@babel/traverse": pkg("@babel/traverse@8.0.6"),
		"@babel/traverse/@babel/types": pkg("@babel/types@8.0.6"),
		"a/b": pkg("b@1.0.0"),
	}

	test("prefere a cópia aninhada no próprio caminho", () => {
		expect(resolveFrom(packages, "@babel/traverse", "@babel/types")).toBe("@babel/traverse/@babel/types")
	})

	test("sem cópia aninhada, sobe até a içada", () => {
		expect(resolveFrom(packages, "@babel/template", "@babel/types")).toBe("@babel/types")
	})

	// `@x/p` é UM pacote. Tratado como dois segmentos, a subida passaria por `@x` como se fosse
	// diretório e, procurando `q`, montaria a chave `@x/q` — casando com o pacote `@x/q` da raiz,
	// que é outro pacote. A resolução certa vai de `@x/p/q` direto para `q`.
	test("nome com escopo conta como UM segmento do caminho", () => {
		const scoped = {
			"@x/p": pkg("@x/p@1.0.0"),
			"@x/q": pkg("@x/q@9.0.0"),
			q: pkg("q@1.0.0"),
		}
		expect(resolveFrom(scoped, "@x/p", "q")).toBe("q")
	})

	test("nada no caminho nem na raiz", () => {
		expect(resolveFrom(packages, "a", "inexistente")).toBeUndefined()
	})
})

describe("findViolations", () => {
	// O caso do #415 que passou por install, typecheck, testes e build.
	test("pega peer PRESENTE fora da faixa", () => {
		const v = findViolations({
			packages: {
				"@tanstack/ai": pkg("@tanstack/ai@0.54.0"),
				"@tanstack/openai-base": pkg("@tanstack/openai-base@0.10.15", { peerDependencies: { "@tanstack/ai": "^0.58.0" } }),
			},
		})
		expect(v).toEqual([
			{
				from: "@tanstack/openai-base",
				dep: "@tanstack/ai",
				range: "^0.58.0",
				kind: "peer",
				resolved: "0.54.0",
				at: "@tanstack/ai",
			},
		])
	})

	// Remover do lock a entrada aninhada deixa o dependente resolver a içada, de outro major —
	// e o `bun install` não repõe a aresta.
	test("pega dependência que caiu na cópia içada de outro major", () => {
		const v = findViolations({
			packages: {
				"@babel/types": pkg("@babel/types@7.29.8"),
				"@babel/template": pkg("@babel/template@8.0.0", { dependencies: { "@babel/types": "^8.0.0" } }),
			},
		})
		expect(v).toHaveLength(1)
		expect(v[0]).toMatchObject({ from: "@babel/template", dep: "@babel/types", resolved: "7.29.8" })
	})

	test("a mesma árvore com a aresta aninhada é limpa", () => {
		const v = findViolations({
			packages: {
				"@babel/types": pkg("@babel/types@7.29.8"),
				"@babel/template": pkg("@babel/template@8.0.0", { dependencies: { "@babel/types": "^8.0.0" } }),
				"@babel/template/@babel/types": pkg("@babel/types@8.0.6"),
			},
		})
		expect(v).toEqual([])
	})

	test("dependência que não resolve é violação", () => {
		const v = findViolations({ packages: { a: pkg("a@1.0.0", { dependencies: { sumiu: "^1.0.0" } }) } })
		expect(v).toEqual([{ from: "a", dep: "sumiu", range: "^1.0.0", kind: "dependência" }])
	})

	test("peer ausente não é violação — é escolha de quem instala", () => {
		const v = findViolations({ packages: { a: pkg("a@1.0.0", { peerDependencies: { next: "^15.0.0" } }) } })
		expect(v).toEqual([])
	})

	test("peer opcional fora da faixa não é violação", () => {
		const v = findViolations({
			packages: {
				react: pkg("react@19.3.0"),
				a: pkg("a@1.0.0", { peerDependencies: { react: "^18.0.0" }, optionalPeers: ["react"] }),
			},
		})
		expect(v).toEqual([])
	})

	test("faixa que não é semver fica de fora", () => {
		const v = findViolations({ packages: { a: pkg("a@1.0.0", { dependencies: { b: "workspace:*", c: "npm:d@^1" } }) } })
		expect(v).toEqual([])
	})
})

describe("isForced — o registro FORCED é a única exceção", () => {
	const violation = { from: "drizzle-kit", dep: "esbuild", range: "^0.25.4", kind: "dependência" as const, resolved: "0.28.2" }

	test("pacote em FORCED é intencional", () => {
		expect(isForced(violation, { esbuild: "motivo e saída" })).toBe(true)
	})

	test("pacote fora de FORCED falha", () => {
		expect(isForced(violation, { undici: "outro" })).toBe(false)
	})
})
