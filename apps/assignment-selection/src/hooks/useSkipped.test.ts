import { describe, expect, it } from "vitest"
import { parseSkipped } from "./useSkipped"

describe("parseSkipped", () => {
	it("lê a lista gravada", () => {
		expect(parseSkipped("[3,7]")).toEqual([3, 7])
	})

	it("descarta o que não é id e o que não é lista", () => {
		expect(parseSkipped('[3,"x",1.5,null]')).toEqual([3])
		expect(parseSkipped('{"a":1}')).toEqual([])
		expect(parseSkipped("não é json")).toEqual([])
		expect(parseSkipped(null)).toEqual([])
	})
})
