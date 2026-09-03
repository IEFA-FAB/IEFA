import { describe, expect, it } from "bun:test"
import {
	annexLetter,
	courtesyClosing,
	dateInFull,
	formatEnumeration,
	formatNup,
	numberingLine,
	preambuloLines,
	renderDivisions,
	shortDate,
	signerIdentification,
} from "./format"
import { rankInFull } from "./ranks"

/**
 * Os casos abaixo são os EXEMPLOS da NSCA 5-3/2026, Anexo I — não invenções de teste.
 * Cada `expect` cita o artigo de onde a string saiu, para que uma revisão da norma possa
 * ser conferida linha a linha contra o arquivo `apps/portal/public/NSCA 5-3 (GABAER).pdf`.
 */

describe("linha de numeração (art. 31 e art. 51)", () => {
	const num = { sequence: 34, sector: "GAB", organizationNumber: "255" }

	it("numera o ofício ostensivo com espécie, sequencial, setor e ordem geral", () => {
		expect(numberingLine("Ofício", num)).toBe("Ofício nº 34/GAB/255")
	})

	it("troca o “nº” pelo prefixo do grau de sigilo, sem acumular os dois", () => {
		expect(numberingLine("Ofício", num, "reservado")).toBe("Ofício R-34/GAB/255")
		expect(numberingLine("Ofício", num, "secreto")).toBe("Ofício S-34/GAB/255")
		expect(numberingLine("Ofício", num, "ultrassecreto")).toBe("Ofício US-34/GAB/255")
	})

	it("no trâmite interno à OM usa apenas sequencial e setor (art. 51 § 5º, I, d)", () => {
		expect(numberingLine("Ofício", { sequence: 7, sector: "GAB", organizationNumber: "255" }, "ostensivo", "interna")).toBe("Ofício nº 7/GAB")
	})

	it("assunto de interesse particular sai s/nº (art. 51 § 6º)", () => {
		expect(numberingLine("Ofício", { sequence: null })).toBe("Ofício s/nº")
	})

	it("o parecer numera por ordem geral e ano (art. 53 § 2º, III)", () => {
		expect(numberingLine("Parecer", { sequence: 237, organizationNumber: "2098", year: 2026 }, "ostensivo", "parecer")).toBe("Parecer nº 237/2098/2026")
	})

	it("o despacho já se numera por “Nº” e não repete o “nº” (art. 48 § 3º, II, d)", () => {
		expect(numberingLine("Nº", { sequence: 183, sector: "GABGEP", organizationNumber: "2377" })).toBe("Nº 183/GABGEP/2377")
	})
})

describe("datas (art. 12)", () => {
	it("escreve por extenso sem zero à esquerda e com ordinal no dia 1º (§ 4º)", () => {
		expect(dateInFull(new Date(2016, 6, 1))).toBe("1º de julho de 2016")
		expect(dateInFull(new Date(2024, 8, 3))).toBe("3 de setembro de 2024")
		expect(dateInFull(new Date(1982, 11, 16))).toBe("16 de dezembro de 1982")
	})

	it("aceita as formas abreviadas admitidas em texto interno (§ 5º)", () => {
		expect(shortDate(new Date(1980, 7, 4), "ponto")).toBe("04.08.1980")
		expect(shortDate(new Date(1932, 3, 25), "barra")).toBe("25/04/1932")
		expect(shortDate(new Date(1972, 3, 1), "mes")).toBe("01 abr. 1972")
		expect(shortDate(new Date(1972, 3, 12), "mes-maiusculo")).toBe("12 ABR 1972")
	})

	it("nunca abrevia maio (§ 5º, II)", () => {
		expect(shortDate(new Date(1972, 4, 12), "mes")).toBe("12 maio 1972")
		expect(shortDate(new Date(1972, 4, 12), "mes-maiusculo")).toBe("12 MAIO 1972")
	})
})

