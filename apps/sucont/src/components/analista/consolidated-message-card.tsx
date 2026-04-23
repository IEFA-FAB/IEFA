import { Copy } from "lucide-react"
import { useState } from "react"
import { getOrganizacao } from "#/lib/analista/organizacao"
import type { ProcessedRow } from "#/lib/analista/types"

interface ConsolidatedMessageCardProps {
	rows: ProcessedRow[]
	activeRacFilter: string
}

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

const formatMessageDate = (dateString: string) => {
	if (!dateString) return ""
	const date = new Date(`${dateString}T00:00:00`)
	const day = String(date.getDate()).padStart(2, "0")
	const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
	return `${day}${months[date.getMonth()]}${date.getFullYear()}`
}

const formatDeadlineDate = (dateString: string) => {
	if (!dateString) return ""
	const date = new Date(`${dateString}T00:00:00`)
	const day = String(date.getDate()).padStart(2, "0")
	const month = String(date.getMonth() + 1).padStart(2, "0")
	return `${day}/${month}/${date.getFullYear()}`
}

export function ConsolidatedMessageCard({ rows, activeRacFilter }: ConsolidatedMessageCardProps) {
	const [msgNumber, setMsgNumber] = useState("")
	const [sendDate, setSendDate] = useState(new Date().toISOString().split("T")[0])
	const [messageType, setMessageType] = useState<"SEM_PRAZO" | "COM_PRAZO" | "ALERTA">("SEM_PRAZO")
	const [deadlineDate, setDeadlineDate] = useState("")

	const getRacTopic = (rac: string) => {
		const topics: Record<string, string> = {
			"Questão 26": "Estoques",
			"Questão 27": "Bens Móveis",
			"Questão 28": "Bens Imóveis",
			"Questão 31": "Fornecedores e Contas a Pagar",
			"Questão 32": "Perdas Involuntárias",
			"Questão 36": "Bens a Classificar",
		}
		return topics[rac] || "Saldos Transitórios"
	}

	const items = rows.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")

	if (items.length === 0) return null

	const groupedByUg = items.reduce(
		(acc, curr) => {
			if (!acc[curr.ug]) acc[curr.ug] = []
			acc[curr.ug].push(curr)
			return acc
		},
		{} as Record<string, ProcessedRow[]>
	)

	const mesReferencia = items[0]?.mes || ""

	const listaContas = Object.entries(groupedByUg)
		.map(([ug, ugItems]) => {
			const org = getOrganizacao(ug)
			const contasStr = ugItems.map((c) => `    • ${c.conta} - ${c.descricao} (${formatCurrency(c.saldo)})`).join("\n")
			return `  UG ${ug} (${org.nome}):\n${contasStr}`
		})
		.join("\n\n")

	const introMsg =
		"Informamos que a Setorial está realizando um mapeamento contábil de contas contábeis que não devem permanecer com saldo ao final do mês, ressalvadas as exceções previstas para casos específicos, destacando, se for o caso, o conta corrente que está sem movimentação."

	const contextMsg = `No âmbito do acompanhamento de ${getRacTopic(activeRacFilter)}, identificamos que as Unidades Gestoras abaixo apresentaram, na data de ${formatDeadlineDate(sendDate)}, ocorrência nas seguintes contas:\n\n${listaContas}`

	let actionMsg = ""
	let deadlineMsg = ""

	if (messageType === "ALERTA") {
		actionMsg =
			"A intenção é alertar as unidades gestoras para que verifiquem a situação, realizando a respectiva regularização, caso seja uma inconsistência contábil. Ressalta-se que não é necessário o envio de resposta a esta mensagem com as ações realizadas ou justificativas via Sistema de Atendimento ao Usuário (SAU)."
	} else {
		actionMsg =
			"A intenção é que as unidades gestoras verifiquem a situação, realizando a respectiva regularização, caso seja uma inconsistência contábil, ou justifiquem para a Setorial, caso seja justificável aquele saldo estar sem movimentação."
		deadlineMsg =
			'Solicitamos que reportem a esta Setorial as medidas adotadas por intermédio do Sistema de Atendimento ao Usuário (SAU), mediante abertura de chamado com o objeto "Resposta de Acompanhamento Contábil"'
		if (messageType === "COM_PRAZO" && deadlineDate) {
			deadlineMsg += `, até o dia ${formatDeadlineDate(deadlineDate)}.`
		} else {
			deadlineMsg += "."
		}
	}

	const closingMsg =
		"Por fim, a Divisão de Acompanhamento Contábil e de Suporte ao Usuário (SUCONT-3) permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do referido sistema.\n\nAtenciosamente,\n\nDIREF\nSubdiretoria de Contabilidade – SUCONT\nDivisão de Acompanhamento Contábil e de Suporte ao Usuário – SUCONT-3"

	const baseParts = [introMsg, contextMsg, actionMsg]
	if (deadlineMsg) baseParts.push(deadlineMsg)
	baseParts.push(closingMsg)

	const assuntoMsg = `Assunto: Mapeamento Contábil - ${getRacTopic(activeRacFilter)} - ${mesReferencia}`
	const headerMsg = `Mensagem n° ${msgNumber || "___"}/SUCONT-3/${formatMessageDate(sendDate)}\n\n${assuntoMsg}\n\n`
	const fullMessage = headerMsg + baseParts.join("\n\n")

	return (
		<div className="bg-indigo-50 rounded-2xl shadow-sm border border-indigo-200 overflow-hidden mb-8">
			<div className="bg-indigo-100 border-b border-indigo-200 px-6 py-4 flex justify-between items-center">
				<div className="flex items-center gap-4">
					<div>
						<h2 className="text-lg font-bold text-indigo-900">Mensagem Consolidada - {activeRacFilter}</h2>
						<p className="text-sm text-indigo-700">Agrupa todas as UGs com inconsistências nesta questão</p>
					</div>
				</div>
				<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-200 text-indigo-800">
					{Object.keys(groupedByUg).length} UGs / {items.length} Ocorrência(s)
				</span>
			</div>

			<div className="p-6">
				<div className="flex flex-col xl:flex-row gap-6">
					<div className="flex-1 bg-white rounded-xl p-4 border border-slate-200 flex flex-col min-w-[300px]">
						<div className="flex justify-between items-start mb-4">
							<h3 className="text-sm font-semibold text-slate-900">Mensagem Institucional Pronta (Consolidada)</h3>
							<button
								type="button"
								onClick={() => navigator.clipboard.writeText(fullMessage)}
								className="flex items-center space-x-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm transition-colors"
							>
								<Copy className="w-3 h-3" />
								<span>Copiar</span>
							</button>
						</div>

						<div className="grid grid-cols-2 gap-3 mb-4">
							<div>
								<label htmlFor="cons-msg-number" className="block text-xs font-medium text-slate-700 mb-1">
									Nº da Mensagem
								</label>
								<input
									id="cons-msg-number"
									type="text"
									value={msgNumber}
									onChange={(e) => setMsgNumber(e.target.value)}
									placeholder="Ex: 123"
									className="w-full text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
							<div>
								<label htmlFor="cons-send-date" className="block text-xs font-medium text-slate-700 mb-1">
									Data de Envio
								</label>
								<input
									id="cons-send-date"
									type="date"
									value={sendDate}
									onChange={(e) => setSendDate(e.target.value)}
									className="w-full text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
							<div className="col-span-2">
								<label htmlFor="cons-message-type" className="block text-xs font-medium text-slate-700 mb-1">
									Tipo de Mensagem
								</label>
								<select
									id="cons-message-type"
									value={messageType}
									onChange={(e) => setMessageType(e.target.value as "SEM_PRAZO" | "COM_PRAZO" | "ALERTA")}
									className="w-full text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:ring-blue-500 focus:border-blue-500 mb-2"
								>
									<option value="SEM_PRAZO">Padrão (Sem Prazo)</option>
									<option value="COM_PRAZO">Com Prazo de Resposta</option>
									<option value="ALERTA">Apenas Alerta (Sem Resposta)</option>
								</select>
								{messageType === "COM_PRAZO" && (
									<div className="mt-2">
										<label htmlFor="cons-deadline-date" className="block text-xs font-medium text-slate-700 mb-1">
											Data Limite
										</label>
										<input
											id="cons-deadline-date"
											type="date"
											value={deadlineDate}
											onChange={(e) => setDeadlineDate(e.target.value)}
											className="w-full text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:ring-blue-500 focus:border-blue-500"
										/>
									</div>
								)}
							</div>
						</div>

						<div className="bg-slate-50 p-4 rounded border border-slate-200 flex-1 overflow-y-auto min-h-[350px] max-h-[600px]">
							<p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{fullMessage}</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
