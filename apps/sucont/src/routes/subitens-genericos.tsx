import { createFileRoute } from "@tanstack/react-router"
import {
	CheckCircle2,
	Copy,
	Crosshair,
	FileSpreadsheet,
	FileText,
	LayoutDashboard,
	PieChart as PieChartIcon,
	Plane,
	Search,
	Shield,
	TrendingUp,
	X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts"
import * as XLSX from "xlsx"
import { requireToolAccess } from "#/auth/pbac"
import { AnalysisGuide } from "#/components/analysis-guide"
import { AnalysisStart } from "#/components/analysis-start"
import { EditableMessage } from "#/components/editable-message"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card"
import { EXCEL_ACCEPT, FileDropzone } from "#/components/ui/file-dropzone"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { SectionHeader } from "#/components/ui/section-header"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { StatTile } from "#/components/ui/stat-tile"
import { useMessageDrafts } from "#/hooks/use-editable-message"
import { formatCurrency } from "#/lib/analista/types"
import { chartChrome } from "#/lib/chart-theme"
import { blocoFundamentacao, FUNDAMENTO_CONTA_GENERICA } from "#/lib/normas"
import { AIAssistant } from "#/subitens/components/AIAssistant"
import { CONFERENTES_MAPPING, UG_INFO } from "#/subitens/constants"

/**
 * O que a ferramenta faz com a planilha. Último bloco da tela inicial: é a
 * única parte que se pode ler depois de já ter enviado o arquivo.
 */
const ANALYSIS_NOTES = [
	{
		icon: Search,
		title: "O que é analisado",
		text: "O relatório do Tesouro Gerencial é varrido em busca de subitens genéricos (99, 999, P99, /99) e de outras falhas de classificação previstas no RAC.",
	},
	{
		icon: CheckCircle2,
		title: "O que é gerado",
		text: "Para cada UG identificada, uma mensagem institucional formatada, pronta para envio via SAU, com o fundamento normativo já embutido.",
	},
	{
		icon: TrendingUp,
		title: "Como o resultado é lido",
		text: "As ocorrências são agregadas por UG, ODS e órgão superior, com curva de Pareto para mostrar onde está a concentração.",
	},
] as const

export const Route = createFileRoute("/subitens-genericos")({
	// A divisão exigida sai do catálogo (`sucontTools`), pelo `internalPath`.
	beforeLoad: (opts) => requireToolAccess(opts, "/subitens-genericos"),
	component: SubitensGenericos,
})

// ── Types ────────────────────────────────────────────────────
interface ProcessedData {
	ug: string
	contaContabil: string
	contaCorrente: string
	saldo: number
	racId: string
}

interface UgGroup {
	ug: string
	occurrences: ProcessedData[]
	totalSaldo: number
}

// ── Constants ────────────────────────────────────────────────
const RAC_QUESTIONS: Record<string, { title: string; description: string }> = {
	"RAC 28": {
		title: "Utilização de Contas/Subitens Genéricos",
		description:
			"Identificação de saldos em contas contábeis que utilizam subitens genéricos (terminados em 99 ou 999), o que prejudica a transparência e a correta evidenciação dos atos e fatos administrativos.",
	},
}

const getConferente = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && CONFERENTES_MAPPING[match[0]]) return CONFERENTES_MAPPING[match[0]]
	return "Não atribuído"
}

const getOdsForUg = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) return UG_INFO[match[0]].ods
	return "OUTROS"
}

const getOrgaoSuperiorForUg = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) return UG_INFO[match[0]].orgaoSuperior
	return "OUTROS"
}

const formatUgName = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) return `${ugString} (${UG_INFO[match[0]].sigla})`
	return ugString
}

const formatUgFull = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) {
		const info = UG_INFO[match[0]]
		return `UG ${match[0]} (${info.sigla}), subordinada ao ${info.orgaoSuperior} / ${info.ods}`
	}
	return ugString
}

const GENERIC_SUBITEM_REGEX = /(^|\D)(99|999)($|\D)/

// ── Message Templates ────────────────────────────────────────
const INSTITUTIONAL_TEMPLATE = (
	_ug: string,
	occurrences: ProcessedData[],
	_date: string,
	monthYear: string,
	messageType: "com_prazo" | "sem_prazo" | "alerta" = "sem_prazo",
	deadline = "",
	messageNumber = "XXX",
	focalRacId?: string
) => {
	const groupedByRac: Record<string, ProcessedData[]> = {}
	for (const occ of occurrences) {
		if (!groupedByRac[occ.racId]) groupedByRac[occ.racId] = []
		groupedByRac[occ.racId].push(occ)
	}

	const racIds = focalRacId && focalRacId !== "all" ? [focalRacId] : Object.keys(groupedByRac)

	const occurrencesList = racIds
		.map((id) =>
			(groupedByRac[id] ?? [])
				.map(
					(occ) =>
						`   • Conta Contábil ${occ.contaContabil} — Conta Corrente ${occ.contaCorrente} — Saldo: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(occ.saldo)}`
				)
				.join("\n")
		)
		.join("\n")

	const subject =
		focalRacId && focalRacId !== "all"
			? `Assunto: Inconsistência Contábil — ${RAC_QUESTIONS[focalRacId]?.title || focalRacId}`
			: `Assunto: Regularização de Inconsistências Contábeis — Panorama Geral`

	const deadlineClause =
		messageType === "com_prazo" && deadline
			? `\nSolicitamos que as providências sejam adotadas no prazo de ${deadline}, a contar do recebimento desta mensagem.\n`
			: ""

	const intro =
		focalRacId && focalRacId !== "all"
			? `Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foi identificada inconsistência referente à ${RAC_QUESTIONS[focalRacId]?.title || focalRacId} por esta Unidade Gestora.`
			: `Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foram identificadas inconsistências contábeis sob responsabilidade desta Unidade Gestora, conforme detalhamento abaixo:`

	const conclusion =
		messageType === "alerta"
			? `Esta é uma mensagem de alerta. Não é necessário responder via Sistema de Atendimento ao Usuário (SAU) com as ações realizadas ou justificativas, a menos que haja alguma dúvida.`
			: `Após a regularização, ou caso haja justificativa técnica para a manutenção do saldo, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem.`

	return `${subject}

Mensagem nº ${messageNumber}/SUCONT-3/${monthYear}

${intro}

Detalhamento da(s) situação(ões) identificada(s):
${occurrencesList}
${deadlineClause}
Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com os ajustes adequados conforme as normas vigentes.

${blocoFundamentacao(FUNDAMENTO_CONTA_GENERICA)}

${conclusion}

Atenciosamente,

Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)
Subdiretoria de Contabilidade (SUCONT)
Diretoria de Economia e Finanças da Aeronáutica (DIREF)`
}

