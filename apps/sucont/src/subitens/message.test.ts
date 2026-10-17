import { describe, expect, it } from "bun:test"
import { addDays, todayInBrasilia } from "#/lib/brasilia"
import { classifyGenericCode } from "#/subitens/generic-code"
import {
	buildRacMessageKey,
	buildUgMessageKey,
	CONSOLIDATED_TEMPLATE,
	defaultDeadline,
	formatDeadlineText,
	formatMsgDate,
	formatReportDate,
	INSTITUTIONAL_TEMPLATE,
	NO_GENERIC_CODE_MESSAGE,
	RAC_QUESTIONS,
} from "#/subitens/message"
import type { ProcessedData } from "#/subitens/types"

// O Intl separa "R$" do número com espaço não separável (U+00A0).
const BRL = "R$ "

const FUNDAMENTACAO = `Fundamentação normativa:
1. Macrofunção 02.03.18 — Encerramento do Exercício (Manual SIAFI), item 5.1 — os saldos devem ser analisados evitando-se a utilização do conta corrente 999.
2. Macrofunção 02.03.15 — Conformidade Contábil (Manual SIAFI), item 4.2.2.2 — o registro na conta "Outros" acima do percentual da transação CONPARINC enseja ressalva na conformidade contábil.
3. Este apontamento é por ocorrência, apurado no relatório do Tesouro Gerencial. Ele não afere o percentual do subelemento 99 por modalidade de aplicação e elemento de despesa (CONINCONS), de modo que pode alcançar situação ainda abaixo do parâmetro federal.`

const CONCLUSAO_PADRAO =
	"Após a regularização, ou caso haja justificativa técnica para a manutenção do saldo, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem."
const CONCLUSAO_ALERTA =
	"Esta é uma mensagem de alerta. Não é necessário responder via Sistema de Atendimento ao Usuário (SAU) com as ações realizadas ou justificativas, a menos que haja alguma dúvida."

const ASSINATURA = `Atenciosamente,

Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)
Subdiretoria de Contabilidade (SUCONT)
Diretoria de Economia e Finanças da Aeronáutica (DIREF)`

const occ = (ug: string, contaContabil: string, contaCorrente: string, saldo: number, racId = "RAC 28"): ProcessedData => ({
	ug,
	contaContabil,
	contaCorrente,
	genericKinds: classifyGenericCode(contaCorrente),
	saldo,
	racId,
})

