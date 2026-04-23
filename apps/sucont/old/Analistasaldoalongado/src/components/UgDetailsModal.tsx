import { ArrowUpDown, Check, Copy, Download, Info, Search, Settings2, User, X } from "lucide-react"
import type React from "react"
import { useMemo, useState } from "react"
import * as XLSX from "xlsx"
import type { UgConsolidated } from "../utils/analytics"
import { getConferente } from "../utils/conferentes"

import { RAC_MAPPING } from "../utils/rac"

interface UgDetailsModalProps {
	ugData: UgConsolidated | null
	onClose: () => void
	initialRacFilter?: string
}

const formatCurrency = (value: number) => {
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

const accountToRacMapping: Record<string, string> = {}
Object.entries(RAC_MAPPING).forEach(([questao, contas]) => {
	contas.forEach((conta) => {
		accountToRacMapping[conta] = questao
	})
})

export const UgDetailsModal: React.FC<UgDetailsModalProps> = ({ ugData, onClose, initialRacFilter }) => {
	const [copied, setCopied] = useState(false)
	const [searchTerm, setSearchTerm] = useState("")
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
	const [selectedRacFilter, setSelectedRacFilter] = useState<string>(initialRacFilter || "Geral")

	// Message configuration state
	const [messageNumber, setMessageNumber] = useState("")

	// Default to today
	const today = new Date()
	const [messageDate, setMessageDate] = useState(today.toISOString().split("T")[0])

	type MessageType = "COM_PRAZO" | "SEM_PRAZO" | "ALERTA"
	const [messageType, setMessageType] = useState<MessageType>("COM_PRAZO")

	// Default deadline: 5 days from today
	const defaultDeadline = new Date(today)
	defaultDeadline.setDate(today.getDate() + 5)
	const [deadlineDate, setDeadlineDate] = useState(defaultDeadline.toISOString().split("T")[0])

	const formatToMilitaryDate = (dateString: string) => {
		if (!dateString) return ""
		const date = new Date(`${dateString}T00:00:00`) // Ensure local timezone parsing
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

	const generatedMessage = useMemo(() => {
		if (!ugData) return ""

		let occurrencesText = ""
		const filteredOccurrences =
			selectedRacFilter && selectedRacFilter !== "Geral"
				? ugData.ocorrencias.filter((occ) => accountToRacMapping[occ.conta_contabil] === selectedRacFilter)
				: ugData.ocorrencias

		filteredOccurrences.forEach((occ) => {
			const formattedSaldo = new Intl.NumberFormat("pt-BR", {
				style: "decimal",
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			}).format(occ.saldo)

			occurrencesText += `Conta Contábil: ${occ.conta_contabil} - ${occ.nome_conta}\n`
			occurrencesText += `Conta Corrente: ${occ.conta_corrente}\n`
			occurrencesText += `Saldo - R$: ${formattedSaldo}\n\n`
		})

		const formattedMessageDate = formatToMilitaryDate(messageDate)
		const _conferente = getConferente(ugData.ug)
		const messageHeader = `Mensagem n° ${messageNumber || "___"}/SUCONT-3/${formattedMessageDate || "___"}`

		let deadlineText = ""
		if (messageType === "COM_PRAZO") {
			if (deadlineDate) {
				deadlineText = `, até o dia ${formatToBrazilianDate(deadlineDate)}`
			} else {
				deadlineText = `, no prazo estabelecido`
			}
		}

		const subject = `ASSUNTO: Mapeamento Contábil — Contas com saldo sem movimentação superior a três meses`

		const intro = `Informamos que esta Setorial Contábil está realizando um mapeamento de contas contábeis que apresentam saldos sem movimentação há mais de 3 meses. Após análise de dados extraídos do Tesouro Gerencial (Base SIAFI), identificamos que a Unidade Gestora ${ugData.ug} apresenta registros nessa situação, destacando-se, quando aplicável, os respectivos contas correntes.`

		let actionText = ""
		if (messageType === "ALERTA") {
			actionText = `A intenção deste acompanhamento é que a Unidade Gestora verifique a situação apresentada e realize as respectivas regularizações, caso se trate de uma inconsistência contábil.

Ressalta-se que, por se tratar de uma mensagem de alerta, não é necessário o envio de resposta informando as ações adotadas ou justificativas via Sistema de Atendimento ao Usuário (SAU).`
		} else {
			actionText = `A intenção deste acompanhamento é que a Unidade Gestora verifique a situação apresentada. Solicitamos que sejam realizadas as respectivas regularizações, caso se trate de uma inconsistência contábil, ou que seja encaminhada a devida justificativa a esta Setorial, caso a ausência de movimentação seja regular e justificável.

Solicito, ainda, que as providências adotadas ou as justificativas pertinentes sejam informadas a esta Diretoria por meio do Sistema de Atendimento ao Usuário (SAU), mediante abertura de chamado com o objeto “Resposta de Acompanhamento Contábil”${deadlineText}.`
		}

		return `${messageHeader}

${subject}

${intro}

Nesse contexto, foram identificadas as seguintes ocorrências:

${occurrencesText.trim()}

${actionText}

Por fim, a Divisão de Acompanhamento Contábil e de Suporte ao Usuário (SUCONT-3) permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do referido sistema.

Atenciosamente,

DIREF
Subdiretoria de Contabilidade – SUCONT
Divisão de Acompanhamento Contábil e de Suporte ao Usuário – SUCONT-3`
	}, [ugData, messageNumber, messageDate, messageType, deadlineDate, selectedRacFilter, formatToMilitaryDate, formatToBrazilianDate])

	if (!ugData) return null

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(generatedMessage)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch (_err) {}
	}

	const exportToExcel = () => {
		if (!ugData) return
		const conferente = getConferente(ugData.ug)

		const dataToExport =
			selectedRacFilter && selectedRacFilter !== "Geral"
				? ugData.ocorrencias.filter((occ) => accountToRacMapping[occ.conta_contabil] === selectedRacFilter)
				: ugData.ocorrencias

		const exportData = dataToExport.map((occ) => ({
			UG: occ.ug,
			Conferente: conferente,
			"Nome da UG": occ.nome_ug || "",
			"Conta Contábil": occ.conta_contabil,
			"Nome da Conta": occ.nome_conta || "",
			"Conta Corrente": occ.conta_corrente,
			"Saldo (R$)": occ.saldo,
			Situação: occ.status,
		}))

		const ws = XLSX.utils.json_to_sheet(exportData)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, `Ocorrencias_UG_${ugData.ug}`)
		XLSX.writeFile(wb, `ocorrencias_ug_${ugData.ug}.xlsx`)
	}

	const filteredAndSortedOcorrencias = useMemo(() => {
		let filtered = [...ugData.ocorrencias]

		// Apply RAC filter if provided and not "Geral"
		if (selectedRacFilter && selectedRacFilter !== "Geral") {
			filtered = filtered.filter((occ) => accountToRacMapping[occ.conta_contabil] === selectedRacFilter)
		}

		if (searchTerm) {
			const lowerSearch = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(occ) => occ.conta_contabil.includes(lowerSearch) || occ.nome_conta?.toLowerCase().includes(lowerSearch) || occ.conta_corrente.includes(lowerSearch)
			)
		}

		return filtered.sort((a, b) => {
			if (sortDirection === "asc") {
				return a.saldo - b.saldo
			}
			return b.saldo - a.saldo
		})
	}, [ugData.ocorrencias, searchTerm, sortDirection, selectedRacFilter])

	const toggleSort = () => {
		setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
	}

	const racQuestions = useMemo(() => {
		if (!ugData) return []
		const questions = new Set<string>()
		ugData.ocorrencias.forEach((occ) => {
			const q = accountToRacMapping[occ.conta_contabil]
			if (q) {
				questions.add(q)
			}
		})
		return Array.from(questions).sort((a, b) => {
			const numA = parseInt(a.replace(/\D/g, ""), 10)
			const numB = parseInt(b.replace(/\D/g, ""), 10)
			return numA - numB
		})
	}, [ugData])

	return (
		<div className="fixed inset-0 z-50 flex justify-center items-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6">
			<div className="w-full max-w-7xl h-full max-h-[90vh] bg-slate-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-xl bg-fab-100 flex items-center justify-center text-fab-700 font-bold text-lg">UG</div>
						<div>
							<div className="flex items-baseline gap-2">
								<h2 className="text-2xl font-bold text-slate-900">{ugData.ug}</h2>
								{ugData.nome_ug && <span className="text-sm font-medium text-slate-500">- {ugData.nome_ug}</span>}
							</div>
							<div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
								<span className="font-medium flex items-center gap-1.5">
									<User className="w-4 h-4 text-slate-400" />
									Conferente: <span className="text-slate-900">{getConferente(ugData.ug)}</span>
								</span>
								<span className="w-1 h-1 rounded-full bg-slate-300"></span>
								<span className="font-medium">
									Saldo Alongado (&gt;3 meses): <span className="text-slate-900">{formatCurrency(ugData.saldo_total)}</span>
								</span>
								<span className="w-1 h-1 rounded-full bg-slate-300"></span>
								<span className="font-medium">
									Ocorrências: <span className="text-slate-900">{ugData.quantidade_ocorrencias}</span>
								</span>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<button
							onClick={exportToExcel}
							className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
						>
							<Download className="w-4 h-4" />
							Exportar
						</button>
						<button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
							<X className="w-6 h-6" />
						</button>
					</div>
				</div>

				{/* Content - Split View */}
				<div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
					{/* Left Side - Table */}
					<div className="flex-1 flex flex-col border-r border-slate-200 bg-white overflow-hidden">
						<div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-4">
							<h3 className="text-sm font-semibold text-slate-800">Tabela Detalhada de Ocorrências</h3>
							<div className="relative w-full sm:w-64">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
								<input
									type="text"
									placeholder="Buscar conta..."
									className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-white text-slate-900"
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
								/>
							</div>
						</div>

						{racQuestions.length > 0 && (
							<div className="px-4 py-3 bg-fab-50 border-b border-fab-100 flex items-start gap-3">
								<Info className="w-5 h-5 text-fab-600 shrink-0 mt-0.5" />
								<div>
									<h4 className="text-sm font-semibold text-fab-900 mb-1">Informação para Análise (Controle Interno SUCONT-3)</h4>
									<p className="text-xs text-fab-800 mb-2">
										A Análise que está sendo feita é relativa a Saldos Alongados (sem movimentação) que correspondem às seguintes Questões do Roteiro de
										Acompanhamento Contábil (RAC):
									</p>
									<div className="flex flex-wrap gap-2">
										<button
											onClick={() => setSelectedRacFilter("Geral")}
											className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
												selectedRacFilter === "Geral" ? "bg-fab-600 text-white border-fab-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
											}`}
										>
											Todas as Questões
										</button>
										{racQuestions.map((q) => (
											<button
												key={q}
												onClick={() => setSelectedRacFilter(q)}
												className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
													selectedRacFilter === q ? "bg-fab-600 text-white border-fab-600 shadow-sm" : "bg-fab-50 text-fab-700 border-fab-200 hover:bg-fab-100"
												}`}
											>
												{q}
											</button>
										))}
									</div>
								</div>
							</div>
						)}

						<div className="flex-1 overflow-auto">
							<table className="w-full text-sm text-left text-slate-600">
								<thead className="text-xs text-slate-500 uppercase bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
									<tr>
										<th className="px-4 py-3 font-medium">Conta Contábil / Nome</th>
										<th className="px-4 py-3 font-medium">Conta Corrente</th>
										<th className="px-4 py-3 font-medium cursor-pointer hover:bg-slate-50" onClick={toggleSort}>
											<div className="flex items-center gap-1">
												Saldo (R$)
												<ArrowUpDown className="w-3.5 h-3.5" />
											</div>
										</th>
										<th className="px-4 py-3 font-medium">Situação</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{filteredAndSortedOcorrencias.map((occ, idx) => (
										<tr key={idx} className="hover:bg-slate-50 transition-colors">
											<td className="px-4 py-3 font-mono text-xs">
												{occ.conta_contabil} - {occ.nome_conta}
											</td>
											<td className="px-4 py-3 font-mono text-xs">{occ.conta_corrente}</td>
											<td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{formatCurrency(occ.saldo)}</td>
											<td className="px-4 py-3">
												<span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-fab-50 text-fab-700 border border-fab-100 whitespace-nowrap">
													{occ.status}
												</span>
											</td>
										</tr>
									))}
									{filteredAndSortedOcorrencias.length === 0 && (
										<tr>
											<td colSpan={5} className="px-4 py-8 text-center text-slate-500">
												Nenhuma conta encontrada.
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</div>

					{/* Right Side - Message */}
					<div className="w-full lg:w-[450px] flex flex-col bg-slate-50 shrink-0 border-l border-slate-200">
						<div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Settings2 className="w-4 h-4 text-slate-500" />
								<h3 className="text-sm font-semibold text-slate-800">Configurar Mensagem</h3>
							</div>
							<button
								onClick={handleCopy}
								className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-fab-600 border border-transparent rounded-lg hover:bg-fab-700 transition-colors focus:outline-none focus:ring-2 focus:ring-fab-500 focus:ring-offset-1 shadow-sm"
							>
								{copied ? (
									<>
										<Check className="w-3.5 h-3.5" />
										<span>Copiado!</span>
									</>
								) : (
									<>
										<Copy className="w-3.5 h-3.5" />
										<span>Copiar Mensagem</span>
									</>
								)}
							</button>
						</div>

						{/* Config Form */}
						<div className="p-4 border-b border-slate-200 bg-white space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-slate-700">Número da Mensagem</label>
									<input
										type="text"
										placeholder="Ex: 123"
										className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-white text-slate-900"
										value={messageNumber}
										onChange={(e) => setMessageNumber(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-xs font-medium text-slate-700">Data da Mensagem</label>
									<input
										type="date"
										className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-white text-slate-900"
										value={messageDate}
										onChange={(e) => setMessageDate(e.target.value)}
									/>
								</div>
							</div>

							<div className="space-y-2">
								<label className="text-xs font-medium text-slate-700">Tipo de Mensagem</label>
								<select
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
										<label className="text-xs font-medium text-slate-700 mb-1.5 block">Data Limite</label>
										<input
											type="date"
											className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-fab-500 focus:border-fab-500 bg-white text-slate-900"
											value={deadlineDate}
											onChange={(e) => setDeadlineDate(e.target.value)}
										/>
									</div>
								)}
							</div>
						</div>

						{/* Message Preview */}
						<div className="flex-1 p-4 overflow-y-auto bg-slate-50">
							<div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm h-full">
								<pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 leading-relaxed">{generatedMessage}</pre>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
