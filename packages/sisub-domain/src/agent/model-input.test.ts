import { describe, expect, test } from "bun:test"
import { dropUnexpectedNulls } from "./model-input.ts"

describe("dropUnexpectedNulls", () => {
	const handWritten = {
		type: "object",
		properties: {
			kitchenId: { type: "number" },
			search: { type: "string" },
			from: { type: "string" },
		},
		required: ["kitchenId"],
	}

	test("apaga o null que o schema não previu — o modelo quis dizer 'não informado'", () => {
		expect(dropUnexpectedNulls({ kitchenId: 2, search: null }, handWritten)).toEqual({ kitchenId: 2 })
	})

	test("preserva o null que o schema declara — lá ele significa alguma coisa", () => {
		const schema = {
			type: "object",
			properties: {
				kitchenId: { anyOf: [{ type: "number" }, { type: "null" }] },
				folderId: { type: ["string", "null"] },
			},
		}
		expect(dropUnexpectedNulls({ kitchenId: null, folderId: null }, schema)).toEqual({ kitchenId: null, folderId: null })
	})

	test("sem schema, todo null vira ausência", () => {
		expect(dropUnexpectedNulls({ a: 1, b: null })).toEqual({ a: 1 })
	})

	test("undefined também sai — o handler checa presença de chave", () => {
		expect(Object.keys(dropUnexpectedNulls({ a: undefined, b: 2 }, handWritten))).toEqual(["b"])
	})

	test("não toca em valores legítimos, inclusive falsy", () => {
		const args = { kitchenId: 0, search: "", ativo: false }
		expect(dropUnexpectedNulls(args, handWritten)).toEqual(args)
	})

	test("desce em objeto aninhado usando o schema aninhado", () => {
		const schema = {
			type: "object",
			properties: {
				filtro: { type: "object", properties: { texto: { type: "string" }, pasta: { anyOf: [{ type: "string" }, { type: "null" }] } } },
			},
		}
		expect(dropUnexpectedNulls({ filtro: { texto: null, pasta: null, ok: 1 } }, schema)).toEqual({ filtro: { pasta: null, ok: 1 } })
	})

	test("array passa intacto — apagar item deslocaria os outros", () => {
		expect(dropUnexpectedNulls({ ids: [1, null, 3] }, { type: "object", properties: { ids: { type: "array" } } })).toEqual({ ids: [1, null, 3] })
	})

	test("enum e const com null contam como anuláveis", () => {
		const schema = { type: "object", properties: { a: { enum: ["x", null] }, b: { const: null } } }
		expect(dropUnexpectedNulls({ a: null, b: null }, schema)).toEqual({ a: null, b: null })
	})

	test("__proto__/constructor/prototype vindos do modelo não viram propriedade nem protótipo", () => {
		// `JSON.parse` entrega `__proto__` como chave PRÓPRIA — é assim que o argumento chega.
		const args = JSON.parse('{"search":"arroz","__proto__":{"isAdmin":true},"constructor":{"x":1},"prototype":2,"filtro":{"__proto__":{"y":1},"ok":1}}')
		const out = dropUnexpectedNulls(args, handWritten) as Record<string, unknown>

		expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
		expect((out as { isAdmin?: unknown }).isAdmin).toBeUndefined()
		expect(Object.keys(out)).toEqual(["search", "filtro"])
		expect(Object.hasOwn(out, "constructor")).toBe(false)
		const filtro = out.filtro as Record<string, unknown>
		expect(Object.getPrototypeOf(filtro)).toBe(Object.prototype)
		expect(filtro).toEqual({ ok: 1 })
		// Nada vazou para o protótipo global.
		expect(({} as { isAdmin?: unknown }).isAdmin).toBeUndefined()
	})

	test("schema com `properties` herdadas não é consultado por herança", () => {
		// `properties.constructor` seria `Object` — um schema que não aceita null nem é schema.
		expect(dropUnexpectedNulls({ toString: null }, { type: "object", properties: {} })).toEqual({})
	})
})
