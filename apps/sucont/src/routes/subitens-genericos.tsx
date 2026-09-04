import { createFileRoute } from "@tanstack/react-router"
import {
	AlertCircle,
	CheckCircle2,
	ChevronRight,
	Copy,
	Crosshair,
	FileSpreadsheet,
	FileText,
	Filter,
	Info,
	LayoutDashboard,
	Map as MapIcon,
	PieChart as PieChartIcon,
	Plane,
	Search,
	Shield,
	TrendingUp,
	Upload,
	X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import React, { useCallback, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts"
import * as XLSX from "xlsx"
import { HubLayout } from "#/components/hub-layout"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip"
import { chartChrome } from "#/lib/chart-theme"
import { blocoFundamentacao, FUNDAMENTO_CONTA_GENERICA } from "#/lib/normas"
import { cn } from "#/lib/utils"
import { AIAssistant } from "#/subitens/components/AIAssistant"
import { CONFERENTES_MAPPING, UG_INFO } from "#/subitens/constants"

export const Route = createFileRoute("/subitens-genericos")({
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
	"RAC 34": {
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
	const [isDragging, setIsDragging] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
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
							racId: "RAC 34",
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

	const onDrop = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		const file = e.dataTransfer.files[0]
		if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
			processFile(file)
		} else {
			setError("Por favor, envie um arquivo Excel (.xlsx ou .xls).")
		}
	}

	const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
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
	return (
		<HubLayout
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
							 * Zona de envio no padrão do hub — a mesma do `DgcUpload`.
							 *
							 * Aqui havia uma capa institucional: avião num disco de 96px com anel
							 * dourado, "Análise de SUBITENS Genéricos" com a palavra do meio em
							 * ouro, e o lema "Defender, Controlar e Integrar" entre duas bússolas.
							 * Nada disso é a tarefa — a tarefa é enviar uma planilha —, e nenhuma
							 * outra ferramenta do hub abre assim. O que a capa dizia de útil (o
							 * que a ferramenta faz) já está na descrição sob a trilha.
							 */}
							<label
								htmlFor="file-upload"
								onDragOver={(e) => {
									e.preventDefault()
									setIsDragging(true)
								}}
								onDragLeave={() => setIsDragging(false)}
								onDrop={onDrop}
								className={cn(
									"mx-auto flex max-w-2xl cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors",
									isDragging ? "border-tech-cyan bg-tech-cyan/5" : "border-border bg-muted/50 hover:border-border/80 hover:bg-muted"
								)}
							>
								<input type="file" onChange={onFileChange} accept=".xlsx,.xls" className="hidden" id="file-upload" />

								{isProcessing ? (
									<Search className="mb-4 h-11 w-11 animate-pulse text-muted-foreground" />
								) : (
									<Upload className="mb-4 h-11 w-11 text-muted-foreground" />
								)}

								<p className="mb-1 text-subheading text-foreground">
									{isProcessing ? (
										"Processando a planilha…"
									) : (
										<>
											<span className="font-semibold text-tech-blue">Clique para enviar</span> ou arraste o relatório
										</>
									)}
								</p>
								<p className="text-caption text-muted-foreground">Excel do Tesouro Gerencial (.xlsx, .xls)</p>

								<div className="mt-6 flex flex-wrap justify-center gap-2">
									{["UG Executora", "Conta Contábil", "Conta Corrente", "Saldo"].map((col) => (
										<Badge key={col} variant="outline">
											{col}
										</Badge>
									))}
								</div>
							</label>

							{error && (
								<Alert variant="destructive" className="mt-8">
									<AlertCircle />
									<AlertTitle>Não foi possível processar a planilha</AlertTitle>
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<div className="mt-12 space-y-6">
								{/* Referencial Metodológico */}
								<div className="p-8 bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all">
									<div className="flex items-start gap-6">
										<div className="w-12 h-12 shrink-0 bg-muted rounded-xl flex items-center justify-center text-foreground ">
											<Shield size={24} />
										</div>
										<div>
											<h3 className="text-heading mb-3 text-foreground">Referencial Metodológico (RAC)</h3>
											<p className="text-body text-muted-foreground leading-relaxed mb-4">
												Esta verificação integra o processo de <strong>Acompanhamento Contábil do COMAER</strong> conduzido pela SUCONT-3, com base na{" "}
												<strong>Questão 34 do Roteiro de Acompanhamento Contábil (RAC)</strong>. A finalidade é garantir que os registros representem de forma
												fidedigna os fatos administrativos e a situação patrimonial.
											</p>
											<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
												{[
													{
														title: "Objetivo da Análise",
														text: "Identificar a utilização indevida de contas contábeis e subitens genéricos (ex: 99, 999, P99, /99) nos registros das Unidades Gestoras.",
													},
													{
														title: "Risco Contábil",
														text: "O uso de subitens genéricos oculta a real natureza da transação, prejudicando a transparência, a precisão da informação e a evidenciação contábil.",
													},
													{
														title: "Importância",
														text: "A regularização preserva a qualidade das demonstrações contábeis e apoia a tomada de decisão da alta administração do COMAER.",
													},
												].map((card) => (
													<div key={card.title} className="bg-muted/50 p-4 rounded-xl border border-border">
														<h4 className="text-label text-foreground mb-2">{card.title}</h4>
														<p className="text-caption text-muted-foreground leading-relaxed">{card.text}</p>
													</div>
												))}
											</div>
										</div>
									</div>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="p-8 bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all">
										<div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-6 text-foreground ">
											<Info size={24} />
										</div>
										<h3 className="text-heading mb-3 text-foreground">O que é analisado?</h3>
										<p className="text-body text-muted-foreground leading-relaxed">
											O sistema analisa o relatório do Tesouro Gerencial com base nas questões do Roteiro de Acompanhamento Contábil (RAC), identificando
											inconsistências como o uso de subitens genéricos (99/999) e outras falhas de classificação.
										</p>
									</div>
									<div className="p-8 bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all">
										<div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-6 text-foreground ">
											<CheckCircle2 size={24} />
										</div>
										<h3 className="text-heading mb-3 text-foreground">Geração Automática</h3>
										<p className="text-body text-muted-foreground leading-relaxed">
											Para cada UG identificada, é gerada uma mensagem institucional formatada pronta para ser enviada via SAU, promovendo a regularização
											contábil de forma padronizada.
										</p>
									</div>
								</div>

								<div className="p-8 bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all">
									<div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mb-6 text-foreground ">
										<MapIcon size={24} />
									</div>
									<h3 className="text-heading mb-4 text-foreground">Caminho do Relatório (Tesouro Gerencial)</h3>
									<div className="bg-muted/50 p-5 rounded-xl border border-border text-body font-mono text-muted-foreground leading-relaxed">
										<div className="flex flex-wrap items-center gap-x-2 gap-y-3">
											{[
												"TESOURO GERENCIAL",
												"Relatórios Compartilhados",
												"Consultas Gerenciais",
												"Relatórios de Bancada dos Órgãos Superiores",
												"52000 - Ministério da Defesa",
												"52111 - Comando da Aeronáutica",
												"SEFA",
												"DIREF",
												"SUCONT-3 - ACOMPANHAMENTO",
												"ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1",
											].map((step, i, arr) => (
												<React.Fragment key={step}>
													<span className="font-semibold text-foreground">{step}</span>
													{i < arr.length - 1 && <ChevronRight size={14} className="text-warning shrink-0" />}
												</React.Fragment>
											))}
										</div>
									</div>
								</div>
							</div>
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

							{/* KPI cards */}
							<section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
								{[
									{
										label: "Unidades Gestoras",
										value: filteredData.length,
										suffix: "afetadas",
										accent: false,
										color: "text-foreground",
									},
									{
										label: "Total de Ocorrências",
										value: filteredData.reduce((acc, curr) => acc + curr.occurrences.length, 0),
										suffix: "registros",
										accent: false,
										color: "text-action",
									},
								].map((kpi, i) => (
									<motion.div
										key={kpi.label}
										initial={{ opacity: 0, y: 20 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ delay: i * 0.1 }}
										className="bg-card p-8 rounded-xl border border-border shadow-sm flex flex-col justify-between relative overflow-hidden group"
									>
										<p className="text-label text-muted-foreground mb-1">{kpi.label}</p>
										<div className="flex items-baseline gap-2">
											<h3 className={`text-display ${kpi.color}`}>{kpi.value}</h3>
											<span className="text-label text-muted-foreground">{kpi.suffix}</span>
										</div>
										<div className="mt-6 h-1.5 w-full bg-muted rounded-full overflow-hidden">
											<div className="h-full bg-tech-blue w-full opacity-30" />
										</div>
									</motion.div>
								))}

								<motion.div
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.2 }}
									className="bg-tech-blue p-8 rounded-xl flex flex-col justify-between text-white relative overflow-hidden group"
								>
									<p className="text-label text-white/40 mb-1">Volume Financeiro</p>
									<div className="flex flex-col">
										<h3 className="text-display font-mono text-warning">
											{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalVolume)}
										</h3>
										<span className="text-label text-white/40 mt-2">em subitens genéricos</span>
									</div>
								</motion.div>
							</section>

							{/* Filter */}
							<section className="bg-card p-8 rounded-xl border border-border shadow-sm mb-12">
								<div className="flex flex-col md:flex-row items-center justify-between gap-8">
									<div className="flex items-center gap-4">
										<div className="p-3 bg-muted rounded-xl text-foreground">
											<Filter size={24} />
										</div>
										<div>
											<div className="flex items-center gap-2">
												<h3 className="text-heading text-foreground">Filtrar Análise</h3>
												{selectedConferente !== "all" && (
													<span className="px-2 py-0.5 bg-warning text-white text-label rounded-full animate-pulse">Filtro Ativo</span>
												)}
											</div>
											<p className="text-label text-muted-foreground">Modo Geral ou por Conferente</p>
										</div>
									</div>

									<div className="flex flex-wrap items-center gap-3">
										<Button
											onClick={() => setSelectedConferente("all")}
											type="button"
											variant="ghost"
											className={cn(
												"h-auto px-5 py-2 rounded-full text-label transition-all flex items-center gap-2",
												selectedConferente === "all" ? "bg-tech-blue text-white shadow-md" : "bg-muted/50 text-muted-foreground hover:bg-muted"
											)}
										>
											Modo Geral
										</Button>

										<div className="flex items-center gap-2">
											<Select items={{ all: "Todos os Conferentes" }} value={selectedConferente} onValueChange={(v) => setSelectedConferente(v ?? "all")}>
												<SelectTrigger className="data-[size=default]:h-auto bg-muted/50 text-foreground border-none rounded-full px-5 py-2 text-label shadow-none focus-visible:ring-2 focus-visible:ring-ring">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="all">Todos os Conferentes</SelectItem>
													{allConferentes.map((c) => (
														<SelectItem key={c} value={c}>
															{c}
														</SelectItem>
													))}
												</SelectContent>
											</Select>

											{selectedConferente !== "all" && (
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																onClick={() => setSelectedConferente("all")}
																type="button"
																variant="ghost"
																size="icon-sm"
																aria-label="Limpar Filtros"
																className="text-muted-foreground hover:text-foreground"
															>
																<X size={16} />
															</Button>
														}
													/>
													<TooltipContent>Limpar Filtros</TooltipContent>
												</Tooltip>
											)}
										</div>
									</div>
								</div>
							</section>

							{/* Tab Navigation */}
							<div className="flex items-center justify-center mb-12">
								<div className="bg-card p-1.5 rounded-full border border-border shadow-sm inline-flex">
									{[
										{ key: "messages", label: "Mensagens Institucionais", icon: FileText },
										{ key: "dashboard", label: "Painel Gerencial", icon: LayoutDashboard },
									].map(({ key, label, icon: Icon }) => (
										<Button
											key={key}
											onClick={() => setActiveTab(key as "messages" | "dashboard")}
											type="button"
											variant="ghost"
											className={cn(
												"h-auto px-6 py-2.5 rounded-full text-label transition-all flex items-center gap-2",
												activeTab === key ? "bg-tech-blue text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted"
											)}
										>
											<Icon size={16} />
											{label}
										</Button>
									))}
								</div>
							</div>

							{activeTab === "messages" ? (
								<>
									{/* Tabela Situacional */}
									<section className="mb-16">
										<div className="flex items-center justify-between mb-8">
											<div className="flex items-center gap-3">
												<div className="w-12 h-12 bg-muted text-foreground rounded-xl flex items-center justify-center border border-border shadow-sm">
													<FileSpreadsheet size={24} />
												</div>
												<div>
													<h2 className="text-heading text-foreground">Retrato Situacional</h2>
													<p className="text-label text-muted-foreground">Detalhamento por Conta e Saldo</p>
												</div>
											</div>
										</div>

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
																	<td className="px-10 py-5">
																		{oIdx === 0 ? (
																			<div className="flex flex-col gap-1">
																				<div className="flex items-center gap-3">
																					<div className="w-1.5 h-1.5 rounded-full bg-warning" />
																					<span className="text-heading text-foreground">{formatUgName(group.ug)}</span>
																				</div>
																				<span className="text-label text-muted-foreground ml-4">Conferente: {getConferente(group.ug)}</span>
																			</div>
																		) : (
																			<span className="opacity-0">{group.ug}</span>
																		)}
																	</td>
																	<td className="px-10 py-5">
																		<span className="px-3 py-1 bg-muted text-foreground rounded-full text-label">{occ.racId}</span>
																	</td>
																	<td className="px-10 py-5 font-mono text-body text-muted-foreground">{occ.contaContabil}</td>
																	<td className="px-10 py-5 font-mono text-body">
																		<span className="px-3 py-1 bg-destructive/10 text-destructive rounded-lg text-label border border-destructive/30 shadow-sm">
																			{occ.contaCorrente}
																		</span>
																	</td>
																	<td className="px-10 py-5 font-mono text-subheading text-right text-foreground">
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
										<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
											<div className="flex items-center gap-3">
												<div className="w-12 h-12 bg-tech-blue text-white rounded-xl flex items-center justify-center">
													<FileText size={24} />
												</div>
												<div>
													<h2 className="text-heading text-foreground">Expedição de Cobranças</h2>
													<p className="text-label text-muted-foreground">Comunicações Oficiais Geradas</p>
												</div>
											</div>

											<div className="flex items-center bg-card rounded-full p-1 border border-border shadow-sm">
												{[
													{ key: "individual", label: "Por Unidade Gestora" },
													{ key: "consolidated", label: "Consolidada por Questão" },
												].map(({ key, label }) => (
													<Button
														key={key}
														onClick={() => setMessageMode(key as "individual" | "consolidated")}
														type="button"
														variant="ghost"
														className={cn(
															"h-auto px-4 py-2 rounded-full text-label transition-all",
															messageMode === key ? "bg-tech-blue text-white shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
														)}
													>
														{label}
													</Button>
												))}
											</div>
										</div>

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

													return (
														<motion.div
															key={group.ug}
															initial={{ opacity: 0, y: 20 }}
															whileInView={{ opacity: 1, y: 0 }}
															viewport={{ once: true }}
															transition={{ delay: idx * 0.05 }}
															className="bg-card rounded-xl border border-foreground/10 shadow-sm hover:shadow-xl hover:shadow-foreground/5 transition-all duration-500 overflow-hidden flex flex-col lg:flex-row"
														>
															<div className="lg:w-80 bg-muted/50 p-10 border-b lg:border-b-0 lg:border-r border-border flex flex-col justify-between">
																<div>
																	<div className="flex items-center gap-2 mb-6">
																		<span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
																		<span className="text-label text-muted-foreground">Status: Pendente</span>
																	</div>
																	<p className="text-label text-muted-foreground mb-1">Unidade Gestora</p>
																	<h3 className="text-display text-foreground mb-1">{formatUgName(group.ug)}</h3>
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
																					className="h-auto w-full rounded-xl border-border bg-card px-3 py-2 font-mono text-caption text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
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
																					className="h-auto w-full rounded-xl border-border bg-card px-3 py-2 font-mono text-caption text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
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
																					<SelectTrigger
																						id={`ug-msg-type-${idx}`}
																						className="w-full px-3 py-2 bg-card border border-border rounded-xl text-label text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
																					>
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
																								className="h-auto w-full rounded-xl border-border bg-card px-3 py-2 font-mono text-caption text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
																							/>
																						</div>
																					</motion.div>
																				)}
																			</AnimatePresence>
																		</div>
																	</div>
																</div>

																<Button
																	onClick={() => copyToClipboard(message, idx)}
																	type="button"
																	variant="default"
																	className={cn(
																		"h-auto mt-12 w-full py-4 rounded-xl flex items-center justify-center gap-3 transition-all text-label",
																		copiedIndex === idx ? "bg-success text-success-foreground shadow-lg" : "bg-tech-blue text-white hover:bg-tech-blue"
																	)}
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

															<div className="flex-1 p-10 bg-card relative">
																<div className="absolute top-6 right-10 flex items-center gap-2">
																	<div className="w-2 h-2 rounded-full bg-surface-inverted/20" />
																	<span className="text-label text-foreground/20">Documento Institucional</span>
																</div>
																<div className="prose prose-sm max-w-none">
																	<pre className="whitespace-pre-wrap font-sans text-body leading-relaxed text-foreground/70 max-h-[500px] overflow-y-auto pr-6 scrollbar-thin scrollbar-thumb-foreground/10">
																		{message}
																	</pre>
																</div>
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
													const totalSaldo = occurrences.reduce((sum, occ) => sum + occ.saldo, 0)
													const uniqueUgs = new Set(occurrences.map((o) => o.ug)).size

													return (
														<motion.div
															key={racId}
															initial={{ opacity: 0, y: 20 }}
															whileInView={{ opacity: 1, y: 0 }}
															viewport={{ once: true }}
															transition={{ delay: idx * 0.05 }}
															className="bg-card rounded-xl border border-foreground/10 shadow-sm hover:shadow-xl hover:shadow-foreground/5 transition-all duration-500 overflow-hidden flex flex-col lg:flex-row"
														>
															<div className="lg:w-80 bg-muted/50 p-10 border-b lg:border-b-0 lg:border-r border-border flex flex-col justify-between">
																<div>
																	<div className="flex items-center gap-2 mb-6">
																		<span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
																		<span className="text-label text-muted-foreground">Status: Pendente</span>
																	</div>
																	<p className="text-label text-muted-foreground mb-1">Questão RAC</p>
																	<h3 className="text-display text-foreground mb-1">{RAC_QUESTIONS[racId]?.title || racId}</h3>
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
																					className="h-auto w-full rounded-xl border-border bg-card px-3 py-2 font-mono text-caption text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
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
																					className="h-auto w-full rounded-xl border-border bg-card px-3 py-2 font-mono text-caption text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
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
																					<SelectTrigger
																						id={`rac-msg-type-${idx}`}
																						className="w-full px-3 py-2 bg-card border border-border rounded-xl text-label text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
																					>
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
																								className="h-auto w-full rounded-xl border-border bg-card px-3 py-2 font-mono text-caption text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-ring/20"
																							/>
																						</div>
																					</motion.div>
																				)}
																			</AnimatePresence>
																		</div>
																	</div>
																</div>

																<Button
																	onClick={() => copyToClipboard(message, idx)}
																	type="button"
																	variant="default"
																	className={cn(
																		"h-auto mt-12 w-full py-4 rounded-xl flex items-center justify-center gap-3 transition-all text-label",
																		copiedIndex === idx ? "bg-success text-success-foreground shadow-lg" : "bg-tech-blue text-white hover:bg-tech-blue"
																	)}
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

															<div className="flex-1 p-10 bg-card relative">
																<div className="absolute top-6 right-10 flex items-center gap-2">
																	<div className="w-2 h-2 rounded-full bg-surface-inverted/20" />
																	<span className="text-label text-foreground/20">Documento Institucional</span>
																</div>
																<div className="prose prose-sm max-w-none">
																	<pre className="whitespace-pre-wrap font-sans text-body leading-relaxed text-foreground/70 max-h-[500px] overflow-y-auto pr-6 scrollbar-thin scrollbar-thumb-foreground/10">
																		{message}
																	</pre>
																</div>
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
									<div className="flex items-center justify-between mb-8">
										<div className="flex items-center gap-3">
											<div className="w-12 h-12 bg-muted text-foreground rounded-xl flex items-center justify-center border border-border shadow-sm">
												<TrendingUp size={24} />
											</div>
											<div>
												<h2 className="text-heading text-foreground">Painel Estratégico de Acompanhamento</h2>
												<p className="text-label text-muted-foreground">Visão Operacional, Tática e Estratégica</p>
											</div>
										</div>
									</div>

									<div className="flex bg-card p-2 rounded-xl border border-border shadow-sm w-fit mb-8">
										{(["operacional", "tatico", "estrategico"] as const).map((tab) => (
											<Button
												key={tab}
												onClick={() => setDashboardTab(tab)}
												type="button"
												variant="ghost"
												className={cn(
													"h-auto px-6 py-3 rounded-xl text-label transition-all",
													dashboardTab === tab ? "bg-tech-blue text-white shadow-md" : "text-muted-foreground hover:bg-muted"
												)}
											>
												{tab === "operacional" ? "Nível Operacional" : tab === "tatico" ? "Nível Tático" : "Nível Estratégico"}
											</Button>
										))}
									</div>

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
											<div className="bg-tech-blue p-10 rounded-xl text-white relative overflow-hidden">
												<div className="absolute -right-10 -top-10 opacity-[0.05]">
													<Shield size={300} className="text-white" />
												</div>
												<div className="relative z-10">
													<h3 className="text-display text-warning mb-2">Painel de Risco Contábil do COMAER</h3>
													<p className="text-body text-white/60 mb-10 max-w-2xl">
														Panorama consolidado das inconsistências contábeis identificadas, permitindo a visualização rápida dos pontos de maior risco
														financeiro e operacional.
													</p>

													<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
														{[
															{
																label: "Total de Inconsistências",
																value: <h4 className="text-display text-white">{totalInconsistencias}</h4>,
															},
															{
																label: "Volume Financeiro em Risco",
																value: (
																	<h4 className="text-display font-mono text-warning mt-2">
																		{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(totalVolume)}
																	</h4>
																),
															},
															{
																label: "Maior Risco por ODS",
																value: (
																	<>
																		<h4 className="text-display text-white mt-2">{odsList[0]?.name || "-"}</h4>
																		<p className="text-hint text-white/50 mt-1">{odsList[0]?.count || 0} ocorrências</p>
																	</>
																),
															},
															{
																label: "Média por UG Afetada",
																value: (
																	<h4 className="text-display text-white mt-1">
																		{filteredData.length > 0 ? (totalInconsistencias / filteredData.length).toFixed(1) : 0}
																	</h4>
																),
															},
														].map((kpi) => (
															<div key={kpi.label} className="bg-white/10 p-6 rounded-xl border border-white/10">
																<p className="text-label text-white/50 mb-1">{kpi.label}</p>
																{kpi.value}
															</div>
														))}
													</div>
												</div>
											</div>

											<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
												{[
													{ title: "Distribuição Percentual por ODS", data: odsList, barColor: "bg-tech-blue" },
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

												<div className="bg-tech-blue p-8 rounded-xl text-white flex flex-col justify-between">
													<div>
														<div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6">
															<TrendingUp size={24} className="text-warning" />
														</div>
														<h3 className="text-display mb-2">Análise de Concentração</h3>
														<p className="text-label text-white/50 mb-6">Regra de Pareto (80/20)</p>

														<div className="space-y-6">
															<div>
																<h4 className="text-display text-warning mb-1">{Math.round(paretoSummary.concentrationPercentage)}%</h4>
																<p className="text-caption text-white/60 leading-relaxed">
																	das inconsistências contábeis estão concentradas em apenas 20% das UGs analisadas.
																</p>
															</div>

															<div className="pt-6 border-t border-white/10">
																<p className="text-label text-white/40 mb-3">UGs de Alta Concentração:</p>
																<div className="space-y-2">
																	{paretoSummary.top20PercentUgs.slice(0, 3).map((item) => (
																		<div key={item.ug} className="flex items-center justify-between text-caption">
																			<span className="text-white/70 font-mono">{formatUgName(item.ug)}</span>
																			<span className="font-bold text-warning">{item.count} ocorr.</span>
																		</div>
																	))}
																	{paretoSummary.top20PercentUgs.length > 3 && (
																		<p className="text-hint text-white/30 italic">+ {paretoSummary.top20PercentUgs.length - 3} outras unidades</p>
																	)}
																</div>
															</div>
														</div>
													</div>

													<div className="mt-8 p-4 bg-white/5 rounded-xl border border-white/10">
														<p className="text-label text-warning mb-1">Prioridade de Atuação</p>
														<p className="text-hint text-white/50 leading-relaxed">
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
