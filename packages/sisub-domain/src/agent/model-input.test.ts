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
})
