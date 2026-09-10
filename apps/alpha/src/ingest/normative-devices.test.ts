import { describe, expect, it } from "bun:test"
import { markNormativeDevices } from "./normative-devices.ts"

const lines = (text: string) => markNormativeDevices(text).split("\n")

describe("markNormativeDevices", () => {
	it("marca artigo, capítulo e seção", () => {
		expect(lines(["CAPÍTULO IV", "Seção III", "Art. 7º Fica instituído o programa."].join("\n"))).toEqual([
			"## CAPÍTULO IV",
			"### Seção III",
			"#### Art. 7º Fica instituído o programa.",
		])
	})

	it("marca a numeração decimal do manual, com a profundidade certa", () => {
		// `14` é o módulo, `14.1` a seção, `14.1.1` o dispositivo. É a profundidade que
		// `chunkByArticle` lê de volta para decidir o que é o quê.
		expect(lines(["14.1 GENERALIDADES", "14.1.1 O Comando da Aeronáutica participa."].join("\n"))).toEqual([
			"### 14.1 GENERALIDADES",
			"#### 14.1.1 O Comando da Aeronáutica participa.",
		])
	})

	it("mantém numeração e caput na mesma linha", () => {
		// Separá-los faria o caput perder o número que o identifica na norma — e é assim
		// que o manual escreve: `10.2.10.1.3 Os militares, no gozo do primeiro período…`.
		expect(lines("10.2.10.1.3 Os militares, no gozo do primeiro período de férias")[0]).toBe(
			"#### 10.2.10.1.3 Os militares, no gozo do primeiro período de férias"
		)
	})

	it("não confunde separador de milhar com dispositivo", () => {
		// `1.234 unidades` tem a forma de um item `1.234`. Manual nenhum tem item 234
		// dentro do item 1.
		expect(lines("1.234 unidades foram distribuídas")[0]).toBe("1.234 unidades foram distribuídas")
	})

	it("não confunde valor monetário no início da linha", () => {
		expect(lines("1.234,56 referente ao exercício anterior")[0]).toBe("1.234,56 referente ao exercício anterior")
	})

	it("não marca enumeração dentro do dispositivo", () => {
		// `1) Sim, quando…` é item de lista, não título de módulo. Marcá-lo zeraria seção e
		// artigo, e os chunks seguintes sairiam rotulados com norma que não é a deles.
		expect(lines("1) Sim, quando houver disponibilidade orçamentária")[0]).toBe("1) Sim, quando houver disponibilidade orçamentária")
	})

	it("marca título de primeiro nível em caixa alta", () => {
		expect(lines("1. CONSIDERAÇÕES INICIAIS")[0]).toBe("## 1. CONSIDERAÇÕES INICIAIS")
	})

	it("deixa texto corrido intocado", () => {
		const texto = "As Especificações Técnicas a seguir detalhadas destinam-se ao estabelecimento dos padrões."
		expect(lines(texto)[0]).toBe(texto)
	})

	it("não marca linha que já é heading", () => {
		expect(lines("# RADA-e Módulo G — Módulo 14")[0]).toBe("# RADA-e Módulo G — Módulo 14")
	})
})

describe("markNormativeDevices — o que tem forma de dispositivo e não é", () => {
	it("não marca conta contábil do SIAFI", () => {
		// `4.5.1.1.2.02.00 - REPASSE RECEBIDO` aparece no corpo dos módulos de execução
		// orçamentária. Profundidade acima de cinco e segmento com zero à esquerda: norma
		// não escreve o item `02` dentro do `2`.
		const conta = "4.5.1.1.2.02.00 - REPASSE RECEBIDO - devolução à DIREF"

		expect(markNormativeDevices(conta)).toBe(conta)
	})

	it("continua marcando dispositivo profundo de verdade", () => {
		expect(markNormativeDevices("10.2.10.1.3 Os militares")).toBe("#### 10.2.10.1.3 Os militares")
	})
})

describe("markNormativeDevices — o que a revisão do #302 apontou", () => {
	it("não abre dispositivo em remissão que dobrou de linha", () => {
		// A extração preserva uma linha por linha VISUAL: uma remissão longa começa a
		// linha seguinte por `art. 15 da Portaria…`. Marcar isso rotularia os chunks
		// seguintes com norma alheia.
		const remissao = "art. 15 da Portaria nº 1.234/GC3, de 4 de dezembro de 2023"

		expect(markNormativeDevices(remissao)).toBe(remissao)
	})

	it("continua abrindo dispositivo em artigo de verdade", () => {
		expect(markNormativeDevices("Art. 15 Fica instituído")).toBe("#### Art. 15 Fica instituído")
		expect(markNormativeDevices("ART. 15 FICA INSTITUÍDO")).toBe("#### ART. 15 FICA INSTITUÍDO")
	})

	it("não confunde quantidade no início da linha com título de módulo", () => {
		// `12 UNIDADES ADMINISTRATIVAS` e `5 DIAS ÚTEIS` são comuns nas tabelas do SIAFI.
		// Título de primeiro nível ZERA seção e artigo: um falso positivo desses deixa
		// todos os chunks seguintes rotulados com norma que não é a deles.
		expect(markNormativeDevices("12 UNIDADES ADMINISTRATIVAS")).toBe("12 UNIDADES ADMINISTRATIVAS")
		expect(markNormativeDevices("5 DIAS ÚTEIS")).toBe("5 DIAS ÚTEIS")
	})

	it("não confunde enumeração em caixa alta com título de módulo", () => {
		expect(markNormativeDevices("2) SIM, QUANDO HOUVER DISPONIBILIDADE")).toBe("2) SIM, QUANDO HOUVER DISPONIBILIDADE")
	})
})
