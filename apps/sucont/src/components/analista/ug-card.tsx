import { Copy } from "lucide-react"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
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
		<div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
			<div className="bg-muted/50 border-b border-border px-6 py-4 flex justify-between items-center">
				<div className="flex items-center gap-4">
					<div>
						<h2 className="text-lg font-semibold text-foreground">
							UG {group.ug} ({org.nome}), subordinada ao {org.orgaoSuperior} / {org.ods}
						</h2>
						<p className="text-sm text-muted-foreground">
							Conferente: {getConferente(group.ug)} | Mês de Referência: {group.mes}
						</p>
					</div>
					{isFocal && (
						<div className="hidden md:block bg-action/10 border border-action/30 px-3 py-1 rounded-lg">
							<p className="text-label text-action leading-tight">Análise Focal</p>
							<p className="text-xs font-semibold text-action">{activeRacFilter}</p>
						</div>
					)}
				</div>
				<span
					className={cn(
						"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
						type === "INCONSISTENCIA" ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
					)}
				>
					{items.length} Ocorrência(s)
				</span>
			</div>

			<div className="p-6">
				<div className="flex flex-col xl:flex-row gap-6">
					{/* Table */}
					<div className="flex-1 overflow-x-auto">
						<table className="min-w-full divide-y divide-border">
							<thead>
								<tr>
									<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Conta</th>
									<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Descrição</th>
									{type === "INCONSISTENCIA" && (
										<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Questão RAC</th>
									)}
									<th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Saldo</th>
									{type === "INCONSISTENCIA" && (
										<>
											<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Classificação</th>
											<th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Observação</th>
										</>
									)}
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{items.map((c, i) => (
									<tr key={i} className="hover:bg-muted/50">
										<td className="px-3 py-2 whitespace-nowrap text-sm font-mono text-foreground">{c.conta}</td>
										<td className="px-3 py-2 text-sm text-foreground">{c.descricao}</td>
										{type === "INCONSISTENCIA" && <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-foreground">{c.questaoRAC || "-"}</td>}
										<td className="px-3 py-2 whitespace-nowrap text-sm text-right font-medium text-foreground">{formatCurrency(c.saldo)}</td>
										{type === "INCONSISTENCIA" && (
											<>
												<td className="px-3 py-2 whitespace-nowrap text-sm">
													<span
														className={cn(
															"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
															c.classificacao === "COBRANÇA COM OBSERVAÇÃO" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
														)}
													>
														{c.classificacao}
													</span>
												</td>
												<td className="px-3 py-2 text-sm text-muted-foreground italic max-w-xs truncate" title={c.observacao}>
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
					<div className="flex-1 bg-muted/50 rounded-xl p-4 border border-border flex flex-col min-w-[300px] xl:w-1/2">
						<div className="flex justify-between items-start mb-4">
							<h3 className="text-sm font-semibold text-foreground">Mensagem Institucional Pronta</h3>
							<Button
								type="button"
								onClick={() => navigator.clipboard.writeText(fullMessage)}
								variant="outline"
								size="xs"
								className="gap-1 bg-card font-medium text-muted-foreground shadow-sm hover:text-foreground"
							>
								<Copy className="w-3 h-3" />
								<span>Copiar</span>
							</Button>
						</div>

						<div className="grid grid-cols-2 gap-3 mb-4">
							<div>
								<label htmlFor="ug-msg-number" className="block text-xs font-medium text-foreground mb-1">
									Nº da Mensagem
								</label>
								<Input
									id="ug-msg-number"
									type="text"
									value={msgNumber}
									onChange={(e) => setMsgNumber(e.target.value)}
									placeholder="Ex: 123"
									className="h-auto w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground shadow-none focus-visible:ring-ring focus:border-action dark:bg-card"
								/>
							</div>
							<div>
								<label htmlFor="ug-send-date" className="block text-xs font-medium text-foreground mb-1">
									Data de Envio
								</label>
								<Input
									id="ug-send-date"
									type="date"
									value={sendDate}
									onChange={(e) => setSendDate(e.target.value)}
									className="h-auto w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground shadow-none focus-visible:ring-ring focus:border-action dark:bg-card"
								/>
							</div>
							<div className="col-span-2">
								<label htmlFor="ug-message-type" className="block text-xs font-medium text-foreground mb-1">
									Tipo de Mensagem
								</label>
								<Select
									items={{ SEM_PRAZO: "Padrão (Sem Prazo)", COM_PRAZO: "Com Prazo de Resposta", ALERTA: "Apenas Alerta (Sem Resposta)" }}
									value={messageType}
									onValueChange={(value) => setMessageType(value as "SEM_PRAZO" | "COM_PRAZO" | "ALERTA")}
								>
									<SelectTrigger
										id="ug-message-type"
										className="w-full text-sm px-2 py-1.5 rounded border border-border bg-card text-foreground focus-visible:ring-ring focus-visible:border-action mb-2"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="SEM_PRAZO">Padrão (Sem Prazo)</SelectItem>
										<SelectItem value="COM_PRAZO">Com Prazo de Resposta</SelectItem>
										<SelectItem value="ALERTA">Apenas Alerta (Sem Resposta)</SelectItem>
									</SelectContent>
								</Select>
								{messageType === "COM_PRAZO" && (
									<div className="mt-2">
										<label htmlFor="ug-deadline-date" className="block text-xs font-medium text-foreground mb-1">
											Data Limite
										</label>
										<Input
											id="ug-deadline-date"
											type="date"
											value={deadlineDate}
											onChange={(e) => setDeadlineDate(e.target.value)}
											className="h-auto w-full rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground shadow-none focus-visible:ring-ring focus:border-action dark:bg-card"
										/>
									</div>
								)}
							</div>
						</div>

						<div className="bg-muted p-4 rounded border border-border flex-1 overflow-y-auto min-h-[350px] max-h-[600px]">
							<p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{fullMessage}</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
