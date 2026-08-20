/**
 * Contrato dos search params — o que um link compartilhado precisa aguentar.
 *
 * Rode com: `bun test src/lib/uniforms/search.test.ts` (dentro de apps/rumaer).
 */

import { describe, expect, test } from "bun:test"
import { uniformSearchSchema, uniformViewSchema } from "./search"

describe("uniformSearchSchema — busca da home", () => {
	test("aceita `q` numérico, que é como o TanStack entrega `?q=5`", () => {
		// Sem isto, abrir/recarregar `/?q=5` derruba a home inteira no erro de rota —
		// e número é a busca mais comum do catálogo.
		expect(uniformSearchSchema.parse({ q: 5 })).toEqual({ q: "5" })
	})

	test("`q` string continua string", () => {
		expect(uniformSearchSchema.parse({ q: "gala" })).toEqual({ q: "gala" })
	})

	test("`q` vazio some, em vez de virar busca por string vazia", () => {
		expect(uniformSearchSchema.parse({ q: "" }).q).toBeUndefined()
	})

	test("URL sem nada resolve para objeto vazio", () => {
		expect(uniformSearchSchema.parse({})).toEqual({})
	})

	test("grupo e categoria fora do enum são rejeitados", () => {
		expect(uniformSearchSchema.safeParse({ grupo: "inventado" }).success).toBe(false)
		expect(uniformSearchSchema.safeParse({ categoria: "inventado" }).success).toBe(false)
	})

	test("grupo válido passa", () => {
		expect(uniformSearchSchema.parse({ grupo: "representacao" })).toEqual({ grupo: "representacao" })
	})
})

describe("uniformViewSchema — tela de detalhe", () => {
	test("círculo e gênero válidos passam", () => {
		expect(uniformViewSchema.parse({ circulo: "sargentos", genero: "feminino" })).toEqual({ circulo: "sargentos", genero: "feminino" })
	})

	test("valor fora do enum é rejeitado — o fallback é do resolvedor, não do schema", () => {
		expect(uniformViewSchema.safeParse({ genero: "outro" }).success).toBe(false)
	})

	test("`sub` e `look` numéricos viram string em vez de derrubar a tela", () => {
		expect(uniformViewSchema.parse({ sub: 2, look: 7 })).toEqual({ sub: "2", look: "7" })
	})

	test("URL limpa é objeto vazio — o padrão oficiais/masculino vem do resolvedor", () => {
		expect(uniformViewSchema.parse({})).toEqual({})
	})
})
