import { describe, expect, test } from "bun:test"
import { FacilityUpdateSchema } from "./pregoeiro-facility"

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
