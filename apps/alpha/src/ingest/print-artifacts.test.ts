import { describe, expect, it } from "bun:test"
import { stripPrintArtifacts } from "./print-artifacts.ts"

/** Uma página de manual: cabeçalho, corpo e número de página, como sai da extração. */
function page(pageNumber: number, body: string[]): string {
	return ["MÓDULO 14 – ENCERRAMENTO DO EXERCÍCIO", String(pageNumber), ...body].join("\n")
}

describe("stripPrintArtifacts", () => {
	it("descarta o cabeçalho que se repete no topo das páginas", () => {
		const { text } = stripPrintArtifacts([page(1, ["Primeiro parágrafo."]), page(2, ["Segundo parágrafo."]), page(3, ["Terceiro parágrafo."])])

		expect(text).not.toContain("MÓDULO 14")
		expect(text).toBe("Primeiro parágrafo.\nSegundo parágrafo.\nTerceiro parágrafo.")
	})

	it("descarta o número de página, que caía no meio do dispositivo", () => {
		// A extração concatena as páginas: sem isto, "14.1.1 O Comando da Aeronáutica"
		// vinha partido por um "2" solto no meio da frase.
		const { text } = stripPrintArtifacts([page(1, ["14.1.1 O Comando"]), page(2, ["da Aeronáutica participa"]), page(3, ["do encerramento."])])

		expect(text.split("\n")).toEqual(["14.1.1 O Comando", "da Aeronáutica participa", "do encerramento."])
	})

	it("reconhece o carimbo com número variável como uma linha só", () => {
		// É o pior artefato do acervo: hex de MD5 por página, token sem significado
		// disputando espaço no vetor. Sem mascarar o dígito, cada página parece um
		// rodapé diferente e nenhum passa do limiar de repetição.
		const stamp = (n: number) => `Documento: Módulo 3 - Página ${n}/4 - Hash MD5: 8cc9b2da4d0f1b3efb70`
		const { text, removedLines } = stripPrintArtifacts([
			[stamp(1), "Texto um."].join("\n"),
			[stamp(2), "Texto dois."].join("\n"),
			[stamp(3), "Texto três."].join("\n"),
			[stamp(4), "Texto quatro."].join("\n"),
		])

		expect(text).not.toContain("Hash MD5")
		expect(removedLines).toBe(4)
	})

	it("descarta rodapé, não só cabeçalho", () => {
		const withFooter = (body: string) => [body, "Início"].join("\n")
		const { text } = stripPrintArtifacts([withFooter("Parágrafo um."), withFooter("Parágrafo dois."), withFooter("Parágrafo três.")])

		expect(text).toBe("Parágrafo um.\nParágrafo dois.\nParágrafo três.")
	})

	it("mantém linha repetida no MEIO da página", () => {
		// Só a borda prova origem de impressão. Um `Início` no fim de uma subseção é
		// texto do documento onde está, e removê-lo mutilaria a frase seguinte.
		const body = (n: number) => ["a", "b", "c", "d", `corpo ${n}`, "Início", "e", "f", "g", "h"].join("\n")
		const { text } = stripPrintArtifacts([body(1), body(2), body(3)])

		expect(text.match(/Início/g)).toHaveLength(3)
	})

	it("não mexe em documento curto demais para haver repetição", () => {
		// Duas páginas: "aparece nas duas" não distingue cabeçalho de texto.
		const { text, removedLines } = stripPrintArtifacts(["TÍTULO\nUm.", "TÍTULO\nDois."])

		expect(removedLines).toBe(0)
		expect(text).toContain("TÍTULO")
	})

	it("mantém parágrafo longo mesmo repetido na borda", () => {
		// Cabeçalho é curto. Na dúvida entre artefato e norma, a norma fica.
		const long = "Este é um parágrafo normativo longo o bastante para não ser cabeçalho de impressão, ".repeat(3)
		const { text } = stripPrintArtifacts([`${long}\nUm.`, `${long}\nDois.`, `${long}\nTrês.`])

		expect(text).toContain("parágrafo normativo longo")
	})

	it("preserva a ordem e o conteúdo do que fica", () => {
		const { text } = stripPrintArtifacts([page(1, ["Art. 1º Primeiro.", "Parágrafo único."]), page(2, ["Art. 2º Segundo."]), page(3, ["Art. 3º Terceiro."])])

		expect(text.split("\n")).toEqual(["Art. 1º Primeiro.", "Parágrafo único.", "Art. 2º Segundo.", "Art. 3º Terceiro."])
	})

	it("reporta o que descartou, para conferência humana", () => {
		const { patterns, removedLines } = stripPrintArtifacts([page(1, ["Um."]), page(2, ["Dois."]), page(3, ["Três."])])

		expect(removedLines).toBe(6)
		expect(patterns).toContain("MÓDULO # – ENCERRAMENTO DO EXERCÍCIO")
	})

	it("aceita página vazia sem contá-la no limiar", () => {
		// Página em branco existe em manual impresso (verso de folha de rosto). Contá-la
		// como página faria o limiar subir e o cabeçalho escapar.
		const { text } = stripPrintArtifacts([page(1, ["Um."]), "", page(2, ["Dois."]), page(3, ["Três."])])

		expect(text).not.toContain("MÓDULO 14")
	})

	it("descarta 'Fl. nº 3' e '- 12 -', que também são numeração de impressão", () => {
		const { text } = stripPrintArtifacts([
			["Fl. nº 1", "Um.", "- 1 -"].join("\n"),
			["Fl. nº 2", "Dois.", "- 2 -"].join("\n"),
			["Fl. nº 3", "Três.", "- 3 -"].join("\n"),
		])

		expect(text).toBe("Um.\nDois.\nTrês.")
	})
})

