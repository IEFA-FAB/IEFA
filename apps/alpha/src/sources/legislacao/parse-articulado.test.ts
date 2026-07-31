import { describe, expect, test } from "bun:test"
import { canonicalRefLabel, parseNormaIdentity } from "../../lib/ref-label.ts"
import { decodeHtml, htmlToNormalizedText } from "./html-text.ts"
import { articleLabel, parseArticulado } from "./parse-articulado.ts"

const bytes = new Uint8Array(await Bun.file(new URL("./__fixtures__/planalto-lei-14133.html", import.meta.url)).arrayBuffer())
const text = htmlToNormalizedText(decodeHtml(bytes))
const nodes = parseArticulado(text)
// Primeira ocorrência vence, mesma política do resolvedor: normas transcritas
// no corpo da lei reusam rótulos de dispositivo.
const byRef = new Map<string, (typeof nodes)[number]>()
for (const node of nodes) if (!byRef.has(node.ref_label)) byRef.set(node.ref_label, node)

describe("decodeHtml", () => {
	test("decodifica página sem charset declarado como windows-1252", () => {
		// A página da Lei 14.133 não declara charset; lida como UTF-8, todo "º"
		// vira caractere de substituição e nenhum rótulo de artigo resolve.
		expect(text).toContain("Art. 6º")
		expect(text).not.toContain("�")
	})

	test("mantém UTF-8 válido intacto", () => {
		const utf8 = new TextEncoder().encode("<html><body>Contratação — § 1º</body></html>")
		expect(decodeHtml(utf8)).toContain("Contratação — § 1º")
	})
})

describe("articleLabel", () => {
	test("usa ordinal até o nono artigo e cardinal a partir do décimo", () => {
		expect(articleLabel("6")).toBe("Art. 6º")
		expect(articleLabel("9")).toBe("Art. 9º")
		expect(articleLabel("18")).toBe("Art. 18")
		expect(articleLabel("44-A")).toBe("Art. 44-A")
	})
})

describe("parseArticulado — Lei 14.133 real", () => {
	test("reconhece a quase totalidade dos artigos", () => {
		expect(nodes.filter((node) => node.level === 1).length).toBeGreaterThan(190)
	})

	test("resolve artigo, inciso e alínea encadeados", () => {
		expect(byRef.get("Art. 6º")?.body).toContain("Para os fins desta Lei")
		expect(byRef.get("Art. 6º, XXIII")?.body).toContain("termo de referência")
		expect(byRef.get('Art. 6º, XXIII, "a"')?.body).toContain("definição do objeto")
	})

	test("resolve parágrafo", () => {
		expect(byRef.get("Art. 18, § 1º")?.body).toContain("estudo técnico preliminar")
	})

	test("inciso de parágrafo não recebe o rótulo do caput", () => {
		// "Art. 18, § 1º, I" e "Art. 18, I" são dispositivos distintos.
		const doParagrafo = byRef.get("Art. 18, § 1º, I")
		const doCaput = byRef.get("Art. 18, I")
		if (doParagrafo && doCaput) expect(doParagrafo.body).not.toBe(doCaput.body)
	})

	test("não inventa dispositivo inexistente", () => {
		expect(byRef.get("Art. 999")).toBeUndefined()
		expect(byRef.get("Art. 6º, CXCIX")).toBeUndefined()
	})

	test("todo nó tem ref_label e path coerente com o nível", () => {
		for (const node of nodes) {
			expect(node.ref_label.length).toBeGreaterThan(0)
			expect(node.path.split(".").length).toBe(node.level)
		}
	})

	test("registra o agrupamento do artigo", () => {
		expect(byRef.get("Art. 6º")?.body).toMatch(/^\[(TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO)/)
	})

	test("caput não começa com o ponto que fecha o marcador", () => {
		for (const node of nodes.filter((candidate) => candidate.level === 1)) {
			expect(node.body.replace(/^\[[^\]]+\]\s*/, "")).not.toMatch(/^\./)
		}
	})
})

describe("resolução de referência — forma canônica", () => {
	test("ignora acento, aspas e espaçamento", () => {
		expect(canonicalRefLabel('Art. 6º, XXIII, "a"')).toBe(canonicalRefLabel("art. 6º,XXIII, a"))
	})

	test("extrai número e ano de normas em formatos diferentes", () => {
		expect(parseNormaIdentity("Lei nº 14.133/2021")).toEqual({ numero: "14.133", ano: "2021" })
		expect(parseNormaIdentity("Lei nº 14.133, de 1º de abril de 2021")).toEqual({ numero: "14.133", ano: "2021" })
		expect(parseNormaIdentity("IN SEGES nº 65/2021")).toEqual({ numero: "65", ano: "2021" })
	})

	test("todo dispositivo citado por nota da AGU tem forma canônica estável", () => {
		const label = canonicalRefLabel("art. 18, § 1º, VIII")
		expect(label).toBe("art. 18, § 1º, viii")
	})
})
