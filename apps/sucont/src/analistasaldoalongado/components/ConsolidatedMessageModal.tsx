import { Check, Copy, Settings2, X } from "lucide-react"
import { useMemo, useState } from "react"
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
		<div className="fixed inset-0 z-50 flex justify-center items-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6">
			<div className="w-full max-w-4xl h-full max-h-[90vh] bg-slate-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
				<div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-fab-100 flex items-center justify-center text-fab-700 font-bold text-lg">MSG</div>
						<div>
							<h2 className="text-xl font-bold text-slate-900">Mensagem Consolidada</h2>
							<div className="flex items-center gap-2 mt-1 text-sm text-slate-600">
								<span className="font-medium">
									Filtro: <span className="text-slate-900">{racFilter}</span>
								</span>
								<span className="w-1 h-1 rounded-full bg-slate-300" />
								<span className="font-medium">
									UGs: <span className="text-slate-900">{data.length}</span>
								</span>
							</div>
						</div>
					</div>
					<button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
						<X className="w-6 h-6" />
					</button>
				</div>

				<div className="flex-1 overflow-hidden flex flex-col md:flex-row">
					<div className="w-full md:w-[350px] flex flex-col bg-white shrink-0 border-r border-slate-200 overflow-y-auto">
						<div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
							<Settings2 className="w-4 h-4 text-slate-500" />
							<h3 className="text-sm font-semibold text-slate-800">Configurar Mensagem</h3>
						</div>

						<div className="p-4 space-y-4">
							<div className="space-y-1.5">
								<label htmlFor="cons-msg-number" className="text-xs font-medium text-slate-700">
									Número da Mensagem
								</label>
								<input
									id="cons-msg-number"
									type="text"
									placeholder="Ex: 123"
									className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-white text-slate-900"
									value={messageNumber}
									onChange={(e) => setMessageNumber(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<label htmlFor="cons-msg-date" className="text-xs font-medium text-slate-700">
									Data da Mensagem
								</label>
								<input
									id="cons-msg-date"
									type="date"
									className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-white text-slate-900"
									value={messageDate}
									onChange={(e) => setMessageDate(e.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<label htmlFor="cons-msg-type" className="text-xs font-medium text-slate-700">
									Tipo de Mensagem
								</label>
								<select
									id="cons-msg-type"
									className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-white text-slate-900"
									value={messageType}
									onChange={(e) => setMessageType(e.target.value as MessageType)}
								>
									<option value="COM_PRAZO">Ação com Prazo</option>
									<option value="SEM_PRAZO">Ação sem Prazo</option>
									<option value="ALERTA">Apenas Alerta</option>
								</select>

								{messageType === "COM_PRAZO" && (
									<div className="pt-2">
										<label htmlFor="cons-msg-deadline" className="text-xs font-medium text-slate-700 mb-1.5 block">
											Data Limite
										</label>
										<input
											id="cons-msg-deadline"
											type="date"
											className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-white text-slate-900"
											value={deadlineDate}
											onChange={(e) => setDeadlineDate(e.target.value)}
										/>
									</div>
								)}
							</div>

							<div className="pt-4">
								<button
									type="button"
									onClick={handleCopy}
									className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-fab-600 border border-transparent rounded-lg hover:bg-fab-700 transition-colors shadow-sm"
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
								</button>
							</div>
						</div>
					</div>

					<div className="flex-1 p-4 overflow-y-auto bg-slate-50">
						<div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm min-h-full">
							<pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 leading-relaxed">{generatedMessage}</pre>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
