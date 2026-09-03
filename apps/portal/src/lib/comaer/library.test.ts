import { describe, expect, it } from "bun:test"
import { filterDocuments, kindsPresent } from "./library"

const items = [
	{ id: "1", title: "Prorrogação de prazo do levantamento", kind: "oficio-comaer", updated_at: "2026-09-01T10:00:00Z" },
	{ id: "2", title: "Concessão de licença especial", kind: "requerimento", updated_at: "2026-09-02T10:00:00Z" },
	{ id: "3", title: null, kind: "parecer", updated_at: "2026-09-03T10:00:00Z" },
	{ id: "4", title: "Prestação de informações ao Juízo", kind: "oficio-externo", updated_at: "2026-09-04T10:00:00Z" },
]

describe("busca na biblioteca", () => {
	it("ignora acento e caixa — quem digita “oficio” procura “Ofício”", () => {
		expect(filterDocuments(items, { search: "oficio", kind: null }).map((i) => i.id)).toEqual(["1", "4"])
		expect(filterDocuments(items, { search: "PRORROGAÇÃO", kind: null }).map((i) => i.id)).toEqual(["1"])
	})

	it("casa também no rótulo da espécie", () => {
		// Quem procura "requerimento" espera achar os requerimentos, ainda que a palavra não
		// esteja no assunto de nenhum deles.
		expect(filterDocuments(items, { search: "requerimento", kind: null }).map((i) => i.id)).toEqual(["2"])
	})

	it("exige todos os termos — é filtro, não frase", () => {
		expect(filterDocuments(items, { search: "prazo levantamento", kind: null }).map((i) => i.id)).toEqual(["1"])
		expect(filterDocuments(items, { search: "prazo inexistente", kind: null })).toEqual([])
	})

	it("documento sem assunto continua encontrável pela espécie", () => {
		expect(filterDocuments(items, { search: "parecer", kind: null }).map((i) => i.id)).toEqual(["3"])
	})

	it("filtra por espécie, com e sem busca", () => {
		expect(filterDocuments(items, { search: "", kind: "oficio-externo" }).map((i) => i.id)).toEqual(["4"])
		expect(filterDocuments(items, { search: "juízo", kind: "oficio-comaer" })).toEqual([])
	})

	it("busca vazia devolve tudo", () => {
		expect(filterDocuments(items, { search: "   ", kind: null })).toHaveLength(4)
	})
})

describe("espécies presentes", () => {
	it("oferece só o que existe na lista, ordenado e contado", () => {
		// Um filtro que oferece 14 espécies para uma lista de 3 documentos faz o usuário
		// procurar em gaveta vazia.
		expect(kindsPresent(items)).toEqual([
			{ id: "oficio-comaer", label: "Ofício — entre OM do COMAER", count: 1 },
			{ id: "oficio-externo", label: "Ofício — órgão externo ao COMAER", count: 1 },
			{ id: "parecer", label: "Parecer", count: 1 },
			{ id: "requerimento", label: "Requerimento", count: 1 },
		])
	})
})
