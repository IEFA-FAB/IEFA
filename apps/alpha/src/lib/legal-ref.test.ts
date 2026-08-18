import { describe, expect, test } from "bun:test"
import { extractLegalRefs } from "./legal-ref.ts"

describe("extractLegalRefs", () => {
	test("extrai artigo, parágrafo e inciso de nota real da AGU", () => {
		const refs = extractLegalRefs(
			"A justificativa para o parcelamento ou não do objeto deve constar do Estudo Técnico Preliminar (art. 18, §1º, inciso VIII, da Lei nº 14.133, de 2021, e art. 9º, inciso I, do Decreto nº 11.246, de 2022)."
		)

		expect(refs).toEqual([
			{ norma: "Lei nº 14.133/2021", dispositivo: "art. 18, § 1º, VIII" },
			{ norma: "Decreto nº 11.246/2022", dispositivo: "art. 9º, I" },
		])
	})

	test("aceita a forma abreviada com barra", () => {
		expect(extractLegalRefs("conforme art. 6º da Lei 14.133/2021")).toEqual([{ norma: "Lei nº 14.133/2021", dispositivo: "art. 6º" }])
	})

	test("extrai alínea", () => {
		expect(extractLegalRefs("art. 6º, inciso XXIII, alínea 'a', da Lei nº 14.133, de 2021")).toEqual([
			{ norma: "Lei nº 14.133/2021", dispositivo: 'art. 6º, XXIII, "a"' },
		])
	})

	test("distingue lei complementar de lei ordinária", () => {
		expect(extractLegalRefs("art. 48, inciso I, da Lei Complementar nº 123, de 2006")).toEqual([
			{ norma: "Lei Complementar nº 123/2006", dispositivo: "art. 48, I" },
		])
	})

	test("reconhece Instrução Normativa SEGES", () => {
		expect(extractLegalRefs("art. 5º da Instrução Normativa SEGES nº 65, de 2021")).toEqual([{ norma: "IN SEGES nº 65/2021", dispositivo: "art. 5º" }])
	})

	test("descarta artigo sem norma associada", () => {
		expect(extractLegalRefs("o art. 42 desta portaria interna")).toEqual([])
	})

	test("descarta texto sem citação", () => {
		expect(extractLegalRefs("Adequar a redação do item conforme a natureza do objeto.")).toEqual([])
	})

	test("não duplica a mesma referência repetida no texto", () => {
		const refs = extractLegalRefs("art. 6º da Lei nº 14.133, de 2021, e novamente art. 6º da Lei nº 14.133, de 2021")
		expect(refs).toHaveLength(1)
	})

	test("não associa artigo a norma distante demais", () => {
		const filler = "texto ".repeat(60)
		expect(extractLegalRefs(`art. 10 ${filler} da Lei nº 14.133, de 2021`)).toEqual([])
	})
})
