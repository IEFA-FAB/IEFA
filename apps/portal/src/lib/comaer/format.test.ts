import { describe, expect, it } from "bun:test"
import {
	dataAbreviada,
	dataPorExtenso,
	fechoDeCortesia,
	formatarEnumeracao,
	formatarNup,
	identificacaoSignatario,
	letraAnexo,
	linhaNumeracao,
	linhasPreambulo,
	renderDivisoes,
} from "./format"

/**
 * Os casos abaixo são os EXEMPLOS da NSCA 5-3/2026, Anexo I — não invenções de teste.
 * Cada `expect` cita o artigo de onde a string saiu, para que uma revisão da norma possa
 * ser conferida linha a linha contra o arquivo `apps/portal/public/NSCA 5-3 (GABAER).pdf`.
 */

describe("linha de numeração (art. 31 e art. 51)", () => {
	const num = { sequencial: 34, setor: "GAB", ordemGeral: "255" }

	it("numera o ofício ostensivo com espécie, sequencial, setor e ordem geral", () => {
		expect(linhaNumeracao("Ofício", num)).toBe("Ofício nº 34/GAB/255")
	})

	it("troca o “nº” pelo prefixo do grau de sigilo, sem acumular os dois", () => {
		expect(linhaNumeracao("Ofício", num, "reservado")).toBe("Ofício R-34/GAB/255")
		expect(linhaNumeracao("Ofício", num, "secreto")).toBe("Ofício S-34/GAB/255")
		expect(linhaNumeracao("Ofício", num, "ultrassecreto")).toBe("Ofício US-34/GAB/255")
	})

	it("no trâmite interno à OM usa apenas sequencial e setor (art. 51 § 5º, I, d)", () => {
		expect(linhaNumeracao("Ofício", { sequencial: 7, setor: "GAB", ordemGeral: "255" }, "ostensivo", "interna")).toBe("Ofício nº 7/GAB")
	})

	it("assunto de interesse particular sai s/nº (art. 51 § 6º)", () => {
		expect(linhaNumeracao("Ofício", { sequencial: null })).toBe("Ofício s/nº")
	})

	it("o parecer numera por ordem geral e ano (art. 53 § 2º, III)", () => {
		expect(linhaNumeracao("Parecer", { sequencial: 237, ordemGeral: "2098", ano: 2026 }, "ostensivo", "parecer")).toBe("Parecer nº 237/2098/2026")
	})

	it("o despacho já se numera por “Nº” e não repete o “nº” (art. 48 § 3º, II, d)", () => {
		expect(linhaNumeracao("Nº", { sequencial: 183, setor: "GABGEP", ordemGeral: "2377" })).toBe("Nº 183/GABGEP/2377")
	})
})

describe("datas (art. 12)", () => {
	it("escreve por extenso sem zero à esquerda e com ordinal no dia 1º (§ 4º)", () => {
		expect(dataPorExtenso(new Date(2016, 6, 1))).toBe("1º de julho de 2016")
		expect(dataPorExtenso(new Date(2024, 8, 3))).toBe("3 de setembro de 2024")
		expect(dataPorExtenso(new Date(1982, 11, 16))).toBe("16 de dezembro de 1982")
	})

	it("aceita as formas abreviadas admitidas em texto interno (§ 5º)", () => {
		expect(dataAbreviada(new Date(1980, 7, 4), "ponto")).toBe("04.08.1980")
		expect(dataAbreviada(new Date(1932, 3, 25), "barra")).toBe("25/04/1932")
		expect(dataAbreviada(new Date(1972, 3, 1), "mes")).toBe("01 abr. 1972")
		expect(dataAbreviada(new Date(1972, 3, 12), "mes-maiusculo")).toBe("12 ABR 1972")
	})

	it("nunca abrevia maio (§ 5º, II)", () => {
		expect(dataAbreviada(new Date(1972, 4, 12), "mes")).toBe("12 maio 1972")
		expect(dataAbreviada(new Date(1972, 4, 12), "mes-maiusculo")).toBe("12 MAIO 1972")
	})
})

describe("protocolo COMAER", () => {
	it("mascara os 17 dígitos do NUP", () => {
		expect(formatarNup("68000000000202600")).toBe("68000.000000/2026-00")
		expect(formatarNup("68000.000000/2026-00")).toBe("68000.000000/2026-00")
	})

	it("devolve a entrada intacta quando não são 17 dígitos — mascarar um NUP incompleto o faria parecer válido", () => {
		expect(formatarNup("6800")).toBe("6800")
	})
})

describe("fecho de cortesia (art. 30)", () => {
	it("usa Respeitosamente para autoridade superior e Atenciosamente para as demais", () => {
		expect(fechoDeCortesia("externo", "superior")).toBe("Respeitosamente,")
		expect(fechoDeCortesia("externo", "igual")).toBe("Atenciosamente,")
		expect(fechoDeCortesia("externo", "inferior")).toBe("Atenciosamente,")
	})

	it("não existe entre OM do COMAER (parágrafo único) — nem para autoridade superior", () => {
		expect(fechoDeCortesia("comaer", "superior")).toBeNull()
		expect(fechoDeCortesia("interno-om", "igual")).toBeNull()
	})
})

