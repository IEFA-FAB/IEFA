/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ClassValue, clsx } from "clsx"
import {
	AlertCircle,
	CheckCircle2,
	ChevronRight,
	Compass,
	Copy,
	Crosshair,
	FileSpreadsheet,
	FileText,
	Info,
	LayoutDashboard,
	Map,
	PieChart as PieChartIcon,
	Plane,
	Radar,
	Search,
	Shield,
	TrendingUp,
	Upload,
	X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import React, { useCallback, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts"
import { twMerge } from "tailwind-merge"
import * as XLSX from "xlsx"
import { AIAssistant } from "./components/AIAssistant"
import { UG_INFO } from "./constants"

/**
 * Utility for Tailwind class merging
 */
function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

// --- Types ---

interface SiafiRow {
	"UG Executora": string | number
	"Conta Contábil": string | number
	"Conta Corrente": string | number
	"Saldo - Moeda Origem (Conta Contábil)": number | string
}

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

// --- Constants ---

const RAC_QUESTIONS: Record<string, { title: string; description: string }> = {
	"RAC 34": {
		title: "Utilização de Contas/Subitens Genéricos",
		description:
			"Identificação de saldos em contas contábeis que utilizam subitens genéricos (terminados em 99 ou 999), o que prejudica a transparência e a correta evidenciação dos atos e fatos administrativos.",
	},
}

const CONFERENTES_MAPPING: Record<string, string> = {
	"120001": "1S ELIANA",
	"120002": "1S ELIANA",
	"120004": "1S ELIANA",
	"120005": "1S ELIANA",
	"120006": "1T JEFFERSON LUÍS",
	"120007": "1T ÉRIKA VICENTE",
	"120008": "1S ELIANA",
	"120013": "1T ÉRIKA VICENTE",
	"120014": "1T JEFFERSON LUÍS",
	"120015": "1S ELIANA",
	"120016": "1T JEFFERSON LUÍS",
	"120018": "1T ÉRIKA VICENTE",
	"120019": "1T ÉRIKA VICENTE",
	"120021": "1T ÉRIKA VICENTE",
	"120023": "1S ELIANA",
	"120025": "1S ELIANA",
	"120026": "1T JEFFERSON LUÍS",
	"120029": "2S PÂMELA",
	"120030": "1T ÉRIKA VICENTE",
	"120035": "1T ÉRIKA VICENTE",
	"120036": "1T JEFFERSON LUÍS",
	"120039": "1T ÉRIKA VICENTE",
	"120040": "2S PÂMELA",
	"120041": "2S PÂMELA",
	"120042": "1S ELIANA",
	"120044": "2S PÂMELA",
	"120045": "1T ÉRIKA VICENTE",
	"120047": "1S ELIANA",
	"120048": "2S PÂMELA",
	"120049": "2S PÂMELA",
	"120052": "1S ELIANA",
	"120053": "1T JEFFERSON LUÍS",
	"120060": "2S PÂMELA",
	"120061": "1T ÉRIKA VICENTE",
	"120062": "1T ÉRIKA VICENTE",
	"120064": "1S ELIANA",
	"120065": "2S PÂMELA",
	"120066": "1T JEFFERSON LUÍS",
	"120068": "1T JEFFERSON LUÍS",
	"120069": "1T JEFFERSON LUÍS",
	"120071": "2S PÂMELA",
	"120072": "2S PÂMELA",
	"120073": "2S PÂMELA",
	"120075": "2S PÂMELA",
	"120077": "2S PÂMELA",
	"120082": "1S ELIANA",
	"120087": "1T ÉRIKA VICENTE",
	"120088": "1T JEFFERSON LUÍS",
	"120089": "1T JEFFERSON LUÍS",
	"120090": "2S PÂMELA",
	"120091": "1T JEFFERSON LUÍS",
	"120093": "1T ÉRIKA VICENTE",
	"120094": "1S ELIANA",
	"120096": "1S ELIANA",
	"120097": "1T ÉRIKA VICENTE",
	"120099": "1T ÉRIKA VICENTE",
	"120100": "1S ELIANA",
	"120108": "1T JEFFERSON LUÍS",
	"120127": "2S PÂMELA",
	"120152": "1S ELIANA",
	"120154": "1T JEFFERSON LUÍS",
	"120195": "2S PÂMELA",
	"120225": "1T JEFFERSON LUÍS",
	"120255": "1T ÉRIKA VICENTE",
	"120257": "2S PÂMELA",
	"120258": "2S PÂMELA",
	"120259": "2S PÂMELA",
	"120260": "1S ELIANA",
	"120261": "1T JEFFERSON LUÍS",
	"120265": "1S ELIANA",
	"120279": "1T ÉRIKA VICENTE",
	"120283": "1S ELIANA",
	"120512": "1T JEFFERSON LUÍS",
	"120623": "2S PÂMELA",
	"120624": "1T JEFFERSON LUÍS",
	"120625": "1S ELIANA",
	"120628": "1T ÉRIKA VICENTE",
	"120629": "2S PÂMELA",
	"120630": "1S ELIANA",
	"120631": "1S ELIANA",
	"120632": "1T ÉRIKA VICENTE",
	"120633": "1T ÉRIKA VICENTE",
	"120636": "1T JEFFERSON LUÍS",
	"120637": "1T ÉRIKA VICENTE",
	"120638": "1T JEFFERSON LUÍS",
	"120641": "2S PÂMELA",
	"120643": "1T JEFFERSON LUÍS",
	"120645": "1T ÉRIKA VICENTE",
	"120669": "1T ÉRIKA VICENTE",
	"120701": "2S PÂMELA",
	"120702": "1T JEFFERSON LUÍS",
	"121002": "1T JEFFERSON LUÍS",
}

const getConferente = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && CONFERENTES_MAPPING[match[0]]) {
		return CONFERENTES_MAPPING[match[0]]
	}
	return "Não atribuído"
}

const getOdsForUg = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) {
		return UG_INFO[match[0]].ods
	}
	return "OUTROS"
}

const getOrgaoSuperiorForUg = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) {
		return UG_INFO[match[0]].orgaoSuperior
	}
	return "OUTROS"
}