describe("INSTITUTIONAL_TEMPLATE", () => {
	const occurrences = [occ("120001 GABAER", "332110100", "99", 1234.5), occ("120001 GABAER", "113110200", "P99", -10)]

	it("panorama geral com os valores padrão (sem prazo, número XXX, sem questão focal)", () => {
		expect(
			INSTITUTIONAL_TEMPLATE("120001 GABAER", occurrences, "13/10/2026", "13OUT2026")
		).toBe(`Assunto: Regularização de Inconsistências Contábeis — Panorama Geral

Mensagem nº XXX/SUCONT-3/13OUT2026

Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foram identificadas inconsistências contábeis sob responsabilidade desta Unidade Gestora, conforme detalhamento abaixo:

Detalhamento da(s) situação(ões) identificada(s):
   • Conta Contábil 332110100 — Conta Corrente 99 — Subitem genérico (99) — Saldo: ${BRL}1.234,50
   • Conta Contábil 113110200 — Conta Corrente P99 — Subitem genérico (99) — Saldo: -${BRL}10,00

Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com os ajustes adequados conforme as normas vigentes.

${FUNDAMENTACAO}

${CONCLUSAO_PADRAO}

${ASSINATURA}`)
	})

	it("focalRacId 'all' é o mesmo panorama de não informar", () => {
		const semFocal = INSTITUTIONAL_TEMPLATE("u", occurrences, "d", "13OUT2026", "sem_prazo", "", "007")
		const comAll = INSTITUTIONAL_TEMPLATE("u", occurrences, "d", "13OUT2026", "sem_prazo", "", "007", "all")
		expect(comAll).toBe(semFocal)
		expect(comAll).toContain("Mensagem nº 007/SUCONT-3/13OUT2026")
	})

	it("questão focal conhecida, com prazo: assunto e introdução pelo título, cláusula de prazo", () => {
		const outra = occ("120001 GABAER", "999", "999", 5, "RAC 30")
		expect(
			INSTITUTIONAL_TEMPLATE("u", [...occurrences, outra], "d", "05OUT2026", "com_prazo", "20/10/2026", "042", "RAC 28")
		).toBe(`Assunto: Inconsistência Contábil — Utilização de Contas/Subitens Genéricos

Mensagem nº 042/SUCONT-3/05OUT2026

Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foi identificada inconsistência referente à Utilização de Contas/Subitens Genéricos por esta Unidade Gestora.

Detalhamento da(s) situação(ões) identificada(s):
   • Conta Contábil 332110100 — Conta Corrente 99 — Subitem genérico (99) — Saldo: ${BRL}1.234,50
   • Conta Contábil 113110200 — Conta Corrente P99 — Subitem genérico (99) — Saldo: -${BRL}10,00

Solicitamos que as providências sejam adotadas no prazo de 20/10/2026, a contar do recebimento desta mensagem.

Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com os ajustes adequados conforme as normas vigentes.

${FUNDAMENTACAO}

${CONCLUSAO_PADRAO}

${ASSINATURA}`)
	})

	it("questão focal desconhecida: título cai no id e a lista fica vazia", () => {
		const text = INSTITUTIONAL_TEMPLATE("u", occurrences, "d", "M", "sem_prazo", "", "1", "RAC 99")
		expect(text).toContain("Assunto: Inconsistência Contábil — RAC 99\n")
		expect(text).toContain("foi identificada inconsistência referente à RAC 99 por esta Unidade Gestora.")
		expect(text).toContain("Detalhamento da(s) situação(ões) identificada(s):\n\n\nSolicitamos a análise")
	})

	it("com prazo mas sem data: sem cláusula", () => {
		const text = INSTITUTIONAL_TEMPLATE("u", occurrences, "d", "M", "com_prazo", "")
		expect(text).not.toContain("prazo de")
		expect(text).toBe(INSTITUTIONAL_TEMPLATE("u", occurrences, "d", "M", "sem_prazo", ""))
	})

	it("sem prazo com data informada: sem cláusula", () => {
		expect(INSTITUTIONAL_TEMPLATE("u", occurrences, "d", "M", "sem_prazo", "20/10/2026")).not.toContain("prazo de")
	})

	it("alerta troca a conclusão e ignora o prazo", () => {
		const text = INSTITUTIONAL_TEMPLATE("u", occurrences, "d", "M", "alerta", "20/10/2026")
		expect(text).toContain(`\n\n${CONCLUSAO_ALERTA}\n\n`)
		expect(text).not.toContain(CONCLUSAO_PADRAO)
		expect(text).not.toContain("prazo de")
	})

	it("panorama agrupa por questão na ordem das chaves do objeto (inteiras primeiro)", () => {
		const text = INSTITUTIONAL_TEMPLATE(
			"u",
			[occ("u", "A", "99", 1, "RAC 28"), occ("u", "B", "99", 2, "10"), occ("u", "C", "99", 3, "RAC 28"), occ("u", "D", "99", 4, "2")],
			"d",
			"M"
		)
		const lines = text.split("\n").filter((l) => l.startsWith("   • "))
		expect(lines.map((l) => l.slice(20, 21))).toEqual(["D", "B", "A", "C"])
	})

	it("sem ocorrências: lista vazia", () => {
		expect(INSTITUTIONAL_TEMPLATE("u", [], "d", "M")).toContain("Detalhamento da(s) situação(ões) identificada(s):\n\n\nSolicitamos")
	})
})