describe("stripPrintArtifacts — página de controle de assinatura", () => {
	const signature = [
		"CONTROLE DE ASSINATURAS ELETRÔNICAS DO DOCUMENTO",
		"Documento:",
		"Data/Hora de Criação: 22/11/2024 15:06:51",
		"Hash MD5:",
		"Páginas Totais (Doc. + Ass.)",
	].join("\n")

	it("descarta a página inteira, que é metadado do sistema de assinatura", () => {
		// Ela aparece UMA vez por documento, então a regra de repetição não a alcança —
		// e era a origem de todo o resíduo de `Hash MD5` que sobrava depois da limpeza.
		const { text } = stripPrintArtifacts(["Página um do manual.", "Página dois do manual.", "Página três do manual.", signature])

		expect(text).not.toContain("Hash MD5")
		expect(text).toBe("Página um do manual.\nPágina dois do manual.\nPágina três do manual.")
	})

	it("alcança o documento curto demais para a regra de repetição", () => {
		// Dez submódulos do Módulo H têm exatamente 2 páginas, e a segunda é a de
		// assinatura. Sem esta regra, metade do documento era metadado.
		const { text, removedLines } = stripPrintArtifacts(["O texto normativo do submódulo.", signature])

		expect(text).toBe("O texto normativo do submódulo.")
		expect(removedLines).toBe(5)
	})

	it("não descarta página que só MENCIONA controle de assinaturas", () => {
		// O cabeçalho é exigido no início da linha: uma norma que fale do assunto no meio
		// de um parágrafo não pode perder a página.
		const body = "A unidade fará o controle de assinaturas eletrônicas conforme o módulo próprio."
		const { text } = stripPrintArtifacts([body, "Página dois.", "Página três."])

		expect(text).toContain("controle de assinaturas eletrônicas")
	})
})

describe("stripPrintArtifacts — carimbo do sistema de documento eletrônico", () => {
	const stamp = "Documento: CADIN - Página 1/2 - Hash MD5: 5049dd09c276586e05c7dd483bc49b34"

	it("descarta o carimbo mesmo sem repetição que o prove", () => {
		// Dez submódulos do Módulo H têm 2 páginas, uma delas de assinatura: sobra UMA
		// página útil, e nenhuma repetição. A forma do carimbo já é prova suficiente.
		const { text } = stripPrintArtifacts([[stamp, "O texto normativo do submódulo."].join("\n"), "CONTROLE DE ASSINATURAS ELETRÔNICAS DO DOCUMENTO\nHash MD5:"])

		expect(text).toBe("O texto normativo do submódulo.")
	})

	it("não confunde com linha que apenas cite documento e página", () => {
		const body = "Documento: o processo deve indicar a página do parecer."
		const { text } = stripPrintArtifacts([body, "Página dois.", "Página três."])

		expect(text).toContain("indicar a página do parecer")
	})
})

describe("stripPrintArtifacts — o que a revisão do #301 apontou", () => {
	it("não leva junto o texto que divide a página com o bloco de assinatura", () => {
		// O corte é da linha de assinatura PARA BAIXO. Nada garante que o bloco comece no
		// topo da página, e descartar a página inteira perderia norma em silêncio.
		const last = [
			"14.9.3 O encerramento observará o disposto neste módulo.",
			"Parágrafo único. Os prazos são improrrogáveis.",
			"CONTROLE DE ASSINATURAS ELETRÔNICAS DO DOCUMENTO",
			"Hash MD5:",
		].join("\n")
		const { text } = stripPrintArtifacts(["Página um.", "Página dois.", "Página três.", last])

		expect(text).toContain("14.9.3 O encerramento")
		expect(text).toContain("Parágrafo único")
		expect(text).not.toContain("Hash MD5")
	})

	it("não descarta número solto sem repetição que o prove", () => {
		// `1200` no topo da página pode ser paginação ou o valor que abre a continuação de
		// uma tabela. Quem separa os dois é a repetição: paginação aparece em quase toda
		// página, valor de tabela não.
		const page = (first: string) => [first, ...Array.from({ length: 8 }, (_, i) => `linha de corpo ${i}`)].join("\n")
		const { text } = stripPrintArtifacts([page("1200"), page("340"), page("57")])

		expect(text).toContain("1200")
		expect(text).toContain("340")
	})

	it("descarta o carimbo mesmo acima do teto de tamanho", () => {
		// O teto protege a remoção POR REPETIÇÃO de comer parágrafo. O carimbo sai por
		// forma própria, e um de 285 caracteres é tão carimbo quanto um de 110.
		const long = `Documento: ${"NOME MUITO LONGO DE MÓDULO ".repeat(9)} - Página 1/4 - Hash MD5: 8cc9b2da4d0f1b3efb70`
		expect(long.length).toBeGreaterThan(200)

		const { text } = stripPrintArtifacts([`${long}\nUm.`, `${long}\nDois.`, `${long}\nTrês.`])

		expect(text).toBe("Um.\nDois.\nTrês.")
	})

	it("relata máscara distinta, e não uma entrada por linha removida", () => {
		// `patterns` é o canal de conferência humana: repetir a mesma máscara quatro vezes
		// esconde as outras em vez de mostrar o que saiu.
		const stamp = (n: number) => `Documento: Módulo 3 - Página ${n}/4 - Hash MD5: 8cc9b2da4d0f`
		const { patterns } = stripPrintArtifacts([`${stamp(1)}\nUm.`, `${stamp(2)}\nDois.`, `${stamp(3)}\nTrês.`, `${stamp(4)}\nQuatro.`])

		expect(patterns).toHaveLength(1)
	})
})
