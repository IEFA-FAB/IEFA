import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FLOORS, overrideRegistryProblems } from "./lock-registry"

const entry = { reason: "x" }

describe("overrideRegistryProblems", () => {
	test("todo override do package.json tem motivo em um registro só", () => {
		const { overrides } = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"))
		expect(overrideRegistryProblems(overrides)).toEqual([])
	})

	test("override sem registro falha", () => {
		const problems = overrideRegistryProblems({ "left-pad": "^1.3.0" }, { FORCED: {}, MIRRORS: {}, FLOORS: {} })
		expect(problems).toHaveLength(1)
		expect(problems[0]).toContain("left-pad: override sem motivo")
	})

	test("override em dois registros falha", () => {
		const problems = overrideRegistryProblems({ esbuild: "^0.28.2" }, { FORCED: { esbuild: entry }, MIRRORS: {}, FLOORS: { esbuild: entry } })
		expect(problems).toEqual(["  esbuild: está em FORCED e FLOORS → um override é uma coisa só; deixe em um."])
	})

	test("entrada de FLOORS sem override é morta", () => {
		const problems = overrideRegistryProblems({}, { FORCED: {}, MIRRORS: {}, FLOORS: { react: entry } })
		expect(problems).toHaveLength(1)
		expect(problems[0]).toContain("react: entrada morta em FLOORS")
	})

	test("toda entrada de FLOORS diz de onde veio o motivo", () => {
		for (const [name, floor] of Object.entries(FLOORS)) {
			expect(floor.source, name).not.toBe("")
			expect(floor.reason, name).not.toBe("")
		}
	})
})
