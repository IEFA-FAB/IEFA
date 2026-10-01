import { describe, expect, test } from "bun:test"
import { FacilityUpdateSchema, toPublicFacility } from "./pregoeiro-facility"

describe("FacilityUpdateSchema", () => {
	test("a edição descarta `owner_id` e `default` — autoria e alcance não mudam por ela", () => {
		const parsed = FacilityUpdateSchema.parse({
			phase: "habilitação",
			title: "t",
			content: "c",
			tags: ["a"],
			owner_id: "outro-usuario",
			default: true,
		})

		expect(parsed).toEqual({ phase: "habilitação", title: "t", content: "c", tags: ["a"] })
		expect(Object.keys(parsed)).not.toContain("default")
		expect(Object.keys(parsed)).not.toContain("owner_id")
	})
})

describe("toPublicFacility", () => {
	const row = { id: "f1", created_at: "x", phase: "p", title: "t", content: "c", tags: null, default: false, owner_id: "u-dono" }

	test("não entrega o dono, só se a frase é de quem pediu", () => {
		expect(toPublicFacility(row, "u-dono")).toEqual({
			id: "f1",
			created_at: "x",
			phase: "p",
			title: "t",
			content: "c",
			tags: null,
			default: false,
			is_mine: true,
		})
		expect(toPublicFacility(row, "u-outro").is_mine).toBe(false)
		expect(JSON.stringify(toPublicFacility(row, "u-outro"))).not.toContain("u-dono")
	})

	test("anônimo e frase sem dono nunca são 'minha'", () => {
		expect(toPublicFacility(row, null).is_mine).toBe(false)
		expect(toPublicFacility({ ...row, owner_id: null }, null).is_mine).toBe(false)
	})
})
