import type { ParsedRow } from "./parser"

export interface UgMessage {
	ug: string
	message: string
}

export const generateMessages = (rows: ParsedRow[]): UgMessage[] => {
	if (rows.length === 0) return []

	const groupedByUg: Record<string, ParsedRow[]> = {}

	rows.forEach((row) => {
		if (!groupedByUg[row.ug]) {
			groupedByUg[row.ug] = []
		}
		groupedByUg[row.ug].push(row)
	})

	const sortedUgs = Object.keys(groupedByUg).sort((a, b) => {
		const numA = parseInt(a, 10)
		const numB = parseInt(b, 10)
		if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB
		return a.localeCompare(b)
	})

	return sortedUgs.map((ug) => {
		const occurrences = groupedByUg[ug]

		let occurrencesText = ""
		occurrences.forEach((occ) => {
			const formattedSaldo = new Intl.NumberFormat("pt-BR", {
				style: "decimal",
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			}).format(occ.saldo)

			occurrencesText += `Conta Contábil: ${occ.contaContabil}\n`
			occurrencesText += `Conta Corrente: ${occ.contaCorrente}\n`
			occurrencesText += `Saldo - R$: ${formattedSaldo}\n\n`
		})

		const message = `ASSUNTO: Mapeamento Contábil — Contas com saldo sem movimentação superior a três meses

Informamos que esta Setorial Contábil está realizando um mapeamento de contas contábeis que apresentam saldos sem movimentação há mais de 3 meses. Após análise de dados extraídos do Tesouro Gerencial (Base SIAFI), identificamos que a Unidade Gestora ${ug} apresenta registros nessa situação, destacando-se, quando aplicável, os respectivos contas correntes.

Nesse contexto, foram identificadas as seguintes ocorrências:

${occurrencesText.trim()}

A intenção deste acompanhamento é que a Unidade Gestora verifique a situação apresentada. Solicitamos que sejam realizadas as respectivas regularizações, caso se trate de uma inconsistência contábil, ou que seja encaminhada a devida justificativa a esta Setorial, caso a ausência de movimentação seja regular e justificável.

Solicito, ainda, que as providências adotadas ou as justificativas pertinentes sejam informadas a esta Diretoria por meio do Sistema de Atendimento ao Usuário (SAU), mediante abertura de chamado com o objeto "Resposta de Acompanhamento Contábil", no prazo de 05 (cinco) dias úteis.

Por fim, a Divisão de Acompanhamento Contábil e de Suporte ao Usuário (SUCONT-3) permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do referido sistema.

Atenciosamente,

DIREF
Subdiretoria de Contabilidade – SUCONT
Divisão de Acompanhamento Contábil e de Suporte ao Usuário – SUCONT-3`

		return { ug, message }
	})
}
