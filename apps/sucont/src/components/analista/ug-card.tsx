import { Copy } from "lucide-react"
import { useState } from "react"
import { getConferente } from "#/lib/analista/conferentes"
import { getOrganizacao } from "#/lib/analista/organizacao"
import type { ProcessedRow } from "#/lib/analista/types"
import { cn } from "#/lib/utils"

interface UGCardProps {
	group: { ug: string; mes: string; rows: ProcessedRow[] }
	type: "INCONSISTENCIA" | "FORA_ESCOPO"
	activeRacFilter?: string
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

export function UGCard({ group, type, activeRacFilter }: UGCardProps) {
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

	const items = group.rows.filter((r) =>
		type === "INCONSISTENCIA"
			? r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO"
			: r.classificacao === "FORA DO ESCOPO PARAMETRIZADO"
	)

	if (items.length === 0) return null

	const isFocal = activeRacFilter && activeRacFilter !== "TODOS"
	const listaContas = items.map((c) => `  • ${c.conta} - ${c.descricao} (${formatCurrency(c.saldo)})`).join("\n")

	const introMsg =
		"Informamos que a Setorial está realizando um mapeamento contábil de contas contábeis que não devem permanecer com saldo ao final do mês, ressalvadas as exceções previstas para casos específicos, destacando, se for o caso, o conta corrente que está sem movimentação."

	const contextMsg = isFocal
		? `No âmbito do acompanhamento de ${getRacTopic(activeRacFilter ?? "")}, identificamos que essa Unidade Gestora apresentou, na data de ${formatDeadlineDate(sendDate)}, ocorrência nas seguintes contas:\n\n${listaContas}`
		: `Após análise do relatório extraído do Tesouro Gerencial, identificamos que essa Unidade Gestora apresentou, na data de ${formatDeadlineDate(sendDate)}, ocorrência nas seguintes contas:\n\n${listaContas}`

	let actionMsg = ""
	let deadlineMsg = ""

	if (messageType === "ALERTA") {
		actionMsg =
			"A intenção é alertar a unidade gestora para que verifique a situação, realizando a respectiva regularização, caso seja uma inconsistência contábil. Ressalta-se que não é necessário o envio de resposta a esta mensagem com as ações realizadas ou justificativas via Sistema de Atendimento ao Usuário (SAU)."
	} else {
		actionMsg =
			"A intenção é que a unidade gestora verifique a situação, realizando a respectiva regularização, caso seja uma inconsistência contábil, ou justifique para a Setorial, caso seja justificável aquele saldo estar sem movimentação."
		deadlineMsg =
			'Solicitamos que reporte a esta Setorial as medidas adotadas por intermédio do Sistema de Atendimento ao Usuário (SAU), mediante abertura de chamado com o objeto "Resposta de Acompanhamento Contábil"'
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

	const assuntoMsg = isFocal
		? `Assunto: Mapeamento Contábil - ${getRacTopic(activeRacFilter ?? "")} - ${group.mes}`
		: `Assunto: Mapeamento Contábil - Saldos Transitórios - ${group.mes}`

	const headerMsg = `Mensagem n° ${msgNumber || "___"}/SUCONT-3/${formatMessageDate(sendDate)}\n\n${assuntoMsg}\n\n`
	const fullMessage = headerMsg + baseParts.join("\n\n")

	const org = getOrganizacao(group.ug)

	return (
		<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
			<div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
				<div className="flex items-center gap-4">
					<div>
						<h2 className="text-lg font-semibold text-slate-900">
							UG {group.ug} ({org.nome}), subordinada ao {org.orgaoSuperior} / {org.ods}
						</h2>
						<p className="text-sm text-slate-500">
							Conferente: {getConferente(group.ug)} | Mês de Referência: {group.mes}
						</p>
					</div>
					{isFocal && (
						<div className="hidden md:block bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg">
							<p className="text-[10px] font-bold text-blue-700 uppercase leading-tight">Análise Focal</p>
							<p className="text-xs font-semibold text-blue-900">{activeRacFilter}</p>
						</div>
					)}
				</div>
				<span
					className={cn(
						"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
						type === "INCONSISTENCIA" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
					)}
				>
					{items.length} Ocorrência(s)
				</span>
			</div>

			<div className="p-6">
				<div className="flex flex-col xl:flex-row gap-6">
					{/* Table */}
					<div className="flex-1 overflow-x-auto">
						<table className="min-w-full divide-y divide-slate-200">
							<thead>
								<tr>
									<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Conta</th>
									<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Descrição</th>
									{type === "INCONSISTENCIA" && (
										<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Questão RAC</th>
									)}
									<th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Saldo</th>
									{type === "INCONSISTENCIA" && (
										<>
											<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Classificação</th>
											<th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Observação</th>
										</>
									)}
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-200">
								{items.map((c, i) => (
									<tr key={i} className="hover:bg-slate-50">
										<td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-slate-900">{c.conta}</td>
										<td className="px-3 py-2 text-sm text-slate-700">{c.descricao}</td>
										{type === "INCONSISTENCIA" && <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-slate-900">{c.questaoRAC || "-"}</td>}
										<td className="px-3 py-2 whitespace-nowrap text-sm text-right font-medium text-slate-900">{formatCurrency(c.saldo)}</td>
										{type === "INCONSISTENCIA" && (
											<>
												<td className="px-3 py-2 whitespace-nowrap text-sm">
													<span
														className={cn(
															"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
															c.classificacao === "COBRANÇA COM OBSERVAÇÃO" ? "bg-orange-100 text-orange-800" : "bg-red-100 text-red-800"
														)}
													>
														{c.classificacao}
													</span>
												</td>
												<td className="px-3 py-2 text-sm text-slate-600 italic max-w-xs truncate" title={c.observacao}>
													{c.observacao || "-"}
												</td>
											</>
										)}
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Message generator */}
					<div className="flex-1 bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col min-w-[300px] xl:w-1/2">
						<div className="flex justify-between items-start mb-4">
							<h3 className="text-sm font-semibold text-slate-900">Mensagem Institucional Pronta</h3>
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
								<label htmlFor="ug-msg-number" className="block text-xs font-medium text-slate-700 mb-1">
									Nº da Mensagem
								</label>
								<input
									id="ug-msg-number"
									type="text"
									value={msgNumber}
									onChange={(e) => setMsgNumber(e.target.value)}
									placeholder="Ex: 123"
									className="w-full text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
							<div>
								<label htmlFor="ug-send-date" className="block text-xs font-medium text-slate-700 mb-1">
									Data de Envio
								</label>
								<input
									id="ug-send-date"
									type="date"
									value={sendDate}
									onChange={(e) => setSendDate(e.target.value)}
									className="w-full text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:ring-blue-500 focus:border-blue-500"
								/>
							</div>
							<div className="col-span-2">
								<label htmlFor="ug-message-type" className="block text-xs font-medium text-slate-700 mb-1">
									Tipo de Mensagem
								</label>
								<select
									id="ug-message-type"
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
										<label htmlFor="ug-deadline-date" className="block text-xs font-medium text-slate-700 mb-1">
											Data Limite
										</label>
										<input
											id="ug-deadline-date"
											type="date"
											value={deadlineDate}
											onChange={(e) => setDeadlineDate(e.target.value)}
											className="w-full text-sm px-2 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:ring-blue-500 focus:border-blue-500"
										/>
									</div>
								)}
							</div>
						</div>

						<div className="bg-slate-100 p-4 rounded border border-slate-200 flex-1 overflow-y-auto min-h-[350px] max-h-[600px]">
							<p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{fullMessage}</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