describe("protocolo COMAER", () => {
	it("mascara os 17 dígitos do NUP", () => {
		expect(formatNup("68000000000202600")).toBe("68000.000000/2026-00")
		expect(formatNup("68000.000000/2026-00")).toBe("68000.000000/2026-00")
	})

	it("devolve a entrada intacta quando não são 17 dígitos — mascarar um NUP incompleto o faria parecer válido", () => {
		expect(formatNup("6800")).toBe("6800")
	})
})

describe("fecho de cortesia (art. 30)", () => {
	it("usa Respeitosamente para autoridade superior e Atenciosamente para as demais", () => {
		expect(courtesyClosing("externo", "superior")).toBe("Respeitosamente,")
		expect(courtesyClosing("externo", "igual")).toBe("Atenciosamente,")
		expect(courtesyClosing("externo", "inferior")).toBe("Atenciosamente,")
	})

	it("não existe entre OM do COMAER (parágrafo único) — nem para autoridade superior", () => {
		expect(courtesyClosing("comaer", "superior")).toBeNull()
		expect(courtesyClosing("interno-om", "igual")).toBeNull()
	})
})

describe("preâmbulo (art. 36)", () => {
	it("concorda o artigo com o gênero do cargo", () => {
		expect(
			preambuloLines({ position: "Chefe do Grupamento de Apoio dos Afonsos" }, [{ position: "Diretora do Hospital de Aeronáutica dos Afonsos", gender: "f" }])
		).toEqual(["Do Chefe do Grupamento de Apoio dos Afonsos", "À Diretora do Hospital de Aeronáutica dos Afonsos"])
		expect(preambuloLines({ position: "CO-DCTA" }, [{ position: "ASOCEA" }])).toEqual(["Do CO-DCTA", "Ao ASOCEA"])
	})

	it("menciona a autoridade intermediária com “via” (parágrafo único, III)", () => {
		expect(preambuloLines(undefined, [{ position: "Chefe do Estado-Maior da Aeronáutica", via: "Comandante-Geral do Pessoal" }])).toEqual([
			"Ao Chefe do Estado-Maior da Aeronáutica, via Comandante-Geral do Pessoal",
		])
	})

	it("junta vários destinatários por vírgula e “e” antes do último (parágrafo único, I)", () => {
		expect(preambuloLines(undefined, [{ position: "BAAF" }, { position: "BASC" }, { position: "GAP-SP" }])).toEqual(["Aos BAAF, BASC e GAP-SP"])
	})
})

describe("enumeração de referências e anexos (art. 37 § 2º)", () => {
	it("termina os itens em ponto e vírgula, “; e” no penúltimo e ponto no último", () => {
		expect(formatEnumeration(["Proc nº 67400.001529/2026-DV", "Ofício nº R-9/1EM/475", "Ofício nº 136/DP/1288"], (i) => `${i + 1}.`)).toEqual([
			"1. Proc nº 67400.001529/2026-DV;",
			"2. Ofício nº R-9/1EM/475; e",
			"3. Ofício nº 136/DP/1288.",
		])
	})

	it("item único termina em ponto", () => {
		expect(formatEnumeration(["Alteração de período de férias"], (i) => `${i + 1}.`)).toEqual(["1. Alteração de período de férias."])
	})

	it("identifica anexos por letras e dobra depois do Z (art. 21 § 3º)", () => {
		expect(annexLetter(0)).toBe("A")
		expect(annexLetter(25)).toBe("Z")
		expect(annexLetter(26)).toBe("AA")
	})
})

