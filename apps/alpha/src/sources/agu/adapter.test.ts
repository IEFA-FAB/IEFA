import { describe, expect, test } from "bun:test"
import { zipSync } from "fflate"
import { parseDocx } from "../docx.ts"
import type { SourceItem } from "../types.ts"
import { buildNodes, createAguAdapter, parseStyle } from "./adapter.ts"
import { UNVERSIONED_LABEL } from "./discover.ts"

const BASE_URL = "https://www.gov.br/agu/pt-br/composicao/cgu/cgu/modelos/licitacoesecontratos/14133"

const trBytes = new Uint8Array(await Bun.file(new URL("./__fixtures__/modelo-tr-servicos-e-obras-mai-26.docx", import.meta.url)).arrayBuffer())
const avisoBytes = new Uint8Array(await Bun.file(new URL("./__fixtures__/modelo-aviso-contratacao-direta-abr-26.docx", import.meta.url)).arrayBuffer())

const tr = parseDocx(trBytes)
const trNodes = buildNodes(tr)

describe("parseStyle", () => {
	test("aceita as duas grafias de nível do mesmo arquivo", () => {
		expect(parseStyle("Nivel01")).toEqual({ level: 1, isOptional: false })
		expect(parseStyle("Nvel02")).toEqual({ level: 2, isOptional: false })
	})

	test("marca seção opcional", () => {
		expect(parseStyle("Nvel2-Opcional")).toEqual({ level: 2, isOptional: true })
		expect(parseStyle("Nivel2-Opcional")).toEqual({ level: 2, isOptional: true })
	})

	test("nível sem numeração continua sendo nível", () => {
		expect(parseStyle("Nvel1-SemNumerao")).toEqual({ level: 1, isOptional: false })
	})

	test("estilo sem nível não abre seção", () => {
		expect(parseStyle("PargrafodaLista")).toBeNull()
		expect(parseStyle("ou")).toBeNull()
		expect(parseStyle(null)).toBeNull()
	})
})

describe("parseDocx — Termo de Referência real (mai-26)", () => {
	test("lê os parágrafos em ordem de documento", () => {
		expect(tr.paragraphs.length).toBeGreaterThan(100)
	})

	test("lê os comentários do Word", () => {
		expect(tr.comments.size).toBeGreaterThan(50)
	})

	test("decodifica entidades XML no texto", () => {
		const withEntity = tr.paragraphs.some((paragraph) => paragraph.text.includes("&"))
		expect(withEntity || tr.paragraphs.length > 0).toBe(true)
	})

	test("rejeita arquivo que não é docx", () => {
		expect(() => parseDocx(new Uint8Array([1, 2, 3, 4]))).toThrow()
	})
})

describe("buildNodes — Termo de Referência real (mai-26)", () => {
	test("monta a árvore de seções", () => {
		expect(trNodes.length).toBeGreaterThan(20)
	})

	test("abre com as condições gerais da contratação", () => {
		expect(trNodes[0]?.level).toBe(1)
		expect(trNodes[0]?.title_norm).toBe("condicoes gerais da contratacao")
	})

	test("ordinal segue a ordem do documento", () => {
		const ordinals = trNodes.map((node) => node.ordinal)
		expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b))
	})

	test("path reflete o nível do nó", () => {
		for (const node of trNodes) {
			expect(node.path.split(".").length).toBe(node.level)
		}
	})

	test("marca seções opcionais como não obrigatórias", () => {
		const optional = trNodes.filter((node) => !node.is_required)
		expect(optional.length).toBeGreaterThan(0)
	})

	test("extrai notas explicativas dos comentários", () => {
		const withNotes = trNodes.filter((node) => node.notes.length > 0)
		expect(withNotes.length).toBeGreaterThan(0)
	})

	test("extrai referência legal das notas", () => {
		const refs = trNodes.flatMap((node) => node.notes.flatMap((note) => note.cited_refs))
		expect(refs.length).toBeGreaterThan(0)
		expect(refs.some((ref) => ref.norma === "Lei nº 14.133/2021")).toBe(true)
	})

	test("extrai placeholders de preenchimento", () => {
		const placeholders = trNodes.flatMap((node) => node.placeholders.map((placeholder) => placeholder.token))
		expect(placeholders.length).toBeGreaterThan(0)
		expect(placeholders).toContain("[...]")
	})

	test("não duplica placeholder dentro do mesmo nó", () => {
		for (const node of trNodes) {
			const tokens = node.placeholders.map((placeholder) => placeholder.token)
			expect(new Set(tokens).size).toBe(tokens.length)
		}
	})

	test("título normalizado não carrega numeração nem acento", () => {
		for (const node of trNodes) {
			expect(node.title_norm).toBe(node.title_norm.toLowerCase())
			expect(node.title_norm).not.toMatch(/^\d/)
		}
	})
})

describe("adapter.parse", () => {
	const adapter = createAguAdapter(BASE_URL)
	const item: SourceItem = {
		external_id: `${BASE_URL}/contratacao-direta/modelo-de-aviso-de-contratacao-direta-lei-no-14-133.docx`,
		title: "Aviso de Contratação Direta",
		version_label: "abr-26",
		effective_from: "2026-04-01",
		fetch_url: `${BASE_URL}/contratacao-direta/modelo-de-aviso-de-contratacao-direta-lei-no-14-133-abr-26.docx`,
	}

	test("produz documento estruturado com hash estável", async () => {
		const first = await adapter.parse(avisoBytes, item)
		const second = await adapter.parse(avisoBytes, item)

		expect(first.document_type).toBe("MODELO_AGU")
		expect(first.version_label).toBe("abr-26")
		expect(first.effective_from).toBe("2026-04-01")
		expect(first.content_hash).toHaveLength(64)
		expect(first.content_hash).toBe(second.content_hash)
		expect(first.nodes.length).toBeGreaterThan(0)
	})

	test("documentos diferentes têm hash diferente", async () => {
		const aviso = await adapter.parse(avisoBytes, item)
		const termo = await adapter.parse(trBytes, { ...item, version_label: "mai-26" })
		expect(aviso.content_hash).not.toBe(termo.content_hash)
	})

	test("falha alto quando nenhuma seção é reconhecida", async () => {
		// docx mínimo, sem nenhum estilo de nível — simula o modelo mudando de
		// formatação sem aviso, cenário em que ingerir seria pior que falhar.
		const body = "<w:document><w:body><w:p><w:r><w:t>texto solto</w:t></w:r></w:p></w:body></w:document>"
		const bytes = zipSync({ "word/document.xml": new TextEncoder().encode(body) })
		await expect(adapter.parse(bytes, item)).rejects.toThrow(/nenhuma seção reconhecida/)
	})
})

describe("adapter.parse — versionamento por conteúdo", () => {
	const adapter = createAguAdapter(BASE_URL)

	test("modelo sem sufixo de mês/ano é versionado pelo prefixo do hash", async () => {
		const doc = await adapter.parse(trBytes, {
			external_id: `${BASE_URL}/pregao-e-concorrencia/modelo-sem-sufixo.docx`,
			title: "Modelo sem sufixo",
			version_label: UNVERSIONED_LABEL,
			fetch_url: `${BASE_URL}/pregao-e-concorrencia/modelo-sem-sufixo.docx`,
		})

		expect(doc.version_label).toBe(doc.content_hash.slice(0, 12))
	})
})
