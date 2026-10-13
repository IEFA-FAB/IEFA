import { afterEach, describe, expect, it, setSystemTime } from "bun:test"
import { generateMessageText } from "./message"
import { PARES } from "./pares"
import type { UGReport } from "./parser"

// Saldos de cada par: o 2 sem o lado A e o 3 sem o lado B, para exercitar o
// "CONTA NÃO LOCALIZADA NO RELATÓRIO" do detalhamento.
const PAIR_FIXTURE: Record<number, { saldoA: number | undefined; saldoB: number | undefined; diff: number; hasA: boolean; hasB: boolean }> = {
	1: { saldoA: 1500.25, saldoB: 1000, diff: 500.25, hasA: true, hasB: true },
	2: { saldoA: undefined, saldoB: 40, diff: -40, hasA: false, hasB: true },
	3: { saldoA: 2000, saldoB: undefined, diff: 2000, hasA: true, hasB: false },
}

function reportWith(ids: number[]): UGReport {
	return {
		ug: "120001",
		ugCode: "120001",
		ugName: "GABAER",
		superior: "GABAER",
		ods: "GABAER",
		conferente: "1S ELIANA",
		totalDiff: 0,
		divergencias: [],
		chartData: [],
		pairs: ids.map((id) => ({ ...PARES[id - 1], ...PAIR_FIXTURE[id] })),
	}
}

function lineOf(text: string, prefix: string) {
	return text.split("\n").find((l) => l.startsWith(prefix))
}

