import { describe, expect, test } from "bun:test"
import { buildNodes } from "./agu/adapter.ts"
import { buildChunks } from "./chunking.ts"
import { parseDocx } from "./docx.ts"
import type { StructureNodeDraft } from "./types.ts"

function node(path: string, level: number, title: string, body = ""): StructureNodeDraft {
	return { path, ordinal: 0, level, title, title_norm: title.toLowerCase(), is_required: true, body, notes: [], placeholders: [] }
}

describe("buildChunks", () => {
	test("agrega as subseções dentro do chunk da seção de nível 1", () => {
		const chunks = buildChunks([node("1", 1, "Objeto"), node("1.1", 2, "Detalhamento", "texto do detalhamento"), node("2", 1, "Vigência", "doze meses")])

		expect(chunks).toHaveLength(2)
		expect(chunks[0].content).toContain("Detalhamento")
		expect(chunks[0].chapter).toBe("Objeto")
		expect(chunks[1].content).toContain("doze meses")
	})

	test("não gera chunk para seção sem conteúdo textual", () => {
		expect(buildChunks([node("1", 1, "")])).toHaveLength(0)
	})

	test("ignora seções de nível 2 sem pai de nível 1", () => {
		expect(buildChunks([node("1.1", 2, "Órfã", "conteúdo")])).toHaveLength(0)
	})

	test("parte seção longa repetindo o título nos pedaços seguintes", () => {
		const chunks = buildChunks([node("1", 1, "Seção longa", "palavra ".repeat(2000))])

		expect(chunks.length).toBeGreaterThan(1)
		expect(chunks[1].content.startsWith("Seção longa")).toBe(true)
		for (const chunk of chunks) expect(chunk.chapter).toBe("Seção longa")
	})

	test("chunk_index é sequencial e único", () => {
		const chunks = buildChunks([node("1", 1, "A", "a".repeat(6000)), node("2", 1, "B", "b")])
		const indexes = chunks.map((chunk) => chunk.chunk_index)

		expect(indexes).toEqual(indexes.map((_, position) => position))
		expect(new Set(indexes).size).toBe(indexes.length)
	})
})

const trBytes = new Uint8Array(await Bun.file(new URL("./agu/__fixtures__/modelo-tr-servicos-e-obras-mai-26.docx", import.meta.url)).arrayBuffer())

describe("buildChunks — modelo real da AGU", () => {
	const chunks = buildChunks(buildNodes(parseDocx(trBytes)))

	test("gera chunks a partir do Termo de Referência", () => {
		expect(chunks.length).toBeGreaterThan(10)
	})

	test("nenhum chunk vazio", () => {
		for (const chunk of chunks) expect(chunk.content.trim().length).toBeGreaterThan(0)
	})
})
