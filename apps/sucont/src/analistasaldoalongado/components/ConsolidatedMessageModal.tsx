import { Check, Copy, Settings2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import type { UgConsolidated } from "../utils/analytics"
import { RAC_MAPPING } from "../utils/rac"

interface ConsolidatedMessageModalProps {
	data: UgConsolidated[]
	racFilter: string
	onClose: () => void
}

const accountToRacMapping: Record<string, string> = {}
Object.entries(RAC_MAPPING).forEach(([questao, contas]) => {
	contas.forEach((conta) => {
		accountToRacMapping[conta] = questao
	})
})

const formatToMilitaryDate = (dateString: string) => {
	if (!dateString) return ""
	const date = new Date(`${dateString}T00:00:00`)
	const day = String(date.getDate()).padStart(2, "0")
	const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
	const month = months[date.getMonth()]
	const year = date.getFullYear()
	return `${day}${month}${year}`
}

const formatToBrazilianDate = (dateString: string) => {
	if (!dateString) return ""
	const date = new Date(`${dateString}T00:00:00`)
	return new Intl.DateTimeFormat("pt-BR").format(date)
}

export function ConsolidatedMessageModal({ data, racFilter, onClose }: ConsolidatedMessageModalProps) {
	const [copied, setCopied] = useState(false)
	const [messageNumber, setMessageNumber] = useState("")

	const today = new Date()
	const [messageDate, setMessageDate] = useState(today.toISOString().split("T")[0])

	type MessageType = "COM_PRAZO" | "SEM_PRAZO" | "ALERTA"
	const [messageType, setMessageType] = useState<MessageType>("COM_PRAZO")

	const defaultDeadline = new Date(today)
	defaultDeadline.setDate(today.getDate() + 5)
	const [deadlineDate, setDeadlineDate] = useState(defaultDeadline.toISOString().split("T")[0])

	const generatedMessage = useMemo(() => {
		if (!data || data.length === 0) return ""

		let occurrencesText = ""

		data.forEach((ug) => {
			const filteredOccurrences =
				racFilter && racFilter !== "Geral" ? ug.ocorrencias.filter((occ) => accountToRacMapping[occ.conta_contabil] === racFilter) : ug.ocorrencias

			if (filteredOccurrences.length > 0) {
				filteredOccurrences.forEach((occ) => {
					const formattedSaldo = new Intl.NumberFormat("pt-BR", {
						style: "decimal",
						minimumFractionDigits: 2,
						maximumFractionDigits: 2,
					}).format(occ.saldo)

					occurrencesText += `UG: ${ug.ug} - ${ug.nome_ug || ""}\n`
					occurrencesText += `Conta Contábil: ${occ.conta_contabil} - ${occ.nome_conta}\n`
					occurrencesText += `Conta Corrente: ${occ.conta_corrente}\n`
					occurrencesText += `Saldo - R$: ${formattedSaldo}\n\n`
				})
			}
		})

		const formattedMessageDate = formatToMilitaryDate(messageDate)
		const messageHeader = `Mensagem n° ${messageNumber || "___"}/SUCONT-3/${formattedMessageDate || "___"}`

		let deadlineText = ""
		if (messageType === "COM_PRAZO") {
			deadlineText = deadlineDate ? `, até o dia ${formatToBrazilianDate(deadlineDate)}` : ", no prazo estabelecido"
		}

		const subject = "ASSUNTO: Mapeamento Contábil — Contas com saldo sem movimentação superior a três meses"
		const intro =
			"Informamos que esta Setorial Contábil está realizando um mapeamento de contas contábeis que apresentam saldos sem movimentação há mais de 3 meses. Após análise de dados extraídos do Tesouro Gerencial (Base SIAFI), identificamos que as Unidades Gestoras abaixo apresentam registros nessa situação, destacando-se, quando aplicável, os respectivos contas correntes."

		let actionText = ""
		if (messageType === "ALERTA") {
			actionText = `A intenção deste acompanhamento é que as Unidades Gestoras verifiquem a situação apresentada e realizem as respectivas regularizações, caso se trate de uma inconsistência contábil.\n\nRessalta-se que, por se tratar de uma mensagem de alerta, não é necessário o envio de resposta informando as ações adotadas ou justificativas via Sistema de Atendimento ao Usuário (SAU).`
		} else {
			actionText = `A intenção deste acompanhamento é que as Unidades Gestoras verifiquem a situação apresentada. Solicitamos que sejam realizadas as respectivas regularizações, caso se trate de uma inconsistência contábil, ou que seja encaminhada a devida justificativa a esta Setorial, caso a ausência de movimentação seja regular e justificável.\n\nSolicito, ainda, que as providências adotadas ou as justificativas pertinentes sejam informadas a esta Diretoria por meio do Sistema de Atendimento ao Usuário (SAU), mediante abertura de chamado com o objeto "Resposta de Acompanhamento Contábil"${deadlineText}.`
		}

		return `${messageHeader}\n\n${subject}\n\n${intro}\n\nNesse contexto, foram identificadas as seguintes ocorrências:\n\n${occurrencesText.trim()}\n\n${actionText}\n\nPor fim, a Divisão de Acompanhamento Contábil e de Suporte ao Usuário (SUCONT-3) permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do referido sistema.\n\nAtenciosamente,\n\nDIREF\nSubdiretoria de Contabilidade – SUCONT\nDivisão de Acompanhamento Contábil e de Suporte ao Usuário – SUCONT-3`
	}, [data, racFilter, messageNumber, messageDate, messageType, deadlineDate])

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(generatedMessage)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (_err) {}
	}

	return (
		<div className="fixed inset-0 z-50 flex justify-center items-center bg-overlay/60 backdrop-blur-sm p-4 sm:p-6">
			<div className="w-full max-w-4xl h-full max-h-[90vh] bg-muted/50 rounded-xl shadow-2xl flex flex-col overflow-hidden border border-border">
				<div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-fab-100 flex items-center justify-center text-fab-700 text-heading">MSG</div>
						<div>
							<h2 className="text-heading text-foreground">Mensagem Consolidada</h2>
							<div className="flex items-center gap-2 mt-1 text-body text-muted-foreground">
								<span className="font-medium">
									Filtro: <span className="text-foreground">{racFilter}</span>
								</span>
								<span className="w-1 h-1 rounded-full bg-muted" />
								<span className="font-medium">
									UGs: <span className="text-foreground">{data.length}</span>
								</span>
							</div>
						</div>
					</div>
					<Button
						type="button"
						onClick={onClose}
						variant="ghost"
						size="icon"
						aria-label="Fechar"
						className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
					>
						<X className="w-6 h-6" />
					</Button>
				</div>

				<div className="flex-1 overflow-hidden flex flex-col md:flex-row">
					<div className="w-full md:w-[350px] flex flex-col bg-card shrink-0 border-r border-border overflow-y-auto">
						<div className="p-4 border-b border-border bg-muted/50 flex items-center gap-2">
							<Settings2 className="w-4 h-4 text-muted-foreground" />
							<h3 className="text-subheading text-foreground">Configurar Mensagem</h3>
						</div>

						<div className="p-4 space-y-4">
							<div className="space-y-1.5">
								<label htmlFor="cons-msg-number" className="text-caption text-foreground">
									Número da Mensagem
								</label>
								<Input
									id="cons-msg-number"
									type="text"
									placeholder="Ex: 123"
									className="px-3 py-1.5 text-body border-border rounded-lg focus-visible:ring-fab-500 focus-visible:border-fab-500 bg-card text-foreground"
									value={messageNumber}
									onChange={(e) => setMessageNumber(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<label htmlFor="cons-msg-date" className="text-caption text-foreground">
									Data da Mensagem
								</label>
								<Input
									id="cons-msg-date"
									type="date"
									className="px-3 py-1.5 text-body border-border rounded-lg focus-visible:ring-fab-500 focus-visible:border-fab-500 bg-card text-foreground"
									value={messageDate}
									onChange={(e) => setMessageDate(e.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<label htmlFor="cons-msg-type" className="text-caption text-foreground">
									Tipo de Mensagem
								</label>
								<Select
									items={{ COM_PRAZO: "Ação com Prazo", SEM_PRAZO: "Ação sem Prazo", ALERTA: "Apenas Alerta" }}
									value={messageType}
									onValueChange={(value) => setMessageType(value as MessageType)}
								>
									<SelectTrigger
										id="cons-msg-type"
										className="w-full px-3 py-1.5 text-body border border-border rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-card text-foreground"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="COM_PRAZO">Ação com Prazo</SelectItem>
										<SelectItem value="SEM_PRAZO">Ação sem Prazo</SelectItem>
										<SelectItem value="ALERTA">Apenas Alerta</SelectItem>
									</SelectContent>
								</Select>

								{messageType === "COM_PRAZO" && (
									<div className="pt-2">
										<label htmlFor="cons-msg-deadline" className="text-caption text-foreground mb-1.5 block">
											Data Limite
										</label>
										<Input
											id="cons-msg-deadline"
											type="date"
											className="px-3 py-1.5 text-body border-border rounded-lg focus-visible:ring-fab-500 focus-visible:border-fab-500 bg-card text-foreground"
											value={deadlineDate}
											onChange={(e) => setDeadlineDate(e.target.value)}
										/>
									</div>
								)}
							</div>

							<div className="pt-4">
								<Button
									type="button"
									onClick={handleCopy}
									className="w-full gap-2 px-4 py-2 text-subheading text-white bg-fab-600 border-transparent rounded-lg hover:bg-fab-700 transition-colors shadow-sm"
								>
									{copied ? (
										<>
											<Check className="w-4 h-4" />
											<span>Copiado!</span>
										</>
									) : (
										<>
											<Copy className="w-4 h-4" />
											<span>Copiar Mensagem</span>
										</>
									)}
								</Button>
							</div>
						</div>
					</div>

					<div className="flex-1 p-4 overflow-y-auto bg-muted/50">
						<div className="bg-card p-6 rounded-xl border border-border shadow-sm min-h-full">
							<pre className="whitespace-pre-wrap font-sans text-body text-foreground leading-relaxed">{generatedMessage}</pre>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
