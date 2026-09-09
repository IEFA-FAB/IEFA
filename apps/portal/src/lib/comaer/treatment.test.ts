import { describe, expect, it } from "bun:test"
import { findForbiddenTreatment, findForbiddenTreatmentInParagraph, forbiddenTreatmentMessage } from "./treatment"

describe("tratamento proibido no texto", () => {
	it("pega “Vossa Senhoria” no que circula dentro do COMAER", () => {
		expect(findForbiddenTreatment("Solicito a Vossa Senhoria autorização para o afastamento.", "comaer")).toBe("Vossa Senhoria")
		expect(findForbiddenTreatment("Informo a Vossa Excelência o resultado.", "interno-om")).toBe("Vossa Excelência")
	})

	it("pega a forma abreviada, que é como ela costuma escapar", () => {
		expect(findForbiddenTreatment("Encaminho a V. Sª o processo.", "comaer")).toBe("V. Sª")
		expect(findForbiddenTreatment("Encaminho a V. Exa. o processo.", "comaer")).toBe("V. Exa.")
	})

	it("não decide a forma do ofício externo: ali o destinatário pode ser de outro poder", () => {
		// Quem escolhe entre Senhoria e Excelência é o campo de endereçamento do formulário.
		expect(findForbiddenTreatment("Solicito a Vossa Excelência a designação de perito.", "externo")).toBeNull()
	})

	it("“Ilustríssimo” e “Digníssimo” não têm destinatário que os receba, em âmbito nenhum", () => {
		expect(findForbiddenTreatment("Ao Ilustríssimo Senhor Diretor,", "externo")).toBe("Ilustríssimo")
		expect(findForbiddenTreatment("Ao Digníssimo Chefe do Setor,", "comaer")).toBe("Digníssimo")
	})

	it("não estraga o texto correto", () => {
		// "Senhor" é o tratamento que a norma manda usar; a frase impessoal é a preferida.
		expect(findForbiddenTreatment("Solicito ao Senhor Comandante autorização para o afastamento.", "comaer")).toBeNull()
		expect(findForbiddenTreatment("Solicito autorização para o afastamento.", "comaer")).toBeNull()
	})

	it("“doutor” fica fora da verificação de propósito", () => {
		// A norma o proíbe como tratamento, mas ele é parte de nome de instituição e de citação
		// transcrita; barrar a escrita por causa dele custaria mais do que o erro que evita.
		expect(findForbiddenTreatment("O atendimento ocorreu no Hospital Dr. Ary Pinheiro.", "comaer")).toBeNull()
	})

	it("nome de gente não é abreviatura: o ponto é obrigatório", () => {
		// Sem o ponto exigido, "Ilma" (nome de servidora) e "Ilmar" casavam com a regra: a
		// escrita do modelo era recusada em laço e a conferência acusava norma contrariada.
		expect(findForbiddenTreatment("Encaminho o processo ao Sargento Ilmar Souza.", "comaer")).toBeNull()
		expect(findForbiddenTreatment("A servidora Ilma Ribeiro prestou a informação.", "comaer")).toBeNull()
		expect(findForbiddenTreatment("Ao Ilmo. Sr. Diretor,", "comaer")).toBe("Ilmo.")
	})

	it("“dd.” de formato de data não é Digníssimo", () => {
		expect(findForbiddenTreatment("Preencha a data no formato dd.mm.aaaa.", "comaer")).toBeNull()
	})

	it("desce ao item e à alínea, que é por onde o texto digitado à mão escapava", () => {
		const paragraph = {
			text: "Solicito o seguinte:",
			items: [{ text: "informar o efetivo;", alineas: [{ text: "encaminhar a Vossa Senhoria o processo;" }] }],
		}
		expect(findForbiddenTreatmentInParagraph(paragraph, "comaer")).toBe("Vossa Senhoria")
		expect(findForbiddenTreatmentInParagraph({ text: "Solicito autorização." }, "comaer")).toBeNull()
	})

	it("a mensagem diz o que fazer, e não só o que está errado", () => {
		const message = forbiddenTreatmentMessage("Vossa Senhoria")
		expect(message).toContain("Vossa Senhoria")
		expect(message).toContain("Senhor")
		expect(message).toContain("art. 9º")
	})
})
