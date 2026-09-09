import { describe, expect, it } from "bun:test"
import { Glob } from "bun"
import { AERONAUTICAL_DOCUMENT_TYPES, FEDERAL_LEGISLATION_TYPES, TEMPLATE_DOCUMENT_TYPES, toDocumentType } from "./corpora.ts"

/**
 * `alpha.document` guarda o corpus aeronáutico e o federal na mesma tabela, e
 * as RPCs de busca não filtram por conta própria. Quem recupera sem dizer o
 * corpus atravessa os dois: o ChatRADA responde sobre o RADA com trecho da Lei
 * 14.133, e o verificador de conformidade julga uma regra da 14.133 contra
 * norma aeronáutica. A interface cita a fonte pelo id do chunk, então nada na
 * tela denuncia a troca — daí este contrato ser estático.
 */
const SRC_ROOT = new URL("../", import.meta.url).pathname

/** Recorta o primeiro argumento da chamada, contando chaves para não parar num objeto aninhado. */
function firstArgument(source: string, callIndex: number): string {
	const open = source.indexOf("(", callIndex)
	let depth = 0
	for (let i = open; i < source.length; i++) {
		const char = source[i]
		if (char === "(" || char === "{" || char === "[") depth++
		if (char === ")" || char === "}" || char === "]") {
			depth--
			if (depth === 0) return source.slice(open, i + 1)
		}
	}
	return source.slice(open)
}

/**
 * O corpus pode vir inline ou por constante nomeada (`filters: RADA_CORPUS_FILTER`).
 * No segundo caso a declaração é resolvida no mesmo arquivo — sem isso o
 * contrato reprovaria justamente o call site que faz a coisa certa.
 */
function declaresCorpus(call: string, source: string): boolean {
	if (!call.includes("filters")) return false
	if (call.includes("document_type")) return true

	const named = call.match(/filters:\s*([A-Za-z_$][\w$]*)/)
	if (!named) return false

	const declaration = source.match(new RegExp(`(?:const|let|var)\\s+${named[1]}\\b[^\n]*(?:\n(?!\\s*(?:const|let|var|export|function)).*)*`))
	return declaration ? declaration[0].includes("document_type") : false
}

async function retrieverCallSites(): Promise<Array<{ file: string; call: string; declaresCorpus: boolean }>> {
	const glob = new Glob("**/*.ts")
	const sites: Array<{ file: string; call: string; declaresCorpus: boolean }> = []

	for await (const relative of glob.scan({ cwd: SRC_ROOT })) {
		if (relative.endsWith(".test.ts") || relative.endsWith("tools/rada-retriever.ts")) continue
		const source = await Bun.file(`${SRC_ROOT}${relative}`).text()

		let cursor = source.indexOf("radaRetriever(")
		while (cursor !== -1) {
			const call = firstArgument(source, cursor)
			sites.push({ file: relative, call, declaresCorpus: declaresCorpus(call, source) })
			cursor = source.indexOf("radaRetriever(", cursor + 1)
		}
	}

	return sites
}

describe("corpora de alpha.document", () => {
	it("mantém os três conjuntos disjuntos", () => {
		const all = [...AERONAUTICAL_DOCUMENT_TYPES, ...FEDERAL_LEGISLATION_TYPES, ...TEMPLATE_DOCUMENT_TYPES]
		expect(new Set(all).size).toBe(all.length)
	})

	it("não assume corpus para tipo desconhecido", () => {
		// Regressão: o default era `"RADA"`, que rotulava norma federal como
		// aeronáutica em vez de admitir que o tipo não foi reconhecido.
		expect(toDocumentType(null)).toBeNull()
		expect(toDocumentType(undefined)).toBeNull()
		expect(toDocumentType("")).toBeNull()
		expect(toDocumentType("rada")).toBeNull()
		expect(toDocumentType("PORTARIA")).toBeNull()
	})

	it("preserva o tipo de cada corpus", () => {
		for (const type of [...AERONAUTICAL_DOCUMENT_TYPES, ...FEDERAL_LEGISLATION_TYPES, ...TEMPLATE_DOCUMENT_TYPES]) {
			expect(toDocumentType(type)).toBe(type)
		}
	})
})

describe("chamadas de radaRetriever", () => {
	it("encontra os pontos de recuperação esperados", async () => {
		const sites = await retrieverCallSites()
		expect(sites.length).toBeGreaterThanOrEqual(2)
		expect(sites.map((site) => site.file).sort()).toContain("graph/nodes/rada-agent.ts")
	})

	it("nenhuma recupera sem declarar o corpus", async () => {
		const unfiltered = (await retrieverCallSites()).filter((site) => !site.declaresCorpus).map((site) => `${site.file}: ${site.call}`)

		expect(unfiltered).toEqual([])
	})
})