describe("identificação do signatário (art. 40)", () => {
	it("põe o posto ANTES do nome para Oficial-General e DEPOIS para os demais", () => {
		expect(signerIdentification({ name: "Fulano de Tal", rank: "Brig", quadro: "Ar", position: "Cmt do CINDACTA I" }, "comaer")).toEqual([
			"Brig Ar FULANO DE TAL",
			"Cmt do CINDACTA I",
		])
		expect(signerIdentification({ name: "Fulano de Tal", rank: "Cel", quadro: "Av", position: "Comandante da Base Aérea dos Afonsos" }, "externo")).toEqual([
			"FULANO DE TAL Coronel Aviador",
			"Comandante da Base Aérea dos Afonsos",
		])
	})

	it("grafa posto e quadro por extenso no documento externo (art. 26 e § 2º)", () => {
		expect(signerIdentification({ name: "Fulano de Tal", rank: "Ten Brig", quadro: "Ar", position: "Comandante-Geral do Pessoal" }, "externo")[0]).toBe(
			"Tenente-Brigadeiro do Ar FULANO DE TAL"
		)
	})

	it("na substituição, o substituto assina acima e o cargo fica só sob a substituída (§ 7º)", () => {
		expect(
			signerIdentification(
				{
					name: "Fulana de Tal",
					rank: "Cel",
					quadro: "Int",
					position: "Diretora do Centro de Documentação da Aeronáutica",
					noImp: { name: "Beltrano de Tal", rank: "Cel", quadro: "Int" },
				},
				"comaer"
			)
		).toEqual(["No Imp FULANA DE TAL Cel Int", "Diretora do Centro de Documentação da Aeronáutica", "BELTRANO DE TAL Cel Int"])
	})
})

describe("divisões do texto (art. 39)", () => {
	it("numera parágrafo, item, alínea e subalínea nos marcadores da norma", () => {
		const lines = renderDivisions([
			{ text: "Parágrafo", items: [{ text: "Item", alineas: [{ text: "alínea", subalineas: [{ text: "subalínea" }] }] }] },
			{ text: "Segundo" },
		])
		expect(lines.map((l) => l.text)).toEqual(["1. Parágrafo", "1.1 Item", "a) alínea", "- subalínea", "2. Segundo"])
	})

	it("dispensa a numeração quando o documento tem parágrafo único (parágrafo único, I)", () => {
		expect(renderDivisions([{ text: "Único" }]).map((l) => l.text)).toEqual(["Único"])
	})
})

/**
 * Regressões apontadas pela revisão do PR #264. Cada uma nasceu de um caminho que os
 * testes acima não visitavam — não de uma regra da norma lida errado.
 */
describe("regressões", () => {
	it("acha o posto com ordinal escrito de qualquer jeito (art. 26)", () => {
		// `normalize("NFD")` deixa o "º" intacto — só o NFKD o decompõe. Sem isso, a busca
		// "tolerante" não achava "1º Ten" digitado como "1o Ten", o posto ficava abreviado
		// num documento externo e ainda saía um aviso de art. 18 falso.
		for (const escrito of ["1º Ten", "1o Ten", "1 TEN", "1ºTen"]) {
			expect(rankInFull(escrito), escrito).toBe("Primeiro-Tenente")
		}
	})

	it("não abrevia palavra que só termina em “o”", () => {
		expect(rankInFull("Cabo")).toBe("Cabo")
		expect(rankInFull("Cb")).toBe("Cabo")
	})

	it("o despacho sem sequencial não vira “Nº s/nº”", () => {
		expect(numberingLine("Nº", { sequence: null })).toBe("s/nº")
		expect(numberingLine("Ofício", { sequence: null })).toBe("Ofício s/nº")
	})

	it("numera o parágrafo único quando ele tem itens — “1.1” exige um “1.” impresso", () => {
		const comItens = renderDivisions([{ text: "Único", items: [{ text: "Item" }] }])
		expect(comItens.map((l) => l.text)).toEqual(["1. Único", "1.1 Item"])
	})

	it("espécie que não numera parágrafo também não numera item por parágrafo", () => {
		// Carta e despacho decisório (art. 45 e 49): "1.1" apontaria para um parágrafo que
		// o documento não mostra.
		const semNumero = renderDivisions([{ text: "Primeiro", items: [{ text: "Item" }] }, { text: "Segundo" }], false)
		expect(semNumero.map((l) => l.text)).toEqual(["Primeiro", "- Item", "Segundo"])
	})
})