const formatUgName = (ugString: string): string => {
	const match = ugString.match(/\b\d{6}\b/)
	if (match && UG_INFO[match[0]]) {
		return `${ugString} (${UG_INFO[match[0]].sigla})`
	}
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

const _formatUgWithConferente = (ugString: string): string => {
	const conferente = getConferente(ugString)
	const ugDisplay = formatUgFull(ugString)
	return `${ugDisplay} — Conferente: ${conferente}`
}

const GENERIC_SUBITEM_REGEX = /(^|\D)(99|999)($|\D)/

const INSTITUTIONAL_TEMPLATE = (
	_ug: string,
	occurrences: ProcessedData[],
	_date: string,
	monthYear: string,
	messageType: "com_prazo" | "sem_prazo" | "alerta" = "sem_prazo",
	deadline: string = "",
	messageNumber: string = "XXX",
	focalRacId?: string
) => {
	const groupedByRac: Record<string, ProcessedData[]> = {}
	occurrences.forEach((occ) => {
		if (!groupedByRac[occ.racId]) groupedByRac[occ.racId] = []
		groupedByRac[occ.racId].push(occ)
	})

	const racIds = focalRacId && focalRacId !== "all" ? [focalRacId] : Object.keys(groupedByRac)

	const occurrencesList = racIds
		.map((id) => {
			return groupedByRac[id]
				.map(
					(occ) =>
						`   • Conta Contábil ${occ.contaContabil} — Conta Corrente ${occ.contaCorrente} — Saldo: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(occ.saldo)}`
				)
				.join("\n")
		})
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
	deadline: string = "",
	messageNumber: string = "XXX"
) => {
	const groupedByUg: Record<string, ProcessedData[]> = {}
	occurrences.forEach((occ) => {
		if (!groupedByUg[occ.ug]) groupedByUg[occ.ug] = []
		groupedByUg[occ.ug].push(occ)
	})

	const occurrencesList = Object.keys(groupedByUg)
		.map((ug) => {
			const list = groupedByUg[ug]
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

${conclusion}

Atenciosamente,

Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)
Subdiretoria de Contabilidade (SUCONT)
Diretoria de Economia e Finanças da Aeronáutica (DIREF)`
}

// --- Components ---

export default function App() {
	const [data, setData] = useState<UgGroup[]>([])
	const [isDragging, setIsDragging] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
	const [activeTab, setActiveTab] = useState<"messages" | "dashboard">("messages")

	// Reference parameters
	const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split("T")[0])
	const [msgNumber, setMsgNumber] = useState<string>("___")
	const [msgDate, setMsgDate] = useState<string>(new Date().toISOString().split("T")[0])

	// State for per-UG configurations
	const [ugConfigs, setUgConfigs] = useState<
		Record<string, { messageType: "com_prazo" | "sem_prazo" | "alerta"; deadlineDate: string; msgNumber: string; msgDate: string }>
	>({})
	const [racConfigs, setRacConfigs] = useState<
		Record<string, { messageType: "com_prazo" | "sem_prazo" | "alerta"; deadlineDate: string; msgNumber: string; msgDate: string }>
	>({})
	const [messageMode, setMessageMode] = useState<"individual" | "consolidated">("individual")
	const [selectedConferente, setSelectedConferente] = useState<string | "all">("all")
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

	const updateUgConfig = (ug: string, field: string, value: any) => {
		setUgConfigs((prev) => ({
			...prev,
			[ug]: {
				...(prev[ug] || {
					messageType: "sem_prazo",
					deadlineDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
					msgNumber: msgNumber,
					msgDate: msgDate,
				}),
				[field]: value,
			},
		}))
	}

	const updateRacConfig = (racId: string, field: string, value: any) => {
		setRacConfigs((prev) => ({
			...prev,
			[racId]: {
				...(prev[racId] || {
					messageType: "sem_prazo",
					deadlineDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
					msgNumber: msgNumber,
					msgDate: msgDate,
				}),
				[field]: value,
			},
		}))
	}

	const getDeadlineText = (ug: string) => {
		const config = ugConfigs[ug]
		if (!config || config.messageType !== "com_prazo" || !config.deadlineDate) return ""
		const [year, month, day] = config.deadlineDate.split("-")
		return `${day}/${month}/${year}`
	}

	const getRacDeadlineText = (racId: string) => {
		const config = racConfigs[racId]
		if (!config || config.messageType !== "com_prazo" || !config.deadlineDate) return ""
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
				const workbook = XLSX.read(bstr, { type: "binary" })
				const sheetName = workbook.SheetNames[0]
				const worksheet = workbook.Sheets[sheetName]

				// Skip first 11 rows (header info) and start at line 12 (index 11)
				const jsonData = XLSX.utils.sheet_to_json(worksheet, {
					defval: "",
					range: 11,
				}) as any[]

				if (jsonData.length === 0) {
					throw new Error("O arquivo está vazio ou não contém dados válidos.")
				}

				// Flexible Column Mapping
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
					const missing = []
					if (!ugCol) missing.push("UG Executora")
					if (!contaCol) missing.push("Conta Contábil")
					if (!ccCol) missing.push("Conta Corrente")
					if (!saldoCol) missing.push("Saldo")
					throw new Error(`Não foi possível identificar as colunas: ${missing.join(", ")}. Verifique o cabeçalho da planilha.`)
				}

				// Filter and Process
				const filtered: ProcessedData[] = jsonData
					.map((row) => {
						const cc = String(row[ccCol] || "")
						const saldoRaw = row[saldoCol]
						let saldo = 0

						if (typeof saldoRaw === "number") {
							saldo = saldoRaw
						} else {
							// Handle string currency format like "R$ 1.234,56" or "1234.56"
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
					.filter((row) => {
						// Check if it's a generic subitem
						return GENERIC_SUBITEM_REGEX.test(row.contaCorrente)
					})

				// Group by UG
				const groups: Record<string, UgGroup> = {}
				filtered.forEach((row) => {
					if (!groups[row.ug]) {
						groups[row.ug] = { ug: row.ug, occurrences: [], totalSaldo: 0 }
					}

					const existing = groups[row.ug].occurrences.find((o) => o.contaContabil === row.contaContabil && o.contaCorrente === row.contaCorrente)

					if (existing) {
						existing.saldo += row.saldo
					} else {
						groups[row.ug].occurrences.push({ ...row })
					}

					groups[row.ug].totalSaldo += row.saldo
				})

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
		reader.readAsBinaryString(file)
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

	const _today = new Intl.DateTimeFormat("pt-BR").format(new Date())

	// Filtering Logic
	const allConferentes = Array.from(new Set(Object.values(CONFERENTES_MAPPING))).sort()

	const filteredData = data.filter((group) => {
		const matchesConferente = selectedConferente === "all" || getConferente(group.ug) === selectedConferente
		const hasOccurrences = group.occurrences.length > 0
		return matchesConferente && hasOccurrences
	})

	// Dashboard Data Preparation
	const topUgsBySaldo = [...filteredData]
		.sort((a, b) => b.totalSaldo - a.totalSaldo)
		.slice(0, 5)
		.map((ug) => ({
			name: formatUgName(ug.ug),
			saldo: ug.totalSaldo,
		}))

	const contasCount: Record<string, number> = {}
	filteredData.forEach((group) => {
		group.occurrences.forEach((occ) => {
			contasCount[occ.contaContabil] = (contasCount[occ.contaContabil] || 0) + 1
		})
	})
	const topContas = Object.entries(contasCount)
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 5)

	const conferentesData: Record<string, { ugs: string[]; count: number }> = {}
	filteredData.forEach((group) => {
		const conferente = getConferente(group.ug)
		if (!conferentesData[conferente]) {
			conferentesData[conferente] = { ugs: [], count: 0 }
		}
		conferentesData[conferente].ugs.push(group.ug)
		conferentesData[conferente].count += group.occurrences.length
	})

	const conferentesList = Object.entries(conferentesData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)

	// --- Strategic Dashboard Data ---
	const totalInconsistencias = filteredData.reduce((acc, curr) => acc + curr.occurrences.length, 0)
	const totalVolume = filteredData.reduce((acc, curr) => acc + curr.totalSaldo, 0)

	const odsData: Record<string, { count: number; saldo: number }> = {}
	const orgaoSuperiorData: Record<string, { count: number; saldo: number }> = {}
	const racData: Record<string, { count: number }> = {}

	filteredData.forEach((group) => {
		const ods = getOdsForUg(group.ug)
		const orgao = getOrgaoSuperiorForUg(group.ug)

		if (!odsData[ods]) odsData[ods] = { count: 0, saldo: 0 }
		odsData[ods].count += group.occurrences.length
		odsData[ods].saldo += group.totalSaldo

		if (!orgaoSuperiorData[orgao]) orgaoSuperiorData[orgao] = { count: 0, saldo: 0 }
		orgaoSuperiorData[orgao].count += group.occurrences.length
		orgaoSuperiorData[orgao].saldo += group.totalSaldo

		group.occurrences.forEach((occ) => {
			if (!racData[occ.racId]) racData[occ.racId] = { count: 0 }
			racData[occ.racId].count += 1
		})
	})

	const odsList = Object.entries(odsData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)

	const orgaoSuperiorList = Object.entries(orgaoSuperiorData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)

	const racList = Object.entries(racData)
		.map(([name, info]) => ({ name, ...info }))
		.sort((a, b) => b.count - a.count)

	const topUgsByInconsistencies = [...filteredData].sort((a, b) => b.occurrences.length - a.occurrences.length)

	// Pareto Analysis (80/20 Rule)
	const totalUgsCount = filteredData.length
	const paretoData = topUgsByInconsistencies.reduce(
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

	// Critical Levels Identification
	const criticalLevels = {
		odsMaisCritico: odsList[0]?.name || "N/A",
		orgaoSuperiorMaisCritico: orgaoSuperiorList[0]?.name || "N/A",
		ugMaiorConcentracao: topUgsByInconsistencies[0]?.ug || "N/A",
		ugMaiorSaldo: [...filteredData].sort((a, b) => b.totalSaldo - a.totalSaldo)[0]?.ug || "N/A",
		odsMaiorImpactoFinanceiro: [...odsList].sort((a, b) => b.saldo - a.saldo)[0]?.name || "N/A",
		orgaoSuperiorMaiorSaldo: [...orgaoSuperiorList].sort((a, b) => b.saldo - a.saldo)[0]?.name || "N/A",
	}

	// Group occurrences by RAC for consolidated messages
	const occurrencesByRac: Record<string, ProcessedData[]> = {}
	filteredData.forEach((group) => {
		group.occurrences.forEach((occ) => {
			if (!occurrencesByRac[occ.racId]) occurrencesByRac[occ.racId] = []
			occurrencesByRac[occ.racId].push(occ)
		})
	})

	const COLORS = ["#00205B", "#003DA5", "#D4AF37", "#4A90E2", "#87CEEB", "#B0C4DE", "#4682B4"]

	return (
		<div className="min-h-screen bg-slate-50 text-[#141414] font-sans selection:bg-fab-blue selection:text-white relative overflow-hidden">
			{/* Background Watermark */}
			<div className="fixed inset-0 pointer-events-none opacity-[0.02] flex items-center justify-center overflow-hidden z-0">
				<div className="absolute top-10 left-10">
					<Plane size={300} className="-rotate-45 text-fab-blue" />
				</div>
				<div className="absolute bottom-10 right-10">
					<Radar size={400} className="text-fab-blue" />
				</div>
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
					<Shield size={800} className="text-fab-blue" />
				</div>
			</div>

			{/* Institutional Header */}
			<header className="bg-gradient-to-r from-fab-blue to-fab-light-blue border-b-4 border-fab-gold py-8 px-6 sticky top-0 z-50 shadow-xl relative overflow-hidden">
				{/* Subtle background pattern in header */}
				<div className="absolute inset-0 opacity-5 pointer-events-none">
					<div
						className="absolute top-0 left-0 w-full h-full"
						style={{ backgroundImage: "radial-gradient(circle at 2px 2px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}
					></div>
				</div>

				<div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
					<div className="flex items-center gap-6">
						<div className="hidden sm:flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl shadow-lg border border-white/10 rotate-3 hover:rotate-0 transition-transform duration-500">
							<Plane className="text-fab-gold -rotate-45" size={32} />
						</div>
						<div>
							<div className="flex items-center gap-2 mb-1">
								<Shield className="text-fab-gold" size={12} />
								<span className="text-[10px] font-bold tracking-[0.2em] text-fab-sky uppercase">FORÇA AÉREA BRASILEIRA • DIREF • SUCONT</span>
							</div>
							<h1 className="text-3xl md:text-4xl font-serif italic tracking-tight text-white">
								Analista SUCONT <span className="text-fab-gold">/</span> Subitens Genéricos
							</h1>
							<div className="flex items-center gap-2 mt-2">
								<div className="px-3 py-1 bg-fab-gold/20 border border-fab-gold/40 rounded-full flex items-center gap-2 shadow-sm">
									<Shield size={10} className="text-fab-gold" />
									<span className="text-[10px] uppercase tracking-[0.15em] font-black text-fab-gold">
										Acompanhamento Contábil: Questão 34 do Roteiro (SUCONT-3)
									</span>
								</div>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-4">
						<div className="text-right hidden md:flex flex-col gap-1">
							<div className="flex items-center gap-2 justify-end">
								<label className="text-[9px] uppercase tracking-wider font-bold text-fab-sky/60">Data Relatório</label>
								<input
									type="date"
									value={reportDate}
									onChange={(e) => setReportDate(e.target.value)}
									className="bg-transparent border-b border-white/20 font-mono text-xs focus:outline-none focus:border-fab-gold text-white"
								/>
							</div>
							<div className="flex items-center gap-2 justify-end">
								<label className="text-[9px] uppercase tracking-wider font-bold text-fab-sky/60">Nº Mensagem</label>
								<input
									type="text"
									value={msgNumber}
									onChange={(e) => setMsgNumber(e.target.value)}
									placeholder="___"
									className="bg-transparent border-b border-white/20 font-mono text-xs w-12 text-right focus:outline-none focus:border-fab-gold text-white placeholder:text-white/30"
								/>
							</div>
							<div className="flex items-center gap-2 justify-end">
								<label className="text-[9px] uppercase tracking-wider font-bold text-fab-sky/60">Data Mensagem</label>
								<input
									type="date"
									value={msgDate}
									onChange={(e) => setMsgDate(e.target.value)}
									className="bg-transparent border-b border-white/20 font-mono text-xs focus:outline-none focus:border-fab-gold text-white"
								/>
							</div>
						</div>
						<div className="h-10 w-[1px] bg-white/20 hidden md:block"></div>
						<button
							onClick={() => window.location.reload()}
							className="px-6 py-2.5 rounded-full border border-fab-gold/30 bg-fab-gold/10 text-fab-gold hover:bg-fab-gold hover:text-fab-blue shadow-lg transition-all text-sm font-bold uppercase tracking-widest backdrop-blur-sm"
						>
							Nova Análise
						</button>
					</div>
				</div>
			</header>

			<main className="max-w-6xl mx-auto p-6 md:p-12 relative z-10">
				<AnimatePresence mode="wait">
					{data.length === 0 ? (
						<motion.div
							key="upload"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95 }}
							className="max-w-2xl mx-auto"
						>
							<div className="mb-12 text-center">
								<div className="inline-flex items-center justify-center w-24 h-24 bg-fab-sky rounded-full mb-8 shadow-inner border-4 border-white relative">
									<div className="absolute inset-0 border-2 border-fab-gold/30 rounded-full m-1"></div>
									<Plane className="text-fab-blue -rotate-45" size={40} />
								</div>
								<h2 className="text-5xl font-serif italic text-fab-blue mb-6 tracking-tight">
									Análise de <span className="text-fab-gold">Subitens</span> Genéricos
								</h2>
								<p className="text-fab-blue/60 leading-relaxed mb-8 max-w-2xl mx-auto">
									Ferramenta institucional da DIREF para identificação automatizada de utilização de subitens genéricos (99/999) no Tesouro Gerencial (Base
									SIAFI).
								</p>
								<div className="flex items-center justify-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-fab-blue/40">
									<Compass size={14} className="text-fab-gold" />
									<span>Defender, Controlar e Integrar</span>
									<Compass size={14} className="text-fab-gold" />
								</div>
							</div>

							<div
								onDragOver={(e) => {
									e.preventDefault()
									setIsDragging(true)
								}}
								onDragLeave={() => setIsDragging(false)}
								onDrop={onDrop}
								className={cn(
									"relative group cursor-pointer transition-all duration-500",
									"border-2 border-dashed rounded-[32px] p-12",
									"flex flex-col items-center justify-center text-center gap-6",
									isDragging
										? "border-fab-blue bg-fab-blue/5 scale-[1.02]"
										: "border-fab-blue/10 bg-white hover:border-fab-blue/40 hover:shadow-2xl hover:shadow-fab-blue/5"
								)}
							>
								<input type="file" onChange={onFileChange} accept=".xlsx,.xls" className="absolute inset-0 opacity-0 cursor-pointer" id="file-upload" />

								<div
									className={cn(
										"w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500",
										isDragging ? "bg-fab-blue text-white rotate-12" : "bg-fab-sky text-fab-blue group-hover:scale-110 shadow-lg shadow-fab-blue/5"
									)}
								>
									{isProcessing ? (
										<motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
											<Search size={40} />
										</motion.div>
									) : (
										<Upload size={40} />
									)}
								</div>

								<div>
									<p className="text-2xl font-bold text-fab-blue mb-2">{isProcessing ? "Processando dados..." : "Arraste o relatório Excel aqui"}</p>
									<p className="text-sm text-fab-blue/40">ou clique para selecionar o arquivo no seu computador</p>
								</div>

								<div className="flex flex-wrap justify-center gap-3 mt-4">
									{["UG Executora", "Conta Contábil", "Conta Corrente", "Saldo"].map((col) => (
										<span
											key={col}
											className="px-4 py-1.5 bg-fab-sky/50 rounded-full text-[10px] font-bold uppercase tracking-widest text-fab-blue/60 border border-fab-blue/5"
										>
											{col}
										</span>
									))}
								</div>
							</div>

							{error && (
								<motion.div
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									className="mt-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-800"
								>
									<AlertCircle className="shrink-0 mt-0.5" size={18} />
									<p className="text-sm font-medium">{error}</p>
								</motion.div>
							)}

							<div className="mt-12 space-y-6">
								{/* Referencial Metodológico Card */}
								<div className="p-8 bg-white rounded-[32px] border border-fab-blue/5 border-t-4 border-t-fab-gold/50 shadow-sm hover:shadow-md transition-all">
									<div className="flex items-start gap-6">
										<div className="w-12 h-12 shrink-0 bg-fab-sky rounded-2xl flex items-center justify-center text-fab-blue shadow-inner">
											<Shield size={24} />
										</div>
										<div>
											<h3 className="font-serif italic text-xl mb-3 text-fab-blue">Referencial Metodológico (RAC)</h3>
											<p className="text-sm text-fab-blue/70 leading-relaxed mb-4">
												Esta verificação integra o processo de <strong>Acompanhamento Contábil do COMAER</strong> conduzido pela SUCONT-3, com base na{" "}
												<strong>Questão 34 do Roteiro de Acompanhamento Contábil (RAC)</strong>. A finalidade é garantir que os registros representem de forma
												fidedigna os fatos administrativos e a situação patrimonial.
											</p>
											<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
												<div className="bg-slate-50 p-4 rounded-2xl border border-fab-blue/5">
													<h4 className="text-xs font-bold uppercase tracking-wider text-fab-blue mb-2">Objetivo da Análise</h4>
													<p className="text-xs text-fab-blue/60 leading-relaxed">
														Identificar a utilização indevida de contas contábeis e subitens genéricos (ex: 99, 999, P99, /99) nos registros das Unidades
														Gestoras.
													</p>
												</div>
												<div className="bg-slate-50 p-4 rounded-2xl border border-fab-blue/5">
													<h4 className="text-xs font-bold uppercase tracking-wider text-fab-blue mb-2">Risco Contábil</h4>
													<p className="text-xs text-fab-blue/60 leading-relaxed">
														O uso de subitens genéricos oculta a real natureza da transação, prejudicando a transparência, a precisão da informação e a
														evidenciação contábil.
													</p>
												</div>
												<div className="bg-slate-50 p-4 rounded-2xl border border-fab-blue/5">
													<h4 className="text-xs font-bold uppercase tracking-wider text-fab-blue mb-2">Importância</h4>
													<p className="text-xs text-fab-blue/60 leading-relaxed">
														A regularização preserva a qualidade das demonstrações contábeis e apoia a tomada de decisão da alta administração do COMAER.
													</p>
												</div>
											</div>
										</div>
									</div>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="p-8 bg-white rounded-[32px] border border-fab-blue/5 border-t-4 border-t-fab-gold/50 shadow-sm hover:shadow-md transition-all">
										<div className="w-12 h-12 bg-fab-sky rounded-2xl flex items-center justify-center mb-6 text-fab-blue shadow-inner">
											<Info size={24} />
										</div>
										<h3 className="font-serif italic text-xl mb-3 text-fab-blue">O que é analisado?</h3>
										<p className="text-sm text-fab-blue/60 leading-relaxed">
											O sistema analisa o relatório do Tesouro Gerencial com base nas questões do Roteiro de Acompanhamento Contábil (RAC), identificando
											inconsistências como o uso de subitens genéricos (99/999) e outras falhas de classificação.
										</p>
									</div>
									<div className="p-8 bg-white rounded-[32px] border border-fab-blue/5 border-t-4 border-t-fab-gold/50 shadow-sm hover:shadow-md transition-all">
										<div className="w-12 h-12 bg-fab-sky rounded-2xl flex items-center justify-center mb-6 text-fab-blue shadow-inner">
											<CheckCircle2 size={24} />
										</div>
										<h3 className="font-serif italic text-xl mb-3 text-fab-blue">Geração Automática</h3>
										<p className="text-sm text-fab-blue/60 leading-relaxed">
											Para cada UG identificada, é gerada uma mensagem institucional formatada pronta para ser enviada via SAU, promovendo a regularização
											contábil de forma padronizada.
										</p>
									</div>
								</div>

								<div className="p-8 bg-white rounded-[32px] border border-fab-blue/5 border-t-4 border-t-fab-gold/50 shadow-sm hover:shadow-md transition-all">
									<div className="w-12 h-12 bg-fab-sky rounded-2xl flex items-center justify-center mb-6 text-fab-blue shadow-inner">
										<Map size={24} />
									</div>
									<h3 className="font-serif italic text-xl mb-4 text-fab-blue">Caminho do Relatório (Tesouro Gerencial)</h3>
									<div className="bg-slate-50 p-5 rounded-2xl border border-fab-blue/5 text-sm font-mono text-fab-blue/70 leading-relaxed">
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
												<React.Fragment key={i}>
													<span className="font-semibold text-fab-blue">{step}</span>
													{i < arr.length - 1 && <ChevronRight size={14} className="text-fab-gold shrink-0" />}
												</React.Fragment>
											))}
										</div>
									</div>
								</div>
							</div>

							{/* Identificação Institucional */}
							<div className="mt-16 text-center max-w-4xl mx-auto px-6">
								<p className="text-[10px] text-fab-blue/40 leading-relaxed uppercase tracking-wider">
									Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel
									Int Carlos José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp
									CCO Jefferson Luís Reis Alves (Chefe da SUCONT-3.1).
								</p>
							</div>
						</motion.div>
					) : (
						<motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
							{/* Executive Dashboard Header */}
							<section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
								<motion.div
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm flex flex-col justify-between relative overflow-hidden group"
								>
									<div className="absolute -right-4 -top-4 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity">
										<Shield size={120} className="text-fab-blue" />
									</div>
									<p className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40 mb-1">Unidades Gestoras</p>
									<div className="flex items-baseline gap-2">
										<h3 className="text-5xl font-serif italic text-fab-blue">{filteredData.length}</h3>
										<span className="text-xs text-fab-blue/40 font-medium uppercase tracking-wider">afetadas</span>
									</div>
									<div className="mt-6 h-1.5 w-full bg-fab-sky rounded-full overflow-hidden">
										<div className="h-full bg-fab-blue w-full opacity-30"></div>
									</div>
								</motion.div>

								<motion.div
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.1 }}
									className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm flex flex-col justify-between relative overflow-hidden group"
								>
									<div className="absolute -right-4 -top-4 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity">
										<FileText size={120} className="text-fab-blue" />
									</div>
									<p className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40 mb-1">Total de Ocorrências</p>
									<div className="flex items-baseline gap-2">
										<h3 className="text-5xl font-serif italic text-fab-light-blue">{filteredData.reduce((acc, curr) => acc + curr.occurrences.length, 0)}</h3>
										<span className="text-xs text-fab-blue/40 font-medium uppercase tracking-wider">registros</span>
									</div>
									<div className="mt-6 h-1.5 w-full bg-fab-sky rounded-full overflow-hidden">
										<div className="h-full bg-fab-light-blue w-full opacity-30"></div>
									</div>
								</motion.div>

								<motion.div
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.2 }}
									className="bg-fab-blue p-8 rounded-[40px] shadow-2xl shadow-fab-blue/20 flex flex-col justify-between text-white relative overflow-hidden group"
								>
									<div className="absolute -right-4 -top-4 opacity-[0.1] group-hover:opacity-[0.2] transition-opacity">
										<Plane size={140} className="-rotate-45 text-white" />
									</div>
									<p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Volume Financeiro</p>
									<div className="flex flex-col">
										<h3 className="text-3xl font-mono font-bold text-fab-gold">
											{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
												filteredData.reduce((acc, curr) => acc + curr.totalSaldo, 0)
											)}
										</h3>
										<span className="text-[10px] text-white/40 font-medium uppercase tracking-widest mt-2">em subitens genéricos</span>
									</div>
								</motion.div>
							</section>

							{/* Filter Section */}
							<section className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm mb-12">
								<div className="flex flex-col md:flex-row items-center justify-between gap-8">
									<div className="flex items-center gap-4">
										<div className="p-3 bg-fab-sky rounded-2xl text-fab-blue">
											<Search size={24} />
										</div>
										<div>
											<div className="flex items-center gap-2">
												<h3 className="text-xl font-serif italic text-fab-blue">Filtrar Análise</h3>
												{selectedConferente !== "all" && (
													<span className="px-2 py-0.5 bg-fab-gold text-white text-[8px] font-bold uppercase tracking-tighter rounded-full animate-pulse">
														Filtro Ativo
													</span>
												)}
											</div>
											<p className="text-[10px] text-fab-blue/40 uppercase tracking-widest font-bold">Modo Geral ou por Conferente</p>
										</div>
									</div>

									<div className="flex flex-wrap items-center gap-3">
										<button
											onClick={() => {
												setSelectedConferente("all")
											}}
											className={cn(
												"px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2",
												selectedConferente === "all" ? "bg-fab-blue text-white shadow-md" : "bg-fab-sky/30 text-fab-blue/60 hover:bg-fab-sky/50"
											)}
										>
											Modo Geral
										</button>

										<div className="flex items-center gap-2">
											<select
												value={selectedConferente}
												onChange={(e) => {
													setSelectedConferente(e.target.value)
												}}
												className="bg-fab-sky/30 text-fab-blue border-none rounded-full px-5 py-2 text-[10px] font-bold uppercase tracking-widest focus:ring-2 focus:ring-fab-blue outline-none cursor-pointer"
											>
												<option value="all">Todos os Conferentes</option>
												{allConferentes.map((c) => (
													<option key={c} value={c}>
														{c}
													</option>
												))}
											</select>

											{selectedConferente !== "all" && (
												<button
													onClick={() => {
														setSelectedConferente("all")
													}}
													className="p-2 text-fab-blue/40 hover:text-fab-blue transition-colors"
													title="Limpar Filtros"
												>
													<X size={16} />
												</button>
											)}
										</div>
									</div>
								</div>
							</section>

							{/* Tab Navigation */}
							<div className="flex items-center justify-center mb-12">
								<div className="bg-white p-1.5 rounded-full border border-fab-blue/10 shadow-sm inline-flex">
									<button
										onClick={() => setActiveTab("messages")}
										className={cn(
											"px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-widest transition-all flex items-center gap-2",
											activeTab === "messages" ? "bg-fab-blue text-white shadow-md" : "text-fab-blue/60 hover:text-fab-blue hover:bg-fab-sky/50"
										)}
									>
										<FileText size={16} />
										Mensagens Institucionais
									</button>
									<button
										onClick={() => setActiveTab("dashboard")}
										className={cn(
											"px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-widest transition-all flex items-center gap-2",
											activeTab === "dashboard" ? "bg-fab-blue text-white shadow-md" : "text-fab-blue/60 hover:text-fab-blue hover:bg-fab-sky/50"
										)}
									>
										<LayoutDashboard size={16} />
										Painel Gerencial
									</button>
								</div>
							</div>

							{activeTab === "messages" ? (
								<>
									{/* Technical Summary Section */}
									<section className="mb-16">
										<div className="flex items-center justify-between mb-8">
											<div className="flex items-center gap-3">
												<div className="w-12 h-12 bg-fab-sky text-fab-blue rounded-2xl flex items-center justify-center border border-fab-blue/10 shadow-sm">
													<FileSpreadsheet size={24} />
												</div>
												<div>
													<h2 className="text-3xl font-serif italic text-fab-blue">Retrato Situacional</h2>
													<p className="text-xs text-fab-blue/40 uppercase tracking-widest font-bold">Detalhamento por Conta e Saldo</p>
												</div>
											</div>
										</div>

										<div className="bg-white rounded-[40px] border border-fab-blue/10 overflow-hidden shadow-xl shadow-fab-blue/5">
											<div className="overflow-x-auto">
												<table className="w-full text-left border-collapse">
													<thead>
														<tr className="bg-fab-sky/30 border-b border-fab-blue/10">
															<th className="px-10 py-6 text-[10px] font-bold uppercase tracking-widest text-fab-blue/60">UG Executora</th>
															<th className="px-10 py-6 text-[10px] font-bold uppercase tracking-widest text-fab-blue/60">Questão RAC</th>
															<th className="px-10 py-6 text-[10px] font-bold uppercase tracking-widest text-fab-blue/60">Conta Contábil</th>
															<th className="px-10 py-6 text-[10px] font-bold uppercase tracking-widest text-fab-blue/60">Conta Corrente</th>
															<th className="px-10 py-6 text-[10px] font-bold uppercase tracking-widest text-fab-blue/60 text-right">Saldo</th>
														</tr>
													</thead>
													<tbody className="divide-y divide-fab-blue/5">
														{filteredData.flatMap((group, gIdx) =>
															group.occurrences.map((occ, oIdx) => (
																<tr key={`${gIdx}-${oIdx}`} className="hover:bg-fab-sky/10 transition-colors group">
																	<td className="px-10 py-5">
																		{oIdx === 0 ? (
																			<div className="flex flex-col gap-1">
																				<div className="flex items-center gap-3">
																					<div className="w-1.5 h-1.5 rounded-full bg-fab-gold"></div>
																					<span className="font-serif italic text-xl text-fab-blue">{formatUgName(group.ug)}</span>
																				</div>
																				<span className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/50 ml-4">
																					Conferente: {getConferente(group.ug)}
																				</span>
																			</div>
																		) : (
																			<span className="opacity-0">{group.ug}</span>
																		)}
																	</td>
																	<td className="px-10 py-5">
																		<span className="px-3 py-1 bg-fab-sky text-fab-blue rounded-full text-[10px] font-bold uppercase tracking-widest">
																			{occ.racId}
																		</span>
																	</td>
																	<td className="px-10 py-5 font-mono text-sm text-fab-blue/70">{occ.contaContabil}</td>
																	<td className="px-10 py-5 font-mono text-sm">
																		<span className="px-3 py-1 bg-red-50 text-red-700 rounded-lg font-bold text-xs border border-red-100 shadow-sm">
																			{occ.contaCorrente}
																		</span>
																	</td>
																	<td className="px-10 py-5 font-mono text-sm text-right font-bold text-fab-blue">
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

									{/* Institutional Messages Section */}
									<section>
										<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
											<div className="flex items-center gap-3">
												<div className="w-12 h-12 bg-fab-blue text-white rounded-2xl flex items-center justify-center shadow-xl shadow-fab-blue/20">
													<FileText size={24} />
												</div>
												<div>
													<h2 className="text-3xl font-serif italic text-fab-blue">Expedição de Cobranças</h2>
													<p className="text-xs text-fab-blue/40 uppercase tracking-widest font-bold">Comunicações Oficiais Geradas</p>
												</div>
											</div>

											<div className="flex items-center bg-white rounded-full p-1 border border-fab-blue/10 shadow-sm">
												<button
													onClick={() => setMessageMode("individual")}
													className={cn(
														"px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all",
														messageMode === "individual" ? "bg-fab-blue text-white shadow-md" : "text-fab-blue/60 hover:text-fab-blue hover:bg-fab-sky/30"
													)}
												>
													Por Unidade Gestora
												</button>
												<button
													onClick={() => setMessageMode("consolidated")}
													className={cn(
														"px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all",
														messageMode === "consolidated" ? "bg-fab-blue text-white shadow-md" : "text-fab-blue/60 hover:text-fab-blue hover:bg-fab-sky/30"
													)}
												>
													Consolidada por Questão
												</button>
											</div>
										</div>

										{messageMode === "individual" ? (
											<div className="grid grid-cols-1 gap-8">
												{filteredData.map((group, idx) => {
													const ugConfig = ugConfigs[group.ug] || {
														messageType: "sem_prazo",
														deadlineDate: "",
														msgNumber: msgNumber,
														msgDate: msgDate,
													}

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
															className="bg-white rounded-[40px] border border-[#141414]/10 shadow-sm hover:shadow-xl hover:shadow-[#141414]/5 transition-all duration-500 overflow-hidden flex flex-col lg:flex-row"
														>
															<div className="lg:w-80 bg-fab-sky/30 p-10 border-b lg:border-b-0 lg:border-r border-fab-blue/10 flex flex-col justify-between">
																<div>
																	<div className="flex items-center gap-2 mb-6">
																		<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
																		<span className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40">Status: Pendente</span>
																	</div>
																	<p className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40 mb-1">Unidade Gestora</p>
																	<h3 className="text-4xl font-serif italic text-fab-blue mb-1">{formatUgName(group.ug)}</h3>
																	<p className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40 mb-4">Conferente: {getConferente(group.ug)}</p>

																	<div className="bg-red-50 p-4 rounded-2xl border border-red-100 mb-6">
																		<p className="text-[9px] font-bold uppercase tracking-widest text-red-600 mb-1">Inconsistência Identificada</p>
																		<p className="text-xs text-red-800 leading-relaxed font-medium">Múltiplas inconsistências identificadas conforme RAC.</p>
																	</div>

																	<div className="space-y-3 mt-8">
																		<div className="flex justify-between items-center text-sm">
																			<span className="text-fab-blue/40">Ocorrências</span>
																			<span className="font-mono font-bold text-fab-blue">{group.occurrences.length}</span>
																		</div>
																		<div className="flex justify-between items-center text-sm">
																			<span className="text-fab-blue/40">Total em 99/999</span>
																			<span className="font-mono font-bold text-fab-light-blue">
																				{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(group.totalSaldo)}
																			</span>
																		</div>
																	</div>

																	{/* Individual Controls */}
																	<div className="mt-8 pt-8 border-t border-fab-blue/5 space-y-6">
																		{/* Message Number & Date */}
																		<div className="grid grid-cols-2 gap-4">
																			<div className="flex flex-col gap-2">
																				<label className="text-[9px] font-bold uppercase tracking-widest text-fab-blue/40">Nº Mensagem</label>
																				<input
																					type="text"
																					value={ugConfig.msgNumber}
																					onChange={(e) => updateUgConfig(group.ug, "msgNumber", e.target.value)}
																					placeholder="___"
																					className="w-full px-3 py-2 bg-white border border-fab-blue/10 rounded-xl text-xs font-mono text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20"
																				/>
																			</div>
																			<div className="flex flex-col gap-2">
																				<label className="text-[9px] font-bold uppercase tracking-widest text-fab-blue/40">Data Mensagem</label>
																				<input
																					type="date"
																					value={ugConfig.msgDate}
																					onChange={(e) => updateUgConfig(group.ug, "msgDate", e.target.value)}
																					className="w-full px-3 py-2 bg-white border border-fab-blue/10 rounded-xl text-xs font-mono text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20"
																				/>
																			</div>
																		</div>

																		{/* Message Type Control */}
																		<div>
																			<div className="flex flex-col gap-2 mb-4">
																				<label className="text-[9px] font-bold uppercase tracking-widest text-fab-blue/40">Tipo de Mensagem</label>
																				<select
																					value={ugConfig.messageType}
																					onChange={(e) => updateUgConfig(group.ug, "messageType", e.target.value)}
																					className="w-full px-3 py-2 bg-white border border-fab-blue/10 rounded-xl text-xs font-bold text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20"
																				>
																					<option value="sem_prazo">Sem Prazo</option>
																					<option value="com_prazo">Com Prazo</option>
																					<option value="alerta">Apenas Alerta</option>
																				</select>
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
																							<label className="text-[9px] font-bold uppercase tracking-widest text-fab-blue/40">Data Limite</label>
																							<input
																								type="date"
																								value={ugConfig.deadlineDate || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
																								onChange={(e) => updateUgConfig(group.ug, "deadlineDate", e.target.value)}
																								className="w-full px-3 py-2 bg-white border border-fab-blue/10 rounded-xl text-xs font-mono text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20"
																							/>
																						</div>
																					</motion.div>
																				)}
																			</AnimatePresence>
																		</div>
																	</div>
																</div>

																<button
																	onClick={() => copyToClipboard(message, idx)}
																	className={cn(
																		"mt-12 w-full py-4 rounded-2xl flex items-center justify-center gap-3 transition-all font-bold text-xs uppercase tracking-widest",
																		copiedIndex === idx
																			? "bg-green-600 text-white shadow-lg shadow-green-600/20"
																			: "bg-fab-blue text-white hover:bg-fab-light-blue shadow-lg shadow-fab-blue/20"
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
																</button>
															</div>
															<div className="flex-1 p-10 bg-white relative">
																<div className="absolute top-6 right-10 flex items-center gap-2">
																	<div className="w-2 h-2 rounded-full bg-[#5A5A40]/20"></div>
																	<span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#141414]/20">Documento Institucional</span>
																</div>
																<div className="prose prose-sm max-w-none">
																	<pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#141414]/70 max-h-[500px] overflow-y-auto pr-6 scrollbar-thin scrollbar-thumb-[#141414]/10">
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
													const racConfig = racConfigs[racId] || {
														messageType: "sem_prazo",
														deadlineDate: "",
														msgNumber: msgNumber,
														msgDate: msgDate,
													}

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
															className="bg-white rounded-[40px] border border-[#141414]/10 shadow-sm hover:shadow-xl hover:shadow-[#141414]/5 transition-all duration-500 overflow-hidden flex flex-col lg:flex-row"
														>
															<div className="lg:w-80 bg-fab-sky/30 p-10 border-b lg:border-b-0 lg:border-r border-fab-blue/10 flex flex-col justify-between">
																<div>
																	<div className="flex items-center gap-2 mb-6">
																		<span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
																		<span className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40">Status: Pendente</span>
																	</div>
																	<p className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40 mb-1">Questão RAC</p>
																	<h3 className="text-4xl font-serif italic text-fab-blue mb-1">{RAC_QUESTIONS[racId]?.title || racId}</h3>
																	<p className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40 mb-4">Múltiplas UGs</p>

																	<div className="bg-red-50 p-4 rounded-2xl border border-red-100 mb-6">
																		<p className="text-[9px] font-bold uppercase tracking-widest text-red-600 mb-1">Inconsistência Consolidada</p>
																		<p className="text-xs text-red-800 leading-relaxed font-medium">
																			Mensagem única agrupando todas as UGs afetadas por esta questão.
																		</p>
																	</div>

																	<div className="space-y-3 mt-8">
																		<div className="flex justify-between items-center text-sm">
																			<span className="text-fab-blue/40">UGs Afetadas</span>
																			<span className="font-mono font-bold text-fab-blue">{uniqueUgs}</span>
																		</div>
																		<div className="flex justify-between items-center text-sm">
																			<span className="text-fab-blue/40">Ocorrências</span>
																			<span className="font-mono font-bold text-fab-blue">{occurrences.length}</span>
																		</div>
																		<div className="flex justify-between items-center text-sm">
																			<span className="text-fab-blue/40">Total em 99/999</span>
																			<span className="font-mono font-bold text-fab-light-blue">
																				{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalSaldo)}
																			</span>
																		</div>
																	</div>

																	{/* Controls */}
																	<div className="mt-8 pt-8 border-t border-fab-blue/5 space-y-6">
																		{/* Message Number & Date */}
																		<div className="grid grid-cols-2 gap-4">
																			<div className="flex flex-col gap-2">
																				<label className="text-[9px] font-bold uppercase tracking-widest text-fab-blue/40">Nº Mensagem</label>
																				<input
																					type="text"
																					value={racConfig.msgNumber}
																					onChange={(e) => updateRacConfig(racId, "msgNumber", e.target.value)}
																					placeholder="___"
																					className="w-full px-3 py-2 bg-white border border-fab-blue/10 rounded-xl text-xs font-mono text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20"
																				/>
																			</div>
																			<div className="flex flex-col gap-2">
																				<label className="text-[9px] font-bold uppercase tracking-widest text-fab-blue/40">Data Mensagem</label>
																				<input
																					type="date"
																					value={racConfig.msgDate}
																					onChange={(e) => updateRacConfig(racId, "msgDate", e.target.value)}
																					className="w-full px-3 py-2 bg-white border border-fab-blue/10 rounded-xl text-xs font-mono text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20"
																				/>
																			</div>
																		</div>

																		{/* Message Type Control */}
																		<div>
																			<div className="flex flex-col gap-2 mb-4">
																				<label className="text-[9px] font-bold uppercase tracking-widest text-fab-blue/40">Tipo de Mensagem</label>
																				<select
																					value={racConfig.messageType}
																					onChange={(e) => updateRacConfig(racId, "messageType", e.target.value)}
																					className="w-full px-3 py-2 bg-white border border-fab-blue/10 rounded-xl text-xs font-bold text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20"
																				>
																					<option value="sem_prazo">Sem Prazo</option>
																					<option value="com_prazo">Com Prazo</option>
																					<option value="alerta">Apenas Alerta</option>
																				</select>
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
																							<label className="text-[9px] font-bold uppercase tracking-widest text-fab-blue/40">Data Limite</label>
																							<input
																								type="date"
																								value={racConfig.deadlineDate || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
																								onChange={(e) => updateRacConfig(racId, "deadlineDate", e.target.value)}
																								className="w-full px-3 py-2 bg-white border border-fab-blue/10 rounded-xl text-xs font-mono text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20"
																							/>
																						</div>
																					</motion.div>
																				)}
																			</AnimatePresence>
																		</div>
																	</div>
																</div>

																<button
																	onClick={() => copyToClipboard(message, idx)}
																	className={cn(
																		"mt-12 w-full py-4 rounded-2xl flex items-center justify-center gap-3 transition-all font-bold text-xs uppercase tracking-widest",
																		copiedIndex === idx
																			? "bg-green-600 text-white shadow-lg shadow-green-600/20"
																			: "bg-fab-blue text-white hover:bg-fab-light-blue shadow-lg shadow-fab-blue/20"
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
																</button>
															</div>
															<div className="flex-1 p-10 bg-white relative">
																<div className="absolute top-6 right-10 flex items-center gap-2">
																	<div className="w-2 h-2 rounded-full bg-[#5A5A40]/20"></div>
																	<span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#141414]/20">Documento Institucional</span>
																</div>
																<div className="prose prose-sm max-w-none">
																	<pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#141414]/70 max-h-[500px] overflow-y-auto pr-6 scrollbar-thin scrollbar-thumb-[#141414]/10">
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
								<section className="mb-16 space-y-8">
									<div className="flex items-center justify-between mb-8">
										<div className="flex items-center gap-3">
											<div className="w-12 h-12 bg-fab-sky text-fab-blue rounded-2xl flex items-center justify-center border border-fab-blue/10 shadow-sm">
												<TrendingUp size={24} />
											</div>
											<div>
												<h2 className="text-3xl font-serif italic text-fab-blue">Painel Estratégico de Acompanhamento</h2>
												<p className="text-xs text-fab-blue/40 uppercase tracking-widest font-bold">Visão Operacional, Tática e Estratégica</p>
											</div>
										</div>
									</div>

									<div className="flex bg-white p-2 rounded-2xl border border-fab-blue/10 shadow-sm w-fit mb-8">
										<button
											onClick={() => setDashboardTab("operacional")}
											className={cn(
												"px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
												dashboardTab === "operacional" ? "bg-fab-blue text-white shadow-md" : "text-fab-blue/60 hover:bg-fab-sky/50"
											)}
										>
											Nível Operacional
										</button>
										<button
											onClick={() => setDashboardTab("tatico")}
											className={cn(
												"px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
												dashboardTab === "tatico" ? "bg-fab-blue text-white shadow-md" : "text-fab-blue/60 hover:bg-fab-sky/50"
											)}
										>
											Nível Tático
										</button>
										<button
											onClick={() => setDashboardTab("estrategico")}
											className={cn(
												"px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
												dashboardTab === "estrategico" ? "bg-fab-blue text-white shadow-md" : "text-fab-blue/60 hover:bg-fab-sky/50"
											)}
										>
											Nível Estratégico
										</button>
									</div>

									{dashboardTab === "operacional" && (
										<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
											<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
												<div className="bg-white p-6 rounded-3xl border border-fab-blue/5 shadow-sm">
													<h4 className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40 mb-2">Risco Sistêmico</h4>
													<p className="text-sm text-fab-blue/70 leading-relaxed">
														{`A utilização de subitens genéricos afeta ${filteredData.length} Unidades Gestoras, comprometendo a evidenciação contábil de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalVolume)} no COMAER.`}
													</p>
												</div>
												<div className="bg-white p-6 rounded-3xl border border-fab-blue/5 shadow-sm">
													<h4 className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40 mb-2">Ação Recomendada</h4>
													<p className="text-sm text-fab-blue/70 leading-relaxed">
														{`Expedir as ${filteredData.length} mensagens institucionais geradas para orientar as UGs na reclassificação dos saldos para contas específicas, conforme RAC.`}
													</p>
												</div>
												<div className="bg-white p-6 rounded-3xl border border-fab-blue/5 shadow-sm">
													<h4 className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40 mb-2">Contas Afetadas</h4>
													<p className="text-sm text-fab-blue/70 leading-relaxed">
														Foram identificadas {Object.keys(contasCount).length} contas contábeis distintas com inconsistências, exigindo atenção da Setorial
														Contábil.
													</p>
												</div>
											</div>

											<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
												{/* Top UGs Chart */}
												<div className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
													<div className="flex items-center gap-3 mb-8">
														<div className="p-2 bg-fab-sky rounded-lg text-fab-blue">
															<LayoutDashboard size={20} />
														</div>
														<h3 className="font-serif italic text-xl text-fab-blue">Top 5 UGs por Volume Financeiro</h3>
													</div>
													<div className="h-[300px] w-full">
														<ResponsiveContainer width="100%" height="100%">
															<BarChart data={topUgsBySaldo} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
																<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3F2FD" />
																<XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#00205B", fontSize: 12 }} />
																<YAxis
																	axisLine={false}
																	tickLine={false}
																	tick={{ fill: "#00205B", fontSize: 12 }}
																	tickFormatter={(value) => new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(value)}
																/>
																<RechartsTooltip
																	cursor={{ fill: "#E3F2FD", opacity: 0.4 }}
																	contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
																	formatter={(value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)}
																/>
																<Bar dataKey="saldo" fill="#003DA5" radius={[6, 6, 0, 0]} barSize={40} />
															</BarChart>
														</ResponsiveContainer>
													</div>
												</div>

												{/* Top Contas Chart */}
												<div className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
													<div className="flex items-center gap-3 mb-8">
														<div className="p-2 bg-fab-sky rounded-lg text-fab-blue">
															<PieChartIcon size={20} />
														</div>
														<h3 className="font-serif italic text-xl text-fab-blue">Contas com Mais Inconsistências</h3>
													</div>
													<div className="h-[300px] w-full">
														<ResponsiveContainer width="100%" height="100%">
															<PieChart>
																<Pie data={topContas} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="count">
																	{topContas.map((_entry, index) => (
																		<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
																	))}
																</Pie>
																<RechartsTooltip contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }} />
																<Legend verticalAlign="bottom" height={36} iconType="circle" />
															</PieChart>
														</ResponsiveContainer>
													</div>
												</div>
											</div>

											{/* Inconsistências por Conferente */}
											<div className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
												<div className="flex items-center gap-3 mb-8">
													<div className="p-2 bg-fab-sky rounded-lg text-fab-blue">
														<Shield size={20} />
													</div>
													<h3 className="font-serif italic text-xl text-fab-blue">Inconsistências por Conferente</h3>
												</div>
												<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
													{conferentesList.map((conf, idx) => (
														<div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-fab-blue/5">
															<div className="flex items-center justify-between mb-4">
																<h4 className="font-bold text-fab-blue">{conf.name}</h4>
																<span className="px-3 py-1 bg-fab-sky text-fab-blue rounded-full text-xs font-bold">
																	{conf.count} {conf.count === 1 ? "inconsistência" : "inconsistências"}
																</span>
															</div>
															<div className="space-y-2">
																<p className="text-[10px] uppercase tracking-widest text-fab-blue/40 font-bold mb-2">UGs Afetadas:</p>
																<div className="flex flex-wrap gap-2">
																	{conf.ugs.map((ug, i) => (
																		<span key={i} className="px-2 py-1 bg-white border border-fab-blue/10 rounded-md text-xs font-mono text-fab-blue/70">
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
												{/* Ranking ODS */}
												<div className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
													<h3 className="font-serif italic text-xl text-fab-blue mb-6">Ranking de ODS por Inconsistências</h3>
													<div className="space-y-4">
														{odsList.map((ods, idx) => (
															<div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-fab-blue/5">
																<div className="flex items-center gap-4">
																	<span className="text-xl font-serif italic text-fab-gold font-bold">{idx + 1}º</span>
																	<span className="font-bold text-fab-blue">{ods.name}</span>
																</div>
																<span className="text-sm font-mono text-fab-blue/70">{ods.count} ocorrências</span>
															</div>
														))}
													</div>
												</div>

												{/* Ranking Orgao Superior */}
												<div className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
													<h3 className="font-serif italic text-xl text-fab-blue mb-6">Ranking de Órgãos Superiores</h3>
													<div className="space-y-4">
														{orgaoSuperiorList.map((orgao, idx) => (
															<div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-fab-blue/5">
																<div className="flex items-center gap-4">
																	<span className="text-xl font-serif italic text-fab-gold font-bold">{idx + 1}º</span>
																	<span className="font-bold text-fab-blue">{orgao.name}</span>
																</div>
																<span className="text-sm font-mono text-fab-blue/70">{orgao.count} ocorrências</span>
															</div>
														))}
													</div>
												</div>

												{/* Ranking UGs */}
												<div className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
													<h3 className="font-serif italic text-xl text-fab-blue mb-6">Top 10 UGs com Mais Inconsistências</h3>
													<div className="space-y-3">
														{topUgsByInconsistencies.map((ug, idx) => (
															<div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-fab-blue/5">
																<div className="flex items-center gap-3">
																	<span className="text-sm font-serif italic text-fab-gold font-bold w-6">{idx + 1}º</span>
																	<span className="font-mono text-sm text-fab-blue">{formatUgName(ug.ug)}</span>
																</div>
																<span className="text-xs font-bold text-fab-blue/60">{ug.occurrences.length} ocorrências</span>
															</div>
														))}
													</div>
												</div>
											</div>
										</motion.div>
									)}

									{dashboardTab === "estrategico" && (
										<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
											{/* Painel Consolidado de Risco */}
											<div className="bg-fab-blue p-10 rounded-[40px] shadow-2xl shadow-fab-blue/20 text-white relative overflow-hidden">
												<div className="absolute -right-10 -top-10 opacity-[0.05]">
													<Shield size={300} className="text-white" />
												</div>
												<div className="relative z-10">
													<h3 className="font-serif italic text-3xl text-fab-gold mb-2">Painel de Risco Contábil do COMAER</h3>
													<p className="text-sm text-white/60 mb-10 max-w-2xl">
														Panorama consolidado das inconsistências contábeis identificadas, permitindo a visualização rápida dos pontos de maior risco
														financeiro e operacional.
													</p>

													<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
														<div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/10">
															<p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Total de Inconsistências</p>
															<h4 className="text-4xl font-serif italic text-white">{totalInconsistencias}</h4>
														</div>
														<div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/10">
															<p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Volume Financeiro em Risco</p>
															<h4 className="text-2xl font-mono font-bold text-fab-gold mt-2">
																{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(totalVolume)}
															</h4>
														</div>
														<div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/10">
															<p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Maior Risco por ODS</p>
															<h4 className="text-2xl font-bold text-white mt-2">{odsList[0]?.name || "-"}</h4>
															<p className="text-[10px] text-white/50 mt-1">{odsList[0]?.count || 0} ocorrências</p>
														</div>
														<div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/10">
															<p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Média por UG Afetada</p>
															<h4 className="text-3xl font-serif italic text-white mt-1">
																{filteredData.length > 0 ? (totalInconsistencias / filteredData.length).toFixed(1) : 0}
															</h4>
														</div>
													</div>
												</div>
											</div>

											<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
												{/* Distribuição por ODS */}
												<div className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
													<h3 className="font-serif italic text-xl text-fab-blue mb-6">Distribuição Percentual por ODS</h3>
													<div className="space-y-4">
														{odsList.map((ods, idx) => {
															const percentage = totalInconsistencias > 0 ? Math.round((ods.count / totalInconsistencias) * 100) : 0
															return (
																<div key={idx} className="flex items-center gap-4">
																	<div className="w-24 font-bold text-fab-blue text-sm">{ods.name}</div>
																	<div className="flex-1 h-3 bg-fab-sky rounded-full overflow-hidden">
																		<div className="h-full bg-fab-blue rounded-full" style={{ width: `${percentage}%` }}></div>
																	</div>
																	<div className="w-12 text-right font-mono text-sm text-fab-blue/70">{percentage}%</div>
																</div>
															)
														})}
													</div>
												</div>

												{/* Concentração por Órgão Superior */}
												<div className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
													<h3 className="font-serif italic text-xl text-fab-blue mb-6">Concentração por Órgão Superior</h3>
													<div className="space-y-4">
														{orgaoSuperiorList.map((orgao, idx) => {
															const percentage = totalInconsistencias > 0 ? Math.round((orgao.count / totalInconsistencias) * 100) : 0
															return (
																<div key={idx} className="flex items-center gap-4">
																	<div className="w-24 font-bold text-fab-blue text-sm">{orgao.name}</div>
																	<div className="flex-1 h-3 bg-fab-sky rounded-full overflow-hidden">
																		<div className="h-full bg-fab-gold rounded-full" style={{ width: `${percentage}%` }}></div>
																	</div>
																	<div className="w-12 text-right font-mono text-sm text-fab-blue/70">{percentage}%</div>
																</div>
															)
														})}
													</div>
												</div>
											</div>

											{/* Mapa de Risco e Pareto */}
											<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
												{/* Mapa de Risco Consolidado */}
												<div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
													<div className="flex items-center justify-between mb-8">
														<h3 className="font-serif italic text-xl text-fab-blue">Mapa de Risco Contábil (Consolidado)</h3>
														<div className="px-3 py-1 bg-fab-sky text-fab-blue rounded-full text-[10px] font-bold uppercase tracking-widest">Visão por ODS</div>
													</div>
													<div className="overflow-x-auto">
														<table className="w-full">
															<thead>
																<tr className="border-b border-fab-blue/5">
																	<th className="text-left py-4 text-[10px] font-bold uppercase tracking-widest text-fab-blue/40">ODS</th>
																	<th className="text-center py-4 text-[10px] font-bold uppercase tracking-widest text-fab-blue/40">Inconsistências</th>
																	<th className="text-right py-4 text-[10px] font-bold uppercase tracking-widest text-fab-blue/40">Saldo Associado</th>
																	<th className="text-right py-4 text-[10px] font-bold uppercase tracking-widest text-fab-blue/40">% do Total</th>
																</tr>
															</thead>
															<tbody className="divide-y divide-fab-blue/5">
																{odsList.map((ods, idx) => (
																	<tr key={idx} className="hover:bg-fab-sky/10 transition-colors">
																		<td className="py-4 font-bold text-fab-blue text-sm">{ods.name}</td>
																		<td className="py-4 text-center font-mono text-sm text-fab-blue/70">{ods.count}</td>
																		<td className="py-4 text-right font-mono text-sm text-fab-blue/70">
																			{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(ods.saldo)}
																		</td>
																		<td className="py-4 text-right font-mono text-sm font-bold text-fab-blue">
																			{totalInconsistencias > 0 ? Math.round((ods.count / totalInconsistencias) * 100) : 0}%
																		</td>
																	</tr>
																))}
															</tbody>
														</table>
													</div>
												</div>

												{/* Análise de Pareto */}
												<div className="bg-fab-blue p-8 rounded-[40px] text-white flex flex-col justify-between">
													<div>
														<div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
															<TrendingUp size={24} className="text-fab-gold" />
														</div>
														<h3 className="font-serif italic text-2xl mb-2">Análise de Concentração</h3>
														<p className="text-xs text-white/50 uppercase tracking-widest font-bold mb-6">Regra de Pareto (80/20)</p>

														<div className="space-y-6">
															<div>
																<h4 className="text-4xl font-serif italic text-fab-gold mb-1">{Math.round(paretoSummary.concentrationPercentage)}%</h4>
																<p className="text-xs text-white/60 leading-relaxed">
																	das inconsistências contábeis estão concentradas em apenas 20% das UGs analisadas.
																</p>
															</div>

															<div className="pt-6 border-t border-white/10">
																<p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">UGs de Alta Concentração:</p>
																<div className="space-y-2">
																	{paretoSummary.top20PercentUgs.slice(0, 3).map((item, idx) => (
																		<div key={idx} className="flex items-center justify-between text-xs">
																			<span className="text-white/70 font-mono">{formatUgName(item.ug)}</span>
																			<span className="font-bold text-fab-gold">{item.count} ocorr.</span>
																		</div>
																	))}
																	{paretoSummary.top20PercentUgs.length > 3 && (
																		<p className="text-[10px] text-white/30 italic">+ {paretoSummary.top20PercentUgs.length - 3} outras unidades</p>
																	)}
																</div>
															</div>
														</div>
													</div>

													<div className="mt-8 p-4 bg-white/5 rounded-2xl border border-white/10">
														<p className="text-[10px] font-bold uppercase tracking-widest text-fab-gold mb-1">Prioridade de Atuação</p>
														<p className="text-[10px] text-white/50 leading-relaxed">
															O direcionamento das ações para estas {paretoSummary.top20PercentUgs.length} UGs resultará na regularização de{" "}
															{Math.round(paretoSummary.concentrationPercentage)}% do passivo contábil.
														</p>
													</div>
												</div>
											</div>

											{/* Priorização de Atuação */}
											<div className="bg-white p-8 rounded-[40px] border border-fab-blue/5 shadow-sm">
												<div className="flex items-center justify-between mb-8">
													<div className="flex items-center gap-3">
														<div className="p-2 bg-fab-sky rounded-lg text-fab-blue">
															<Shield size={20} />
														</div>
														<h3 className="font-serif italic text-xl text-fab-blue">Priorização de Atuação Imediata</h3>
													</div>
													<p className="text-[10px] font-bold uppercase tracking-widest text-fab-blue/40">Baseado em Risco e Impacto Financeiro</p>
												</div>

												<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
													{topUgsByInconsistencies.slice(0, 3).map((ug, idx) => (
														<div
															key={idx}
															className="p-6 bg-slate-50 rounded-3xl border border-fab-blue/5 relative overflow-hidden group hover:border-fab-gold/30 transition-all"
														>
															<div className="absolute -right-4 -top-4 text-fab-blue/5 font-serif italic text-8xl group-hover:text-fab-gold/10 transition-colors">
																{idx + 1}
															</div>
															<div className="relative z-10">
																<p className="text-[10px] font-bold uppercase tracking-widest text-fab-gold mb-1">{idx + 1}º Prioridade</p>
																<h4 className="text-xl font-serif italic text-fab-blue mb-4">{formatUgName(ug.ug)}</h4>

																<div className="space-y-3">
																	<div className="flex items-center justify-between">
																		<span className="text-[10px] text-fab-blue/40 uppercase font-bold">Inconsistências</span>
																		<span className="text-sm font-mono font-bold text-fab-blue">{ug.occurrences.length}</span>
																	</div>
																	<div className="flex items-center justify-between">
																		<span className="text-[10px] text-fab-blue/40 uppercase font-bold">Impacto Financeiro</span>
																		<span className="text-sm font-mono font-bold text-fab-blue">
																			{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(ug.totalSaldo)}
																		</span>
																	</div>
																	<div className="pt-3 border-t border-fab-blue/5">
																		<p className="text-[10px] text-fab-blue/60 italic">
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

							<footer className="pt-20 pb-32 border-t border-fab-blue/10 text-center">
								<div className="flex items-center justify-center gap-4 mb-6 opacity-30">
									<Shield size={24} className="text-fab-blue" />
									<div className="w-2 h-2 rounded-full bg-fab-gold"></div>
									<Crosshair size={24} className="text-fab-blue" />
									<div className="w-2 h-2 rounded-full bg-fab-gold"></div>
									<Plane size={24} className="text-fab-blue -rotate-45" />
								</div>
								<p className="text-[10px] font-bold uppercase tracking-[0.4em] text-fab-blue/40 mb-2">Força Aérea Brasileira • Asas que protegem o país</p>
								<p className="text-[9px] font-bold uppercase tracking-[0.2em] text-fab-blue/20">Analista SUCONT • DIREF • 2026</p>
							</footer>
						</motion.div>
					)}
				</AnimatePresence>
			</main>

			{/* AI Assistant */}
			{data.length > 0 && (
				<AIAssistant
					dataContext={{
						totalInconsistencias,
						totalVolume,
						odsList,
						orgaoSuperiorList,
						topUgsByInconsistencies,
						racList,
						conferentesList,
						paretoSummary,
						criticalLevels,
					}}
				/>
			)}
		</div>
	)
}
