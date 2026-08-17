import { describe, expect, test } from "bun:test"
import { LEGAL_CONTACT_EMAIL, LEGAL_DATA_PROTECTION_OFFICER, LEGAL_DATA_SALE, LEGAL_INSTITUTIONAL_PURPOSE, LEGAL_RESPONSE_DAYS } from "./contact.ts"
import { readCurrentLegalSeedText } from "./seed-fixture.ts"
import { LEGAL_DOC_PATHS, LEGAL_DOC_TITLES, LEGAL_DOC_TYPES, LEGAL_LOCALES } from "./types.ts"

/**
 * O canal de exercício de direitos vive em dois lugares: nestas constantes (que a
 * UI e as APIs renderizam) e no texto dos documentos legais (que é o que tem valor
 * jurídico). Divergência entre os dois é o pior caso — o usuário lê um endereço no
 * rodapé, outro na política, e o pedido de exclusão vai para uma caixa que ninguém
 * lê enquanto o prazo corre. Este teste amarra os dois.
 */
const SEED = await readCurrentLegalSeedText()

describe("contato do encarregado", () => {
	test("o e-mail das constantes aparece no texto dos documentos", () => {
		expect(SEED).toContain(LEGAL_CONTACT_EMAIL)
	})

	test("o encarregado é identificado por cargo, não por nome de pessoa", () => {
		expect(LEGAL_DATA_PROTECTION_OFFICER).toBe("Secretaria do IEFA")
		expect(SEED).toContain(LEGAL_DATA_PROTECTION_OFFICER)
	})

	test("o prazo declarado no texto bate com a constante", () => {
		expect(LEGAL_RESPONSE_DAYS).toBe(7)
		expect(SEED).toContain(`${LEGAL_RESPONSE_DAYS} (sete) dias corridos`)
		expect(SEED).toContain(`${LEGAL_RESPONSE_DAYS} (seven) calendar days`)
	})

	test("a política afirma que não há autoexclusão", () => {
		// Não é detalhe de redação: é a diferença entre o titular procurar um botão
		// que não existe e mandar o e-mail que efetivamente inicia o procedimento.
		expect(SEED).toContain("Não existe botão de autoexclusão")
		expect(SEED).toContain("processada manualmente")
	})

	test("a política declara a retenção real, sem prometer expurgo inexistente", () => {
		expect(SEED).toContain("Não existe rotina de expurgo automático")
		expect(SEED).toContain("a expectativa é que seja permanente")
	})
})

/**
 * "Vocês vendem meus dados?" e "para que isso serve?" são as duas perguntas que o
 * titular realmente faz. Ambas já tinham resposta correta no texto — enterradas no
 * meio da seção 6 e no terceiro marcador da seção 5, invisíveis para quem lê duas
 * telas e fecha. Estes testes prendem a resposta na abertura dos três documentos,
 * nos dois idiomas: é o tipo de frase que uma revisão de redação apaga sem perceber
 * que apagou um compromisso.
 */
describe("não-venda e finalidade de pesquisa", () => {
	test("a não-venda é declarada em pt-BR nos três documentos", () => {
		expect(SEED).toContain("Nós nunca vendemos os seus dados pessoais.")
		expect(SEED).toContain("O IEFA não vende dados pessoais.")
		expect(SEED).toContain("O IEFA não vende dados pessoais, em nenhuma hipótese")
		expect(SEED).toContain("O IEFA nunca vende esses dados")
	})

	test("a não-venda é declarada em en-US nos três documentos", () => {
		expect(SEED).toContain("We never sell your personal data.")
		expect(SEED).toContain("IEFA does not sell personal data.")
		expect(SEED).toContain("IEFA does not sell personal data under any circumstances")
		expect(SEED).toContain("IEFA never sells this data")
	})

	test("a não-venda vem com o motivo, não só com a promessa", () => {
		// Promessa isolada envelhece mal: a próxima gestão pode revê-la. O fundamento
		// — dado sob custódia do Estado, titularidade da União — não depende de gestão.
		expect(SEED).toContain("a exploração comercial")
		expect(SEED).toContain("vedada")
		expect(SEED).toContain("forbidden by law")
	})

	test("a finalidade de pesquisa abre a política e encabeça a lista de finalidades", () => {
		expect(SEED).toContain("instituição pública de **ensino e pesquisa**")
		expect(SEED).toContain("public **teaching and research** institution")
		expect(SEED).toContain("## 5. Finalidades — operar o serviço e fazer pesquisa")
		expect(SEED).toContain("## 5. Purposes — running the service and doing research")
	})

	test("a lista de finalidades se declara exaustiva", () => {
		// Sem isso a lista lê como exemplificativa, e uma finalidade nova poderia ser
		// acrescentada na prática sem passar por versão nova do documento.
		expect(SEED).toContain("Esta lista é exaustiva.")
		expect(SEED).toContain("This list is exhaustive.")
	})
})