describe("generateMessageText: texto completo por ramo", () => {
	it("par 1, com prazo e data", () => {
		expect(generateMessageText(reportWith([1]), "com_prazo", "2026-10-20", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Caução a Executar

Mensagem n° 45/SUCONT-3/13OUT2026

Em consulta ao SIAFI, foram identificadas divergências entre os saldos registrados na conta de controle 8.1.1.1.1.01.13 - CAUÇÃO A EXECUTAR e na conta contábil 1.1.1.1.1.19.03 - DEMAIS CONTAS - CAIXA ECONÔMICA FEDERAL nessa UG, o que exige análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e).

Detalhamento da divergência:

Saldo da conta 1.1.1.1.1.19.03: R$\u00a01.500,25
Saldo da conta 8.1.1.1.1.01.13: R$\u00a01.000,00
Diferença apurada: R$\u00a0500,25

Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo (1.1.1.1.1.19.03) e no passivo (2.X.8.8.1.04.02), é obrigatório o registro de documento hábil RC com a situação LDV053, por meio do qual será gerado saldo na conta de controle 8.1.1.1.1.01.13.

No caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na referida conta de controle (8.1.1.1.1.01.13), sem movimentação nas contas de caixa.

Dessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior, em razão dos registros de caução realizados por meio de títulos da dívida pública.

Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise a situação verificada até o dia 20/10/2026. Caso seja constatada irregularidade, deverá ser promovida a regularização imediata dos registros contábeis. Na hipótese de não haver falha, mas sim diferenças justificadas, especialmente pela existência de cauções em títulos da dívida pública, deverá ser encaminhada justificativa formal detalhada até a mesma data, com base nos fundamentos aqui descritos, para fins de análise e arquivamento.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para esclarecer eventuais dúvidas acerca do assunto.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 1, com prazo sem data", () => {
		expect(generateMessageText(reportWith([1]), "com_prazo", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Caução a Executar

Mensagem n° 45/SUCONT-3/13OUT2026

Em consulta ao SIAFI, foram identificadas divergências entre os saldos registrados na conta de controle 8.1.1.1.1.01.13 - CAUÇÃO A EXECUTAR e na conta contábil 1.1.1.1.1.19.03 - DEMAIS CONTAS - CAIXA ECONÔMICA FEDERAL nessa UG, o que exige análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e).

Detalhamento da divergência:

Saldo da conta 1.1.1.1.1.19.03: R$\u00a01.500,25
Saldo da conta 8.1.1.1.1.01.13: R$\u00a01.000,00
Diferença apurada: R$\u00a0500,25

Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo (1.1.1.1.1.19.03) e no passivo (2.X.8.8.1.04.02), é obrigatório o registro de documento hábil RC com a situação LDV053, por meio do qual será gerado saldo na conta de controle 8.1.1.1.1.01.13.

No caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na referida conta de controle (8.1.1.1.1.01.13), sem movimentação nas contas de caixa.

Dessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior, em razão dos registros de caução realizados por meio de títulos da dívida pública.

Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise a situação verificada até o dia __/__/____. Caso seja constatada irregularidade, deverá ser promovida a regularização imediata dos registros contábeis. Na hipótese de não haver falha, mas sim diferenças justificadas, especialmente pela existência de cauções em títulos da dívida pública, deverá ser encaminhada justificativa formal detalhada até a mesma data, com base nos fundamentos aqui descritos, para fins de análise e arquivamento.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para esclarecer eventuais dúvidas acerca do assunto.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 1, sem prazo", () => {
		expect(generateMessageText(reportWith([1]), "sem_prazo", "2026-10-20", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Caução a Executar

Mensagem n° 45/SUCONT-3/13OUT2026

Em consulta ao SIAFI, foram identificadas divergências entre os saldos registrados na conta de controle 8.1.1.1.1.01.13 - CAUÇÃO A EXECUTAR e na conta contábil 1.1.1.1.1.19.03 - DEMAIS CONTAS - CAIXA ECONÔMICA FEDERAL nessa UG, o que exige análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e).

Detalhamento da divergência:

Saldo da conta 1.1.1.1.1.19.03: R$\u00a01.500,25
Saldo da conta 8.1.1.1.1.01.13: R$\u00a01.000,00
Diferença apurada: R$\u00a0500,25

Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo (1.1.1.1.1.19.03) e no passivo (2.X.8.8.1.04.02), é obrigatório o registro de documento hábil RC com a situação LDV053, por meio do qual será gerado saldo na conta de controle 8.1.1.1.1.01.13.

No caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na referida conta de controle (8.1.1.1.1.01.13), sem movimentação nas contas de caixa.

Dessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior, em razão dos registros de caução realizados por meio de títulos da dívida pública.

Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise a situação verificada. Caso seja constatada irregularidade, deverá ser promovida a regularização imediata dos registros contábeis. Na hipótese de não haver falha, mas sim diferenças justificadas, especialmente pela existência de cauções em títulos da dívida pública, deverá ser encaminhada justificativa formal detalhada, com base nos fundamentos aqui descritos, para fins de análise e arquivamento.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para esclarecer eventuais dúvidas acerca do assunto.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 1, alerta", () => {
		expect(generateMessageText(reportWith([1]), "alerta", "2026-10-20", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Caução a Executar

Mensagem n° 45/SUCONT-3/13OUT2026

Em consulta ao SIAFI, foram identificadas divergências entre os saldos registrados na conta de controle 8.1.1.1.1.01.13 - CAUÇÃO A EXECUTAR e na conta contábil 1.1.1.1.1.19.03 - DEMAIS CONTAS - CAIXA ECONÔMICA FEDERAL nessa UG, o que exige análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e).

Detalhamento da divergência:

Saldo da conta 1.1.1.1.1.19.03: R$\u00a01.500,25
Saldo da conta 8.1.1.1.1.01.13: R$\u00a01.000,00
Diferença apurada: R$\u00a0500,25

Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo (1.1.1.1.1.19.03) e no passivo (2.X.8.8.1.04.02), é obrigatório o registro de documento hábil RC com a situação LDV053, por meio do qual será gerado saldo na conta de controle 8.1.1.1.1.01.13.

No caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na referida conta de controle (8.1.1.1.1.01.13), sem movimentação nas contas de caixa.

Dessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior, em razão dos registros de caução realizados por meio de títulos da dívida pública.

Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, emite este alerta para que o agente responsável analise a situação verificada. Esta mensagem possui caráter estritamente orientativo. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para esclarecer eventuais dúvidas acerca do assunto.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 2, com prazo e data", () => {
		expect(
			generateMessageText(reportWith([2]), "com_prazo", "2026-10-24", " 45 ", "2026-10-13", "")
		).toBe(`Assunto: Divergência de saldos - Materiais de Consumo

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos entre as contas contábeis 1.1.5.5.1.10.00 (MATERIAIS DE CONSUMO EM TRÂNSITO) e 8.9.9.9.2.01.02 (BENS DE ESTOQUE ENVIADOS), em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Detalhamento da(s) divergência(s):

Saldo da conta 1.1.5.5.1.10.00: CONTA NÃO LOCALIZADA NO RELATÓRIO
Saldo da conta 8.9.9.9.2.01.02: R$\u00a040,00
Diferença apurada: -R$\u00a040,00

Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria, até o dia 24/10/2026 (Sábado) pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 2, com prazo sem data", () => {
		expect(generateMessageText(reportWith([2]), "com_prazo", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Materiais de Consumo

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos entre as contas contábeis 1.1.5.5.1.10.00 (MATERIAIS DE CONSUMO EM TRÂNSITO) e 8.9.9.9.2.01.02 (BENS DE ESTOQUE ENVIADOS), em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Detalhamento da(s) divergência(s):

Saldo da conta 1.1.5.5.1.10.00: CONTA NÃO LOCALIZADA NO RELATÓRIO
Saldo da conta 8.9.9.9.2.01.02: R$\u00a040,00
Diferença apurada: -R$\u00a040,00

Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria, até o dia __/__/____ (Xª feira) pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 2, sem prazo", () => {
		expect(generateMessageText(reportWith([2]), "sem_prazo", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Materiais de Consumo

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos entre as contas contábeis 1.1.5.5.1.10.00 (MATERIAIS DE CONSUMO EM TRÂNSITO) e 8.9.9.9.2.01.02 (BENS DE ESTOQUE ENVIADOS), em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Detalhamento da(s) divergência(s):

Saldo da conta 1.1.5.5.1.10.00: CONTA NÃO LOCALIZADA NO RELATÓRIO
Saldo da conta 8.9.9.9.2.01.02: R$\u00a040,00
Diferença apurada: -R$\u00a040,00

Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 2, alerta", () => {
		expect(generateMessageText(reportWith([2]), "alerta", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Materiais de Consumo

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos entre as contas contábeis 1.1.5.5.1.10.00 (MATERIAIS DE CONSUMO EM TRÂNSITO) e 8.9.9.9.2.01.02 (BENS DE ESTOQUE ENVIADOS), em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Detalhamento da(s) divergência(s):

Saldo da conta 1.1.5.5.1.10.00: CONTA NÃO LOCALIZADA NO RELATÓRIO
Saldo da conta 8.9.9.9.2.01.02: R$\u00a040,00
Diferença apurada: -R$\u00a040,00

Diante do exposto, esta mensagem possui caráter estritamente orientativo e de alerta. Solicitamos ao agente responsável que analise o caso em questão e promova a regularização. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.

Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 3, com prazo e data", () => {
		expect(generateMessageText(reportWith([3]), "com_prazo", "2026-10-25", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Bens Móveis

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilização de saldos entre as contas contábeis 123119905 (BENS MÓVEIS EM TRÂNSITO) e 899920202 (BENS MÓVEIS ENVIADOS), em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Detalhamento da(s) divergência(s):

Saldo da conta 1.2.3.1.1.99.05: R$\u00a02.000,00
Saldo da conta 8.9.9.9.2.02.02: CONTA NÃO LOCALIZADA NO RELATÓRIO
Diferença apurada: R$\u00a02.000,00

Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria, até o dia 25/10/2026.

Com o fito de agilizar a troca de informações entre esta Diretoria e essa UG, solicito a possibilidade de responder o presente questionamento pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 3, com prazo sem data", () => {
		expect(generateMessageText(reportWith([3]), "com_prazo", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Bens Móveis

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilização de saldos entre as contas contábeis 123119905 (BENS MÓVEIS EM TRÂNSITO) e 899920202 (BENS MÓVEIS ENVIADOS), em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Detalhamento da(s) divergência(s):

Saldo da conta 1.2.3.1.1.99.05: R$\u00a02.000,00
Saldo da conta 8.9.9.9.2.02.02: CONTA NÃO LOCALIZADA NO RELATÓRIO
Diferença apurada: R$\u00a02.000,00

Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria, até o dia __/__/____.

Com o fito de agilizar a troca de informações entre esta Diretoria e essa UG, solicito a possibilidade de responder o presente questionamento pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 3, sem prazo", () => {
		expect(generateMessageText(reportWith([3]), "sem_prazo", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Bens Móveis

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilização de saldos entre as contas contábeis 123119905 (BENS MÓVEIS EM TRÂNSITO) e 899920202 (BENS MÓVEIS ENVIADOS), em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Detalhamento da(s) divergência(s):

Saldo da conta 1.2.3.1.1.99.05: R$\u00a02.000,00
Saldo da conta 8.9.9.9.2.02.02: CONTA NÃO LOCALIZADA NO RELATÓRIO
Diferença apurada: R$\u00a02.000,00

Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria.

Com o fito de agilizar a troca de informações entre esta Diretoria e essa UG, solicito a possibilidade de responder o presente questionamento pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("par 3, alerta", () => {
		expect(generateMessageText(reportWith([3]), "alerta", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Bens Móveis

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilização de saldos entre as contas contábeis 123119905 (BENS MÓVEIS EM TRÂNSITO) e 899920202 (BENS MÓVEIS ENVIADOS), em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Detalhamento da(s) divergência(s):

Saldo da conta 1.2.3.1.1.99.05: R$\u00a02.000,00
Saldo da conta 8.9.9.9.2.02.02: CONTA NÃO LOCALIZADA NO RELATÓRIO
Diferença apurada: R$\u00a02.000,00

Diante do exposto, esta mensagem possui caráter estritamente orientativo e de alerta. Solicitamos ao agente responsável que analise o caso em questão e promova a regularização. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("pares 1 e 2, com prazo e data", () => {
		expect(generateMessageText(reportWith([1, 2]), "com_prazo", "2026-10-21", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergências Contábeis Diversas

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos nas seguintes contas contábeis:

- 1.1.1.1.1.19.03 (CAIXA ECONÔMICA FEDERAL) e 8.1.1.1.1.01.13 (CAUÇÃO A EXECUTAR)
- 1.1.5.5.1.10.00 (MATERIAIS DE CONSUMO EM TRÂNSITO) e 8.9.9.9.2.01.02 (BENS DE ESTOQUE ENVIADOS)

Detalhamento da(s) divergência(s):

Saldo da conta 1.1.1.1.1.19.03: R$\u00a01.500,25
Saldo da conta 8.1.1.1.1.01.13: R$\u00a01.000,00
Diferença apurada: R$\u00a0500,25

Saldo da conta 1.1.5.5.1.10.00: CONTA NÃO LOCALIZADA NO RELATÓRIO
Saldo da conta 8.9.9.9.2.01.02: R$\u00a040,00
Diferença apurada: -R$\u00a040,00

Em relação às contas 8.1.1.1.1.01.13 e 1.1.1.1.1.19.03, exige-se análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e). Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo e no passivo, é obrigatório o registro de documento hábil RC com a situação LDV053. No caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na conta de controle, sem movimentação nas contas de caixa. Dessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior.

Em relação às contas de Almoxarifado/Bens Móveis, a incompatibilidade encontra-se em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise os casos em questão, promovendo a regularização imediata dos registros contábeis ou apresentando justificativa formal detalhada, reportando as providências adotadas a esta Diretoria, até o dia 21/10/2026 (4ª feira) pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("pares 1 e 3, alerta", () => {
		expect(generateMessageText(reportWith([1, 3]), "alerta", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergências Contábeis Diversas

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos nas seguintes contas contábeis:

- 1.1.1.1.1.19.03 (CAIXA ECONÔMICA FEDERAL) e 8.1.1.1.1.01.13 (CAUÇÃO A EXECUTAR)
- 1.2.3.1.1.99.05 (BENS MÓVEIS EM TRÂNSITO) e 8.9.9.9.2.02.02 (BENS MÓVEIS ENVIADOS)

Detalhamento da(s) divergência(s):

Saldo da conta 1.1.1.1.1.19.03: R$\u00a01.500,25
Saldo da conta 8.1.1.1.1.01.13: R$\u00a01.000,00
Diferença apurada: R$\u00a0500,25

Saldo da conta 1.2.3.1.1.99.05: R$\u00a02.000,00
Saldo da conta 8.9.9.9.2.02.02: CONTA NÃO LOCALIZADA NO RELATÓRIO
Diferença apurada: R$\u00a02.000,00

Em relação às contas 8.1.1.1.1.01.13 e 1.1.1.1.1.19.03, exige-se análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e). Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo e no passivo, é obrigatório o registro de documento hábil RC com a situação LDV053. No caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na conta de controle, sem movimentação nas contas de caixa. Dessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior.

Em relação às contas de Almoxarifado/Bens Móveis, a incompatibilidade encontra-se em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, emite este alerta para que o agente responsável analise os casos em questão e promova a regularização imediata dos registros contábeis. Esta mensagem possui caráter estritamente orientativo. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("pares 2 e 3, sem prazo", () => {
		expect(generateMessageText(reportWith([2, 3]), "sem_prazo", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergência de saldos - Almoxarifado e Bens Móveis

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos nas seguintes contas contábeis:

- 1.1.5.5.1.10.00 (MATERIAIS DE CONSUMO EM TRÂNSITO) e 8.9.9.9.2.01.02 (BENS DE ESTOQUE ENVIADOS)
- 1.2.3.1.1.99.05 (BENS MÓVEIS EM TRÂNSITO) e 8.9.9.9.2.02.02 (BENS MÓVEIS ENVIADOS)

Detalhamento da(s) divergência(s):

Saldo da conta 1.1.5.5.1.10.00: CONTA NÃO LOCALIZADA NO RELATÓRIO
Saldo da conta 8.9.9.9.2.01.02: R$\u00a040,00
Diferença apurada: -R$\u00a040,00

Saldo da conta 1.2.3.1.1.99.05: R$\u00a02.000,00
Saldo da conta 8.9.9.9.2.02.02: CONTA NÃO LOCALIZADA NO RELATÓRIO
Diferença apurada: R$\u00a02.000,00

Em relação às contas de Almoxarifado/Bens Móveis, a incompatibilidade encontra-se em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise os casos em questão, promovendo a regularização imediata dos registros contábeis ou apresentando justificativa formal detalhada, reportando as providências adotadas a esta Diretoria pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("pares 1, 2 e 3, com prazo sem data", () => {
		expect(generateMessageText(reportWith([1, 2, 3]), "com_prazo", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergências Contábeis Diversas

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos nas seguintes contas contábeis:

- 1.1.1.1.1.19.03 (CAIXA ECONÔMICA FEDERAL) e 8.1.1.1.1.01.13 (CAUÇÃO A EXECUTAR)
- 1.1.5.5.1.10.00 (MATERIAIS DE CONSUMO EM TRÂNSITO) e 8.9.9.9.2.01.02 (BENS DE ESTOQUE ENVIADOS)
- 1.2.3.1.1.99.05 (BENS MÓVEIS EM TRÂNSITO) e 8.9.9.9.2.02.02 (BENS MÓVEIS ENVIADOS)

Detalhamento da(s) divergência(s):

Saldo da conta 1.1.1.1.1.19.03: R$\u00a01.500,25
Saldo da conta 8.1.1.1.1.01.13: R$\u00a01.000,00
Diferença apurada: R$\u00a0500,25

Saldo da conta 1.1.5.5.1.10.00: CONTA NÃO LOCALIZADA NO RELATÓRIO
Saldo da conta 8.9.9.9.2.01.02: R$\u00a040,00
Diferença apurada: -R$\u00a040,00

Saldo da conta 1.2.3.1.1.99.05: R$\u00a02.000,00
Saldo da conta 8.9.9.9.2.02.02: CONTA NÃO LOCALIZADA NO RELATÓRIO
Diferença apurada: R$\u00a02.000,00

Em relação às contas 8.1.1.1.1.01.13 e 1.1.1.1.1.19.03, exige-se análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e). Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo e no passivo, é obrigatório o registro de documento hábil RC com a situação LDV053. No caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na conta de controle, sem movimentação nas contas de caixa. Dessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior.

Em relação às contas de Almoxarifado/Bens Móveis, a incompatibilidade encontra-se em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).

Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise os casos em questão, promovendo a regularização imediata dos registros contábeis ou apresentando justificativa formal detalhada, reportando as providências adotadas a esta Diretoria, até o dia __/__/____ (Xª feira) pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})

	it("sem pares", () => {
		expect(generateMessageText(reportWith([]), "com_prazo", "", " 45 ", "2026-10-13", "")).toBe(`Assunto: Divergências Contábeis Diversas

Mensagem n° 45/SUCONT-3/13OUT2026

Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos nas seguintes contas contábeis:

Detalhamento da(s) divergência(s):

Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise os casos em questão, promovendo a regularização imediata dos registros contábeis ou apresentando justificativa formal detalhada, reportando as providências adotadas a esta Diretoria, até o dia __/__/____ (Xª feira) pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.

Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU.

DIREF/SUCONT/SUCONT-3`)
	})
})

describe("generateMessageText: cabeçalho", () => {
	afterEach(() => {
		setSystemTime()
	})

	it("sem data usa a data de hoje", () => {
		setSystemTime(new Date(2026, 0, 5, 10, 0, 0))
		expect(lineOf(generateMessageText(reportWith([1]), "alerta", "", "7", "", ""), "Mensagem")).toBe("Mensagem n° 7/SUCONT-3/05JAN2026")
	})

	it("data que não é número também cai na data de hoje", () => {
		setSystemTime(new Date(2026, 11, 31, 10, 0, 0))
		expect(lineOf(generateMessageText(reportWith([1]), "alerta", "", "7", "abc", ""), "Mensagem")).toBe("Mensagem n° 7/SUCONT-3/31DEZ2026")
	})

	it("número vazio ou só espaços vira ___", () => {
		expect(lineOf(generateMessageText(reportWith([1]), "alerta", "", "   ", "2026-03-09", ""), "Mensagem")).toBe("Mensagem n° ___/SUCONT-3/09MAR2026")
		expect(lineOf(generateMessageText(reportWith([1]), "alerta", "", "", "2026-03-09", ""), "Mensagem")).toBe("Mensagem n° ___/SUCONT-3/09MAR2026")
	})

	it("assunto próprio entra sem aparar; só espaços volta ao padrão", () => {
		expect(lineOf(generateMessageText(reportWith([1]), "alerta", "", "1", "2026-03-09", "  Assunto X "), "Assunto")).toBe("Assunto:   Assunto X ")
		expect(lineOf(generateMessageText(reportWith([2, 3]), "alerta", "", "1", "2026-03-09", "   "), "Assunto")).toBe(
			"Assunto: Divergência de saldos - Almoxarifado e Bens Móveis"
		)
	})
})