describe("tipo do código na linha da ocorrência", () => {
	it("diz se é subitem 99, favorecido 999 ou os dois", () => {
		const text = INSTITUTIONAL_TEMPLATE("120001", [occ("120001", "1", "P 99", 1), occ("120001", "2", "P999", 2), occ("120001", "3", "999 / 99", 3)], "d", "M")
		expect(text).toContain(`   • Conta Contábil 1 — Conta Corrente P 99 — Subitem genérico (99) — Saldo: ${BRL}1,00`)
		expect(text).toContain(`   • Conta Contábil 2 — Conta Corrente P999 — Favorecido genérico (999) — Saldo: ${BRL}2,00`)
		expect(text).toContain(`   • Conta Contábil 3 — Conta Corrente 999 / 99 — Subitem genérico (99) e favorecido genérico (999) — Saldo: ${BRL}3,00`)
	})
})

describe("CONSOLIDATED_TEMPLATE", () => {
	it("agrupa por UG com o nome completo, valores padrão", () => {
		const occurrences = [occ("120004", "332110100", "99", 100), occ("999999 SEM CADASTRO", "113110200", "999", 2.5), occ("120001", "332110100", "999", 7)]
		expect(CONSOLIDATED_TEMPLATE("RAC 28", occurrences, "d", "13OUT2026")).toBe(`Assunto: Inconsistência Contábil — Utilização de Contas/Subitens Genéricos

Mensagem nº XXX/SUCONT-3/13OUT2026

Às Unidades Gestoras (UGs) listadas abaixo:

Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foi identificada inconsistência referente à Utilização de Contas/Subitens Genéricos pelas Unidades Gestoras listadas abaixo.

Detalhamento da(s) situação(ões) identificada(s):
UG 120001 (GABAER), subordinada ao GABAER / GABAER:
   • Conta Contábil 332110100 — Conta Corrente 999 — Favorecido genérico (999) — Saldo: ${BRL}7,00

UG 120004 (BABR), subordinada ao VI COMAR / COMPREP:
   • Conta Contábil 332110100 — Conta Corrente 99 — Subitem genérico (99) — Saldo: ${BRL}100,00

999999 SEM CADASTRO:
   • Conta Contábil 113110200 — Conta Corrente 999 — Favorecido genérico (999) — Saldo: ${BRL}2,50

Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com os ajustes adequados conforme as normas vigentes.

${FUNDAMENTACAO}

${CONCLUSAO_PADRAO}

${ASSINATURA}`)
	})

	it("questão desconhecida, com prazo e número: título cai no id e entra a cláusula", () => {
		const text = CONSOLIDATED_TEMPLATE("RAC 99", [occ("x", "1", "99", 1)], "d", "M", "com_prazo", "20/10/2026", "015")
		expect(text.startsWith("Assunto: Inconsistência Contábil — RAC 99\n\nMensagem nº 015/SUCONT-3/M\n")).toBe(true)
		expect(text).toContain("referente à RAC 99 pelas Unidades Gestoras listadas abaixo.")
		expect(text).toContain(
			`Saldo: ${BRL}1,00\n\nSolicitamos que as providências sejam adotadas no prazo de 20/10/2026, a contar do recebimento desta mensagem.\n\nSolicitamos a análise`
		)
	})

	it("com prazo sem data não tem cláusula; alerta troca a conclusão", () => {
		expect(CONSOLIDATED_TEMPLATE("RAC 28", [occ("x", "1", "99", 1)], "d", "M", "com_prazo", "")).not.toContain("prazo de")
		const alerta = CONSOLIDATED_TEMPLATE("RAC 28", [occ("x", "1", "99", 1)], "d", "M", "alerta", "20/10/2026")
		expect(alerta).toContain(`\n\n${CONCLUSAO_ALERTA}\n\n`)
		expect(alerta).not.toContain("prazo de")
	})
})

describe("RAC_QUESTIONS", () => {
	it("mantém o título da RAC 28", () => {
		expect(RAC_QUESTIONS["RAC 28"].title).toBe("Utilização de Contas/Subitens Genéricos")
	})
})

