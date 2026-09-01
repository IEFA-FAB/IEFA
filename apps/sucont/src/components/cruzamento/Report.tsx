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
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
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
				return "text-success bg-success/10 border-success/30"
			case "ATENÇÃO":
				return "text-warning bg-warning/10 border-warning/30"
			case "CRÍTICA":
				return "text-destructive bg-destructive/10 border-destructive/30"
			default:
				return "text-muted-foreground bg-muted/50 border-border"
		}
	}

	const detailStatusColor = (status: string) => {
		switch (status) {
			case "REGULAR":
				return "text-success bg-success/10 border-success/30"
			case "AUSÊNCIA NA 897110300":
				return "text-warning bg-warning/10 border-warning/30"
			case "AUSÊNCIA NA 897210300":
				return "text-warning bg-warning/10 border-warning/30"
			case "UG INDEVIDA NA 897210300":
				return "text-action bg-action/10 border-action/30"
			case "DIVERGÊNCIA DE SALDO":
				return "text-destructive bg-destructive/10 border-destructive/30"
			default:
				return "text-muted-foreground bg-muted/50 border-border"
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
			<div className="bg-action/10 border border-action/30 p-5 rounded-xl shadow-sm text-left flex items-start gap-4">
				<FileText className="w-6 h-6 text-action shrink-0 mt-0.5" />
				<div>
					<h3 className="text-label text-action mb-2">Roteiro de Acompanhamento Contábil (SUCONT-3)</h3>
					<p className="text-subheading text-action leading-relaxed">
						<span className="font-bold">Questão 43</span> - Os saldos da conta EM COBRANÇA - A RECEBER (8.9.7.1.1.03.00), registrados na UG, são compatíveis com
						os saldos registrados na conta EM COBRANÇA (8.9.7.2.1.03.00) registrados na SDPP-País?
					</p>
					<p className="text-caption text-action mt-2 opacity-80 italic">
						* O objetivo desta verificação é orientar a unidade gestora, promover a regularização contábil e preservar a qualidade das demonstrações do COMAER.
					</p>
				</div>
			</div>

			{/* SELETOR DE NÍVEL */}
			<div className="flex p-1 bg-muted/50 rounded-xl w-full max-w-2xl mx-auto border border-border">
				{(
					[
						{ id: "ESTRATEGICO", label: "Nível Estratégico", Icon: Target },
						{ id: "TATICO", label: "Nível Tático", Icon: TrendingUp },
						{ id: "OPERACIONAL", label: "Nível Operacional", Icon: FileText },
					] as const
				).map(({ id, label, Icon }) => (
					<Button
						key={id}
						type="button"
						variant="ghost"
						onClick={() => setSelectedLevel(id)}
						className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-subheading transition-all ${
							selectedLevel === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/50"
						}`}
					>
						<Icon className="w-4 h-4" />
						{label}
					</Button>
				))}
			</div>

			{/* PAINEL ESTRATÉGICO */}
			{selectedLevel === "ESTRATEGICO" && (
				<section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="bg-surface-inverted px-6 py-4 flex items-center justify-between">
						<h2 className="text-heading text-white flex items-center gap-2">
							<Target className="w-5 h-5 text-warning" />
							Painel Estratégico de Acompanhamento Contábil
						</h2>
					</div>

					<div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
						<div className="bg-muted/50 p-5 rounded-xl border border-border">
							<div className="flex items-center gap-2 mb-3">
								<div className="w-8 h-8 rounded-full bg-action/15 flex items-center justify-center">
									<FileText className="w-4 h-4 text-action" />
								</div>
								<h3 className="text-foreground text-label">Nível Operacional</h3>
							</div>
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-body text-muted-foreground">Total de UGs Analisadas</span>
									<span className="font-bold text-foreground">{ranking.length}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-body text-muted-foreground">UGs com Inconsistências</span>
									<span className="font-bold text-warning">{ugsComInconsistencias.length}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-body text-muted-foreground">UGs Regulares</span>
									<span className="font-bold text-success">{ranking.length - ugsComInconsistencias.length}</span>
								</div>
							</div>
						</div>

						<div className="bg-muted/50 p-5 rounded-xl border border-border">
							<div className="flex items-center gap-2 mb-3">
								<div className="w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center">
									<TrendingUp className="w-4 h-4 text-warning" />
								</div>
								<h3 className="text-foreground text-label">Nível Tático</h3>
							</div>
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-body text-muted-foreground">Taxa de Inconsistência</span>
									<span className="font-bold text-foreground">{percentualInconsistentes}%</span>
								</div>
								<div className="text-caption text-muted-foreground mt-2 pt-2 border-t border-border">
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

						<div className="bg-muted/50 p-5 rounded-xl border border-border">
							<div className="flex items-center gap-2 mb-3">
								<div className="w-8 h-8 rounded-full bg-destructive/15 flex items-center justify-center">
									<ShieldAlert className="w-4 h-4 text-destructive" />
								</div>
								<h3 className="text-foreground text-label">Nível Estratégico</h3>
							</div>
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-body text-muted-foreground">Risco Contábil Sistêmico</span>
									<span
										className={`px-2 py-0.5 rounded text-label ${
											riscoSistemico === "ALTO"
												? "bg-destructive/15 text-destructive"
												: riscoSistemico === "MÉDIO"
													? "bg-warning/15 text-warning"
													: "bg-success/15 text-success"
										}`}
									>
										{riscoSistemico}
									</span>
								</div>
								<div className="text-caption text-muted-foreground mt-2 pt-2 border-t border-border">
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
						<div className="bg-action/10 border border-action/30 rounded-xl p-4 flex gap-3">
							<ShieldAlert className="w-5 h-5 text-action shrink-0 mt-0.5" />
							<div>
								<h3 className="text-label text-action mb-1">Síntese para Chefia</h3>
								<p className="text-body text-action leading-relaxed">{stats.synthesis}</p>
							</div>
						</div>
					</div>
				</section>
			)}

			{/* DISTRIBUIÇÃO DE INCONSISTÊNCIAS */}
			{(selectedLevel === "ESTRATEGICO" || selectedLevel === "TATICO") && ugsComInconsistencias.length > 0 && (
				<section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="bg-surface-inverted px-6 py-4">
						<h2 className="text-heading text-white flex items-center gap-2">
							<PieChart className="w-5 h-5 text-action" />
							Distribuição de Inconsistências
						</h2>
					</div>
					<div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
						<div className="bg-muted/50 border border-border rounded-xl p-5">
							<h3 className="font-bold text-foreground mb-4 flex items-center gap-2 border-b border-border pb-2">
								<Building2 className="w-4 h-4 text-action" />
								Ranking por ODS
							</h3>
							<div className="space-y-3">
								{rankingODS.map((ods, idx) => (
									<div key={ods.ods} className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<span className="text-label text-muted-foreground w-4">{idx + 1}º</span>
											<span className="text-subheading text-foreground">{ods.ods}</span>
										</div>
										<div className="flex items-center gap-4">
											<span className="text-caption text-muted-foreground">{ods.percentage.toFixed(1)}%</span>
											<span className="text-subheading text-warning bg-warning/10 px-2 py-0.5 rounded">{ods.count} UGs</span>
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="bg-muted/50 border border-border rounded-xl p-5">
							<h3 className="font-bold text-foreground mb-4 flex items-center gap-2 border-b border-border pb-2">
								<Building2 className="w-4 h-4 text-action" />
								Ranking por Órgão Superior
							</h3>
							<div className="space-y-3">
								{rankingOrgaoSuperior.map((orgao, idx) => (
									<div key={orgao.orgao} className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<span className="text-label text-muted-foreground w-4">{idx + 1}º</span>
											<span className="text-subheading text-foreground">{orgao.orgao}</span>
										</div>
										<div className="flex items-center gap-4">
											<span className="text-caption text-muted-foreground">{orgao.percentage.toFixed(1)}%</span>
											<span className="text-subheading text-warning bg-warning/10 px-2 py-0.5 rounded">{orgao.count} UGs</span>
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
				<section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="bg-surface-inverted px-6 py-4">
						<h2 className="text-heading text-white flex items-center gap-2">
							<Users className="w-5 h-5 text-action" />
							Saída Gerencial por Conferente
						</h2>
					</div>
					<div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{agrupamentoConferentes.map(([conferente, dados]) => (
							<div key={conferente} className="bg-muted/50 border border-border rounded-xl p-5">
								<div className="flex items-center justify-between mb-4 border-b border-border pb-3">
									<h3 className="font-bold text-foreground flex items-center gap-2">
										<Users className="w-4 h-4 text-action" />
										{conferente}
									</h3>
									<span className="bg-destructive/15 text-destructive text-caption px-2.5 py-1 rounded-full">{dados.count} UGs</span>
								</div>
								<div className="flex flex-wrap gap-2">
									{dados.ugs.map((ug) => (
										<span key={ug} className="font-mono text-caption bg-card border border-border text-foreground px-2 py-1 rounded shadow-sm">
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
				<section className="bg-card rounded-xl shadow-sm border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="bg-muted/50 px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
						<h2 className="text-heading text-foreground flex items-center gap-2">
							<ListOrdered className="w-5 h-5 text-action" />
							RANKING DE PRIORIDADE
						</h2>
						<div className="flex items-center gap-2">
							<Filter className="w-4 h-4 text-muted-foreground" />
							<Select
								items={{
									ALL: "Modo Geral (Todos os Conferentes)",
									"NÃO ATRIBUÍDO": "Não Atribuído",
									...Object.fromEntries(CONFERENTES.map((c) => [c, c])),
								}}
								value={selectedConferente}
								onValueChange={(v) => setSelectedConferente(v ?? "ALL")}
							>
								<SelectTrigger className="bg-card border border-border text-foreground text-subheading rounded-lg focus-visible:ring-ring focus-visible:border-action p-2">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="ALL">Modo Geral (Todos os Conferentes)</SelectItem>
									{CONFERENTES.map((conf) => (
										<SelectItem key={conf} value={conf}>
											Modo por Conferente: {conf}
										</SelectItem>
									))}
									<SelectItem value="NÃO ATRIBUÍDO">Não Atribuído</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="overflow-x-auto">
						<table className="w-full text-body text-left">
							<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
								<tr>
									<th className="px-4 py-3 w-16 text-center">Ranking</th>
									<th className="px-4 py-3">UG</th>
									<th className="px-4 py-3">Conferente</th>
									<th className="px-4 py-3">Status</th>
									<th className="px-4 py-3 text-right">Impacto Financeiro</th>
									<th className="px-4 py-3 text-center">Qtde Inconsistências</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{filteredUgs.map((ug, idx) => (
									<tr key={ug.ug} className="hover:bg-muted/50 transition-colors">
										<td className="px-6 py-3 text-center">
											<span
												className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-label ${
													idx < 3 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
												}`}
											>
												{idx + 1}
											</span>
										</td>
										<td className="px-6 py-3">
											<div className="font-mono font-medium text-foreground">{ug.ug}</div>
											{ug.ugName && ug.ugName !== "Desconhecida" && <div className="text-caption text-muted-foreground mt-0.5">{ug.ugName}</div>}
										</td>
										<td className="px-6 py-3">
											<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-hint bg-muted text-foreground border border-border">
												<Users className="w-3 h-3" />
												{ug.conferente}
											</span>
										</td>
										<td className="px-6 py-3">
											<span className={`px-2.5 py-1 rounded-md text-hint border ${statusColor(ug.status)}`}>{ug.status}</span>
										</td>
										<td className="px-6 py-3 text-right font-mono font-bold text-foreground">{formatCurrency(ug.financialImpact)}</td>
										<td className="px-6 py-3 text-center font-medium text-muted-foreground">{ug.inconsistenciesCount}</td>
									</tr>
								))}
								{filteredUgs.length === 0 && (
									<tr>
										<td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
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
					<div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
						<button
							type="button"
							onClick={() => setShowConsolidated(!showConsolidated)}
							className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors border-b border-border focus-visible:ring-[3px] focus-visible:ring-ring/50"
						>
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-full bg-action/15 flex items-center justify-center">
									<Send className="w-5 h-5 text-action" />
								</div>
								<div className="text-left">
									<h3 className="font-bold text-foreground">Mensagem Consolidada</h3>
									<p className="text-caption text-muted-foreground">Gerar uma única mensagem para todas as {filteredUgs.length} UGs listadas</p>
								</div>
							</div>
							{showConsolidated ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
						</button>

						{showConsolidated && (
							<div className="p-6 bg-muted/50 space-y-6">
								<div className="flex items-center justify-between mb-3">
									<h3 className="text-label text-foreground flex items-center gap-2">
										<Send className="w-4 h-4 text-action" />
										Proposta de Mensagem Consolidada
									</h3>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											navigator.clipboard.writeText(generateConsolidatedMessage())
											setCopiedConsolidated(true)
											setTimeout(() => setCopiedConsolidated(false), 2000)
										}}
										className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border hover:bg-muted/50 hover:border-border/80 text-foreground text-label rounded-md transition-all shadow-sm"
									>
										{copiedConsolidated ? (
											<>
												<Check className="w-3.5 h-3.5 text-success" />
												<span className="text-success">Copiado!</span>
											</>
										) : (
											<>
												<Copy className="w-3.5 h-3.5" />
												Copiar Mensagem
											</>
										)}
									</Button>
								</div>

								<div className="mb-4 p-4 bg-muted/50 border border-border rounded-lg flex flex-wrap gap-4 items-end">
									<div className="flex flex-col gap-1.5">
										<label htmlFor="cons-report-msg-num" className="text-label text-muted-foreground">
											Nº da Mensagem
										</label>
										<Input
											id="cons-report-msg-num"
											type="text"
											value={consolidatedConfig.msgNum}
											onChange={(e) => setConsolidatedConfig({ ...consolidatedConfig, msgNum: e.target.value })}
											className="px-3 py-1.5 border border-border rounded-md text-body w-24 focus:outline-none focus:ring-2 focus:ring-action"
											placeholder="___"
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<label htmlFor="cons-report-msg-date" className="text-label text-muted-foreground">
											Data da Mensagem
										</label>
										<Input
											id="cons-report-msg-date"
											type="date"
											value={consolidatedConfig.msgDate}
											onChange={(e) => setConsolidatedConfig({ ...consolidatedConfig, msgDate: e.target.value })}
											className="px-3 py-1.5 border border-border rounded-md text-body focus:outline-none focus:ring-2 focus:ring-action"
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<label htmlFor="cons-report-msg-type" className="text-label text-muted-foreground">
											Tipo de Mensagem
										</label>
										<Select
											items={{ SEM_PRAZO: "Padrão (Sem Prazo)", COM_PRAZO: "Com Prazo", ALERTA: "Alerta (Sem Resposta)" }}
											value={consolidatedConfig.messageType}
											onValueChange={(value) =>
												setConsolidatedConfig({
													...consolidatedConfig,
													messageType: value as MessageConfig["messageType"],
												})
											}
										>
											<SelectTrigger
												id="cons-report-msg-type"
												className="px-3 py-1.5 border border-border rounded-md text-body focus-visible:ring-2 focus-visible:ring-action"
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="SEM_PRAZO">Padrão (Sem Prazo)</SelectItem>
												<SelectItem value="COM_PRAZO">Com Prazo</SelectItem>
												<SelectItem value="ALERTA">Alerta (Sem Resposta)</SelectItem>
											</SelectContent>
										</Select>
									</div>
									{consolidatedConfig.messageType === "COM_PRAZO" && (
										<div className="flex flex-col gap-1.5 ml-2">
											<label htmlFor="cons-report-deadline" className="text-label text-muted-foreground">
												Data do Prazo
											</label>
											<Input
												id="cons-report-deadline"
												type="date"
												value={consolidatedConfig.deadlineDate}
												onChange={(e) =>
													setConsolidatedConfig({
														...consolidatedConfig,
														deadlineDate: e.target.value,
													})
												}
												className="px-3 py-1.5 border border-border rounded-md text-body focus:outline-none focus:ring-2 focus:ring-action"
											/>
										</div>
									)}
								</div>

								<div className="bg-card border border-border p-5 rounded-xl shadow-inner max-h-96 overflow-y-auto">
									<pre className="text-body text-foreground whitespace-pre-wrap font-sans leading-relaxed">{generateConsolidatedMessage()}</pre>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* DASHBOARD POR UG */}
			{selectedLevel === "OPERACIONAL" && (
				<div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
					<h2 className="text-heading text-foreground flex items-center gap-2 px-2">
						<FileText className="w-6 h-6 text-action" />
						DASHBOARD POR UG
					</h2>

					{filteredUgs.length === 0 ? (
						<div className="bg-card rounded-xl shadow-sm border border-border p-8 text-center">
							<CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
							<h3 className="text-heading text-foreground mb-1">Nenhuma inconsistência encontrada</h3>
							<p className="text-muted-foreground">Todas as UGs analisadas estão regulares para o filtro selecionado.</p>
						</div>
					) : (
						filteredUgs.map((ug) => (
							<div key={ug.ug} className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
								<button
									type="button"
									onClick={() => toggleUg(ug.ug)}
									className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50"
								>
									<div className="flex items-center gap-6">
										<div className="flex items-center gap-4">
											<div
												className={`w-2 h-14 rounded-full shrink-0 ${
													ug.status === "CRÍTICA" ? "bg-destructive" : ug.status === "ATENÇÃO" ? "bg-warning" : "bg-success"
												}`}
											/>
											<div className="w-12 h-12 rounded-full bg-muted border border-border hidden sm:flex items-center justify-center shrink-0">
												<Building2 className="w-6 h-6 text-muted-foreground" />
											</div>
											<div className="text-left">
												<div className="text-label text-muted-foreground">
													UG {ug.ug} — Conferente: <span className="font-bold text-action">{ug.conferente}</span>
												</div>
												<div className="font-mono text-heading text-foreground">{ug.ugName && ug.ugName !== "Desconhecida" ? ug.ugName : `UG ${ug.ug}`}</div>
												{ug.orgaoSuperior && ug.orgaoSuperior !== "-" && (
													<div className="text-caption text-muted-foreground mt-0.5">
														{ug.orgaoSuperior} • {ug.ods}
													</div>
												)}
											</div>
										</div>
										<span className={`px-3 py-1 rounded-md text-label border ${statusColor(ug.status)}`}>{ug.status}</span>
									</div>

									<div className="flex items-center gap-8">
										<div className="text-right hidden sm:block">
											<div className="text-label text-muted-foreground">Inconsistências</div>
											<div className="font-medium text-foreground">{ug.inconsistenciesCount}</div>
										</div>
										<div className="text-right hidden sm:block">
											<div className="text-label text-muted-foreground">Impacto Financeiro</div>
											<div className="font-mono font-bold text-foreground">{formatCurrency(ug.financialImpact)}</div>
										</div>
										{expandedUg === ug.ug ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
									</div>
								</button>

								{expandedUg === ug.ug && (
									<div className="border-t border-border bg-muted/50 p-6 space-y-6">
										<div>
											<h3 className="text-label text-foreground mb-3 flex items-center gap-2">
												<BarChart3 className="w-4 h-4 text-muted-foreground" />
												Detalhamento
											</h3>
											<div className="overflow-x-auto rounded-lg border border-border bg-card">
												<table className="w-full text-body text-left">
													<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
														<tr>
															<th className="px-4 py-3">Conta Corrente</th>
															<th className="px-4 py-3">Tipo</th>
															<th className="px-4 py-3 text-right">Saldo 897210300</th>
															<th className="px-4 py-3 text-right">Saldo 897110300</th>
															<th className="px-4 py-3 text-right">Diferença</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-border">
														{ug.details.map((row, idx) => (
															<tr key={idx} className="hover:bg-muted/50">
																<td className="px-4 py-2 font-mono text-foreground">{row.contaCorrente}</td>
																<td className="px-4 py-2">
																	<span className={`px-2 py-0.5 rounded text-hint border ${detailStatusColor(row.status)}`}>{row.status}</span>
																</td>
																<td className="px-4 py-2 text-right font-mono text-muted-foreground">{formatCurrency(row.saldo8972)}</td>
																<td className="px-4 py-2 text-right font-mono text-muted-foreground">{formatCurrency(row.saldo8971)}</td>
																<td className="px-4 py-2 text-right font-mono font-medium text-foreground">{formatCurrency(row.diferenca)}</td>
															</tr>
														))}
													</tbody>
												</table>
											</div>
										</div>

										{ug.status !== "REGULAR" && (
											<div className="mt-8">
												<div className="flex items-center justify-between mb-3">
													<h3 className="text-label text-foreground flex items-center gap-2">
														<Send className="w-4 h-4 text-action" />
														Proposta de Mensagem de Cobrança
													</h3>
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={(e) => handleCopyMessage(e, ug)}
														className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border hover:bg-muted/50 hover:border-border/80 text-foreground text-label rounded-md transition-all shadow-sm"
													>
														{copiedUg === ug.ug ? (
															<>
																<Check className="w-3.5 h-3.5 text-success" />
																<span className="text-success">Copiado!</span>
															</>
														) : (
															<>
																<Copy className="w-3.5 h-3.5" />
																Copiar Mensagem
															</>
														)}
													</Button>
												</div>

												<div className="mb-4 p-4 bg-muted/50 border border-border rounded-lg flex flex-wrap gap-4 items-end">
													<div className="flex flex-col gap-1.5">
														<label htmlFor={`ug-report-msg-num-${ug.ug}`} className="text-label text-muted-foreground">
															Nº da Mensagem
														</label>
														<Input
															id={`ug-report-msg-num-${ug.ug}`}
															type="text"
															value={getConfig(ug.ug).msgNum}
															onChange={(e) => updateConfig(ug.ug, { msgNum: e.target.value })}
															className="px-3 py-1.5 border border-border rounded-md text-body w-24 focus:outline-none focus:ring-2 focus:ring-action"
															placeholder="___"
														/>
													</div>
													<div className="flex flex-col gap-1.5">
														<label htmlFor={`ug-report-msg-date-${ug.ug}`} className="text-label text-muted-foreground">
															Data da Mensagem
														</label>
														<Input
															id={`ug-report-msg-date-${ug.ug}`}
															type="date"
															value={getConfig(ug.ug).msgDate}
															onChange={(e) => updateConfig(ug.ug, { msgDate: e.target.value })}
															className="px-3 py-1.5 border border-border rounded-md text-body focus:outline-none focus:ring-2 focus:ring-action"
														/>
													</div>
													<div className="flex flex-col gap-1.5">
														<label htmlFor={`ug-report-msg-type-${ug.ug}`} className="text-label text-muted-foreground">
															Tipo de Mensagem
														</label>
														<Select
															items={{ SEM_PRAZO: "Padrão (Sem Prazo)", COM_PRAZO: "Com Prazo", ALERTA: "Alerta (Sem Resposta)" }}
															value={getConfig(ug.ug).messageType}
															onValueChange={(value) =>
																updateConfig(ug.ug, {
																	messageType: value as MessageConfig["messageType"],
																})
															}
														>
															<SelectTrigger
																id={`ug-report-msg-type-${ug.ug}`}
																className="px-3 py-1.5 border border-border rounded-md text-body focus-visible:ring-2 focus-visible:ring-action"
															>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="SEM_PRAZO">Padrão (Sem Prazo)</SelectItem>
																<SelectItem value="COM_PRAZO">Com Prazo</SelectItem>
																<SelectItem value="ALERTA">Alerta (Sem Resposta)</SelectItem>
															</SelectContent>
														</Select>
													</div>
													{getConfig(ug.ug).messageType === "COM_PRAZO" && (
														<div className="flex flex-col gap-1.5 ml-2">
															<label htmlFor={`ug-report-deadline-${ug.ug}`} className="text-label text-muted-foreground">
																Data do Prazo
															</label>
															<Input
																id={`ug-report-deadline-${ug.ug}`}
																type="date"
																value={getConfig(ug.ug).deadlineDate}
																onChange={(e) => updateConfig(ug.ug, { deadlineDate: e.target.value })}
																className="px-3 py-1.5 border border-border rounded-md text-body focus:outline-none focus:ring-2 focus:ring-action"
															/>
														</div>
													)}
												</div>

												<div className="bg-card border border-border p-5 rounded-xl shadow-inner">
													<pre className="text-body text-foreground whitespace-pre-wrap font-sans leading-relaxed">{generateMessage(ug)}</pre>
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