const CONSOLIDATED_TEMPLATE = (
	racId: string,
	occurrences: ProcessedData[],
	_date: string,
	monthYear: string,
	messageType: "com_prazo" | "sem_prazo" | "alerta" = "sem_prazo",
	deadline = "",
	messageNumber = "XXX"
) => {
	const groupedByUg: Record<string, ProcessedData[]> = {}
	for (const occ of occurrences) {
		if (!groupedByUg[occ.ug]) groupedByUg[occ.ug] = []
		groupedByUg[occ.ug].push(occ)
	}

	const occurrencesList = Object.keys(groupedByUg)
		.map((ug) => {
			const list = (groupedByUg[ug] ?? [])
				.map(
					(occ) =>
						`   • Conta Contábil ${occ.contaContabil} — Conta Corrente ${occ.contaCorrente} — Saldo: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(occ.saldo)}`
				)
				.join("\n")
			return `${formatUgFull(ug)}:\n${list}`
		})
		.join("\n\n")

	const subject = `Assunto: Inconsistência Contábil — ${RAC_QUESTIONS[racId]?.title || racId}`

	const deadlineClause =
		messageType === "com_prazo" && deadline
			? `\nSolicitamos que as providências sejam adotadas no prazo de ${deadline}, a contar do recebimento desta mensagem.\n`
			: ""

	const intro = `Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foi identificada inconsistência referente à ${RAC_QUESTIONS[racId]?.title || racId} pelas Unidades Gestoras listadas abaixo.`

	const conclusion =
		messageType === "alerta"
			? `Esta é uma mensagem de alerta. Não é necessário responder via Sistema de Atendimento ao Usuário (SAU) com as ações realizadas ou justificativas, a menos que haja alguma dúvida.`
			: `Após a regularização, ou caso haja justificativa técnica para a manutenção do saldo, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem.`

	return `${subject}

Mensagem nº ${messageNumber}/SUCONT-3/${monthYear}

Às Unidades Gestoras (UGs) listadas abaixo:

${intro}

Detalhamento da(s) situação(ões) identificada(s):
${occurrencesList}
${deadlineClause}
Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com os ajustes adequados conforme as normas vigentes.

${blocoFundamentacao(FUNDAMENTO_CONTA_GENERICA)}

${conclusion}

Atenciosamente,

Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)
Subdiretoria de Contabilidade (SUCONT)
Diretoria de Economia e Finanças da Aeronáutica (DIREF)`
}