describe("formatMsgDate", () => {
	it("sem data devolve o marcador", () => {
		expect(formatMsgDate("")).toBe("XXXMÊSANO")
	})

	it("formata dia com dois dígitos, mês abreviado e ano", () => {
		expect(formatMsgDate("2026-10-05")).toBe("05OUT2026")
		expect(formatMsgDate("2027-01-31")).toBe("31JAN2027")
		expect(formatMsgDate("2026-12-01")).toBe("01DEZ2026")
	})
})

describe("NO_GENERIC_CODE_MESSAGE", () => {
	it("não chama o 999 de subitem (#639: é o favorecido genérico)", () => {
		expect(NO_GENERIC_CODE_MESSAGE).not.toContain("99/999")
		expect(NO_GENERIC_CODE_MESSAGE).toContain("subitem 99")
		expect(NO_GENERIC_CODE_MESSAGE).toContain("favorecido genérico 999")
	})
})

describe("chave da mensagem", () => {
	it("não colide entre a lista por UG e a lista por questão, nem depende da posição", () => {
		const keys = [buildUgMessageKey("120001"), buildUgMessageKey("120004"), buildRacMessageKey("RAC 28"), buildRacMessageKey("120001")]
		expect(new Set(keys).size).toBe(keys.length)
		expect(buildUgMessageKey("120001")).toBe(buildUgMessageKey("120001"))
	})
})

describe("formatReportDate", () => {
	it("formata a data do campo em DD/MM/AAAA, como o Intl pt-BR", () => {
		expect(formatReportDate("2026-10-05")).toBe("05/10/2026")
		expect(formatReportDate("2026-10-05")).toBe(new Intl.DateTimeFormat("pt-BR").format(new Date("2026-10-05T12:00:00")))
	})

	it("campo apagado não lança: devolve vazio", () => {
		// O caminho antigo lançava RangeError com o campo vazio.
		expect(() => new Intl.DateTimeFormat("pt-BR").format(new Date("T12:00:00"))).toThrow(RangeError)
		expect(formatReportDate("")).toBe("")
		expect(formatReportDate("lixo")).toBe("")
	})
})

describe("formatDeadlineText", () => {
	const fixed = () => "2026-10-18"

	it("sem configuração ou sem prazo: vazio", () => {
		expect(formatDeadlineText(undefined, fixed)).toBe("")
		expect(formatDeadlineText({ messageType: "sem_prazo", deadlineDate: "2026-10-20", msgNumber: "", msgDate: "" }, fixed)).toBe("")
		expect(formatDeadlineText({ messageType: "alerta", deadlineDate: "2026-10-20", msgNumber: "", msgDate: "" }, fixed)).toBe("")
	})

	it("com prazo e data: DD/MM/AAAA sem consultar o padrão", () => {
		let calls = 0
		const fallback = () => {
			calls++
			return "2000-01-01"
		}
		expect(formatDeadlineText({ messageType: "com_prazo", deadlineDate: "2026-10-20", msgNumber: "", msgDate: "" }, fallback)).toBe("20/10/2026")
		expect(calls).toBe(0)
	})

	it("com prazo sem data: cai no prazo padrão", () => {
		expect(formatDeadlineText({ messageType: "com_prazo", deadlineDate: "", msgNumber: "", msgDate: "" }, fixed)).toBe("18/10/2026")
	})

	it("sem fallback informado usa o prazo padrão de hoje", () => {
		const [y, m, d] = addDays(todayInBrasilia(), 5).split("-")
		expect(formatDeadlineText({ messageType: "com_prazo", deadlineDate: "", msgNumber: "", msgDate: "" })).toBe(`${d}/${m}/${y}`)
	})
})

describe("defaultDeadline", () => {
	it("cinco dias depois da data informada", () => {
		expect(defaultDeadline("2026-10-13")).toBe("2026-10-18")
		expect(defaultDeadline("2026-12-29")).toBe("2027-01-03")
	})

	it("sem data, parte de hoje em Brasília", () => {
		expect(defaultDeadline()).toBe(addDays(todayInBrasilia(), 5))
	})
})
