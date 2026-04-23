import {
	BarChart3,
	Building2,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Copy,
	FileText,
	Filter,
	ListOrdered,
	PieChart,
	Send,
	ShieldAlert,
	Target,
	TrendingUp,
	Users,
} from "lucide-react"
import { useMemo, useState } from "react"
import type { ReportData, UGAnalysis } from "#/lib/cruzamento/analyzer"
import { CONFERENTES } from "#/lib/cruzamento/conferentes"

interface ReportProps {
	data: ReportData
}

interface MessageConfig {
	msgNum: string
	msgDate: string
	messageType: "COM_PRAZO" | "SEM_PRAZO" | "ALERTA"
	deadlineDate: string
}

const formatFABDate = (dateString: string) => {
	if (!dateString) return "___"
	try {
		const [y, m, d] = dateString.split("-")
		const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
		return `${d}${months[parseInt(m, 10) - 1]}${y}`
	} catch {
		return dateString
	}
}

const formatNormalDate = (dateString: string) => {
	if (!dateString) return "___"
	try {
		const [y, m, d] = dateString.split("-")
		return `${d}/${m}/${y}`
	} catch {
		return dateString
	}
}

export function Report({ data }: ReportProps) {
	const { stats, ranking } = data
	const [expandedUg, setExpandedUg] = useState<string | null>(null)
	const [copiedUg, setCopiedUg] = useState<string | null>(null)
	const [messageConfigs, setMessageConfigs] = useState<Record<string, MessageConfig>>({})
	const [selectedConferente, setSelectedConferente] = useState<string>("ALL")
	const [selectedLevel, setSelectedLevel] = useState<"ESTRATEGICO" | "TATICO" | "OPERACIONAL">("ESTRATEGICO")

	const today = new Date().toISOString().split("T")[0]
	const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

	const [consolidatedConfig, setConsolidatedConfig] = useState<MessageConfig>({
		msgNum: "",
		msgDate: today,
		messageType: "SEM_PRAZO",
		deadlineDate: nextWeek,
	})
	const [showConsolidated, setShowConsolidated] = useState(false)
	const [copiedConsolidated, setCopiedConsolidated] = useState(false)

	const getConfig = (ug: string): MessageConfig => {
		return (
			messageConfigs[ug] || {
				msgNum: "",
				msgDate: today,
				messageType: "SEM_PRAZO",
				deadlineDate: nextWeek,
			}
		)
	}

	const updateConfig = (ug: string, updates: Partial<MessageConfig>) => {
		setMessageConfigs((prev) => ({
			...prev,
			[ug]: { ...getConfig(ug), ...updates },
		}))
	}

	const formatCurrency = (value: number | null) => {
		if (value === null) return "-"
		return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
	}

	const statusColor = (status: string) => {
		switch (status) {
			case "REGULAR":
				return "text-emerald-600 bg-emerald-50 border-emerald-200"
			case "ATENÇÃO":
				return "text-amber-600 bg-amber-50 border-amber-200"
			case "CRÍTICA":
				return "text-red-600 bg-red-50 border-red-200"
			default:
				return "text-slate-600 bg-slate-50 border-slate-200"
		}
	}

	const detailStatusColor = (status: string) => {
		switch (status) {
			case "REGULAR":
				return "text-emerald-600 bg-emerald-50 border-emerald-200"
			case "AUSÊNCIA NA 897110300":
				return "text-amber-600 bg-amber-50 border-amber-200"
			case "AUSÊNCIA NA 897210300":
				return "text-orange-600 bg-orange-50 border-orange-200"
			case "UG INDEVIDA NA 897210300":
				return "text-purple-600 bg-purple-50 border-purple-200"
			case "DIVERGÊNCIA DE SALDO":
				return "text-red-600 bg-red-50 border-red-200"
			default:
				return "text-slate-600 bg-slate-50 border-slate-200"
		}
	}

	const toggleUg = (ug: string) => {
		setExpandedUg(expandedUg === ug ? null : ug)
	}

	const generateMessage = (ug: UGAnalysis) => {
		const config = getConfig(ug.ug)

		let acoesRequeridas =
			"Solicitamos a análise tempestiva das contas correntes supracitadas e a adoção das medidas saneadoras no SIAFI, em conformidade com as normas contábeis vigentes."

		if (config.messageType === "COM_PRAZO") {
			acoesRequeridas += `\n\nO prazo para regularização ou apresentação de justificativa é até o dia ${formatNormalDate(config.deadlineDate)}.`
		} else if (config.messageType === "ALERTA") {
			acoesRequeridas =
				"A presente mensagem possui caráter de ALERTA. Solicitamos a análise das contas correntes supracitadas e a adoção das medidas saneadoras no SIAFI. Ressalta-se que não é necessário o envio de resposta informando as ações realizadas ou justificativa para a permanência do saldo via Sistema de Atendimento ao Usuário (SAU), devendo este canal ser utilizado apenas em caso de dúvidas."
		}

		return `Mensagem nº ${config.msgNum || "___"}/SUCONT-3/${formatFABDate(config.msgDate)}

PARA: ${ug.ugName} (${ug.ug})
ASSUNTO: Regularização de Inconsistências - Contas de Cobrança (Q43)

Prezado(a) Gestor(a),

A SUCONT-3, no uso de suas atribuições de Acompanhamento Contábil, identificou inconsistências no espelhamento entre as contas 897210300 (Em Cobrança) e 897110300 (A Receber) vinculadas a esta Unidade Gestora.

RESUMO DA INCONSISTÊNCIA:
• Quantidade de registros: ${ug.inconsistenciesCount}
• Impacto Financeiro Total: ${formatCurrency(ug.financialImpact)}

DETALHAMENTO DAS CONTAS CORRENTES:
${ug.details.map((d) => `- CC ${d.contaCorrente}: ${d.status} (Diferença: ${formatCurrency(d.diferenca)})`).join("\n")}

CAUSAS PROVÁVEIS:
${ug.diagnosis.map((d) => `- ${d}`).join("\n")}

AÇÕES REQUERIDAS:
${acoesRequeridas}

Atenciosamente,

SUCONT-3 • DIREF • COMAER`
	}

	const generateConsolidatedMessage = () => {
		let acoesRequeridas =
			"Solicitamos a análise tempestiva das contas correntes supracitadas e a adoção das medidas saneadoras no SIAFI, em conformidade com as normas contábeis vigentes."

		if (consolidatedConfig.messageType === "COM_PRAZO") {
			acoesRequeridas += `\n\nO prazo para regularização ou apresentação de justificativa é até o dia ${formatNormalDate(consolidatedConfig.deadlineDate)}.`
		} else if (consolidatedConfig.messageType === "ALERTA") {
			acoesRequeridas =
				"A presente mensagem possui caráter de ALERTA. Solicitamos a análise das contas correntes supracitadas e a adoção das medidas saneadoras no SIAFI. Ressalta-se que não é necessário o envio de resposta informando as ações realizadas ou justificativa para a permanência do saldo via Sistema de Atendimento ao Usuário (SAU), devendo este canal ser utilizado apenas em caso de dúvidas."
		}

		const ugsListText = filteredUgs
			.map((ug) => {
				const detailsText = ug.details.map((d) => `  - CC ${d.contaCorrente}: ${d.status} (Diferença: ${formatCurrency(d.diferenca)})`).join("\n")
				return `UG: ${ug.ug} - ${ug.ugName || "Desconhecida"}\n${detailsText}`
			})
			.join("\n\n")

		return `Mensagem nº ${consolidatedConfig.msgNum || "___"}/SUCONT-3/${formatFABDate(consolidatedConfig.msgDate)}

PARA: Unidades Gestoras listadas abaixo
ASSUNTO: Regularização de Inconsistências - Contas de Cobrança (Q43)

Prezados Gestores,

A SUCONT-3, no uso de suas atribuições de Acompanhamento Contábil, identificou inconsistências no espelhamento entre as contas 897210300 (Em Cobrança) e 897110300 (A Receber) vinculadas às seguintes Unidades Gestoras:

RELAÇÃO DE INCONSISTÊNCIAS POR UG:

${ugsListText}

AÇÕES REQUERIDAS:
${acoesRequeridas}

Atenciosamente,

SUCONT-3 • DIREF • COMAER`
	}

	const handleCopyMessage = (e: React.MouseEvent, ug: UGAnalysis) => {
		e.stopPropagation()
		navigator.clipboard.writeText(generateMessage(ug))
		setCopiedUg(ug.ug)
		setTimeout(() => setCopiedUg(null), 2000)
	}

	const ugsComInconsistencias = ranking.filter((ug) => ug.status !== "REGULAR")

	const filteredUgs = useMemo(() => {
		if (selectedConferente === "ALL") return ugsComInconsistencias
		return ugsComInconsistencias.filter((ug) => ug.conferente === selectedConferente)
	}, [ugsComInconsistencias, selectedConferente])

	const percentualInconsistentes = ((ugsComInconsistencias.length / ranking.length) * 100).toFixed(1)
	const riscoSistemico = Number(percentualInconsistentes) > 30 ? "ALTO" : Number(percentualInconsistentes) > 10 ? "MÉDIO" : "BAIXO"

	const agrupamentoConferentes = useMemo(() => {
		const grupos: Record<string, { ugs: string[]; count: number }> = {}
		ugsComInconsistencias.forEach((ug) => {
			if (!grupos[ug.conferente]) {
				grupos[ug.conferente] = { ugs: [], count: 0 }
			}
			grupos[ug.conferente].ugs.push(ug.ug)
			grupos[ug.conferente].count++
		})
		return Object.entries(grupos).sort((a, b) => b[1].count - a[1].count)
	}, [ugsComInconsistencias])

	const rankingODS = useMemo(() => {
		const grupos: Record<string, { count: number; financialImpact: number }> = {}
		ugsComInconsistencias.forEach((ug) => {
			const ods = ug.ods && ug.ods !== "-" ? ug.ods : "OUTROS"
			if (!grupos[ods]) {
				grupos[ods] = { count: 0, financialImpact: 0 }
			}
			grupos[ods].count++
			grupos[ods].financialImpact += ug.financialImpact
		})
		return Object.entries(grupos)
			.map(([ods, dados]) => ({
				ods,
				...dados,
				percentage: (dados.count / ugsComInconsistencias.length) * 100,
			}))
			.sort((a, b) => b.count - a.count)
	}, [ugsComInconsistencias])

	const rankingOrgaoSuperior = useMemo(() => {
		const grupos: Record<string, { count: number; financialImpact: number }> = {}
		ugsComInconsistencias.forEach((ug) => {
			const orgao = ug.orgaoSuperior && ug.orgaoSuperior !== "-" ? ug.orgaoSuperior : "OUTROS"
			if (!grupos[orgao]) {
				grupos[orgao] = { count: 0, financialImpact: 0 }
			}
			grupos[orgao].count++
			grupos[orgao].financialImpact += ug.financialImpact
		})
		return Object.entries(grupos)
			.map(([orgao, dados]) => ({
				orgao,
				...dados,
				percentage: (dados.count / ugsComInconsistencias.length) * 100,
			}))
			.sort((a, b) => b.count - a.count)
	}, [ugsComInconsistencias])

	return (
		<div className="w-full space-y-8 pb-12">
			{/* INFORMAÇÃO DO ROTEIRO DE ACOMPANHAMENTO */}
			<div className="bg-blue-50 border-l-4 border-[#0033A0] p-5 rounded-r-xl shadow-sm text-left flex items-start gap-4">
				<FileText className="w-6 h-6 text-[#0033A0] shrink-0 mt-0.5" />
				<div>
					<h3 className="text-xs font-bold text-[#0033A0] uppercase tracking-wider mb-2">Roteiro de Acompanhamento Contábil (SUCONT-3)</h3>
					<p className="text-sm text-blue-900 font-medium leading-relaxed">
						<span className="font-bold">Questão 43</span> - Os saldos da conta EM COBRANÇA - A RECEBER (8.9.7.1.1.03.00), registrados na UG, são compatíveis com
						os saldos registrados na conta EM COBRANÇA (8.9.7.2.1.03.00) registrados na SDPP-País?
					</p>
					<p className="text-xs text-blue-800 mt-2 opacity-80 italic">
						* O objetivo desta verificação é orientar a unidade gestora, promover a regularização contábil e preservar a qualidade das demonstrações do COMAER.
					</p>
				</div>
			</div>

			{/* SELETOR DE NÍVEL */}
			<div className="flex p-1 bg-slate-200/50 rounded-2xl w-full max-w-2xl mx-auto border border-slate-200">
				{(
					[
						{ id: "ESTRATEGICO", label: "Nível Estratégico", Icon: Target },
						{ id: "TATICO", label: "Nível Tático", Icon: TrendingUp },
						{ id: "OPERACIONAL", label: "Nível Operacional", Icon: FileText },
					] as const
				).map(({ id, label, Icon }) => (
					<button
						key={id}
						type="button"
						onClick={() => setSelectedLevel(id)}
						className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
							selectedLevel === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
						}`}
					>
						<Icon className="w-4 h-4" />
						{label}
					</button>
				))}
			</div>

			{/* PAINEL ESTRATÉGICO */}
			{selectedLevel === "ESTRATEGICO" && (
				<section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
						<h2 className="text-lg font-bold text-white flex items-center gap-2">
							<Target className="w-5 h-5 text-amber-400" />
							Painel Estratégico de Acompanhamento Contábil
						</h2>
					</div>

					<div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
						<div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
							<div className="flex items-center gap-2 mb-3">
								<div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
									<FileText className="w-4 h-4 text-blue-700" />
								</div>
								<h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Nível Operacional</h3>
							</div>
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-sm text-slate-600">Total de UGs Analisadas</span>
									<span className="font-bold text-slate-900">{ranking.length}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-slate-600">UGs com Inconsistências</span>
									<span className="font-bold text-amber-600">{ugsComInconsistencias.length}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-slate-600">UGs Regulares</span>
									<span className="font-bold text-emerald-600">{ranking.length - ugsComInconsistencias.length}</span>
								</div>
							</div>
						</div>

						<div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
							<div className="flex items-center gap-2 mb-3">
								<div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
									<TrendingUp className="w-4 h-4 text-amber-700" />
								</div>
								<h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Nível Tático</h3>
							</div>
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-sm text-slate-600">Taxa de Inconsistência</span>
									<span className="font-bold text-slate-900">{percentualInconsistentes}%</span>
								</div>
								<div className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
									<div className="font-semibold mb-1">Top 3 ODS com Inconsistências:</div>
									{rankingODS.slice(0, 3).map((ods, idx) => (
										<div key={ods.ods} className="flex justify-between items-center mt-1">
											<span>
												{idx + 1}º {ods.ods}
											</span>
											<span className="font-bold">{ods.count} UGs</span>
										</div>
									))}
								</div>
							</div>
						</div>

						<div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
							<div className="flex items-center gap-2 mb-3">
								<div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
									<ShieldAlert className="w-4 h-4 text-red-700" />
								</div>
								<h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Nível Estratégico</h3>
							</div>
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-sm text-slate-600">Risco Contábil Sistêmico</span>
									<span
										className={`font-bold px-2 py-0.5 rounded text-xs ${
											riscoSistemico === "ALTO"
												? "bg-red-100 text-red-800"
												: riscoSistemico === "MÉDIO"
													? "bg-amber-100 text-amber-800"
													: "bg-emerald-100 text-emerald-800"
										}`}
									>
										{riscoSistemico}
									</span>
								</div>
								<div className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">
									<div className="font-semibold mb-1">Concentração de Risco por ODS:</div>
									{rankingODS.slice(0, 3).map((ods) => (
										<div key={ods.ods} className="flex justify-between items-center mt-1">
											<span>{ods.ods}</span>
											<span className="font-bold">{ods.percentage.toFixed(1)}%</span>
										</div>
									))}
								</div>
							</div>
						</div>
					</div>

					<div className="px-6 pb-6">
						<div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
							<ShieldAlert className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
							<div>
								<h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider mb-1">Síntese para Chefia</h3>
								<p className="text-sm text-blue-800 leading-relaxed">{stats.synthesis}</p>
							</div>
						</div>
					</div>
				</section>
			)}

			{/* DISTRIBUIÇÃO DE INCONSISTÊNCIAS */}
			{(selectedLevel === "ESTRATEGICO" || selectedLevel === "TATICO") && ugsComInconsistencias.length > 0 && (
				<section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="bg-slate-900 px-6 py-4">
						<h2 className="text-lg font-bold text-white flex items-center gap-2">
							<PieChart className="w-5 h-5 text-blue-400" />
							Distribuição de Inconsistências
						</h2>
					</div>
					<div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
						<div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
							<h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-200 pb-2">
								<Building2 className="w-4 h-4 text-blue-600" />
								Ranking por ODS
							</h3>
							<div className="space-y-3">
								{rankingODS.map((ods, idx) => (
									<div key={ods.ods} className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<span className="text-xs font-bold text-slate-500 w-4">{idx + 1}º</span>
											<span className="text-sm font-medium text-slate-700">{ods.ods}</span>
										</div>
										<div className="flex items-center gap-4">
											<span className="text-xs text-slate-500">{ods.percentage.toFixed(1)}%</span>
											<span className="text-sm font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{ods.count} UGs</span>
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
							<h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-200 pb-2">
								<Building2 className="w-4 h-4 text-blue-600" />
								Ranking por Órgão Superior
							</h3>
							<div className="space-y-3">
								{rankingOrgaoSuperior.map((orgao, idx) => (
									<div key={orgao.orgao} className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<span className="text-xs font-bold text-slate-500 w-4">{idx + 1}º</span>
											<span className="text-sm font-medium text-slate-700">{orgao.orgao}</span>
										</div>
										<div className="flex items-center gap-4">
											<span className="text-xs text-slate-500">{orgao.percentage.toFixed(1)}%</span>
											<span className="text-sm font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{orgao.count} UGs</span>
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				</section>
			)}

			{/* SAÍDA GERENCIAL POR CONFERENTE */}
			{selectedLevel === "TATICO" && agrupamentoConferentes.length > 0 && (
				<section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="bg-slate-900 px-6 py-4">
						<h2 className="text-lg font-bold text-white flex items-center gap-2">
							<Users className="w-5 h-5 text-blue-400" />
							Saída Gerencial por Conferente
						</h2>
					</div>
					<div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{agrupamentoConferentes.map(([conferente, dados]) => (
							<div key={conferente} className="bg-slate-50 border border-slate-200 rounded-xl p-5">
								<div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
									<h3 className="font-bold text-slate-800 flex items-center gap-2">
										<Users className="w-4 h-4 text-blue-600" />
										{conferente}
									</h3>
									<span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-full">{dados.count} UGs</span>
								</div>
								<div className="flex flex-wrap gap-2">
									{dados.ugs.map((ug) => (
										<span key={ug} className="font-mono text-xs bg-white border border-slate-200 text-slate-700 px-2 py-1 rounded shadow-sm">
											{ug}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				</section>
			)}

			{/* RANKING DE PRIORIDADE */}
			{selectedLevel === "OPERACIONAL" && (
				<section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
						<h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
							<ListOrdered className="w-5 h-5 text-blue-600" />
							RANKING DE PRIORIDADE
						</h2>
						<div className="flex items-center gap-2">
							<Filter className="w-4 h-4 text-slate-400" />
							<select
								value={selectedConferente}
								onChange={(e) => setSelectedConferente(e.target.value)}
								className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 font-medium"
							>
								<option value="ALL">Modo Geral (Todos os Conferentes)</option>
								{CONFERENTES.map((conf) => (
									<option key={conf} value={conf}>
										Modo por Conferente: {conf}
									</option>
								))}
								<option value="NÃO ATRIBUÍDO">Não Atribuído</option>
							</select>
						</div>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full text-sm text-left">
							<thead className="text-xs text-slate-600 uppercase bg-slate-50 border-b border-slate-200">
								<tr>
									<th className="px-6 py-3 font-semibold w-16 text-center">Ranking</th>
									<th className="px-6 py-3 font-semibold">UG</th>
									<th className="px-6 py-3 font-semibold">Conferente</th>
									<th className="px-6 py-3 font-semibold">Status</th>
									<th className="px-6 py-3 font-semibold text-right">Impacto Financeiro</th>
									<th className="px-6 py-3 font-semibold text-center">Qtde Inconsistências</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{filteredUgs.map((ug, idx) => (
									<tr key={ug.ug} className="hover:bg-slate-50/50 transition-colors">
										<td className="px-6 py-3 text-center">
											<span
												className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
													idx < 3 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
												}`}
											>
												{idx + 1}
											</span>
										</td>
										<td className="px-6 py-3">
											<div className="font-mono font-medium text-slate-800">{ug.ug}</div>
											{ug.ugName && ug.ugName !== "Desconhecida" && <div className="text-xs text-slate-500 mt-0.5">{ug.ugName}</div>}
										</td>
										<td className="px-6 py-3">
											<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide bg-slate-100 text-slate-700 border border-slate-200">
												<Users className="w-3 h-3" />
												{ug.conferente}
											</span>
										</td>
										<td className="px-6 py-3">
											<span className={`px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide border ${statusColor(ug.status)}`}>{ug.status}</span>
										</td>
										<td className="px-6 py-3 text-right font-mono font-bold text-slate-700">{formatCurrency(ug.financialImpact)}</td>
										<td className="px-6 py-3 text-center font-medium text-slate-600">{ug.inconsistenciesCount}</td>
									</tr>
								))}
								{filteredUgs.length === 0 && (
									<tr>
										<td colSpan={6} className="px-6 py-8 text-center text-slate-500">
											Nenhuma inconsistência encontrada para o filtro selecionado.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</section>
			)}

			{/* MENSAGEM CONSOLIDADA */}
			{selectedLevel === "OPERACIONAL" && filteredUgs.length > 0 && (
				<div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
						<button
							type="button"
							onClick={() => setShowConsolidated(!showConsolidated)}
							className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-100"
						>
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
									<Send className="w-5 h-5 text-blue-700" />
								</div>
								<div className="text-left">
									<h3 className="font-bold text-slate-800">Mensagem Consolidada</h3>
									<p className="text-xs text-slate-500">Gerar uma única mensagem para todas as {filteredUgs.length} UGs listadas</p>
								</div>
							</div>
							{showConsolidated ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
						</button>

						{showConsolidated && (
							<div className="p-6 bg-slate-50/50 space-y-6">
								<div className="flex items-center justify-between mb-3">
									<h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
										<Send className="w-4 h-4 text-blue-600" />
										Proposta de Mensagem Consolidada
									</h3>
									<button
										type="button"
										onClick={() => {
											navigator.clipboard.writeText(generateConsolidatedMessage())
											setCopiedConsolidated(true)
											setTimeout(() => setCopiedConsolidated(false), 2000)
										}}
										className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-md transition-all shadow-sm"
									>
										{copiedConsolidated ? (
											<>
												<Check className="w-3.5 h-3.5 text-emerald-600" />
												<span className="text-emerald-600">Copiado!</span>
											</>
										) : (
											<>
												<Copy className="w-3.5 h-3.5" />
												Copiar Mensagem
											</>
										)}
									</button>
								</div>

								<div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap gap-4 items-end">
									<div className="flex flex-col gap-1.5">
										<label htmlFor="cons-report-msg-num" className="text-xs font-semibold text-slate-600 uppercase">
											Nº da Mensagem
										</label>
										<input
											id="cons-report-msg-num"
											type="text"
											value={consolidatedConfig.msgNum}
											onChange={(e) => setConsolidatedConfig({ ...consolidatedConfig, msgNum: e.target.value })}
											className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-24 focus:outline-none focus:ring-2 focus:ring-[#0033A0]"
											placeholder="___"
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<label htmlFor="cons-report-msg-date" className="text-xs font-semibold text-slate-600 uppercase">
											Data da Mensagem
										</label>
										<input
											id="cons-report-msg-date"
											type="date"
											value={consolidatedConfig.msgDate}
											onChange={(e) => setConsolidatedConfig({ ...consolidatedConfig, msgDate: e.target.value })}
											className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0033A0]"
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<label htmlFor="cons-report-msg-type" className="text-xs font-semibold text-slate-600 uppercase">
											Tipo de Mensagem
										</label>
										<select
											id="cons-report-msg-type"
											value={consolidatedConfig.messageType}
											onChange={(e) =>
												setConsolidatedConfig({
													...consolidatedConfig,
													messageType: e.target.value as MessageConfig["messageType"],
												})
											}
											className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0033A0]"
										>
											<option value="SEM_PRAZO">Padrão (Sem Prazo)</option>
											<option value="COM_PRAZO">Com Prazo</option>
											<option value="ALERTA">Alerta (Sem Resposta)</option>
										</select>
									</div>
									{consolidatedConfig.messageType === "COM_PRAZO" && (
										<div className="flex flex-col gap-1.5 ml-2">
											<label htmlFor="cons-report-deadline" className="text-xs font-semibold text-slate-600 uppercase">
												Data do Prazo
											</label>
											<input
												id="cons-report-deadline"
												type="date"
												value={consolidatedConfig.deadlineDate}
												onChange={(e) =>
													setConsolidatedConfig({
														...consolidatedConfig,
														deadlineDate: e.target.value,
													})
												}
												className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0033A0]"
											/>
										</div>
									)}
								</div>

								<div className="bg-white border border-slate-200 p-5 rounded-xl shadow-inner max-h-96 overflow-y-auto">
									<pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{generateConsolidatedMessage()}</pre>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* DASHBOARD POR UG */}
			{selectedLevel === "OPERACIONAL" && (
				<div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
					<h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 px-2">
						<FileText className="w-6 h-6 text-blue-600" />
						DASHBOARD POR UG
					</h2>

					{filteredUgs.length === 0 ? (
						<div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
							<CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
							<h3 className="text-lg font-bold text-slate-800 mb-1">Nenhuma inconsistência encontrada</h3>
							<p className="text-slate-600">Todas as UGs analisadas estão regulares para o filtro selecionado.</p>
						</div>
					) : (
						filteredUgs.map((ug) => (
							<div key={ug.ug} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
								<button
									type="button"
									onClick={() => toggleUg(ug.ug)}
									className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
								>
									<div className="flex items-center gap-6">
										<div className="flex items-center gap-4">
											<div
												className={`w-2 h-14 rounded-full shrink-0 ${
													ug.status === "CRÍTICA" ? "bg-red-500" : ug.status === "ATENÇÃO" ? "bg-amber-500" : "bg-emerald-500"
												}`}
											/>
											<div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 hidden sm:flex items-center justify-center shrink-0">
												<Building2 className="w-6 h-6 text-slate-500" />
											</div>
											<div className="text-left">
												<div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
													UG {ug.ug} — Conferente: <span className="font-bold text-blue-700">{ug.conferente}</span>
												</div>
												<div className="font-mono text-lg font-bold text-slate-800">
													{ug.ugName && ug.ugName !== "Desconhecida" ? ug.ugName : `UG ${ug.ug}`}
												</div>
												{ug.orgaoSuperior && ug.orgaoSuperior !== "-" && (
													<div className="text-xs text-slate-400 mt-0.5">
														{ug.orgaoSuperior} • {ug.ods}
													</div>
												)}
											</div>
										</div>
										<span className={`px-3 py-1 rounded-md text-xs font-bold tracking-wide border ${statusColor(ug.status)}`}>{ug.status}</span>
									</div>

									<div className="flex items-center gap-8">
										<div className="text-right hidden sm:block">
											<div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Inconsistências</div>
											<div className="font-medium text-slate-800">{ug.inconsistenciesCount}</div>
										</div>
										<div className="text-right hidden sm:block">
											<div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Impacto Financeiro</div>
											<div className="font-mono font-bold text-slate-800">{formatCurrency(ug.financialImpact)}</div>
										</div>
										{expandedUg === ug.ug ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
									</div>
								</button>

								{expandedUg === ug.ug && (
									<div className="border-t border-slate-100 bg-slate-50/50 p-6 space-y-6">
										<div>
											<h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
												<BarChart3 className="w-4 h-4 text-slate-500" />
												Detalhamento
											</h3>
											<div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
												<table className="w-full text-sm text-left">
													<thead className="text-xs text-slate-600 uppercase bg-slate-50 border-b border-slate-200">
														<tr>
															<th className="px-4 py-2 font-semibold">Conta Corrente</th>
															<th className="px-4 py-2 font-semibold">Tipo</th>
															<th className="px-4 py-2 font-semibold text-right">Saldo 897210300</th>
															<th className="px-4 py-2 font-semibold text-right">Saldo 897110300</th>
															<th className="px-4 py-2 font-semibold text-right">Diferença</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-slate-100">
														{ug.details.map((row, idx) => (
															<tr key={idx} className="hover:bg-slate-50/50">
																<td className="px-4 py-2 font-mono text-slate-700">{row.contaCorrente}</td>
																<td className="px-4 py-2">
																	<span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border ${detailStatusColor(row.status)}`}>
																		{row.status}
																	</span>
																</td>
																<td className="px-4 py-2 text-right font-mono text-slate-600">{formatCurrency(row.saldo8972)}</td>
																<td className="px-4 py-2 text-right font-mono text-slate-600">{formatCurrency(row.saldo8971)}</td>
																<td className="px-4 py-2 text-right font-mono font-medium text-slate-800">{formatCurrency(row.diferenca)}</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										</div>

										{ug.status !== "REGULAR" && (
											<div className="mt-8">
												<div className="flex items-center justify-between mb-3">
													<h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
														<Send className="w-4 h-4 text-blue-600" />
														Proposta de Mensagem de Cobrança
													</h3>
													<button
														type="button"
														onClick={(e) => handleCopyMessage(e, ug)}
														className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-md transition-all shadow-sm"
													>
														{copiedUg === ug.ug ? (
															<>
																<Check className="w-3.5 h-3.5 text-emerald-600" />
																<span className="text-emerald-600">Copiado!</span>
															</>
														) : (
															<>
																<Copy className="w-3.5 h-3.5" />
																Copiar Mensagem
															</>
														)}
													</button>
												</div>

												<div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap gap-4 items-end">
													<div className="flex flex-col gap-1.5">
														<label htmlFor={`ug-report-msg-num-${ug.ug}`} className="text-xs font-semibold text-slate-600 uppercase">
															Nº da Mensagem
														</label>
														<input
															id={`ug-report-msg-num-${ug.ug}`}
															type="text"
															value={getConfig(ug.ug).msgNum}
															onChange={(e) => updateConfig(ug.ug, { msgNum: e.target.value })}
															className="px-3 py-1.5 border border-slate-300 rounded-md text-sm w-24 focus:outline-none focus:ring-2 focus:ring-[#0033A0]"
															placeholder="___"
														/>
													</div>
													<div className="flex flex-col gap-1.5">
														<label htmlFor={`ug-report-msg-date-${ug.ug}`} className="text-xs font-semibold text-slate-600 uppercase">
															Data da Mensagem
														</label>
														<input
															id={`ug-report-msg-date-${ug.ug}`}
															type="date"
															value={getConfig(ug.ug).msgDate}
															onChange={(e) => updateConfig(ug.ug, { msgDate: e.target.value })}
															className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0033A0]"
														/>
													</div>
													<div className="flex flex-col gap-1.5">
														<label htmlFor={`ug-report-msg-type-${ug.ug}`} className="text-xs font-semibold text-slate-600 uppercase">
															Tipo de Mensagem
														</label>
														<select
															id={`ug-report-msg-type-${ug.ug}`}
															value={getConfig(ug.ug).messageType}
															onChange={(e) =>
																updateConfig(ug.ug, {
																	messageType: e.target.value as MessageConfig["messageType"],
																})
															}
															className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0033A0]"
														>
															<option value="SEM_PRAZO">Padrão (Sem Prazo)</option>
															<option value="COM_PRAZO">Com Prazo</option>
															<option value="ALERTA">Alerta (Sem Resposta)</option>
														</select>
													</div>
													{getConfig(ug.ug).messageType === "COM_PRAZO" && (
														<div className="flex flex-col gap-1.5 ml-2">
															<label htmlFor={`ug-report-deadline-${ug.ug}`} className="text-xs font-semibold text-slate-600 uppercase">
																Data do Prazo
															</label>
															<input
																id={`ug-report-deadline-${ug.ug}`}
																type="date"
																value={getConfig(ug.ug).deadlineDate}
																onChange={(e) => updateConfig(ug.ug, { deadlineDate: e.target.value })}
																className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0033A0]"
															/>
														</div>
													)}
												</div>

												<div className="bg-white border border-slate-200 p-5 rounded-xl shadow-inner">
													<pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{generateMessage(ug)}</pre>
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						))
					)}
				</div>
			)}
		</div>
	)
}