describe("preâmbulo (art. 36)", () => {
	it("concorda o artigo com o gênero do cargo", () => {
		expect(
			linhasPreambulo({ cargo: "Chefe do Grupamento de Apoio dos Afonsos" }, [{ cargo: "Diretora do Hospital de Aeronáutica dos Afonsos", genero: "f" }])
		).toEqual(["Do Chefe do Grupamento de Apoio dos Afonsos", "À Diretora do Hospital de Aeronáutica dos Afonsos"])
		expect(linhasPreambulo({ cargo: "CO-DCTA" }, [{ cargo: "ASOCEA" }])).toEqual(["Do CO-DCTA", "Ao ASOCEA"])
	})

	it("menciona a autoridade intermediária com “via” (parágrafo único, III)", () => {
		expect(linhasPreambulo(undefined, [{ cargo: "Chefe do Estado-Maior da Aeronáutica", via: "Comandante-Geral do Pessoal" }])).toEqual([
			"Ao Chefe do Estado-Maior da Aeronáutica, via Comandante-Geral do Pessoal",
		])
	})

	it("junta vários destinatários por vírgula e “e” antes do último (parágrafo único, I)", () => {
		expect(linhasPreambulo(undefined, [{ cargo: "BAAF" }, { cargo: "BASC" }, { cargo: "GAP-SP" }])).toEqual(["Aos BAAF, BASC e GAP-SP"])
	})
})

describe("enumeração de referências e anexos (art. 37 § 2º)", () => {
	it("termina os itens em ponto e vírgula, “; e” no penúltimo e ponto no último", () => {
		expect(formatarEnumeracao(["Proc nº 67400.001529/2026-DV", "Ofício nº R-9/1EM/475", "Ofício nº 136/DP/1288"], (i) => `${i + 1}.`)).toEqual([
			"1. Proc nº 67400.001529/2026-DV;",
			"2. Ofício nº R-9/1EM/475; e",
			"3. Ofício nº 136/DP/1288.",
		])
	})

	it("item único termina em ponto", () => {
		expect(formatarEnumeracao(["Alteração de período de férias"], (i) => `${i + 1}.`)).toEqual(["1. Alteração de período de férias."])
	})

	it("identifica anexos por letras e dobra depois do Z (art. 21 § 3º)", () => {
		expect(letraAnexo(0)).toBe("A")
		expect(letraAnexo(25)).toBe("Z")
		expect(letraAnexo(26)).toBe("AA")
	})
})

describe("identificação do signatário (art. 40)", () => {
	it("põe o posto ANTES do nome para Oficial-General e DEPOIS para os demais", () => {
		expect(identificacaoSignatario({ nome: "Fulano de Tal", posto: "Brig", quadro: "Ar", cargo: "Cmt do CINDACTA I" }, "comaer")).toEqual([
			"Brig Ar FULANO DE TAL",
			"Cmt do CINDACTA I",
		])
		expect(identificacaoSignatario({ nome: "Fulano de Tal", posto: "Cel", quadro: "Av", cargo: "Comandante da Base Aérea dos Afonsos" }, "externo")).toEqual([
			"FULANO DE TAL Coronel Aviador",
			"Comandante da Base Aérea dos Afonsos",
		])
	})

	it("grafa posto e quadro por extenso no documento externo (art. 26 e § 2º)", () => {
		expect(identificacaoSignatario({ nome: "Fulano de Tal", posto: "Ten Brig", quadro: "Ar", cargo: "Comandante-Geral do Pessoal" }, "externo")[0]).toBe(
			"Tenente-Brigadeiro do Ar FULANO DE TAL"
		)
	})

	it("na substituição, o substituto assina acima e o cargo fica só sob a substituída (§ 7º)", () => {
		expect(
			identificacaoSignatario(
				{
					nome: "Fulana de Tal",
					posto: "Cel",
					quadro: "Int",
					cargo: "Diretora do Centro de Documentação da Aeronáutica",
					noImp: { nome: "Beltrano de Tal", posto: "Cel", quadro: "Int" },
				},
				"comaer"
			)
		).toEqual(["No Imp FULANA DE TAL Cel Int", "Diretora do Centro de Documentação da Aeronáutica", "BELTRANO DE TAL Cel Int"])
	})
})

describe("divisões do texto (art. 39)", () => {
	it("numera parágrafo, item, alínea e subalínea nos marcadores da norma", () => {
		const linhas = renderDivisoes([
			{ texto: "Parágrafo", itens: [{ texto: "Item", alineas: [{ texto: "alínea", subalineas: [{ texto: "subalínea" }] }] }] },
			{ texto: "Segundo" },
		])
		expect(linhas.map((l) => l.texto)).toEqual(["1. Parágrafo", "1.1 Item", "a) alínea", "- subalínea", "2. Segundo"])
	})

	it("dispensa a numeração quando o documento tem parágrafo único (parágrafo único, I)", () => {
		expect(renderDivisoes([{ texto: "Único" }]).map((l) => l.texto)).toEqual(["Único"])
	})
})
