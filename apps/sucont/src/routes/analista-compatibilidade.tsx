import { createFileRoute, Link } from "@tanstack/react-router"
import {
	AlertCircle,
	AlertTriangle,
	ArrowLeft,
	BarChart3,
	BookOpen,
	Building2,
	CalendarClock,
	CheckCircle2,
	ChevronRight,
	Copy,
	FileSpreadsheet,
	FileText,
	Info,
	LayoutDashboard,
	MessageSquareText,
	PieChart as PieChartIcon,
	RefreshCw,
	Scale,
	Search,
	ShieldAlert,
	TrendingDown,
	Upload,
	Users,
} from "lucide-react"
import { type ChangeEvent, useCallback, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import * as XLSX from "xlsx"
import { HubLayout } from "#/components/hub-layout"

export const Route = createFileRoute("/analista-compatibilidade")({
	component: AnalistaCompatibilidade,
})

// ─── Constants ────────────────────────────────────────────────────────────────

const PAIRS = [
	{
		id: 1,
		a: "111111903",
		nameA: "CAIXA ECONÔMICA FEDERAL",
		b: "811110113",
		nameB: "CAUÇÃO A EXECUTAR",
		formattedA: "1.1.1.1.1.19.03",
		formattedB: "8.1.1.1.1.01.13",
		legis: "",
		question: "Questão 40 do Roteiro de Acompanhamento Contábil (SUCONT-3)",
	},
	{
		id: 2,
		a: "115511000",
		nameA: "MATERIAIS DE CONSUMO EM TRÂNSITO",
		b: "899920102",
		nameB: "BENS DE ESTOQUE ENVIADOS",
		formattedA: "1.1.5.5.1.10.00",
		formattedB: "8.9.9.9.2.01.02",
		legis: ", em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e)",
		question: "Questão 41 do Roteiro de Acompanhamento Contábil (SUCONT-3)",
	},
	{
		id: 3,
		a: "123119905",
		nameA: "BENS MÓVEIS EM TRÂNSITO",
		b: "899920202",
		nameB: "BENS MÓVEIS ENVIADOS",
		formattedA: "1.2.3.1.1.99.05",
		formattedB: "8.9.9.9.2.02.02",
		legis: ", em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e)",
		question: "Questão 42 do Roteiro de Acompanhamento Contábil (SUCONT-3)",
	},
]

const PAIR_COLORS = ["#ef4444", "#f97316", "#eab308"]

const CONFERENTES_MAP: Record<string, string> = {
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

const UG_METADATA: Record<string, { name: string; superior: string; ods: string }> = {
	"120001": { name: "GABAER", superior: "GABAER", ods: "GABAER" },
	"120002": { name: "DIREF", superior: "SEFA", ods: "SEFA" },
	"120004": { name: "BABR", superior: "VI COMAR", ods: "COMPREP" },
	"120005": { name: "PABR", superior: "DIRAD", ods: "SEFA" },
	"120006": { name: "GAP-BR", superior: "DIRAD", ods: "SEFA" },
	"120007": { name: "PARF", superior: "DIRAD", ods: "SEFA" },
	"120008": { name: "CINDACTA I", superior: "DECEA", ods: "DECEA" },
	"120013": { name: "CLA", superior: "DCTA", ods: "DCTA" },
	"120014": { name: "BAFZ", superior: "II COMAR", ods: "COMPREP" },
	"120015": { name: "CLBI", superior: "DCTA", ods: "DCTA" },
	"120016": { name: "GAP-SJ", superior: "DCTA", ods: "DCTA" },
	"120017": { name: "II COMAR", superior: "COMPREP", ods: "COMPREP" },
	"120018": { name: "BARF", superior: "II COMAR", ods: "COMPREP" },
	"120019": { name: "HARF", superior: "DIRSA", ods: "COMGEP" },
	"120021": { name: "CINDACTA III", superior: "DECEA", ods: "DECEA" },
	"120023": { name: "BASV", superior: "II COMAR", ods: "COMPREP" },
	"120025": { name: "EPCAR", superior: "DIRENS", ods: "COMGEP" },
	"120026": { name: "PAMA-LS", superior: "DIRMAB", ods: "COMGAP" },
	"120029": { name: "BAAF", superior: "III COMAR", ods: "COMPREP" },
	"120030": { name: "BAGL", superior: "III COMAR", ods: "COMPREP" },
	"120035": { name: "CTLA", superior: "CELOG", ods: "COMGAP" },
	"120036": { name: "DECEA", superior: "DECEA", ods: "DECEA" },
	"120039": { name: "GAP-RJ", superior: "DIRAD", ods: "SEFA" },
	"120040": { name: "HCA", superior: "DIRSA", ods: "COMGEP" },
	"120041": { name: "HAAF", superior: "DIRSA", ods: "COMGEP" },
	"120042": { name: "HFAG", superior: "DIRSA", ods: "COMGEP" },
	"120044": { name: "BREVET", superior: "DIRAD", ods: "SEFA" },
	"120045": { name: "PAGL", superior: "DIRAD", ods: "SEFA" },
	"120047": { name: "PAMB", superior: "DIRMAB", ods: "COMGAP" },
	"120048": { name: "PAME", superior: "DECEA", ods: "DECEA" },
	"120049": { name: "PAMA-GL", superior: "DIRMAB", ods: "COMGAP" },
	"120052": { name: "SDPP/PAÍS", superior: "DIRAD", ods: "SEFA" },
	"120053": { name: "PAAF", superior: "DIRAD", ods: "SEFA" },
	"120060": { name: "AFA", superior: "DIRENS", ods: "COMGEP" },
	"120061": { name: "BAST", superior: "IV COMAR", ods: "COMPREP" },
	"120062": { name: "BASP", superior: "IV COMAR", ods: "COMPREP" },
	"120064": { name: "EEAR", superior: "DIRENS", ods: "COMGEP" },
	"120065": { name: "FAYS", superior: "DIRAD", ods: "SEFA" },
	"120066": { name: "HFASP", superior: "DIRSA", ods: "COMGEP" },
	"120068": { name: "PAMA-SP", superior: "DIRMAB", ods: "COMGAP" },
	"120069": { name: "CRCEA-SE", superior: "DECEA", ods: "DECEA" },
	"120071": { name: "CELOG", superior: "COMGAP", ods: "COMGAP" },
	"120072": { name: "CINDACTA II", superior: "DECEA", ods: "DECEA" },
	"120073": { name: "BAFL", superior: "V COMAR", ods: "COMPREP" },
	"120075": { name: "BACO", superior: "V COMAR", ods: "COMPREP" },
	"120077": { name: "HACO", superior: "DIRSA", ods: "COMGEP" },
	"120082": { name: "BAMN", superior: "VII COMAR", ods: "COMPREP" },
	"120087": { name: "BABE", superior: "I COMAR", ods: "COMPREP" },
	"120088": { name: "COMARA", superior: "COMGAP", ods: "COMGAP" },
	"120089": { name: "HABE", superior: "DIRSA", ods: "COMGEP" },
	"120090": { name: "CABW", superior: "CELOG", ods: "COMGAP" },
	"120091": { name: "CABE", superior: "CELOG", ods: "COMGAP" },
	"120093": { name: "SDPP/EXTERIOR", superior: "DIRAD", ods: "SEFA" },
	"120094": { name: "CINDACTA IV", superior: "DECEA", ods: "DECEA" },
	"120096": { name: "HFAB", superior: "DIRSA", ods: "COMGEP" },
	"120097": { name: "PASP", superior: "DIRAD", ods: "SEFA" },
	"120099": { name: "DIRINFRA", superior: "COMGAP", ods: "COMGAP" },
	"120100": { name: "SDAB", superior: "DIRAD", ods: "SEFA" },
	"120108": { name: "COPAC", superior: "DCTA", ods: "DCTA" },
	"120127": { name: "CISCEA", superior: "DECEA", ods: "DECEA" },
	"120152": { name: "CPBV", superior: "VI COMAR", ods: "COMPREP" },
	"120154": { name: "HAMN", superior: "DIRSA", ods: "COMGEP" },
	"120195": { name: "CAE", superior: "DIRAD", ods: "SEFA" },
	"120225": { name: "SERINFRA-SJ", superior: "DIRINFRA", ods: "COMGAP" },
	"120255": { name: "SERINFRA-BE", superior: "DIRINFRA", ods: "COMGAP" },
	"120257": { name: "SERINFRA-RJ", superior: "DIRINFRA", ods: "COMGAP" },
	"120258": { name: "SERINFRA-SP", superior: "DIRINFRA", ods: "COMGAP" },
	"120259": { name: "SERINFRA-CO", superior: "DIRINFRA", ods: "COMGAP" },
	"120260": { name: "SERINFRA-BR", superior: "DIRINFRA", ods: "COMGAP" },
	"120261": { name: "SERINFRA-MN", superior: "DIRINFRA", ods: "COMGAP" },
	"120265": { name: "SERINFRA-NT", superior: "DIRINFRA", ods: "COMGAP" },
	"120279": { name: "RANCHO-DIRAD", superior: "DIRAD", ods: "SEFA" },
	"120512": { name: "PASJ", superior: "DCTA", ods: "DCTA" },
	"120623": { name: "GAP-AF", superior: "DIRAD", ods: "SEFA" },
	"120624": { name: "BAAN", superior: "VI COMAR", ods: "COMPREP" },
	"120625": { name: "GAP-DF", superior: "DIRAD", ods: "SEFA" },
	"120628": { name: "GAP-BE", superior: "DIRAD", ods: "SEFA" },
	"120629": { name: "GAP-CO", superior: "DIRAD", ods: "SEFA" },
	"120630": { name: "GAP-MN", superior: "DIRAD", ods: "SEFA" },
	"120631": { name: "BANT", superior: "II COMAR", ods: "COMPREP" },
	"120632": { name: "GAP-RF", superior: "DIRAD", ods: "SEFA" },
	"120633": { name: "GAP-SP", superior: "DIRAD", ods: "SEFA" },
	"120636": { name: "GAP-LS", superior: "DIRAD", ods: "SEFA" },
	"120637": { name: "BABV", superior: "VII COMAR", ods: "COMPREP" },
	"120638": { name: "BACG", superior: "IV COMAR", ods: "COMPREP" },
	"120639": { name: "GAP-FL", superior: "DIRAD", ods: "SEFA" },
	"120640": { name: "GAP-FZ", superior: "DIRAD", ods: "SEFA" },
	"120641": { name: "BAPV", superior: "VII COMAR", ods: "COMPREP" },
	"120642": { name: "GAP-SV", superior: "DIRAD", ods: "SEFA" },
	"120643": { name: "BASM", superior: "V COMAR", ods: "COMPREP" },
	"120644": { name: "GAP-CT", superior: "DIRAD", ods: "SEFA" },
	"120645": { name: "GAP-GL", superior: "DIRAD", ods: "SEFA" },
	"120669": { name: "BASC", superior: "III COMAR", ods: "COMPREP" },
	"120701": { name: "DIREF/SUCONT", superior: "SEFA", ods: "SEFA" },
	"120702": { name: "DIREF/SUCONV", superior: "SEFA", ods: "SEFA" },
	"120999": { name: "MAER - DIF. CAMBIAL", superior: "STN", ods: "STN" },
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PairBase = (typeof PAIRS)[number]

interface DivergentPair extends PairBase {
	saldoA: number | undefined
	saldoB: number | undefined
	diff: number
	hasA: boolean
	hasB: boolean
}

interface UGReport {
	ug: string
	ugCode: string
	ugName: string
	superior: string
	ods: string
	conferente: string
	totalDiff: number
	divergencias: string[]
	chartData: { name: string; description: string; value: number; color: string; question: string }[]
	pairs: DivergentPair[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(key: string) {
	return key
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim()
}

function formatCurrency(value: number | string) {
	if (typeof value === "string") return value
	return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

// ─── Component ────────────────────────────────────────────────────────────────

function AnalistaCompatibilidade() {
	const [activeTab, setActiveTab] = useState<"operacional" | "gerencial">("operacional")
	const [reports, setReports] = useState<UGReport[]>([])
	const [fileName, setFileName] = useState<string | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [prazos, setPrazos] = useState<Record<string, string>>({})
	const [messageTypes, setMessageTypes] = useState<Record<string, "com_prazo" | "sem_prazo" | "alerta">>({})
	const [msgNumbers, setMsgNumbers] = useState<Record<string, string>>({})
	const [msgDates, setMsgDates] = useState<Record<string, string>>({})
	const [msgSubjects, setMsgSubjects] = useState<Record<string, string>>({})
	const [userProfile, setUserProfile] = useState<string | null>(null)
	const [conferenteFilter, setConferenteFilter] = useState<string>("all")
	const [racFilter, setRacFilter] = useState<string>("all")

	// ── processData ────────────────────────────────────────────────────────────

	const processData = (data: (string | number | boolean | null | undefined)[][]) => {
		const ugs: Record<string, Record<string, number>> = {}

		if (data.length === 0) throw new Error("A planilha está vazia.")

		let headerRowIndex = -1
		let ugCol = -1
		let contaCol = -1
		let saldoCol = -1

		for (let i = 0; i < Math.min(data.length, 50); i++) {
			const row = data[i]
			if (!Array.isArray(row)) continue

			let tempUg = -1
			let tempConta = -1
			let tempSaldo = -1

			for (let j = 0; j < row.length; j++) {
				const cellValue = String(row[j] || "")
				const normalized = normalizeKey(cellValue)

				if (normalized === "ug" || normalized === "unidade gestora") tempUg = j
				else if (normalized.includes("conta")) tempConta = j
				else if (normalized.includes("saldo")) tempSaldo = j
			}

			if (tempUg !== -1 && tempConta !== -1 && tempSaldo !== -1) {
				headerRowIndex = i
				ugCol = tempUg
				contaCol = tempConta
				saldoCol = tempSaldo
				break
			}
		}

		if (headerRowIndex === -1) {
			throw new Error("Não foi possível identificar as colunas 'UG', 'Conta Contábil' e 'Saldo - R$'. Verifique se elas existem na planilha.")
		}

		for (let i = headerRowIndex + 1; i < data.length; i++) {
			const row = data[i]
			if (!Array.isArray(row)) continue

			const ugRaw = row[ugCol]
			const contaRaw = row[contaCol]
			const saldoRaw = row[saldoCol]

			if (ugRaw === undefined || ugRaw === null || ugRaw === "" || contaRaw === undefined || contaRaw === null || contaRaw === "") continue

			const ug = String(ugRaw).trim()
			const conta = String(contaRaw).replace(/\D/g, "")

			let saldo = 0
			if (typeof saldoRaw === "number") {
				saldo = saldoRaw
			} else if (typeof saldoRaw === "string") {
				const cleaned = saldoRaw.replace(/\./g, "").replace(",", ".")
				saldo = parseFloat(cleaned)
			}

			if (Number.isNaN(saldo)) saldo = 0

			if (!ugs[ug]) ugs[ug] = {}
			ugs[ug][conta] = saldo
		}

		const newReports: UGReport[] = []

		for (const ug in ugs) {
			const contas = ugs[ug]
			const divergencias: string[] = []
			const chartData: {
				name: string
				description: string
				value: number
				color: string
				question: string
			}[] = []
			const divergentPairs: DivergentPair[] = []
			let totalDiff = 0

			for (let i = 0; i < PAIRS.length; i++) {
				const { a: contaA, nameA, b: contaB, nameB, question } = PAIRS[i]
				const saldoA = contas[contaA]
				const saldoB = contas[contaB]

				const hasA = saldoA !== undefined
				const hasB = saldoB !== undefined

				if (!hasA && !hasB) continue

				const valA = hasA ? saldoA : 0
				const valB = hasB ? saldoB : 0
				const diff = valA - valB
				const absDiff = Math.abs(diff)

				if (absDiff > 0.001 || !hasA || !hasB) {
					totalDiff += absDiff

					chartData.push({
						name: `Par ${i + 1}`,
						description: `${contaA} (${nameA}) × ${contaB} (${nameB})`,
						value: absDiff,
						color: PAIR_COLORS[i],
						question: question,
					})

					const displayA = hasA ? formatCurrency(saldoA) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"
					const displayB = hasB ? formatCurrency(saldoB) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"

					divergentPairs.push({
						...PAIRS[i],
						saldoA,
						saldoB,
						diff,
						hasA,
						hasB,
					})

					divergencias.push(
						`
${i + 1}) Conta ${contaA} - ${nameA} × Conta ${contaB} - ${nameB}

Saldo da conta ${contaA}: ${displayA}
Saldo da conta ${contaB}: ${displayB}

Diferença apurada: ${formatCurrency(diff)}
`.trim()
					)
				}
			}

			if (totalDiff > 0) {
				const ugMatch = ug.match(/\d{6}/)
				const ugCode = ugMatch ? ugMatch[0] : ug
				const metadata = UG_METADATA[ugCode]
				const ugName = metadata ? metadata.name : ug.includes(" - ") ? ug.split(" - ")[1] : ug
				const superior = metadata ? metadata.superior : "Não Identificado"
				const ods = metadata ? metadata.ods : "Não Identificado"
				const conferente = CONFERENTES_MAP[ugCode] || "Não Identificado"

				newReports.push({
					ug,
					ugCode,
					ugName,
					superior,
					ods,
					conferente,
					totalDiff,
					divergencias,
					chartData,
					pairs: divergentPairs,
				})
			}
		}

		newReports.sort((a, b) => b.totalDiff - a.totalDiff)

		setReports(newReports)
		if (newReports.length === 0) {
			setError("Nenhuma divergência encontrada na planilha processada.")
		}
	}

	// ── handleFileUpload ───────────────────────────────────────────────────────

	const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		setFileName(file.name)
		setIsProcessing(true)
		setError(null)
		setReports([])
		setPrazos({})
		setMessageTypes({})
		setMsgNumbers({})
		setMsgDates({})
		setMsgSubjects({})

		const reader = new FileReader()
		reader.onload = (evt) => {
			try {
				const ab = evt.target?.result
				const wb = XLSX.read(ab, { type: "array" })
				const wsname = wb.SheetNames[0]
				const ws = wb.Sheets[wsname]
				const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
				processData(data as (string | number | boolean | null | undefined)[][])
			} catch (err) {
				const message = err instanceof Error ? err.message : "Erro ao processar o arquivo. Certifique-se de que é uma planilha Excel válida."
				setError(message)
			} finally {
				setIsProcessing(false)
			}
		}
		reader.onerror = () => {
			setError("Erro ao ler o arquivo.")
			setIsProcessing(false)
		}
		reader.readAsArrayBuffer(file)
	}

	// ── handleReset ────────────────────────────────────────────────────────────

	const handleReset = () => {
		setReports([])
		setError(null)
		setFileName(null)
		setPrazos({})
		setMessageTypes({})
		setMsgNumbers({})
		setMsgDates({})
		setMsgSubjects({})
	}

	// ── generateMessageText ────────────────────────────────────────────────────

	const generateMessageText = useCallback(
		(report: UGReport, type: "com_prazo" | "sem_prazo" | "alerta", prazoDias: string, msgNum: string, msgDateStr: string, customSubject: string) => {
			const today = new Date()
			let messageDate = today
			if (msgDateStr) {
				const [year, month, day] = msgDateStr.split("-").map(Number)
				if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
					messageDate = new Date(year, month - 1, day)
				}
			}

			const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
			const dateStr = `${messageDate.getDate().toString().padStart(2, "0")}${meses[messageDate.getMonth()]}${messageDate.getFullYear()}`
			const numStr = msgNum.trim() !== "" ? msgNum.trim() : "___"

			const hasPair1 = report.pairs.some((p) => p.id === 1)
			const hasPair2 = report.pairs.some((p) => p.id === 2)
			const hasPair3 = report.pairs.some((p) => p.id === 3)

			const isOnlyPair1 = hasPair1 && !hasPair2 && !hasPair3
			const isOnlyPair2 = !hasPair1 && hasPair2 && !hasPair3
			const isOnlyPair3 = !hasPair1 && !hasPair2 && hasPair3
			const hasSiloms = hasPair2 || hasPair3
			const isOnlySiloms = !hasPair1 && hasSiloms

			let defaultSubject = "Acompanhamento Contábil"
			if (isOnlyPair1) {
				defaultSubject = "Divergência de saldos - Caução a Executar"
			} else if (isOnlyPair2) {
				defaultSubject = "Divergência de saldos - Materiais de Consumo"
			} else if (isOnlyPair3) {
				defaultSubject = "Divergência de saldos - Bens Móveis"
			} else if (isOnlySiloms) {
				defaultSubject = "Divergência de saldos - Almoxarifado e Bens Móveis"
			} else {
				defaultSubject = "Divergências Contábeis Diversas"
			}
			const subjectStr = customSubject.trim() !== "" ? customSubject : defaultSubject

			let prazoText = ""
			let prazoTextPair1 = ""
			let prazoTextPair3 = ""
			if (type === "com_prazo") {
				if (prazoDias) {
					const [pYear, pMonth, pDay] = prazoDias.split("-").map(Number)
					const deadline = new Date(pYear, pMonth - 1, pDay)
					const diasSemana = ["Domingo", "2ª feira", "3ª feira", "4ª feira", "5ª feira", "6ª feira", "Sábado"]
					const diaSemanaStr = diasSemana[deadline.getDay()]
					const formattedDeadline = `${deadline.getDate().toString().padStart(2, "0")}/${(deadline.getMonth() + 1).toString().padStart(2, "0")}/${deadline.getFullYear()}`
					prazoText = `, até o dia ${formattedDeadline} (${diaSemanaStr})`
					prazoTextPair1 = ` até o dia ${formattedDeadline}`
					prazoTextPair3 = `, até o dia ${formattedDeadline}`
				} else {
					prazoText = `, até o dia __/__/____ (Xª feira)`
					prazoTextPair1 = ` até o dia __/__/____`
					prazoTextPair3 = `, até o dia __/__/____`
				}
			}

			let introText = ""
			let specificText = ""
			let acaoText = ""
			let extraText = ""
			let closingText =
				"Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para dirimir eventuais dúvidas sobre o assunto, por intermédio do SAU."

			const valoresText = report.pairs
				.map((p) => {
					const displayA = p.hasA ? formatCurrency(p.saldoA) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"
					const displayB = p.hasB ? formatCurrency(p.saldoB) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"
					return `Saldo da conta ${p.formattedA}: ${displayA}\nSaldo da conta ${p.formattedB}: ${displayB}\nDiferença apurada: ${formatCurrency(p.diff)}`
				})
				.join("\n\n")

			if (isOnlyPair1) {
				introText = `Em consulta ao SIAFI, foram identificadas divergências entre os saldos registrados na conta de controle 8.1.1.1.1.01.13 - CAUÇÃO A EXECUTAR e na conta contábil 1.1.1.1.1.19.03 - DEMAIS CONTAS - CAIXA ECONÔMICA FEDERAL nessa UG, o que exige análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e).`

				specificText = `Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo (1.1.1.1.1.19.03) e no passivo (2.X.8.8.1.04.02), é obrigatório o registro de documento hábil RC com a situação LDV053, por meio do qual será gerado saldo na conta de controle 8.1.1.1.1.01.13.\n\nNo caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na referida conta de controle (8.1.1.1.1.01.13), sem movimentação nas contas de caixa.\n\nDessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior, em razão dos registros de caução realizados por meio de títulos da dívida pública.`

				if (type === "alerta") {
					acaoText = `Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, emite este alerta para que o agente responsável analise a situação verificada. Esta mensagem possui caráter estritamente orientativo. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.`
				} else {
					acaoText = `Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise a situação verificada${prazoTextPair1}. Caso seja constatada irregularidade, deverá ser promovida a regularização imediata dos registros contábeis. Na hipótese de não haver falha, mas sim diferenças justificadas, especialmente pela existência de cauções em títulos da dívida pública, deverá ser encaminhada justificativa formal detalhada${type === "com_prazo" ? " até a mesma data" : ""}, com base nos fundamentos aqui descritos, para fins de análise e arquivamento.`
				}

				closingText =
					"Por fim, esta Divisão de Acompanhamento Contábil e de Suporte ao Usuário, da Subdiretoria de Contabilidade, permanece à disposição para esclarecer eventuais dúvidas acerca do assunto."
			} else if (isOnlyPair2) {
				const p = report.pairs[0]
				introText = `Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos entre as contas contábeis ${p.formattedA} (${p.nameA}) e ${p.formattedB} (${p.nameB})${p.legis}.`
				if (type === "alerta") {
					acaoText = `Diante do exposto, esta mensagem possui caráter estritamente orientativo e de alerta. Solicitamos ao agente responsável que analise o caso em questão e promova a regularização. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.`
				} else {
					acaoText = `Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria${prazoText} pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.`
				}
				extraText = `Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.`
			} else if (isOnlyPair3) {
				const p = report.pairs[0]
				introText = `Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilização de saldos entre as contas contábeis ${p.a} (${p.nameA}) e ${p.b} (${p.nameB})${p.legis}.`
				if (type === "alerta") {
					acaoText = `Diante do exposto, esta mensagem possui caráter estritamente orientativo e de alerta. Solicitamos ao agente responsável que analise o caso em questão e promova a regularização. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.`
					extraText = ``
				} else {
					acaoText = `Diante do exposto, solicito ao agente responsável que analise o caso em questão, bem como reporte as providências adotadas a esta Diretoria${prazoTextPair3}.`
					extraText = `Com o fito de agilizar a troca de informações entre esta Diretoria e essa UG, solicito a possibilidade de responder o presente questionamento pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.`
				}
			} else {
				// Mixed pairs
				introText =
					`Informo que após consulta no SIAFI, esta Diretoria constatou que essa UG apresenta incompatibilidade de saldos nas seguintes contas contábeis:\n\n` +
					report.pairs.map((p) => `- ${p.formattedA} (${p.nameA}) e ${p.formattedB} (${p.nameB})`).join("\n")

				const specificParts = []
				if (hasPair1) {
					specificParts.push(
						`Em relação às contas 8.1.1.1.1.01.13 e 1.1.1.1.1.19.03, exige-se análise quanto à adequação dos registros aos procedimentos previstos no item 6.12.4 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (Anexo G do RADA-e). Esta Setorial esclarece que, no registro de caução em espécie, além do lançamento no ativo e no passivo, é obrigatório o registro de documento hábil RC com a situação LDV053. No caso de caução em títulos da dívida pública, o ingresso ocorre exclusivamente na conta de controle, sem movimentação nas contas de caixa. Dessa forma, os saldos da conta 1.1.1.1.1.19.03 devem estar integralmente refletidos na conta 8.1.1.1.1.01.13, podendo esta última apresentar saldo maior.`
					)
				}
				if (hasPair2 || hasPair3) {
					specificParts.push(
						`Em relação às contas de Almoxarifado/Bens Móveis, a incompatibilidade encontra-se em desacordo com o módulo 7 do Manual Eletrônico de Execução Orçamentária, Financeira e Patrimonial (anexo G do RADA-e).`
					)
				}
				specificText = specificParts.join("\n\n")

				if (type === "alerta") {
					acaoText = `Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, emite este alerta para que o agente responsável analise os casos em questão e promova a regularização imediata dos registros contábeis. Esta mensagem possui caráter estritamente orientativo. Não é necessário o envio de resposta a este chamado informando as ações realizadas ou justificativas, exceto em caso de dúvidas.`
				} else {
					acaoText = `Diante do exposto, a Subdiretoria de Contabilidade, na qualidade de Setorial Contábil do COMAER, solicita ao agente responsável que analise os casos em questão, promovendo a regularização imediata dos registros contábeis ou apresentando justificativa formal detalhada, reportando as providências adotadas a esta Diretoria${prazoText} pelo Sistema de Atendimento ao Usuário (SAU), com abertura de chamado utilizando o objeto RESPOSTA DE ACOMPANHAMENTO CONTÁBIL.`
				}

				if (hasPair2) {
					extraText = `Em tempo, informo que os saldos entre os sistemas SIAFI e SILOMS deverão estar compatibilizados.`
				}
			}

			const detailText = isOnlyPair1 ? `Detalhamento da divergência:\n\n${valoresText}` : `Detalhamento da(s) divergência(s):\n\n${valoresText}`

			return `
Assunto: ${subjectStr}

Mensagem n° ${numStr}/SUCONT-3/${dateStr}

${introText}

${detailText}
${specificText ? `\n${specificText}\n` : ""}
${acaoText}
${extraText ? `\n${extraText}\n` : ""}
${closingText}

DIREF/SUCONT/SUCONT-3
`
				.trim()
				.replace(/\n{3,}/g, "\n\n")
		},
		[]
	)

	// ── copyToClipboard / copyAll / copyRacSummary ─────────────────────────────

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text)
	}

	const copyAll = () => {
		const allText = filteredReports
			.map((r) =>
				generateMessageText(r, messageTypes[r.ug] || "com_prazo", prazos[r.ug] || "", msgNumbers[r.ug] || "", msgDates[r.ug] || "", msgSubjects[r.ug] || "")
			)
			.join("\n\n-------------------------------------------------------\n\n")
		navigator.clipboard.writeText(allText)
	}

	const copyRacSummary = () => {
		if (racFilter === "all") return

		const pair = PAIRS.find((p) => p.question.includes(racFilter))
		if (!pair) return

		const header = `${racFilter} — ${pair.nameA} × ${pair.nameB}\n\n`
		const body = filteredReports
			.map((r) => {
				const ugDisplay = r.ug.includes(" - ") ? `${r.ug.split(" - ")[1]} (UG ${r.ug.split(" - ")[0]})` : `UG ${r.ug}`

				const pairDetail = r.pairs.find((p) => p.question.includes(racFilter))
				const diffStr = pairDetail ? `Diferença apurada: ${formatCurrency(pairDetail.diff)}` : ""

				return `${ugDisplay} — Conferente: ${r.conferente}\nInconsistência identificada: ${pair.question.split(" do ")[0]}.\n${diffStr}`
			})
			.join("\n\n")

		navigator.clipboard.writeText(header + body)
	}

	// ── Memos ──────────────────────────────────────────────────────────────────

	const managerialData = useMemo(() => {
		if (reports.length === 0) return null

		let totalVolume = 0
		const pairStats = PAIRS.map((p) => ({
			name: `Par ${p.id}`,
			description: `${p.formattedA} × ${p.formattedB}`,
			count: 0,
			volume: 0,
			color: PAIR_COLORS[p.id - 1],
		}))
		const conferenteStatsMap: Record<string, { name: string; count: number; volume: number; ugs: string[] }> = {}
		const superiorStatsMap: Record<string, { name: string; count: number; volume: number; ugs: string[] }> = {}
		const odsStatsMap: Record<string, { name: string; count: number; volume: number; ugs: string[] }> = {}

		reports.forEach((r) => {
			totalVolume += r.totalDiff
			r.pairs.forEach((rp) => {
				const pairIndex = PAIRS.findIndex((p) => p.id === rp.id)
				if (pairIndex !== -1) {
					pairStats[pairIndex].count += 1
					pairStats[pairIndex].volume += rp.diff
				}
			})

			if (!conferenteStatsMap[r.conferente]) {
				conferenteStatsMap[r.conferente] = { name: r.conferente, count: 0, volume: 0, ugs: [] }
			}
			conferenteStatsMap[r.conferente].count += 1
			conferenteStatsMap[r.conferente].volume += r.totalDiff
			conferenteStatsMap[r.conferente].ugs.push(r.ug)

			if (!superiorStatsMap[r.superior]) {
				superiorStatsMap[r.superior] = { name: r.superior, count: 0, volume: 0, ugs: [] }
			}
			superiorStatsMap[r.superior].count += 1
			superiorStatsMap[r.superior].volume += r.totalDiff
			superiorStatsMap[r.superior].ugs.push(r.ug)

			if (!odsStatsMap[r.ods]) {
				odsStatsMap[r.ods] = { name: r.ods, count: 0, volume: 0, ugs: [] }
			}
			odsStatsMap[r.ods].count += 1
			odsStatsMap[r.ods].volume += r.totalDiff
			odsStatsMap[r.ods].ugs.push(r.ug)
		})

		const topUGs = [...reports]
			.sort((a, b) => b.totalDiff - a.totalDiff)
			.slice(0, 5)
			.map((r) => ({
				name: r.ug.includes(" - ") ? `${r.ug.split(" - ")[1]} (${r.ug.split(" - ")[0]})` : r.ug,
				volume: r.totalDiff,
				conferente: r.conferente,
			}))

		const conferenteStats = Object.values(conferenteStatsMap).sort((a, b) => b.count - a.count)
		const superiorStats = Object.values(superiorStatsMap).sort((a, b) => b.count - a.count)
		const odsStats = Object.values(odsStatsMap).sort((a, b) => b.count - a.count)

		return { totalVolume, pairStats, topUGs, conferenteStats, superiorStats, odsStats }
	}, [reports])

	const filteredReports = useMemo(() => {
		let targetConferente = conferenteFilter

		if (conferenteFilter === "minhas" && userProfile) {
			if (userProfile === "Jefferson") targetConferente = "1T JEFFERSON LUÍS"
			else if (userProfile === "Érika") targetConferente = "1T ÉRIKA VICENTE"
			else if (userProfile === "Eliana") targetConferente = "1S ELIANA"
			else if (userProfile === "Pâmela") targetConferente = "2S PÂMELA"
		}

		let result = reports
		if (targetConferente !== "all") {
			result = result.filter((r) => r.conferente === targetConferente)
		}

		if (racFilter !== "all") {
			result = result
				.filter((r) => r.pairs.some((p) => p.question.includes(racFilter)))
				.map((r) => {
					const filteredPairs = r.pairs.filter((p) => p.question.includes(racFilter))
					const filteredChartData = r.chartData.filter((d) => d.question.includes(racFilter))
					const filteredDivergencias = r.divergencias.filter((d) => {
						return filteredPairs.some((p) => d.includes(p.a) && d.includes(p.b))
					})

					return {
						...r,
						pairs: filteredPairs,
						chartData: filteredChartData,
						divergencias: filteredDivergencias,
						totalDiff: filteredPairs.reduce((acc, p) => acc + Math.abs(p.diff), 0),
					}
				})
		}

		return result
	}, [reports, conferenteFilter, userProfile, racFilter])

	const conferentesList = useMemo(() => {
		const list = Array.from(new Set(reports.map((r) => r.conferente)))
		return list.sort()
	}, [reports])

	const racQuestionsList = useMemo(() => {
		const list = PAIRS.map((p) => {
			const match = p.question.match(/Questão \d+/)
			return match ? match[0] : p.question
		})
		return Array.from(new Set(list))
	}, [])

	// ── Render ─────────────────────────────────────────────────────────────────

	return (
		<HubLayout>
			{/* PAGE HEADER */}
			<div className="flex flex-wrap items-center justify-between gap-4 mb-8">
				{/* Left: icon + title */}
				<div className="flex items-center gap-4">
					<Scale className="text-tech-cyan w-5 h-5 shrink-0" />
					<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">Analista de Compatibilidade (Q40–Q42)</h2>
				</div>

				{/* Center: user profile selector */}
				<div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
					<span className="text-xs font-bold text-slate-500 uppercase ml-1">Identificar-se:</span>
					<button
						type="button"
						onClick={() => {
							setUserProfile(null)
							setConferenteFilter("all")
						}}
						className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${userProfile === null ? "bg-[#003366] text-white shadow" : "text-slate-500 hover:text-slate-700"}`}
					>
						Todos
					</button>
					{["Jefferson", "Érika", "Eliana", "Pâmela"].map((name) => (
						<button
							type="button"
							key={name}
							onClick={() => {
								setUserProfile(name)
								setConferenteFilter("minhas")
							}}
							className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${userProfile === name ? "bg-[#00a8e8] text-[#003366] shadow" : "text-slate-500 hover:text-slate-700"}`}
						>
							{name}
						</button>
					))}
				</div>

				{/* Right: actions */}
				<div className="flex items-center gap-3">
					{reports.length > 0 && (
						<button
							type="button"
							onClick={handleReset}
							className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:border-tech-cyan hover:text-tech-cyan text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-sm"
						>
							<RefreshCw className="w-3.5 h-3.5" />
							Nova Análise
						</button>
					)}
					<Link
						to="/"
						className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-tech-cyan text-xs font-mono rounded-lg transition-colors shadow-sm"
					>
						<ArrowLeft className="w-3.5 h-3.5" />
						Voltar ao Hub
					</Link>
				</div>
			</div>

			{/* ── Upload section ─────────────────────────────────────────────────── */}
			{reports.length === 0 && (
				<div className="space-y-6">
					{/* Info cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-[#00a8e8]/50 transition-colors">
							<div className="bg-blue-50 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
								<Search className="w-6 h-6 text-[#003366]" />
							</div>
							<h3 className="text-lg font-bold text-[#003366] mb-2">O que está sendo analisado</h3>
							<p className="text-sm text-slate-600 leading-relaxed">
								Análise de conformidade entre saldos de contas de controle e contas patrimoniais (ex: Cauções, Almoxarifado e Bens Móveis em Trânsito),
								identificando inconsistências nos registros das Unidades Gestoras.
							</p>
						</div>

						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-[#00a8e8]/50 transition-colors">
							<div className="bg-blue-50 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
								<BookOpen className="w-6 h-6 text-[#003366]" />
							</div>
							<h3 className="text-lg font-bold text-[#003366] mb-2">Referencial Teórico (RAC)</h3>
							<p className="text-sm text-slate-600 leading-relaxed">
								Baseado no Roteiro de Acompanhamento Contábil (RAC) da SUCONT-3, o aplicativo orienta a atuação da Setorial Contábil para garantir a
								fidedignidade do balanço patrimonial do COMAER.
							</p>
						</div>

						<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-[#00a8e8]/50 transition-colors">
							<div className="bg-blue-50 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
								<MessageSquareText className="w-6 h-6 text-[#003366]" />
							</div>
							<h3 className="text-lg font-bold text-[#003366] mb-2">Mensagens Automáticas</h3>
							<p className="text-sm text-slate-600 leading-relaxed">
								Geração instantânea de mensagens padronizadas de cobrança e orientação para as UGs, prontas para envio via SAU, otimizando o processo de
								regularização contábil.
							</p>
						</div>
					</div>

					{/* Upload card */}
					<div className="bg-white rounded-2xl shadow-sm border border-[#003366]/10 p-6">
						<h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[#003366]">
							<FileSpreadsheet className="w-5 h-5 text-[#00a8e8]" />
							Importar Relatório
						</h2>

						<div className="mb-6 bg-blue-50/50 border border-blue-100 rounded-xl p-4">
							<div className="flex items-start gap-3">
								<Info className="w-5 h-5 text-[#00a8e8] shrink-0 mt-0.5" />
								<div>
									<h3 className="text-sm font-semibold text-[#003366] mb-1.5">Caminho do Relatório no Tesouro Gerencial:</h3>
									<div className="text-xs text-slate-600 leading-relaxed flex flex-wrap items-center gap-x-1.5 gap-y-1">
										<span className="font-medium text-slate-700">TESOURO GERENCIAL</span>
										<ChevronRight className="w-3 h-3 text-slate-400" />
										<span>Relatórios Compartilhados</span>
										<ChevronRight className="w-3 h-3 text-slate-400" />
										<span>Consultas Gerenciais</span>
										<ChevronRight className="w-3 h-3 text-slate-400" />
										<span>Relatórios de Bancada dos Órgãos Superiores</span>
										<ChevronRight className="w-3 h-3 text-slate-400" />
										<span>52000 - Ministério da Defesa</span>
										<ChevronRight className="w-3 h-3 text-slate-400" />
										<span>52111 - Comando da Aeronáutica</span>
										<ChevronRight className="w-3 h-3 text-slate-400" />
										<span>SEFA</span>
										<ChevronRight className="w-3 h-3 text-slate-400" />
										<span>DIREF</span>
										<ChevronRight className="w-3 h-3 text-slate-400" />
										<span>SUCONT-3 - ACOMPANHAMENTO</span>
										<ChevronRight className="w-3 h-3 text-slate-400" />
										<span className="font-bold text-[#003366]">ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1</span>
									</div>
								</div>
							</div>
						</div>

						<div className="relative">
							<input
								type="file"
								accept=".xlsx, .xls, .csv"
								onChange={handleFileUpload}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
								disabled={isProcessing}
							/>
							<div
								className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isProcessing ? "border-slate-300 bg-slate-50" : "border-[#00a8e8]/30 bg-[#00a8e8]/5 hover:bg-[#00a8e8]/10"}`}
							>
								<Upload className={`w-8 h-8 mx-auto mb-3 ${isProcessing ? "text-slate-400" : "text-[#003366]"}`} />
								{isProcessing ? (
									<p className="text-slate-600 font-medium">Processando planilha...</p>
								) : fileName ? (
									<div>
										<p className="text-[#003366] font-medium">{fileName}</p>
										<p className="text-slate-500 text-sm mt-1">Clique ou arraste outro arquivo para substituir</p>
									</div>
								) : (
									<div>
										<p className="text-[#003366] font-medium">Clique ou arraste o arquivo do Tesouro Gerencial (.xlsx)</p>
										<p className="text-slate-500 text-sm mt-1">Colunas necessárias: UG, Conta Contábil, Saldo</p>
									</div>
								)}
							</div>
						</div>

						{error && (
							<div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3 text-sm">
								<AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
								<p>{error}</p>
							</div>
						)}
					</div>

					{/* Footer note */}
					<div className="text-center opacity-70 hover:opacity-100 transition-opacity">
						<p className="text-[11px] text-slate-500 leading-relaxed max-w-3xl mx-auto">
							Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel Int
							Carlos José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp CCO
							Jefferson Luís Reis Alves (Chefe da SUCONT-3.1).
						</p>
					</div>
				</div>
			)}

			{/* ── Results section ────────────────────────────────────────────────── */}
			{reports.length > 0 && (
				<div className="space-y-6">
					{/* Tab switcher */}
					<div className="flex items-center gap-2 border-b border-slate-200 pb-4">
						<button
							type="button"
							onClick={() => setActiveTab("operacional")}
							className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "operacional" ? "bg-[#003366] text-white shadow-md" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
						>
							<FileText className="w-4 h-4" />
							Visão Operacional (UGs)
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("gerencial")}
							className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "gerencial" ? "bg-[#003366] text-white shadow-md" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"}`}
						>
							<LayoutDashboard className="w-4 h-4" />
							Painel Gerencial (RAC)
						</button>
					</div>

					{/* ── Operacional tab ─────────────────────────────────────────────── */}
					{activeTab === "operacional" && (
						<>
							{/* Filter bar */}
							<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
								<div className="flex items-center gap-3">
									<div className="bg-emerald-100 p-2 rounded-lg">
										<CheckCircle2 className="w-6 h-6 text-emerald-600" />
									</div>
									<div>
										<h2 className="text-lg font-bold text-slate-800">
											{filteredReports.length} {filteredReports.length === 1 ? "Unidade com Divergência" : "Unidades com Divergências"}
										</h2>
										<p className="text-sm text-slate-500">
											{conferenteFilter === "all" && racFilter === "all"
												? "Panorama Geral"
												: `Filtrado por: ${conferenteFilter === "minhas" ? `Minhas UGs (${userProfile})` : conferenteFilter !== "all" ? conferenteFilter : ""} ${racFilter !== "all" ? (conferenteFilter !== "all" ? " + " : "") + racFilter : ""}`}
										</p>
									</div>
								</div>

								<div className="flex flex-wrap items-center gap-3">
									{/* RAC Question Filter */}
									<div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
										<button
											type="button"
											onClick={() => setRacFilter("all")}
											className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${racFilter === "all" ? "bg-[#003366] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
										>
											Todas Questões
										</button>
										<select
											value={racFilter !== "all" ? racFilter : ""}
											onChange={(e) => setRacFilter(e.target.value)}
											className="bg-transparent text-xs font-bold text-slate-600 outline-none px-2 py-1.5 border-l border-slate-200"
										>
											<option value="" disabled>
												Filtrar por Questão RAC
											</option>
											{racQuestionsList.map((q) => (
												<option key={q} value={q}>
													{q}
												</option>
											))}
										</select>
									</div>

									{/* Conferente Filter */}
									<div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
										<button
											type="button"
											onClick={() => setConferenteFilter("all")}
											className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${conferenteFilter === "all" ? "bg-[#003366] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
										>
											Geral
										</button>
										{userProfile && (
											<button
												type="button"
												onClick={() => setConferenteFilter("minhas")}
												className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${conferenteFilter === "minhas" ? "bg-[#00a8e8] text-[#003366] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
											>
												Minhas UGs
											</button>
										)}
										<select
											value={conferenteFilter !== "all" && conferenteFilter !== "minhas" ? conferenteFilter : ""}
											onChange={(e) => setConferenteFilter(e.target.value)}
											className="bg-transparent text-xs font-bold text-slate-600 outline-none px-2 py-1.5 border-l border-slate-200"
										>
											<option value="" disabled>
												Todos
											</option>
											{conferentesList.map((c) => (
												<option key={c} value={c}>
													{c}
												</option>
											))}
										</select>
									</div>

									{racFilter !== "all" && (
										<button
											type="button"
											onClick={copyRacSummary}
											className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
											title="Copiar resumo simplificado para esta questão"
										>
											<Copy className="w-4 h-4" />
											Copiar Resumo {racFilter}
										</button>
									)}

									<button
										type="button"
										onClick={copyAll}
										className="flex items-center gap-2 px-5 py-2.5 bg-[#003366] hover:bg-[#002244] text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
									>
										<Copy className="w-4 h-4" />
										Copiar Mensagens Filtradas
									</button>
								</div>
							</div>

							{/* UG cards */}
							<div className="space-y-8">
								{racFilter !== "all" && filteredReports.length > 0 && (
									<div className="bg-blue-600 text-white px-6 py-4 rounded-xl shadow-md flex items-center gap-3">
										<BookOpen className="w-6 h-6" />
										<div>
											<h3 className="text-lg font-bold">{racFilter}</h3>
											<p className="text-blue-100 text-sm">
												{PAIRS.find((p) => p.question.includes(racFilter))?.question.split(" do ")[0]} —{" "}
												{PAIRS.find((p) => p.question.includes(racFilter))?.nameA} × {PAIRS.find((p) => p.question.includes(racFilter))?.nameB}
											</p>
										</div>
									</div>
								)}

								{filteredReports.map((report, idx) => {
									const msgType = messageTypes[report.ug] || "com_prazo"
									const currentPrazo = prazos[report.ug] || ""
									const currentMsgNum = msgNumbers[report.ug] || ""
									const currentMsgDate = msgDates[report.ug] || ""
									const currentSubject = msgSubjects[report.ug] || ""
									const msgText = generateMessageText(report, msgType, currentPrazo, currentMsgNum, currentMsgDate, currentSubject)

									return (
										<div key={idx} className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden flex flex-col">
											{/* Card header */}
											<div className="bg-gradient-to-r from-[#003366] to-[#004d99] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#002244]">
												<div className="flex items-center gap-3">
													<div className="bg-[#00a8e8] text-[#003366] font-mono text-sm px-2 py-1 rounded font-bold shadow-sm">#{idx + 1}</div>
													<h3 className="text-xl font-bold text-white tracking-tight flex flex-wrap items-center gap-3">
														{report.ugName} (UG {report.ugCode})
														<span className="text-xs font-medium bg-white/20 text-blue-50 px-2.5 py-1 rounded-md border border-white/10 flex items-center gap-1.5">
															<Building2 className="w-3.5 h-3.5" />
															{report.superior} / {report.ods}
														</span>
														<span className="text-xs font-medium bg-white/20 text-blue-50 px-2.5 py-1 rounded-md border border-white/10 flex items-center gap-1.5">
															<Users className="w-3.5 h-3.5" />
															Conferente: {report.conferente}
														</span>
													</h3>
												</div>
												<div className="flex items-center gap-2 bg-red-500/20 px-4 py-2 rounded-lg border border-red-500/30">
													<TrendingDown className="w-5 h-5 text-red-400" />
													<span className="text-red-100 font-medium text-sm">Diferença Total:</span>
													<span className="text-white font-bold">{formatCurrency(report.totalDiff)}</span>
												</div>
											</div>

											{/* Card body */}
											<div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
												{/* Left: Divergences */}
												<div className="p-6 lg:col-span-5 bg-slate-50/50 flex flex-col border-r border-slate-200">
													<h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
														<AlertTriangle className="w-4 h-4" />
														Evidenciação das Divergências
													</h4>
													<div className="flex-1 flex flex-col gap-4">
														{report.chartData.map((data, i) => (
															<div
																key={i}
																className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm relative overflow-hidden gap-3"
															>
																<div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: data.color }} />
																<div className="pl-2 flex-1">
																	<p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{data.name}</p>
																	<p className="text-sm font-semibold text-slate-700 leading-snug">{data.description.split(" × ")[0]}</p>
																	<p className="text-xs text-slate-400 my-0.5">×</p>
																	<p className="text-sm font-semibold text-slate-700 leading-snug">{data.description.split(" × ")[1]}</p>
																	<div className="mt-2 pt-2 border-t border-slate-100">
																		<p className="text-[10px] font-bold text-blue-600 uppercase tracking-tight mb-0.5">Controle Interno SUCONT-3:</p>
																		<p className="text-[11px] text-slate-500 leading-tight italic">{data.question}</p>
																	</div>
																</div>
																<div className="sm:text-right pl-2 sm:pl-0 border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0 mt-2 sm:mt-0">
																	<p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-semibold">Diferença</p>
																	<p className="text-lg font-black tracking-tight" style={{ color: data.color }}>
																		{formatCurrency(data.value)}
																	</p>
																</div>
															</div>
														))}
													</div>
												</div>

												{/* Right: Message generator */}
												<div className="p-6 lg:col-span-7 flex flex-col">
													<div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
														<h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Mensagem Institucional</h4>

														<div className="flex flex-wrap items-center gap-3">
															<div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
																<label htmlFor={`msg-num-${report.ug}`} className="text-xs font-medium text-slate-600 whitespace-nowrap">
																	Nº da Mensagem:
																</label>
																<input
																	id={`msg-num-${report.ug}`}
																	type="text"
																	placeholder="Ex: 123"
																	value={currentMsgNum}
																	onChange={(e) =>
																		setMsgNumbers((prev) => ({
																			...prev,
																			[report.ug]: e.target.value,
																		}))
																	}
																	className="w-16 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-[#00a8e8] focus:border-[#00a8e8] outline-none bg-white"
																/>
															</div>

															<div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
																<label htmlFor={`msg-date-${report.ug}`} className="text-xs font-medium text-slate-600 whitespace-nowrap">
																	Data:
																</label>
																<input
																	id={`msg-date-${report.ug}`}
																	type="date"
																	value={currentMsgDate}
																	onChange={(e) =>
																		setMsgDates((prev) => ({
																			...prev,
																			[report.ug]: e.target.value,
																		}))
																	}
																	className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-[#00a8e8] focus:border-[#00a8e8] outline-none bg-white"
																/>
															</div>

															<div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
																<label htmlFor={`msg-subject-${report.ug}`} className="text-xs font-medium text-slate-600 whitespace-nowrap">
																	Assunto:
																</label>
																<input
																	id={`msg-subject-${report.ug}`}
																	type="text"
																	placeholder="Assunto da mensagem"
																	value={currentSubject}
																	onChange={(e) =>
																		setMsgSubjects((prev) => ({
																			...prev,
																			[report.ug]: e.target.value,
																		}))
																	}
																	className="w-48 px-2 py-1 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-[#00a8e8] focus:border-[#00a8e8] outline-none bg-white"
																/>
															</div>

															<div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
																<button
																	type="button"
																	onClick={() =>
																		setMessageTypes((prev) => ({
																			...prev,
																			[report.ug]: "com_prazo",
																		}))
																	}
																	className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${msgType === "com_prazo" ? "bg-white text-[#003366] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
																>
																	Com Prazo
																</button>
																<button
																	type="button"
																	onClick={() =>
																		setMessageTypes((prev) => ({
																			...prev,
																			[report.ug]: "sem_prazo",
																		}))
																	}
																	className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${msgType === "sem_prazo" ? "bg-white text-[#003366] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
																>
																	Sem Prazo
																</button>
																<button
																	type="button"
																	onClick={() =>
																		setMessageTypes((prev) => ({
																			...prev,
																			[report.ug]: "alerta",
																		}))
																	}
																	className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${msgType === "alerta" ? "bg-white text-[#003366] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
																>
																	Alerta
																</button>
															</div>

															{msgType === "com_prazo" && (
																<div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
																	<CalendarClock className="w-4 h-4 text-slate-400" />
																	<label htmlFor={`msg-prazo-${report.ug}`} className="text-xs font-medium text-slate-600 whitespace-nowrap">
																		Prazo:
																	</label>
																	<input
																		id={`msg-prazo-${report.ug}`}
																		type="date"
																		value={currentPrazo}
																		onChange={(e) =>
																			setPrazos((prev) => ({
																				...prev,
																				[report.ug]: e.target.value,
																			}))
																		}
																		className="px-2 py-1 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-[#00a8e8] focus:border-[#00a8e8] outline-none bg-white"
																	/>
																</div>
															)}

															<button
																type="button"
																onClick={() => copyToClipboard(msgText)}
																className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00a8e8]/10 hover:bg-[#00a8e8]/20 text-[#003366] rounded-lg text-sm font-medium transition-colors border border-[#00a8e8]/30 whitespace-nowrap"
															>
																<Copy className="w-4 h-4" />
																Copiar
															</button>
														</div>
													</div>

													<div className="bg-slate-100 rounded-xl p-5 border border-slate-200 flex-1">
														<pre className="whitespace-pre-wrap font-mono text-sm text-slate-700 leading-relaxed">{msgText}</pre>
													</div>
												</div>
											</div>
										</div>
									)
								})}
							</div>
						</>
					)}

					{/* ── Gerencial tab ───────────────────────────────────────────────── */}
					{activeTab === "gerencial" && managerialData && (
						<div className="space-y-6">
							{/* KPIs */}
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
									<p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Total de UGs com Divergência</p>
									<p className="text-4xl font-black text-[#003366]">{reports.length}</p>
								</div>
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
									<p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Volume Financeiro Total</p>
									<p className="text-4xl font-black text-red-600">{formatCurrency(managerialData.totalVolume)}</p>
								</div>
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
									<p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Média por UG</p>
									<p className="text-4xl font-black text-orange-500">{formatCurrency(managerialData.totalVolume / reports.length)}</p>
								</div>
							</div>

							{/* Charts */}
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
								{/* Bar chart: Top 5 UGs */}
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-[#003366] mb-4 flex items-center gap-2">
										<BarChart3 className="w-5 h-5 text-[#00a8e8]" />
										Top 5 UGs por Volume de Divergência
									</h3>
									<div className="h-72">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={managerialData.topUGs} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
												<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
												<XAxis type="number" tickFormatter={(value: number) => `R$ ${(value / 1000000).toFixed(1)}M`} stroke="#64748b" fontSize={12} />
												<YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} fontWeight="bold" />
												<Tooltip
													formatter={(value: number | string | readonly (number | string)[]) =>
														formatCurrency(typeof value === "number" ? value : Number(value))
													}
													labelFormatter={(label: string, payload: { payload?: { conferente?: string } }[]) => {
														if (payload?.[0]?.payload) {
															return `${label} — Conferente: ${payload[0].payload.conferente}`
														}
														return String(label)
													}}
													cursor={{ fill: "#f1f5f9" }}
													contentStyle={{
														borderRadius: "8px",
														border: "none",
														boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
													}}
												/>
												<Bar dataKey="volume" fill="#003366" radius={[0, 4, 4, 0]} barSize={32} />
											</BarChart>
										</ResponsiveContainer>
									</div>
								</div>

								{/* Pie chart: Pairs */}
								<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
									<h3 className="text-lg font-bold text-[#003366] mb-4 flex items-center gap-2">
										<PieChartIcon className="w-5 h-5 text-[#00a8e8]" />
										Incidência por Par de Contas
									</h3>
									<div className="h-72">
										<ResponsiveContainer width="100%" height="100%">
											<PieChart>
												<Pie
													data={managerialData.pairStats.filter((p) => p.count > 0)}
													cx="50%"
													cy="50%"
													innerRadius={60}
													outerRadius={100}
													paddingAngle={5}
													dataKey="count"
												>
													{managerialData.pairStats.map((entry, index) => (
														<Cell key={`cell-${index}`} fill={entry.color} />
													))}
												</Pie>
												<Tooltip
													// biome-ignore lint/suspicious/noExplicitAny: recharts formatter overload
													formatter={(value: any) => [`${value} UGs`, "Ocorrências"]}
													contentStyle={{
														borderRadius: "8px",
														border: "none",
														boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
													}}
												/>
												<Legend verticalAlign="bottom" height={36} iconType="circle" />
											</PieChart>
										</ResponsiveContainer>
									</div>
								</div>
							</div>

							{/* Distribution: Órgão Superior */}
							<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
								<div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
									<h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
										<Building2 className="w-5 h-5 text-[#00a8e8]" />
										Distribuição por Órgão Superior
									</h3>
								</div>
								<div className="p-6">
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
										{managerialData.superiorStats.map((sup, idx) => (
											<div key={idx} className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex flex-col">
												<div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
													<h4 className="font-bold text-[#003366] flex items-center gap-2">
														<Building2 className="w-4 h-4 text-slate-400" />
														{sup.name}
													</h4>
													<span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">
														{sup.count} UG{sup.count > 1 ? "s" : ""}
													</span>
												</div>
												<div className="flex-1">
													<p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Unidades com Inconsistências:</p>
													<div className="flex flex-wrap gap-1.5">
														{sup.ugs.map((ug, i) => (
															<span key={i} className="text-xs bg-white border border-slate-200 text-slate-700 px-2 py-1 rounded-md shadow-sm">
																{ug.includes(" - ") ? `${ug.split(" - ")[1]} (${ug.split(" - ")[0]})` : `UG ${ug}`}
															</span>
														))}
													</div>
												</div>
												<div className="mt-4 pt-3 border-t border-slate-200">
													<p className="text-xs text-slate-500">
														Volume Total: <span className="font-bold text-slate-700">{formatCurrency(sup.volume)}</span>
													</p>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>

							{/* Distribution: ODS */}
							<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
								<div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
									<h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
										<LayoutDashboard className="w-5 h-5 text-[#00a8e8]" />
										Distribuição por ODS (Órgão de Direção Setorial)
									</h3>
								</div>
								<div className="p-6">
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
										{managerialData.odsStats.map((ods, idx) => (
											<div key={idx} className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex flex-col">
												<div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
													<h4 className="font-bold text-[#003366] flex items-center gap-2">
														<LayoutDashboard className="w-4 h-4 text-slate-400" />
														{ods.name}
													</h4>
													<span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded-full">
														{ods.count} UG{ods.count > 1 ? "s" : ""}
													</span>
												</div>
												<div className="flex-1">
													<p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Unidades com Inconsistências:</p>
													<div className="flex flex-wrap gap-1.5">
														{ods.ugs.map((ug, i) => (
															<span key={i} className="text-xs bg-white border border-slate-200 text-slate-700 px-2 py-1 rounded-md shadow-sm">
																{ug.includes(" - ") ? `${ug.split(" - ")[1]} (${ug.split(" - ")[0]})` : `UG ${ug}`}
															</span>
														))}
													</div>
												</div>
												<div className="mt-4 pt-3 border-t border-slate-200">
													<p className="text-xs text-slate-500">
														Volume Total: <span className="font-bold text-slate-700">{formatCurrency(ods.volume)}</span>
													</p>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>

							{/* Distribution: Conferente */}
							<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
								<div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
									<h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
										<Users className="w-5 h-5 text-[#00a8e8]" />
										Filtro Gerencial por Conferente
									</h3>
								</div>
								<div className="p-6">
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
										{managerialData.conferenteStats.map((conf, idx) => (
											<div key={idx} className="bg-slate-50 rounded-xl border border-slate-200 p-5 flex flex-col">
												<div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
													<h4 className="font-bold text-[#003366] flex items-center gap-2">
														<Users className="w-4 h-4 text-slate-400" />
														{conf.name}
													</h4>
													<span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
														{conf.count} UG{conf.count > 1 ? "s" : ""}
													</span>
												</div>
												<div className="flex-1">
													<p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Unidades com Inconsistências:</p>
													<div className="flex flex-wrap gap-1.5">
														{conf.ugs.map((ug, i) => (
															<span key={i} className="text-xs bg-white border border-slate-200 text-slate-700 px-2 py-1 rounded-md shadow-sm">
																{ug.includes(" - ") ? `${ug.split(" - ")[1]} (${ug.split(" - ")[0]})` : `UG ${ug}`}
															</span>
														))}
													</div>
												</div>
												<div className="mt-4 pt-3 border-t border-slate-200">
													<p className="text-xs text-slate-500">
														Volume Total: <span className="font-bold text-slate-700">{formatCurrency(conf.volume)}</span>
													</p>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>

							{/* Risk analysis */}
							<div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
								<div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
									<h3 className="text-lg font-bold text-[#003366] flex items-center gap-2">
										<ShieldAlert className="w-5 h-5 text-[#00a8e8]" />
										Análise de Risco e Contexto Metodológico (RAC)
									</h3>
								</div>
								<div className="p-6 space-y-6">
									{managerialData.pairStats.map((pair, idx) => {
										if (pair.count === 0) return null
										return (
											<div key={idx} className="flex flex-col md:flex-row gap-4 pb-6 border-b border-slate-100 last:border-0 last:pb-0">
												<div className="md:w-1/3">
													<div className="flex items-center gap-2 mb-2">
														<div className="w-3 h-3 rounded-full" style={{ backgroundColor: pair.color }} />
														<h4 className="font-bold text-slate-800">{pair.name}</h4>
													</div>
													<p className="text-sm font-medium text-slate-600 mb-1">{pair.description.split(" × ")[0]}</p>
													<p className="text-sm font-medium text-slate-600">{pair.description.split(" × ")[1]}</p>
													<div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
														<p className="text-xs text-slate-500 uppercase font-bold mb-1">Volume Envolvido</p>
														<p className="text-lg font-bold text-slate-800">{formatCurrency(pair.volume)}</p>
													</div>
												</div>
												<div className="md:w-2/3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
													<h5 className="text-sm font-bold text-[#003366] mb-2">Objetivo da Verificação:</h5>
													<p className="text-sm text-slate-700 mb-4 leading-relaxed">
														{pair.name === "Par 1"
															? "Garantir que os saldos de caução em espécie registrados no ativo (1.1.1.1.1.19.03) estejam integralmente refletidos na conta de controle (8.1.1.1.1.01.13)."
															: "Garantir a compatibilidade entre os saldos dos sistemas SIAFI e SILOMS, assegurando que os bens em trânsito ou enviados estejam corretamente registrados e baixados."}
													</p>
													<h5 className="text-sm font-bold text-red-700 mb-2">Risco Contábil Associado:</h5>
													<p className="text-sm text-slate-700 leading-relaxed">
														{pair.name === "Par 1"
															? "A divergência indica possível omissão no registro do documento hábil RC com situação LDV053, o que distorce a evidenciação dos controles de garantias e cauções do COMAER, comprometendo a fidedignidade do balanço patrimonial."
															: "A falta de compatibilidade evidencia falhas no controle de movimentação de bens (almoxarifado/móveis), podendo resultar em superavaliação ou subavaliação do patrimônio da União sob responsabilidade do COMAER, além de descumprimento do Manual Eletrônico do RADA-e."}
													</p>
												</div>
											</div>
										)
									})}
								</div>
							</div>
						</div>
					)}
				</div>
			)}
		</HubLayout>
	)
}