// ── Main Component ───────────────────────────────────────────
function SubitensGenericos() {
	const [data, setData] = useState<UgGroup[]>([])
	const [error, setError] = useState<string | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
	const drafts = useMessageDrafts()
	const [activeTab, setActiveTab] = useState<"messages" | "dashboard">("messages")

	const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split("T")[0])
	const [msgNumber, setMsgNumber] = useState<string>("___")
	const [msgDate, setMsgDate] = useState<string>(new Date().toISOString().split("T")[0])

	const [ugConfigs, setUgConfigs] = useState<
		Record<string, { messageType: "com_prazo" | "sem_prazo" | "alerta"; deadlineDate: string; msgNumber: string; msgDate: string }>
	>({})
	const [racConfigs, setRacConfigs] = useState<
		Record<string, { messageType: "com_prazo" | "sem_prazo" | "alerta"; deadlineDate: string; msgNumber: string; msgDate: string }>
	>({})
	const [messageMode, setMessageMode] = useState<"individual" | "consolidated">("individual")
	const [selectedConferente, setSelectedConferente] = useState<string>("all")
	const [dashboardTab, setDashboardTab] = useState<"operacional" | "tatico" | "estrategico">("operacional")

	const formattedReportDate = new Intl.DateTimeFormat("pt-BR").format(new Date(`${reportDate}T12:00:00`))

	const formatMsgDate = (dateStr: string) => {
		if (!dateStr) return "XXXMÊSANO"
		const date = new Date(`${dateStr}T12:00:00`)
		const day = String(date.getDate()).padStart(2, "0")
		const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
		const month = months[date.getMonth()]
		const year = date.getFullYear()
		return `${day}${month}${year}`
	}

	const resetAnalysis = () => {
		setData([])
		setError(null)
		setActiveTab("messages")
		setUgConfigs({})
		setRacConfigs({})
		setMessageMode("individual")
		setSelectedConferente("all")
		setDashboardTab("operacional")
		drafts.resetAll()
	}

	const updateUgConfig = (ug: string, field: string, value: string) => {
		setUgConfigs((prev) => ({
			...prev,
			[ug]: {
				...(prev[ug] || {
					messageType: "sem_prazo",
					deadlineDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
					msgNumber,
					msgDate,
				}),
				[field]: value,
			},
		}))
	}

	const updateRacConfig = (racId: string, field: string, value: string) => {
		setRacConfigs((prev) => ({
			...prev,
			[racId]: {
				...(prev[racId] || {
					messageType: "sem_prazo",
					deadlineDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
					msgNumber,
					msgDate,
				}),
				[field]: value,
			},
		}))
	}

	const getDeadlineText = (ug: string) => {
		const config = ugConfigs[ug]
		if (config?.messageType !== "com_prazo" || !config.deadlineDate) return ""
		const [year, month, day] = config.deadlineDate.split("-")
		return `${day}/${month}/${year}`
	}

	const getRacDeadlineText = (racId: string) => {
		const config = racConfigs[racId]
		if (config?.messageType !== "com_prazo" || !config.deadlineDate) return ""
		const [year, month, day] = config.deadlineDate.split("-")
		return `${day}/${month}/${year}`
	}

	const processFile = useCallback((file: File) => {
		setIsProcessing(true)
		setError(null)

		const reader = new FileReader()
		reader.onload = (e) => {
			try {
				const bstr = e.target?.result
				const workbook = XLSX.read(bstr, { type: "array" })
				const sheetName = workbook.SheetNames[0]
				const worksheet = workbook.Sheets[sheetName]

				const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", range: 11 })

				if (jsonData.length === 0) throw new Error("O arquivo está vazio ou não contém dados válidos.")

				const findColumn = (possibleNames: string[]) => {
					const keys = Object.keys(jsonData[0])
					return keys.find(
						(k) =>
							possibleNames.some((p) => k.toLowerCase().trim() === p.toLowerCase().trim()) ||
							possibleNames.some((p) => k.toLowerCase().trim().includes(p.toLowerCase().trim()))
					)
				}

				const ugCol = findColumn(["UG", "UG Executora"])
				const contaCol = findColumn(["Conta Contábil", "Conta"])
				const ccCol = findColumn(["Conta Corrente", "CC", "Corrente"])
				const saldoCol = findColumn(["Saldo - R$", "Saldo", "Valor"])

				if (!ugCol || !contaCol || !ccCol || !saldoCol) {
					const missing: string[] = []
					if (!ugCol) missing.push("UG Executora")
					if (!contaCol) missing.push("Conta Contábil")
					if (!ccCol) missing.push("Conta Corrente")
					if (!saldoCol) missing.push("Saldo")
					throw new Error(`Não foi possível identificar as colunas: ${missing.join(", ")}. Verifique o cabeçalho da planilha.`)
				}

				const filtered: ProcessedData[] = jsonData
					.map((row: Record<string, unknown>) => {
						const cc = String(row[ccCol] ?? "")
						const saldoRaw = row[saldoCol]
						let saldo = 0
						if (typeof saldoRaw === "number") {
							saldo = saldoRaw
						} else {
							const cleaned = String(saldoRaw)
								.replace(/[R$\s]/g, "")
								.replace(/\./g, "")
								.replace(",", ".")
							saldo = parseFloat(cleaned)
						}
						return {
							ug: String(row[ugCol]).trim(),
							contaContabil: String(row[contaCol]).trim(),
							contaCorrente: cc.trim(),
							saldo: Number.isNaN(saldo) ? 0 : saldo,
							racId: "RAC 28",
						}
					})
					.filter((row: ProcessedData) => GENERIC_SUBITEM_REGEX.test(row.contaCorrente))

				const groups: Record<string, UgGroup> = {}
				for (const row of filtered) {
					if (!groups[row.ug]) groups[row.ug] = { ug: row.ug, occurrences: [], totalSaldo: 0 }
					const existing = groups[row.ug].occurrences.find((o) => o.contaContabil === row.contaContabil && o.contaCorrente === row.contaCorrente)
					if (existing) {
						existing.saldo += row.saldo
					} else {
						groups[row.ug].occurrences.push({ ...row })
					}
					groups[row.ug].totalSaldo += row.saldo
				}

				const result = Object.values(groups).sort((a, b) => a.ug.localeCompare(b.ug))
				if (result.length === 0) {
					setError("Nenhum subitem genérico (99/999) identificado nos dados fornecidos.")
				} else {
					setData(result)
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Erro ao processar o arquivo.")
			} finally {
				setIsProcessing(false)
			}
		}
		reader.onerror = () => {
			setError("Erro na leitura do arquivo.")
			setIsProcessing(false)
		}
		reader.readAsArrayBuffer(file)
	}, [])

	const handleFiles = (files: File[]) => {
		const file = files[0]
		if (file) processFile(file)
	}

	const copyToClipboard = (text: string, index: number) => {
		navigator.clipboard.writeText(text)
		setCopiedIndex(index)
		setTimeout(() => setCopiedIndex(null), 2000)
	}

	// ── Filtering ─────────────────────────────────────────────
	const allConferentes = Array.from(new Set(Object.values(CONFERENTES_MAPPING))).sort()

	const filteredData = data.filter((group) => {
		const matchesConferente = selectedConferente === "all" || getConferente(group.ug) === selectedConferente
		return matchesConferente && group.occurrences.length > 0
	})

	// ── Dashboard data ────────────────────────────────────────
	const topUgsBySaldo = [...filteredData]
		.sort((a, b) => b.totalSaldo - a.totalSaldo)
		.slice(0, 5)
		.map((ug) => ({ name: formatUgName(ug.ug), saldo: ug.totalSaldo }))

	const contasCount: Record<string, number> = {}
	for (const group of filteredData) {
		for (const occ of group.occurrences) {
			contasCount[occ.contaContabil] = (contasCount[occ.contaContabil] || 0) + 1
		}
	}
	const topContas = Object.entries(contasCount)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 5)
		// `fill` na linha: o recharts pinta o setor por ele e monta legenda e marcador do
		// tooltip a partir dele. Cor só no `shape` deixaria os dois no cinza padrão.
		.map((conta, index) => ({ ...conta, fill: COLORS[index % COLORS.length] }))

	const conferentesData: Record<string, { ugs: string[]; count: number }> = {}
	for (const group of filteredData) {
		const conferente = getConferente(group.ug)
		if (!conferentesData[conferente]) conferentesData[conferente] = { ugs: [], count: 0 }
		conferentesData[conferente].ugs.push(group.ug)
		conferentesData[conferente].count += group.occurrences.length
	}
	const conferentesList = Object.entries(conferentesData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)

	const totalInconsistencias = filteredData.reduce((acc, curr) => acc + curr.occurrences.length, 0)
	const totalVolume = filteredData.reduce((acc, curr) => acc + curr.totalSaldo, 0)

	const odsData: Record<string, { count: number; saldo: number }> = {}
	const orgaoSuperiorData: Record<string, { count: number; saldo: number }> = {}
	const racData: Record<string, { count: number }> = {}

	for (const group of filteredData) {
		const ods = getOdsForUg(group.ug)
		const orgao = getOrgaoSuperiorForUg(group.ug)
		if (!odsData[ods]) odsData[ods] = { count: 0, saldo: 0 }
		odsData[ods].count += group.occurrences.length
		odsData[ods].saldo += group.totalSaldo
		if (!orgaoSuperiorData[orgao]) orgaoSuperiorData[orgao] = { count: 0, saldo: 0 }
		orgaoSuperiorData[orgao].count += group.occurrences.length
		orgaoSuperiorData[orgao].saldo += group.totalSaldo
		for (const occ of group.occurrences) {
			if (!racData[occ.racId]) racData[occ.racId] = { count: 0 }
			racData[occ.racId].count += 1
		}
	}

	const odsList = Object.entries(odsData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)
	const orgaoSuperiorList = Object.entries(orgaoSuperiorData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)
	const racList = Object.entries(racData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)

	const topUgsByInconsistencias = [...filteredData].sort((a, b) => b.occurrences.length - a.occurrences.length)

	const totalUgsCount = filteredData.length
	const paretoData = topUgsByInconsistencias.reduce(
		(acc, curr, idx) => {
			const cumulativeCount = (acc.length > 0 ? acc[acc.length - 1].cumulativeCount : 0) + curr.occurrences.length
			acc.push({
				ug: curr.ug,
				count: curr.occurrences.length,
				cumulativeCount,
				percentage: (cumulativeCount / totalInconsistencias) * 100,
				ugPercentage: ((idx + 1) / totalUgsCount) * 100,
			})
			return acc
		},
		[] as { ug: string; count: number; cumulativeCount: number; percentage: number; ugPercentage: number }[]
	)

	const paretoSummary = {
		top20PercentUgs: paretoData.filter((d) => d.ugPercentage <= 20),
		concentrationPercentage: paretoData.find((d) => d.ugPercentage >= 20)?.percentage || 0,
	}

	const criticalLevels = {
		odsMaisCritico: odsList[0]?.name || "N/A",
		orgaoSuperiorMaisCritico: orgaoSuperiorList[0]?.name || "N/A",
		ugMaiorConcentracao: topUgsByInconsistencias[0]?.ug || "N/A",
		ugMaiorSaldo: [...filteredData].sort((a, b) => b.totalSaldo - a.totalSaldo)[0]?.ug || "N/A",
		odsMaiorImpactoFinanceiro: [...odsList].sort((a, b) => b.saldo - a.saldo)[0]?.name || "N/A",
		orgaoSuperiorMaiorSaldo: [...orgaoSuperiorList].sort((a, b) => b.saldo - a.saldo)[0]?.name || "N/A",
	}

	const occurrencesByRac: Record<string, ProcessedData[]> = {}
	for (const group of filteredData) {
		for (const occ of group.occurrences) {
			if (!occurrencesByRac[occ.racId]) occurrencesByRac[occ.racId] = []
			occurrencesByRac[occ.racId].push(occ)
		}
	}

	const COLORS = ["#00205B", "#003DA5", "#D4AF37", "#4A90E2", "#87CEEB", "#B0C4DE", "#4682B4"]

	// ── Render ────────────────────────────────────────────────
	const guide = (
		<AnalysisGuide
			source={<TesouroGerencialPath />}
			reference={
				<RacReference
					statement="As Unidades Gestoras utilizam contas contábeis e subitens genéricos (99, 999, P99, /99) no registro de suas transações?"
					objective="Identificar a utilização indevida de contas contábeis e subitens genéricos nos registros das Unidades Gestoras."
					risk="O uso de subitens genéricos oculta a real natureza da transação, prejudicando a transparência, a precisão da informação e a evidenciação contábil."
					importance="A regularização preserva a qualidade das demonstrações contábeis e apoia a tomada de decisão da alta administração do COMAER."
				/>
			}
			notes={ANALYSIS_NOTES}
		/>
	)

	return (
		<HubLayout
			guide={guide}
			actions={
				// Só com dados: sem análise carregada, "Nova análise" não desfaz nada.
				data.length > 0 && (
					<Button onClick={resetAnalysis} type="button" variant="outline" size="sm">
						Nova análise
					</Button>
				)
			}
		>
			<div>
				<AnimatePresence mode="wait">
					{data.length === 0 ? (
						<motion.div key="upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
							{/*
							 * Ordem e superfícies vêm do `AnalysisStart` — as mesmas das outras
							 * seis ferramentas que começam por uma planilha.
							 *
							 * Aqui havia uma capa institucional: avião num disco de 96px com anel
							 * dourado, "Análise de SUBITENS Genéricos" com a palavra do meio em
							 * ouro, e o lema "Defender, Controlar e Integrar" entre duas bússolas.
							 * Nada disso é a tarefa — a tarefa é enviar uma planilha —, e o que a
							 * capa dizia de útil já está na descrição sob a trilha.
							 */}
							<AnalysisStart
								dropzone={
									<FileDropzone
										accept={EXCEL_ACCEPT}
										onFiles={handleFiles}
										hint="Excel do Tesouro Gerencial (.xlsx, .xls)"
										columns={["UG Executora", "Conta Contábil", "Conta Corrente", "Saldo"]}
										isLoading={isProcessing}
									/>
								}
								error={error}
							/>
						</motion.div>
					) : (
						<motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
							{/*
							 * Metadados da mensagem — só aqui, no ramo COM dados.
							 *
							 * Moravam num cabeçalho institucional próprio (gradiente azul-e-ouro,
							 * faixa dourada de 4px, aviões de marca-d'água, título em serifada
							 * itálica), acima do estado vazio: pediam o número da mensagem antes
							 * de existir qualquer análise para mensagem nenhuma, e ficavam numa
							 * largura diferente do resto da tela.
							 */}
							<Card>
								<CardHeader>
									<CardTitle>Dados do relatório</CardTitle>
									<CardDescription>Identificam a mensagem gerada para a UG. Aparecem no cabeçalho do documento exportado.</CardDescription>
								</CardHeader>
								<CardContent className="grid gap-4 sm:grid-cols-3">
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="report-date">Data do relatório</Label>
										<Input id="report-date" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
									</div>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="msg-number">Nº da mensagem</Label>
										<Input id="msg-number" type="text" value={msgNumber} onChange={(e) => setMsgNumber(e.target.value)} placeholder="___" />
									</div>
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="msg-date">Data da mensagem</Label>
										<Input id="msg-date" type="date" value={msgDate} onChange={(e) => setMsgDate(e.target.value)} />
									</div>
								</CardContent>
							</Card>

							{/* Era: dois cards de `p-8` com barra decorativa de `tech-blue` a 30% e
							    um terceiro azul-sólido com o valor em amarelo — três KPIs, dois desenhos. */}
							<div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
								<StatTile label="Unidades Gestoras" value={filteredData.length} hint="afetadas" />
								<StatTile
									label="Total de ocorrências"
									value={filteredData.reduce((acc, curr) => acc + curr.occurrences.length, 0)}
									hint="registros"
									status="action"
								/>
								<StatTile label="Volume financeiro" value={formatCurrency(totalVolume)} hint="em subitens genéricos" status="warning" />
							</div>

							{/* Filtro no corpo, com rótulo. Era um card de `p-8` com disco de ícone,
							    pílula "Filtro Ativo" em `animate-pulse` e um botão "Modo Geral" pintado
							    de `tech-blue`. */}
							<div className="mb-8 flex flex-col gap-2">
								<Label htmlFor="conferente-filter">Filtrar por conferente</Label>
								<div className="flex items-center gap-2">
									<Select items={{ all: "Todos os conferentes" }} value={selectedConferente} onValueChange={(v) => setSelectedConferente(v ?? "all")}>
										<SelectTrigger id="conferente-filter" className="w-64">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">Todos os conferentes</SelectItem>
											{allConferentes.map((c) => (
												<SelectItem key={c} value={c}>
													{c}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{selectedConferente !== "all" && (
										<Button type="button" variant="ghost" size="sm" onClick={() => setSelectedConferente("all")}>
											<X />
											Limpar
										</Button>
									)}
								</div>
							</div>

							<SegmentedControl
								label="Seção"
								size="lg"
								className="mb-8"
								value={activeTab}
								onValueChange={setActiveTab}
								options={[
									{
										value: "messages",
										label: (
											<>
												<FileText /> Mensagens institucionais
											</>
										),
									},
									{
										value: "dashboard",
										label: (
											<>
												<LayoutDashboard /> Painel gerencial
											</>
										),
									},
								]}
							/>

							{activeTab === "messages" ? (
								<>
									{/* Tabela Situacional */}
									<section className="mb-16">
										<SectionHeader icon={<FileSpreadsheet />} title="Retrato situacional" description="Detalhamento por conta e saldo" className="mb-6" />

										<div className="bg-card rounded-xl border border-border overflow-hidden">
											<div className="overflow-x-auto">
												<table className="w-full text-left border-collapse">
													<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
														<tr>
															{["UG Executora", "Questão RAC", "Conta Contábil", "Conta Corrente", "Saldo"].map((h) => (
																<th key={h} className={`px-4 py-3${h === "Saldo" ? " text-right" : ""}`}>
																	{h}
																</th>
															))}
														</tr>
													</thead>
													<tbody className="divide-y divide-border">
														{filteredData.flatMap((group, gIdx) =>
															group.occurrences.map((occ, oIdx) => (
																<tr key={`${gIdx}-${oIdx}`} className="hover:bg-muted/40 transition-colors group">
																	<td className="px-4 py-3">
																		{oIdx === 0 ? (
																			<div className="flex flex-col gap-1">
																				<div className="flex items-center gap-3">
																					<div className="w-1.5 h-1.5 rounded-full bg-warning" />
																					<span className="text-subheading text-foreground">{formatUgName(group.ug)}</span>
																				</div>
																				<span className="text-label text-muted-foreground ml-4">Conferente: {getConferente(group.ug)}</span>
																			</div>
																		) : (
																			<span className="opacity-0">{group.ug}</span>
																		)}
																	</td>
																	<td className="px-4 py-3">
																		<Badge variant="muted">{occ.racId}</Badge>
																	</td>
																	<td className="px-4 py-3 font-mono text-body text-muted-foreground">{occ.contaContabil}</td>
																	<td className="px-4 py-3 font-mono text-body">
																		<Badge variant="destructive">{occ.contaCorrente}</Badge>
																	</td>
																	<td className="px-4 py-3 font-mono text-subheading text-right text-foreground">
																		{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(occ.saldo)}
																	</td>
																</tr>
															))
														)}
													</tbody>
												</table>
											</div>
										</div>
									</section>

									{/* Mensagens */}
									<section>
										<SectionHeader
											icon={<FileText />}
											title="Expedição de cobranças"
											description="Comunicações oficiais geradas"
											className="mb-6"
											actions={
												<SegmentedControl
													label="Modo de mensagem"
													value={messageMode}
													onValueChange={setMessageMode}
													options={[
														{ value: "individual", label: "Por Unidade Gestora" },
														{ value: "consolidated", label: "Consolidada por questão" },
													]}
												/>
											}
										/>

										{messageMode === "individual" ? (
											<div className="grid grid-cols-1 gap-8">
												{filteredData.map((group, idx) => {
													const ugConfig = ugConfigs[group.ug] || { messageType: "sem_prazo", deadlineDate: "", msgNumber, msgDate }
													const currentMsgNumber = ugConfig.msgNumber || msgNumber
													const currentMsgDate = ugConfig.msgDate || msgDate
													const message = INSTITUTIONAL_TEMPLATE(
														group.ug,
														group.occurrences,
														formattedReportDate,
														formatMsgDate(currentMsgDate),
														ugConfig.messageType,
														getDeadlineText(group.ug),
														currentMsgNumber,
														"all"
													)
													const draft = drafts.of(`ug:${group.ug}`, message)

													return (
														<motion.div
															key={group.ug}
															initial={{ opacity: 0, y: 20 }}
															whileInView={{ opacity: 1, y: 0 }}
															viewport={{ once: true }}
															transition={{ delay: idx * 0.05 }}
															className="bg-card rounded-xl border border-border overflow-hidden flex flex-col lg:flex-row"
														>
															<div className="lg:w-80 bg-muted/50 p-6 border-b lg:border-b-0 lg:border-r border-border flex flex-col justify-between">
																<div>
																	<Badge variant="destructive" className="mb-6">
																		Pendente
																	</Badge>
																	<p className="text-label text-muted-foreground mb-1">Unidade Gestora</p>
																	<h3 className="text-heading text-foreground mb-1">{formatUgName(group.ug)}</h3>
																	<p className="text-label text-muted-foreground mb-4">Conferente: {getConferente(group.ug)}</p>

																	<div className="bg-destructive/10 p-4 rounded-xl border border-destructive/30 mb-6">
																		<p className="text-label text-destructive mb-1">Inconsistência Identificada</p>
																		<p className="text-caption text-destructive leading-relaxed">Múltiplas inconsistências identificadas conforme RAC.</p>
																	</div>

																	<div className="space-y-3 mt-8">
																		<div className="flex justify-between items-center text-body">
																			<span className="text-muted-foreground">Ocorrências</span>
																			<span className="font-mono font-bold text-foreground">{group.occurrences.length}</span>
																		</div>
																		<div className="flex justify-between items-center text-body">
																			<span className="text-muted-foreground">Total em 99/999</span>
																			<span className="font-mono font-bold text-action">
																				{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(group.totalSaldo)}
																			</span>
																		</div>
																	</div>

																	{/* Per-UG controls */}
																	<div className="mt-8 pt-8 border-t border-border space-y-6">
																		<div className="grid grid-cols-2 gap-4">
																			<div className="flex flex-col gap-2">
																				<label htmlFor={`ug-msg-number-${idx}`} className="text-label text-muted-foreground">
																					Nº Mensagem
																				</label>
																				<Input
																					id={`ug-msg-number-${idx}`}
																					type="text"
																					value={ugConfig.msgNumber}
																					onChange={(e) => updateUgConfig(group.ug, "msgNumber", e.target.value)}
																					placeholder="___"
																					className="font-mono"
																				/>
																			</div>
																			<div className="flex flex-col gap-2">
																				<label htmlFor={`ug-msg-date-${idx}`} className="text-label text-muted-foreground">
																					Data Mensagem
																				</label>
																				<Input
																					id={`ug-msg-date-${idx}`}
																					type="date"
																					value={ugConfig.msgDate}
																					onChange={(e) => updateUgConfig(group.ug, "msgDate", e.target.value)}
																					className="font-mono"
																				/>
																			</div>
																		</div>

																		<div>
																			<div className="flex flex-col gap-2 mb-4">
																				<label htmlFor={`ug-msg-type-${idx}`} className="text-label text-muted-foreground">
																					Tipo de Mensagem
																				</label>
																				<Select
																					items={{ sem_prazo: "Sem Prazo", com_prazo: "Com Prazo", alerta: "Apenas Alerta" }}
																					value={ugConfig.messageType}
																					onValueChange={(value) => updateUgConfig(group.ug, "messageType", value as "com_prazo" | "sem_prazo" | "alerta")}
																				>
																					<SelectTrigger id={`ug-msg-type-${idx}`} className="w-full">
																						<SelectValue />
																					</SelectTrigger>
																					<SelectContent>
																						<SelectItem value="sem_prazo">Sem Prazo</SelectItem>
																						<SelectItem value="com_prazo">Com Prazo</SelectItem>
																						<SelectItem value="alerta">Apenas Alerta</SelectItem>
																					</SelectContent>
																				</Select>
																			</div>

																			<AnimatePresence>
																				{ugConfig.messageType === "com_prazo" && (
																					<motion.div
																						initial={{ height: 0, opacity: 0 }}
																						animate={{ height: "auto", opacity: 1 }}
																						exit={{ height: 0, opacity: 0 }}
																						className="space-y-3 overflow-hidden"
																					>
																						<div className="flex flex-col gap-2">
																							<label htmlFor={`ug-deadline-${idx}`} className="text-label text-muted-foreground">
																								Data Limite
																							</label>
																							<Input
																								id={`ug-deadline-${idx}`}
																								type="date"
																								value={ugConfig.deadlineDate || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
																								onChange={(e) => updateUgConfig(group.ug, "deadlineDate", e.target.value)}
																								className="font-mono"
																							/>
																						</div>
																					</motion.div>
																				)}
																			</AnimatePresence>
																		</div>
																	</div>
																</div>

																<Button
																	onClick={() => copyToClipboard(draft.text, idx)}
																	type="button"
																	variant={copiedIndex === idx ? "success" : "default"}
																	className="mt-8 w-full"
																>
																	{copiedIndex === idx ? (
																		<>
																			<CheckCircle2 size={16} />
																			Copiado
																		</>
																	) : (
																		<>
																			<Copy size={16} />
																			Copiar Mensagem
																		</>
																	)}
																</Button>
															</div>

															<div className="flex-1 p-6 bg-card">
																<EditableMessage
																	label={`Mensagem institucional da UG ${group.ug}`}
																	value={draft.text}
																	onChange={draft.setText}
																	onReset={draft.reset}
																	isEdited={draft.isEdited}
																	isStale={draft.isStale}
																	textClassName="max-h-[500px] font-mono"
																	rows={18}
																/>
															</div>
														</motion.div>
													)
												})}
											</div>
										) : (
											<div className="grid grid-cols-1 gap-8">
												{Object.keys(occurrencesByRac).map((racId, idx) => {
													const occurrences = occurrencesByRac[racId]
													const racConfig = racConfigs[racId] || { messageType: "sem_prazo", deadlineDate: "", msgNumber, msgDate }
													const currentMsgNumber = racConfig.msgNumber || msgNumber
													const currentMsgDate = racConfig.msgDate || msgDate
													const message = CONSOLIDATED_TEMPLATE(
														racId,
														occurrences,
														formattedReportDate,
														formatMsgDate(currentMsgDate),
														racConfig.messageType,
														getRacDeadlineText(racId),
														currentMsgNumber
													)
													const draft = drafts.of(`rac:${racId}`, message)
													const totalSaldo = occurrences.reduce((sum, occ) => sum + occ.saldo, 0)
													const uniqueUgs = new Set(occurrences.map((o) => o.ug)).size

													return (
														<motion.div
															key={racId}
															initial={{ opacity: 0, y: 20 }}
															whileInView={{ opacity: 1, y: 0 }}
															viewport={{ once: true }}
															transition={{ delay: idx * 0.05 }}
															className="bg-card rounded-xl border border-border overflow-hidden flex flex-col lg:flex-row"
														>
															<div className="lg:w-80 bg-muted/50 p-6 border-b lg:border-b-0 lg:border-r border-border flex flex-col justify-between">
																<div>
																	<Badge variant="destructive" className="mb-6">
																		Pendente
																	</Badge>
																	<p className="text-label text-muted-foreground mb-1">Questão RAC</p>
																	<h3 className="text-heading text-foreground mb-1">{RAC_QUESTIONS[racId]?.title || racId}</h3>
																	<p className="text-label text-muted-foreground mb-4">Múltiplas UGs</p>

																	<div className="bg-destructive/10 p-4 rounded-xl border border-destructive/30 mb-6">
																		<p className="text-label text-destructive mb-1">Inconsistência Consolidada</p>
																		<p className="text-caption text-destructive leading-relaxed">
																			Mensagem única agrupando todas as UGs afetadas por esta questão.
																		</p>
																	</div>

																	<div className="space-y-3 mt-8">
																		<div className="flex justify-between items-center text-body">
																			<span className="text-muted-foreground">UGs Afetadas</span>
																			<span className="font-mono font-bold text-foreground">{uniqueUgs}</span>
																		</div>
																		<div className="flex justify-between items-center text-body">
																			<span className="text-muted-foreground">Ocorrências</span>
																			<span className="font-mono font-bold text-foreground">{occurrences.length}</span>
																		</div>
																		<div className="flex justify-between items-center text-body">
																			<span className="text-muted-foreground">Total em 99/999</span>
																			<span className="font-mono font-bold text-action">
																				{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalSaldo)}
																			</span>
																		</div>
																	</div>

																	<div className="mt-8 pt-8 border-t border-border space-y-6">
																		<div className="grid grid-cols-2 gap-4">
																			<div className="flex flex-col gap-2">
																				<label htmlFor={`rac-msg-number-${idx}`} className="text-label text-muted-foreground">
																					Nº Mensagem
																				</label>
																				<Input
																					id={`rac-msg-number-${idx}`}
																					type="text"
																					value={racConfig.msgNumber}
																					onChange={(e) => updateRacConfig(racId, "msgNumber", e.target.value)}
																					placeholder="___"
																					className="font-mono"
																				/>
																			</div>
																			<div className="flex flex-col gap-2">
																				<label htmlFor={`rac-msg-date-${idx}`} className="text-label text-muted-foreground">
																					Data Mensagem
																				</label>
																				<Input
																					id={`rac-msg-date-${idx}`}
																					type="date"
																					value={racConfig.msgDate}
																					onChange={(e) => updateRacConfig(racId, "msgDate", e.target.value)}
																					className="font-mono"
																				/>
																			</div>
																		</div>

																		<div>
																			<div className="flex flex-col gap-2 mb-4">
																				<label htmlFor={`rac-msg-type-${idx}`} className="text-label text-muted-foreground">
																					Tipo de Mensagem
																				</label>
																				<Select
																					items={{ sem_prazo: "Sem Prazo", com_prazo: "Com Prazo", alerta: "Apenas Alerta" }}
																					value={racConfig.messageType}
																					onValueChange={(value) => updateRacConfig(racId, "messageType", value as "com_prazo" | "sem_prazo" | "alerta")}
																				>
																					<SelectTrigger id={`rac-msg-type-${idx}`} className="w-full">
																						<SelectValue />
																					</SelectTrigger>
																					<SelectContent>
																						<SelectItem value="sem_prazo">Sem Prazo</SelectItem>
																						<SelectItem value="com_prazo">Com Prazo</SelectItem>
																						<SelectItem value="alerta">Apenas Alerta</SelectItem>
																					</SelectContent>
																				</Select>
																			</div>

																			<AnimatePresence>
																				{racConfig.messageType === "com_prazo" && (
																					<motion.div
																						initial={{ height: 0, opacity: 0 }}
																						animate={{ height: "auto", opacity: 1 }}
																						exit={{ height: 0, opacity: 0 }}
																						className="space-y-3 overflow-hidden"
																					>
																						<div className="flex flex-col gap-2">
																							<label htmlFor={`rac-deadline-${idx}`} className="text-label text-muted-foreground">
																								Data Limite
																							</label>
																							<Input
																								id={`rac-deadline-${idx}`}
																								type="date"
																								value={racConfig.deadlineDate || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
																								onChange={(e) => updateRacConfig(racId, "deadlineDate", e.target.value)}
																								className="font-mono"
																							/>
																						</div>
																					</motion.div>
																				)}
																			</AnimatePresence>
																		</div>
																	</div>
																</div>

																<Button
																	onClick={() => copyToClipboard(draft.text, idx)}
																	type="button"
																	variant={copiedIndex === idx ? "success" : "default"}
																	className="mt-8 w-full"
																>
																	{copiedIndex === idx ? (
																		<>
																			<CheckCircle2 size={16} />
																			Copiado
																		</>
																	) : (
																		<>
																			<Copy size={16} />
																			Copiar Mensagem
																		</>
																	)}
																</Button>
															</div>

															<div className="flex-1 p-6 bg-card">
																<EditableMessage
																	label={`Mensagem consolidada da ${racId}`}
																	value={draft.text}
																	onChange={draft.setText}
																	onReset={draft.reset}
																	isEdited={draft.isEdited}
																	isStale={draft.isStale}
																	textClassName="max-h-[500px] font-mono"
																	rows={18}
																/>
															</div>
														</motion.div>
													)
												})}
											</div>
										)}
									</section>
								</>
							) : (
								/* Dashboard */
								<section className="mb-16 space-y-8">
									<SectionHeader
										icon={<TrendingUp />}
										title="Painel estratégico de acompanhamento"
										description="Visão operacional, tática e estratégica"
										actions={
											<SegmentedControl
												label="Nível do painel"
												value={dashboardTab}
												onValueChange={setDashboardTab}
												options={[
													{ value: "operacional", label: "Operacional" },
													{ value: "tatico", label: "Tático" },
													{ value: "estrategico", label: "Estratégico" },
												]}
											/>
										}
									/>

									{dashboardTab === "operacional" && (
										<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
											<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
												{[
													{
														title: "Risco Sistêmico",
														text: `A utilização de subitens genéricos afeta ${filteredData.length} Unidades Gestoras, comprometendo a evidenciação contábil de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalVolume)} no COMAER.`,
													},
													{
														title: "Ação Recomendada",
														text: `Expedir as ${filteredData.length} mensagens institucionais geradas para orientar as UGs na reclassificação dos saldos para contas específicas, conforme RAC.`,
													},
													{
														title: "Contas Afetadas",
														text: `Foram identificadas ${Object.keys(contasCount).length} contas contábeis distintas com inconsistências, exigindo atenção da Setorial Contábil.`,
													},
												].map((card) => (
													<div key={card.title} className="bg-card p-6 rounded-xl border border-border shadow-sm">
														<h4 className="text-label text-muted-foreground mb-2">{card.title}</h4>
														<p className="text-body text-muted-foreground leading-relaxed">{card.text}</p>
													</div>
												))}
											</div>

											<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
												<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
													<div className="flex items-center gap-3 mb-8">
														<div className="p-2 bg-muted rounded-lg text-foreground">
															<LayoutDashboard size={20} />
														</div>
														<h3 className="text-heading text-foreground">Top 5 UGs por Volume Financeiro</h3>
													</div>
													<div className="h-[300px] w-full">
														<ResponsiveContainer width="100%" height="100%">
															<BarChart data={topUgsBySaldo} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
																<CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartChrome.grid} />
																<XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: chartChrome.axis, fontSize: 12 }} />
																<YAxis
																	axisLine={false}
																	tickLine={false}
																	tick={{ fill: chartChrome.axis, fontSize: 12 }}
																	tickFormatter={(value) => new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(value)}
																/>
																<RechartsTooltip
																	cursor={{ fill: chartChrome.surfaceMuted, opacity: 0.4 }}
																	contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
																	formatter={(value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value))}
																/>
																<Bar dataKey="saldo" fill="var(--series-siafi)" radius={[6, 6, 0, 0]} barSize={40} />
															</BarChart>
														</ResponsiveContainer>
													</div>
												</div>

												<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
													<div className="flex items-center gap-3 mb-8">
														<div className="p-2 bg-muted rounded-lg text-foreground">
															<PieChartIcon size={20} />
														</div>
														<h3 className="text-heading text-foreground">Contas com Mais Inconsistências</h3>
													</div>
													<div className="h-[300px] w-full">
														<ResponsiveContainer width="100%" height="100%">
															<PieChart>
																<Pie data={topContas} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="count" />
																<RechartsTooltip contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }} />
																<Legend verticalAlign="bottom" height={36} iconType="circle" />
															</PieChart>
														</ResponsiveContainer>
													</div>
												</div>
											</div>

											<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
												<div className="flex items-center gap-3 mb-8">
													<div className="p-2 bg-muted rounded-lg text-foreground">
														<Shield size={20} />
													</div>
													<h3 className="text-heading text-foreground">Inconsistências por Conferente</h3>
												</div>
												<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
													{conferentesList.map((conf, idx) => (
														<div key={idx} className="bg-muted/50 p-6 rounded-xl border border-border">
															<div className="flex items-center justify-between mb-4">
																<h4 className="font-bold text-foreground">{conf.name}</h4>
																<span className="px-3 py-1 bg-muted text-foreground rounded-full text-label">
																	{conf.count} {conf.count === 1 ? "inconsistência" : "inconsistências"}
																</span>
															</div>
															<div className="space-y-2">
																<p className="text-label text-muted-foreground mb-2">UGs Afetadas:</p>
																<div className="flex flex-wrap gap-2">
																	{conf.ugs.map((ug, i) => (
																		<span key={i} className="px-2 py-1 bg-card border border-border rounded-md text-caption font-mono text-muted-foreground">
																			{formatUgName(ug)}
																		</span>
																	))}
																</div>
															</div>
														</div>
													))}
												</div>
											</div>
										</motion.div>
									)}

									{dashboardTab === "tatico" && (
										<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
											<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
												{[
													{ title: "Ranking de ODS por Inconsistências", data: odsList, key: "count", suffix: "ocorrências" },
													{ title: "Ranking de Órgãos Superiores", data: orgaoSuperiorList, key: "count", suffix: "ocorrências" },
												].map((ranking) => (
													<div key={ranking.title} className="bg-card p-8 rounded-xl border border-border shadow-sm">
														<h3 className="text-heading text-foreground mb-6">{ranking.title}</h3>
														<div className="space-y-4">
															{ranking.data.map((item, idx) => (
																<div key={item.name} className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border">
																	<div className="flex items-center gap-4">
																		<span className="text-heading text-warning">{idx + 1}º</span>
																		<span className="font-bold text-foreground">{item.name}</span>
																	</div>
																	<span className="text-body font-mono text-muted-foreground">
																		{(item as { count: number }).count} {ranking.suffix}
																	</span>
																</div>
															))}
														</div>
													</div>
												))}

												<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
													<h3 className="text-heading text-foreground mb-6">Top 10 UGs com Mais Inconsistências</h3>
													<div className="space-y-3">
														{topUgsByInconsistencias.map((ug, idx) => (
															<div key={ug.ug} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
																<div className="flex items-center gap-3">
																	<span className="text-subheading text-warning w-6">{idx + 1}º</span>
																	<span className="font-mono text-body text-foreground">{formatUgName(ug.ug)}</span>
																</div>
																<span className="text-caption text-muted-foreground">{ug.occurrences.length} ocorrências</span>
															</div>
														))}
													</div>
												</div>
											</div>
										</motion.div>
									)}

									{dashboardTab === "estrategico" && (
										<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
											{/* Era um painel azul-sólido de `p-10` com escudo de 300px em marca-d'água
											    e KPIs em `bg-white/10` — o único hero escuro do app. */}
											<SectionHeader
												title="Painel de risco contábil do COMAER"
												description="Panorama consolidado das inconsistências, com os pontos de maior risco financeiro e operacional."
											/>
											<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
												<StatTile label="Total de inconsistências" value={totalInconsistencias} />
												<StatTile
													label="Volume financeiro em risco"
													value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(totalVolume)}
													status="warning"
												/>
												<StatTile label="Maior risco por ODS" value={odsList[0]?.name || "-"} hint={`${odsList[0]?.count || 0} ocorrências`} />
												<StatTile label="Média por UG afetada" value={filteredData.length > 0 ? (totalInconsistencias / filteredData.length).toFixed(1) : 0} />
											</div>

											<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
												{[
													{ title: "Distribuição Percentual por ODS", data: odsList, barColor: "bg-action" },
													{ title: "Concentração por Órgão Superior", data: orgaoSuperiorList, barColor: "bg-warning" },
												].map(({ title, data, barColor }) => (
													<div key={title} className="bg-card p-8 rounded-xl border border-border shadow-sm">
														<h3 className="text-heading text-foreground mb-6">{title}</h3>
														<div className="space-y-4">
															{data.map((item) => {
																const pct = totalInconsistencias > 0 ? Math.round((item.count / totalInconsistencias) * 100) : 0
																return (
																	<div key={item.name} className="flex items-center gap-4">
																		<div className="w-24 text-foreground text-subheading">{item.name}</div>
																		<div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
																			<div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
																		</div>
																		<div className="w-12 text-right font-mono text-body text-muted-foreground">{pct}%</div>
																	</div>
																)
															})}
														</div>
													</div>
												))}
											</div>

											{/* Mapa de Risco + Pareto */}
											<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
												<div className="lg:col-span-2 bg-card p-8 rounded-xl border border-border shadow-sm">
													<div className="flex items-center justify-between mb-8">
														<h3 className="text-heading text-foreground">Mapa de Risco Contábil (Consolidado)</h3>
														<div className="px-3 py-1 bg-muted text-foreground rounded-full text-label">Visão por ODS</div>
													</div>
													<div className="overflow-x-auto">
														<table className="w-full">
															<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
																<tr>
																	{["ODS", "Inconsistências", "Saldo Associado", "% do Total"].map((h, i) => (
																		<th key={h} className={`px-4 py-3${i === 0 ? " text-left" : i < 3 ? " text-center" : " text-right"}`}>
																			{h}
																		</th>
																	))}
																</tr>
															</thead>
															<tbody className="divide-y divide-border">
																{odsList.map((ods) => (
																	<tr key={ods.name} className="hover:bg-muted/40 transition-colors">
																		<td className="py-4 text-foreground text-subheading">{ods.name}</td>
																		<td className="py-4 text-center font-mono text-body text-muted-foreground">{ods.count}</td>
																		<td className="py-4 text-right font-mono text-body text-muted-foreground">
																			{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(ods.saldo)}
																		</td>
																		<td className="py-4 text-right font-mono text-subheading text-foreground">
																			{totalInconsistencias > 0 ? Math.round((ods.count / totalInconsistencias) * 100) : 0}%
																		</td>
																	</tr>
																))}
															</tbody>
														</table>
													</div>
												</div>

												<div className="bg-card p-8 rounded-xl border border-border flex flex-col justify-between">
													<div>
														<h3 className="text-heading text-foreground mb-1 flex items-center gap-2">
															<TrendingUp className="w-5 h-5 text-muted-foreground" />
															Análise de concentração
														</h3>
														<p className="text-caption text-muted-foreground mb-6">Regra de Pareto (80/20)</p>

														<div className="space-y-6">
															<div>
																<h4 className="text-display text-warning mb-1">{Math.round(paretoSummary.concentrationPercentage)}%</h4>
																<p className="text-caption text-muted-foreground leading-relaxed">
																	das inconsistências contábeis estão concentradas em apenas 20% das UGs analisadas.
																</p>
															</div>

															<div className="pt-6 border-t border-border">
																<p className="text-label text-muted-foreground mb-3">UGs de alta concentração</p>
																<div className="space-y-2">
																	{paretoSummary.top20PercentUgs.slice(0, 3).map((item) => (
																		<div key={item.ug} className="flex items-center justify-between text-caption">
																			<span className="text-foreground font-mono">{formatUgName(item.ug)}</span>
																			<span className="font-bold text-warning">{item.count} ocorr.</span>
																		</div>
																	))}
																	{paretoSummary.top20PercentUgs.length > 3 && (
																		<p className="text-hint text-muted-foreground">+ {paretoSummary.top20PercentUgs.length - 3} outras unidades</p>
																	)}
																</div>
															</div>
														</div>
													</div>

													<div className="mt-8 p-4 bg-muted/50 rounded-lg border border-border">
														<p className="text-label text-foreground mb-1">Prioridade de atuação</p>
														<p className="text-hint text-muted-foreground leading-relaxed">
															O direcionamento das ações para estas {paretoSummary.top20PercentUgs.length} UGs resultará na regularização de{" "}
															{Math.round(paretoSummary.concentrationPercentage)}% do passivo contábil.
														</p>
													</div>
												</div>
											</div>

											{/* Priorização */}
											<div className="bg-card p-8 rounded-xl border border-border shadow-sm">
												<div className="flex items-center justify-between mb-8">
													<div className="flex items-center gap-3">
														<div className="p-2 bg-muted rounded-lg text-foreground">
															<Shield size={20} />
														</div>
														<h3 className="text-heading text-foreground">Priorização de Atuação Imediata</h3>
													</div>
													<p className="text-label text-muted-foreground">Baseado em Risco e Impacto Financeiro</p>
												</div>

												<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
													{topUgsByInconsistencias.slice(0, 3).map((ug, idx) => (
														<div
															key={ug.ug}
															className="p-6 bg-muted/50 rounded-xl border border-border relative overflow-hidden group hover:border-warning/30 transition-all"
														>
															<div className="absolute -right-4 -top-4 text-muted-foreground/40 text-8xl group-hover:text-warning/10 transition-colors">
																{idx + 1}
															</div>
															<div className="relative z-10">
																<p className="text-label text-warning mb-1">{idx + 1}º Prioridade</p>
																<h4 className="text-heading text-foreground mb-4">{formatUgName(ug.ug)}</h4>
																<div className="space-y-3">
																	<div className="flex items-center justify-between">
																		<span className="text-label text-muted-foreground">Inconsistências</span>
																		<span className="text-subheading font-mono text-foreground">{ug.occurrences.length}</span>
																	</div>
																	<div className="flex items-center justify-between">
																		<span className="text-label text-muted-foreground">Impacto Financeiro</span>
																		<span className="text-subheading font-mono text-foreground">
																			{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(ug.totalSaldo)}
																		</span>
																	</div>
																	<div className="pt-3 border-t border-border">
																		<p className="text-hint text-muted-foreground italic">
																			{ug.occurrences.length > 3 ? "Alta recorrência de questões RAC." : "Impacto significativo nas demonstrações."}
																		</p>
																	</div>
																</div>
															</div>
														</div>
													))}
												</div>
											</div>
										</motion.div>
									)}
								</section>
							)}

							<footer className="pt-20 pb-32 border-t border-border text-center">
								<div className="flex items-center justify-center gap-4 mb-6 opacity-30">
									<Shield size={24} className="text-foreground" />
									<div className="w-2 h-2 rounded-full bg-warning" />
									<Crosshair size={24} className="text-foreground" />
									<div className="w-2 h-2 rounded-full bg-warning" />
									<Plane size={24} className="text-foreground -rotate-45" />
								</div>
								<p className="text-label text-muted-foreground/60">Analista SUCONT • DIREF • 2026</p>
							</footer>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{data.length > 0 && (
				<AIAssistant
					dataContext={{
						totalInconsistencias,
						totalVolume,
						odsList,
						orgaoSuperiorList,
						topUgsByInconsistencias,
						racList,
						conferentesList,
						paretoSummary,
						criticalLevels,
					}}
				/>
			)}
		</HubLayout>
	)
}