describe("catálogo de documentos", () => {
	test("todo tipo tem rota e título nos dois locales", () => {
		for (const locale of LEGAL_LOCALES) {
			for (const docType of LEGAL_DOC_TYPES) {
				expect(LEGAL_DOC_PATHS[locale][docType]).toStartWith("/")
				expect(LEGAL_DOC_TITLES[locale][docType].length).toBeGreaterThan(0)
			}
		}
	})

	test("todo tipo é publicado nos dois locales pela migration", () => {
		for (const docType of LEGAL_DOC_TYPES) {
			for (const locale of LEGAL_LOCALES) {
				expect(SEED).toContain(`'${docType}',`)
				expect(SEED).toContain(`'${locale}',`)
			}
		}
	})

	test("rotas são únicas dentro de cada locale", () => {
		for (const locale of LEGAL_LOCALES) {
			const paths = LEGAL_DOC_TYPES.map((docType) => LEGAL_DOC_PATHS[locale][docType])
			expect(new Set(paths).size).toBe(paths.length)
		}
	})
})

describe("constantes da API x texto publicado", () => {
	test("a finalidade que a API devolve é a mesma que o documento declara", () => {
		// `GET /legal` devolve `institutional_purpose` em JSON; a política diz o mesmo
		// em prosa. Sem este vínculo as duas cópias divergem sozinhas — foi por isso
		// que o e-mail e o prazo viraram constante, e a razão vale igual aqui.
		expect(LEGAL_INSTITUTIONAL_PURPOSE["pt-BR"]).toContain("ensino e pesquisa")
		expect(LEGAL_INSTITUTIONAL_PURPOSE["pt-BR"]).toContain("NUNCA são vendidos")
		expect(LEGAL_INSTITUTIONAL_PURPOSE["en-US"]).toContain("teaching and research")
		expect(LEGAL_INSTITUTIONAL_PURPOSE["en-US"]).toContain("NEVER sold")
		expect(LEGAL_DATA_SALE).toBe("never")
	})

	test("existe versão en-US da finalidade", () => {
		// O handler honra `?locale=en-US` para título e link; devolver português
		// justamente no campo que o agente veio buscar seria pior que não ter o campo.
		expect(LEGAL_INSTITUTIONAL_PURPOSE["en-US"]).not.toBe(LEGAL_INSTITUTIONAL_PURPOSE["pt-BR"])
	})
})

describe("formatação do markdown publicado", () => {
	test("nenhum bloco de citação é hard-wrapped", () => {
		// Os três renderizadores usam `remark-breaks`: quebra simples vira `<br>`. Um
		// parágrafo quebrado em 78 colunas no fonte sai esfarrapado na tela e re-quebra
		// em linhas órfãs no celular — e o bloco de resumo é a PRIMEIRA coisa que o
		// usuário lê na política. Só linha em branco (`>`) separa parágrafos.
		const ragged: string[] = []
		const lines = SEED.split("\n")
		for (const [index, line] of lines.entries()) {
			if (!line.startsWith("> ")) continue
			const next = lines[index + 1]
			if (next?.startsWith("> ") && next.trim() !== ">") ragged.push(line.slice(0, 60))
		}
		expect(ragged, "linhas de blockquote em sequência viram <br> — junte o parágrafo numa linha só").toEqual([])
	})
})
