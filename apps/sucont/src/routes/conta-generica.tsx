import { createFileRoute, Link } from "@tanstack/react-router"
import {
	AlertCircle,
	AlertOctagon,
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Award,
	BookOpen,
	Building2,
	Calendar,
	Check,
	CheckCircle,
	Compass,
	Copy,
	DollarSign,
	FileSpreadsheet,
	FileText,
	Info,
	Landmark,
	Lightbulb,
	MessageSquare,
	Plane,
	RefreshCw,
	Search,
	Shield,
	ShieldCheck,
	Target,
	TrendingUp,
	Upload,
	Wallet,
} from "lucide-react"
import type React from "react"
import { useRef, useState } from "react"
import * as XLSX from "xlsx"
import { HubLayout } from "#/components/hub-layout"
import { oracleContaGenericaFn } from "#/server/conta-generica.fn"

// ── Data Maps ────────────────────────────────────────────────────────────────

interface GroupedData {
	[ug: string]: {
		[conta: string]: {
			mes: string
			saldo: number
		}[]
	}
}

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

const UG_INFO_MAP: Record<string, { nome: string; ods: string; os: string }> = {
	"120001": { nome: "GABAER", ods: "GABAER", os: "GABAER" },
	"120002": { nome: "DIREF", ods: "SEFA", os: "SEFA" },
	"120004": { nome: "BABR", ods: "COMPREP", os: "VI COMAR" },
	"120005": { nome: "PABR", ods: "SEFA", os: "DIRAD" },
	"120006": { nome: "GAP-BR", ods: "SEFA", os: "DIRAD" },
	"120007": { nome: "PARF", ods: "SEFA", os: "DIRAD" },
	"120008": { nome: "CINDACTA I", ods: "DECEA", os: "DECEA" },
	"120013": { nome: "CLA", ods: "DCTA", os: "DCTA" },
	"120014": { nome: "BAFZ", ods: "COMPREP", os: "II COMAR" },
	"120015": { nome: "CLBI", ods: "DCTA", os: "DCTA" },
	"120016": { nome: "GAP-SJ", ods: "DCTA", os: "DCTA" },
	"120017": { nome: "II COMAR", ods: "COMPREP", os: "COMPREP" },
	"120018": { nome: "BARF", ods: "COMPREP", os: "II COMAR" },
	"120019": { nome: "HARF", ods: "COMGEP", os: "DIRSA" },
	"120021": { nome: "CINDACTA III", ods: "DECEA", os: "DECEA" },
	"120023": { nome: "BASV", ods: "COMPREP", os: "II COMAR" },
	"120025": { nome: "EPCAR", ods: "COMGEP", os: "DIRENS" },
	"120026": { nome: "PAMA-LS", ods: "COMGAP", os: "DIRMAB" },
	"120029": { nome: "BAAF", ods: "COMPREP", os: "III COMAR" },
	"120030": { nome: "BAGL", ods: "COMPREP", os: "III COMAR" },
	"120035": { nome: "CTLA", ods: "COMGAP", os: "CELOG" },
	"120036": { nome: "DECEA", ods: "DECEA", os: "DECEA" },
	"120039": { nome: "GAP-RJ", ods: "SEFA", os: "DIRAD" },
	"120040": { nome: "HCA", ods: "COMGEP", os: "DIRSA" },
	"120041": { nome: "HAAF", ods: "COMGEP", os: "DIRSA" },
	"120042": { nome: "HFAG", ods: "COMGEP", os: "DIRSA" },
	"120044": { nome: "BREVET", ods: "SEFA", os: "DIRAD" },
	"120045": { nome: "PAGL", ods: "SEFA", os: "DIRAD" },
	"120047": { nome: "PAMB", ods: "COMGAP", os: "DIRMAB" },
	"120048": { nome: "PAME", ods: "DECEA", os: "DECEA" },
	"120049": { nome: "PAMA-GL", ods: "COMGAP", os: "DIRMAB" },
	"120052": { nome: "SDPP/PAÍS", ods: "SEFA", os: "DIRAD" },
	"120053": { nome: "PAAF", ods: "SEFA", os: "DIRAD" },
	"120060": { nome: "AFA", ods: "COMGEP", os: "DIRENS" },
	"120061": { nome: "BAST", ods: "COMPREP", os: "IV COMAR" },
	"120062": { nome: "BASP", ods: "COMPREP", os: "IV COMAR" },
	"120064": { nome: "EEAR", ods: "COMGEP", os: "DIRENS" },
	"120065": { nome: "FAYS", ods: "SEFA", os: "DIRAD" },
	"120066": { nome: "HFASP", ods: "COMGEP", os: "DIRSA" },
	"120068": { nome: "PAMA-SP", ods: "COMGAP", os: "DIRMAB" },
	"120069": { nome: "CRCEA-SE", ods: "DECEA", os: "DECEA" },
	"120071": { nome: "CELOG", ods: "COMGAP", os: "COMGAP" },
	"120072": { nome: "CINDACTA II", ods: "DECEA", os: "DECEA" },
	"120073": { nome: "BAFL", ods: "COMPREP", os: "V COMAR" },
	"120075": { nome: "BACO", ods: "COMPREP", os: "V COMAR" },
	"120077": { nome: "HACO", ods: "COMGEP", os: "DIRSA" },
	"120082": { nome: "BAMN", ods: "COMPREP", os: "VII COMAR" },
	"120087": { nome: "BABE", ods: "COMPREP", os: "I COMAR" },
	"120088": { nome: "COMARA", ods: "COMGAP", os: "COMGAP" },
	"120089": { nome: "HABE", ods: "COMGEP", os: "DIRSA" },
	"120090": { nome: "CABW", ods: "COMGAP", os: "CELOG" },
	"120091": { nome: "CABE", ods: "COMGAP", os: "CELOG" },
	"120093": { nome: "SDPP/EXTERIOR", ods: "SEFA", os: "DIRAD" },
	"120094": { nome: "CINDACTA IV", ods: "DECEA", os: "DECEA" },
	"120096": { nome: "HFAB", ods: "COMGEP", os: "DIRSA" },
	"120097": { nome: "PASP", ods: "SEFA", os: "DIRAD" },
	"120099": { nome: "DIRINFRA", ods: "COMGAP", os: "COMGAP" },
	"120100": { nome: "SDAB", ods: "SEFA", os: "DIRAD" },
	"120108": { nome: "COPAC", ods: "DCTA", os: "DCTA" },
	"120127": { nome: "CISCEA", ods: "DECEA", os: "DECEA" },
	"120152": { nome: "CPBV", ods: "COMPREP", os: "VI COMAR" },
	"120154": { nome: "HAMN", ods: "COMGEP", os: "DIRSA" },
	"120195": { nome: "CAE", ods: "SEFA", os: "DIRAD" },
	"120225": { nome: "SERINFRA-SJ", ods: "COMGAP", os: "DIRINFRA" },
	"120255": { nome: "SERINFRA-BE", ods: "COMGAP", os: "DIRINFRA" },
	"120257": { nome: "SERINFRA-RJ", ods: "COMGAP", os: "DIRINFRA" },
	"120258": { nome: "SERINFRA-SP", ods: "COMGAP", os: "DIRINFRA" },
	"120259": { nome: "SERINFRA-CO", ods: "COMGAP", os: "DIRINFRA" },
	"120260": { nome: "SERINFRA-BR", ods: "COMGAP", os: "DIRINFRA" },
	"120261": { nome: "SERINFRA-MN", ods: "COMGAP", os: "DIRINFRA" },
	"120265": { nome: "SERINFRA-NT", ods: "COMGAP", os: "DIRINFRA" },
	"120279": { nome: "RANCHO-DIRAD", ods: "SEFA", os: "DIRAD" },
	"120512": { nome: "PASJ", ods: "DCTA", os: "DCTA" },
	"120623": { nome: "GAP-AF", ods: "SEFA", os: "DIRAD" },
	"120624": { nome: "BAAN", ods: "COMPREP", os: "VI COMAR" },
	"120625": { nome: "GAP-DF", ods: "SEFA", os: "DIRAD" },
	"120628": { nome: "GAP-BE", ods: "SEFA", os: "DIRAD" },
	"120629": { nome: "GAP-CO", ods: "SEFA", os: "DIRAD" },
	"120630": { nome: "GAP-MN", ods: "SEFA", os: "DIRAD" },
	"120631": { nome: "BANT", ods: "COMPREP", os: "II COMAR" },
	"120632": { nome: "GAP-RF", ods: "SEFA", os: "DIRAD" },
	"120633": { nome: "GAP-SP", ods: "SEFA", os: "DIRAD" },
	"120636": { nome: "GAP-LS", ods: "SEFA", os: "DIRAD" },
	"120637": { nome: "BABV", ods: "COMPREP", os: "VII COMAR" },
	"120638": { nome: "BACG", ods: "COMPREP", os: "IV COMAR" },
	"120639": { nome: "GAP-FL", ods: "SEFA", os: "DIRAD" },
	"120640": { nome: "GAP-FZ", ods: "SEFA", os: "DIRAD" },
	"120641": { nome: "BAPV", ods: "COMPREP", os: "VII COMAR" },
	"120642": { nome: "GAP-SV", ods: "SEFA", os: "DIRAD" },
	"120643": { nome: "BASM", ods: "COMPREP", os: "V COMAR" },
	"120644": { nome: "GAP-CT", ods: "SEFA", os: "DIRAD" },
	"120645": { nome: "GAP-GL", ods: "SEFA", os: "DIRAD" },
	"120669": { nome: "BASC", ods: "COMPREP", os: "III COMAR" },
	"120701": { nome: "DIREF/SUCONT", ods: "SEFA", os: "SEFA" },
	"120702": { nome: "DIREF/SUCONV", ods: "SEFA", os: "SEFA" },
	"120999": { nome: "MAER - DIF. CAMBIAL", ods: "STN", os: "STN" },
}

const RAC_QUESTIONS = [
	{
		id: "35",
		title: "Questão RAC 35",
		description: "Utilização de conta genérica",
		classes: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
	},
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const getConferente = (ug: string) => CONFERENTES_MAP[ug] || "NÃO MAPEADO"

const getRacInfo = (conta: string) => {
	const firstDigit = conta.charAt(0)
	return (
		RAC_QUESTIONS.find((q) => q.classes.includes(firstDigit)) || {
			id: "XX",
			title: "Questão RAC XX",
			description: "Utilização de conta genérica",
		}
	)
}

const getOds = (ug: string) => UG_INFO_MAP[ug]?.ods || "OUTROS"
const getOs = (ug: string) => UG_INFO_MAP[ug]?.os || "OUTROS"
const getUgName = (ug: string) => UG_INFO_MAP[ug]?.nome || "NÃO IDENTIFICADA"

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

const formatMilitaryDate = (dateStr: string) => {
	if (!dateStr) return "XXXMÊSANO"
	const date = new Date(`${dateStr}T12:00:00`)
	const day = String(date.getDate()).padStart(2, "0")
	const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
	return `${day}${months[date.getMonth()]}${date.getFullYear()}`
}

// ── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/conta-generica")({
	component: ContaGenerica,
})

function ContaGenerica() {
	const [file, setFile] = useState<File | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)
	const [result, setResult] = useState<GroupedData | null>(null)
	const [foundAny, setFoundAny] = useState(false)
	const [copiedUg, setCopiedUg] = useState<string | null>(null)
	const [messageMode, setMessageMode] = useState<"individual" | "unica">("individual")
	const [deadline, setDeadline] = useState("")
	const [messageType, setMessageType] = useState<"prazo" | "sem_prazo" | "alerta">("sem_prazo")
	const [msgNumber, setMsgNumber] = useState("")
	const [msgDate, setMsgDate] = useState(new Date().toISOString().split("T")[0])
	const [conferenteFilter, setConferenteFilter] = useState<string | null>(null)
	const [activeView, setActiveView] = useState<"operacional" | "tatica" | "estrategica">("estrategica")

	// Advanced analysis
	const [paretoData, setParetoData] = useState<{
		ugPercentage: number
		inconsistencyPercentage: number
		topUgs: { ug: string; count: number; volume: number; ods: string; os: string }[]
	} | null>(null)
	const [priorityList, setPriorityList] = useState<{ ug: string; count: number; volume: number; ods: string; os: string; priorityScore: number }[]>([])
	const [criticalSummary, setCriticalSummary] = useState<{
		ods: string
		os: string
		ugCount: string
		ugVolume: string
	} | null>(null)
	const [odsRiskMap, setOdsRiskMap] = useState<{ ods: string; count: number; volume: number; percentage: number }[]>([])
	const [totalFinancialImpact, setTotalFinancialImpact] = useState(0)

	// Oracle chat
	const [chatMessages, setChatMessages] = useState<{ role: "user" | "model"; text: string }[]>([])
	const [isAskingOracle, setIsAskingOracle] = useState(false)
	const [oracleInput, setOracleInput] = useState("")

	const fileInputRef = useRef<HTMLInputElement>(null)

	// ── File handling ───────────────────────────────────────────────────────────

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const f = e.target.files?.[0]
		if (f) {
			setFile(f)
			processFile(f)
		}
	}

	const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		e.stopPropagation()
	}

	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		e.stopPropagation()
		const f = e.dataTransfer.files?.[0]
		if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) {
			setFile(f)
			processFile(f)
		} else {
			setError("Por favor, envie um arquivo Excel válido (.xlsx ou .xls).")
		}
	}

	const resetApp = () => {
		setFile(null)
		setResult(null)
		setFoundAny(false)
		setError(null)
		setConferenteFilter(null)
		setParetoData(null)
		setPriorityList([])
		setCriticalSummary(null)
		setOdsRiskMap([])
		setTotalFinancialImpact(0)
		setChatMessages([])
		setOracleInput("")
		setActiveView("estrategica")
		setMessageMode("individual")
		setMessageType("sem_prazo")
		setDeadline("")
		if (fileInputRef.current) fileInputRef.current.value = ""
	}

	// ── Data processing ─────────────────────────────────────────────────────────

	const processFile = (f: File) => {
		setIsProcessing(true)
		setError(null)
		setResult(null)
		setFoundAny(false)
		const reader = new FileReader()
		reader.onload = (evt) => {
			try {
				const wb = XLSX.read(evt.target?.result, { type: "array" })
				const ws = wb.Sheets[wb.SheetNames[0]]
				const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
				processData(data)
			} catch {
				setError("Erro ao processar o arquivo. Certifique-se de que é um arquivo Excel válido (.xlsx).")
				setIsProcessing(false)
			}
		}
		reader.onerror = () => {
			setError("Erro ao ler o arquivo.")
			setIsProcessing(false)
		}
		reader.readAsArrayBuffer(f)
	}

	const processData = (data: unknown[][]) => {
		let headerRowIndex = -1
		let colIndices = { ug: -1, conta: -1, mes: -1, saldo: -1 }

		for (let i = 0; i < data.length; i++) {
			const row = data[i]
			if (!Array.isArray(row)) continue
			const norm = row.map((c) =>
				String(c || "")
					.trim()
					.toLowerCase()
			)
			const ugIdx = norm.indexOf("ug")
			const contaIdx = norm.findIndex((c) => c === "conta contábil" || c === "conta contabil")
			const mesIdx = norm.findIndex((c) => c === "mês" || c === "mes" || c === "conta corrente")
			const saldoIdx = norm.findIndex((c) => c === "saldo - r$" || c === "saldo - r $" || c === "saldo" || c === "valor alongado")
			if (ugIdx !== -1 && contaIdx !== -1 && mesIdx !== -1 && saldoIdx !== -1) {
				headerRowIndex = i
				colIndices = { ug: ugIdx, conta: contaIdx, mes: mesIdx, saldo: saldoIdx }
				break
			}
		}

		if (headerRowIndex === -1) {
			setError("Não foi possível encontrar o cabeçalho da tabela com as colunas: UG, Conta Contábil, Mês, Saldo - R$. Verifique o formato do arquivo.")
			setIsProcessing(false)
			return
		}

		const grouped: GroupedData = {}
		let hasGeneric = false

		for (let i = headerRowIndex + 1; i < data.length; i++) {
			const row = data[i]
			if (!Array.isArray(row) || row.length === 0) continue
			const rawUg = row[colIndices.ug]
			const rawConta = row[colIndices.conta]
			const rawMes = row[colIndices.mes]
			const rawSaldo = row[colIndices.saldo]
			if (rawUg == null || rawConta == null || rawMes == null || rawSaldo == null) continue
			if (rawUg === "" || rawConta === "") continue

			const ug = String(rawUg).trim()
			const conta = String(rawConta).replace(/\s+/g, "").replace(/\./g, "")
			const mes = String(rawMes).trim()
			let saldo = 0
			if (typeof rawSaldo === "number") {
				saldo = rawSaldo
			} else {
				saldo = parseFloat(String(rawSaldo).replace(/\./g, "").replace(",", "."))
			}

			if (Number.isNaN(saldo) || saldo === 0) continue
			if (conta.length > 0) {
				hasGeneric = true
				if (!grouped[ug]) grouped[ug] = {}
				if (!grouped[ug][conta]) grouped[ug][conta] = []
				grouped[ug][conta].push({ mes, saldo })
			}
		}

		setResult(grouped)
		setFoundAny(hasGeneric)
		if (hasGeneric) performAdvancedAnalysis(grouped)
		setIsProcessing(false)
	}

	const performAdvancedAnalysis = (grouped: GroupedData) => {
		const ugStats: { ug: string; count: number; volume: number; ods: string; os: string }[] = []
		const odsAgg: Record<string, { count: number; volume: number }> = {}
		const osAgg: Record<string, { count: number; volume: number }> = {}
		let totalInc = 0
		let totalVol = 0

		for (const [ug, contas] of Object.entries(grouped)) {
			let ugCount = 0
			let ugVolume = 0
			const ods = getOds(ug)
			const os = getOs(ug)

			for (const regs of Object.values(contas)) {
				for (const reg of regs) {
					ugCount++
					ugVolume += reg.saldo
				}
			}

			totalInc += ugCount
			totalVol += ugVolume
			ugStats.push({ ug, count: ugCount, volume: ugVolume, ods, os })

			if (!odsAgg[ods]) odsAgg[ods] = { count: 0, volume: 0 }
			odsAgg[ods].count += ugCount
			odsAgg[ods].volume += ugVolume

			if (!osAgg[os]) osAgg[os] = { count: 0, volume: 0 }
			osAgg[os].count += ugCount
			osAgg[os].volume += ugVolume
		}

		// Pareto
		const sortedByCount = [...ugStats].sort((a, b) => b.count - a.count)
		let running = 0
		let paretoIdx = -1
		for (let i = 0; i < sortedByCount.length; i++) {
			running += sortedByCount[i].count
			if (running >= totalInc * 0.8 && paretoIdx === -1) paretoIdx = i
		}
		const paretoSlice = sortedByCount.slice(0, Math.max(3, paretoIdx + 1)).slice(0, 10)
		setParetoData({
			ugPercentage: Math.round(((paretoIdx + 1) / ugStats.length) * 100),
			inconsistencyPercentage: Math.round((paretoSlice.reduce((a, c) => a + c.count, 0) / totalInc) * 100),
			topUgs: paretoSlice,
		})

		// ODS risk map
		const riskMap = Object.entries(odsAgg)
			.map(([ods, d]) => ({ ods, count: d.count, volume: d.volume, percentage: Math.round((d.count / totalInc) * 100) }))
			.sort((a, b) => b.count - a.count)
		setOdsRiskMap(riskMap)

		// Critical summary
		const criticalOds = riskMap[0]?.ods || "N/A"
		const criticalOs = Object.entries(osAgg).sort((a, b) => b[1].count - a[1].count)[0]?.[0] || "N/A"
		setCriticalSummary({
			ods: criticalOds,
			os: criticalOs,
			ugCount: sortedByCount[0]?.ug || "N/A",
			ugVolume: [...ugStats].sort((a, b) => b.volume - a.volume)[0]?.ug || "N/A",
		})

		// Priority list
		const maxCount = Math.max(...ugStats.map((u) => u.count))
		const maxVolume = Math.max(...ugStats.map((u) => u.volume))
		setPriorityList(
			ugStats
				.map((u) => ({
					...u,
					priorityScore: Math.round((u.count / maxCount) * 50 + (u.volume / maxVolume) * 50),
				}))
				.sort((a, b) => b.priorityScore - a.priorityScore)
				.slice(0, 5)
		)
		setTotalFinancialImpact(totalVol)
	}

	// ── Oracle ──────────────────────────────────────────────────────────────────

	const askOracle = async (question?: string) => {
		const query = question || oracleInput
		if (!query.trim()) return
		setChatMessages((prev) => [...prev, { role: "user", text: query }])
		setOracleInput("")
		setIsAskingOracle(true)

		try {
			const systemContext = `
Você é o Oráculo SUCONT, assistente de análise contábil do COMAER.
Dados da análise atual:
- Impacto Financeiro Total em Risco: ${formatCurrency(totalFinancialImpact)}
- Total de inconsistências: ${odsRiskMap.reduce((a, c) => a + c.count, 0)}
- ODS mais crítico: ${criticalSummary?.ods}
- Órgão Superior mais crítico: ${criticalSummary?.os}
- UG com mais inconsistências: ${criticalSummary?.ugCount} (${getUgName(criticalSummary?.ugCount || "")})
- UG com maior volume irregular: ${criticalSummary?.ugVolume} (${getUgName(criticalSummary?.ugVolume || "")})
- Análise de Pareto: ${paretoData?.ugPercentage}% das UGs concentram ${paretoData?.inconsistencyPercentage}% das inconsistências.

Mapa de Risco por ODS:
${odsRiskMap.map((o) => `- ${o.ods}: ${o.count} inconsistências (${o.percentage}%), Volume: ${formatCurrency(o.volume)}`).join("\n")}

Prioridades de Atuação:
${priorityList.map((p, i) => `${i + 1}º: UG ${p.ug} (${getUgName(p.ug)}) - Score: ${p.priorityScore}`).join("\n")}
      `.trim()

			const text = await oracleContaGenericaFn({ data: { query, systemContext } })
			setChatMessages((prev) => [...prev, { role: "model", text }])
		} catch (_err) {
			setChatMessages((prev) => [...prev, { role: "model", text: "Erro ao conectar com o Oráculo. Verifique sua conexão." }])
		} finally {
			setIsAskingOracle(false)
		}
	}

	// ── Message generation ──────────────────────────────────────────────────────

	const generateMessage = (ug: string, contas: GroupedData[string]) => {
		const racGroups: Record<string, { info: ReturnType<typeof getRacInfo>; accounts: string[] }> = {}
		for (const conta of Object.keys(contas)) {
			const racInfo = getRacInfo(conta)
			if (!racGroups[racInfo.id]) racGroups[racInfo.id] = { info: racInfo, accounts: [] }
			racGroups[racInfo.id].accounts.push(conta)
		}

		let contasText = ""
		for (const group of Object.values(racGroups)) {
			contasText += "\n"
			for (const conta of group.accounts) {
				contasText += `- Conta Contábil: ${conta}\n`
				contas[conta].forEach((reg) => {
					contasText += `  Conta Corrente / Mês: ${reg.mes} | Valor Alongado / Saldo: ${formatCurrency(reg.saldo)}\n`
				})
			}
		}

		const deadlineText =
			messageType === "prazo" && deadline
				? `\nSolicitamos que as providências sejam adotadas até a data de ${new Date(`${deadline}T12:00:00`).toLocaleDateString("pt-BR")}, a contar do recebimento desta mensagem.\n`
				: ""

		const stnNote =
			ug === "120999"
				? "\nNOTA: Esta Unidade Gestora (120999 - MAER - DIF. CAMBIAL) possui tratamento diferenciado por ser de uso exclusivo da Secretaria do Tesouro Nacional (STN).\n"
				: ""

		const actionText =
			messageType === "alerta"
				? `A intenção deste acompanhamento é que a Unidade Gestora verifique a situação apresentada e realize as respectivas regularizações, caso se trate de uma inconsistência contábil.\n\nRessalta-se que, por se tratar de uma mensagem de alerta, não é necessário o envio de resposta informando as ações adotadas ou justificativas via Sistema de Atendimento ao Usuário (SAU).`
				: `Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com a reclassificação para as contas contábeis específicas adequadas.\n\nApós a regularização, ou caso haja justificativa técnica para a manutenção do saldo na referida conta, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem.`

		return `Assunto: Identificação de Inconsistência Contábil

Mensagem nº ${msgNumber}/SUCONT-3/${formatMilitaryDate(msgDate)}

Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foi identificada inconsistência contábil por esta Unidade Gestora, apresentando saldo(s) diferente(s) de zero.
${stnNote}
Abaixo, detalhamos a(s) conta(s) e o(s) respectivo(s) saldo(s) identificado(s):${contasText}${deadlineText}
${actionText}

Atenciosamente,

Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)
Subdiretoria de Contabilidade (SUCONT)
Diretoria de Economia e Finanças da Aeronáutica (DIREF)`
	}

	const generateSingleMessage = () => {
		const deadlineText =
			messageType === "prazo" && deadline
				? `\nSolicitamos que as providências sejam adotadas até a data de ${new Date(`${deadline}T12:00:00`).toLocaleDateString("pt-BR")}, a contar do recebimento desta mensagem.\n`
				: ""

		const actionText =
			messageType === "alerta"
				? `A intenção deste acompanhamento é que as Unidades Gestoras verifiquem a situação apresentada e realizem as respectivas regularizações, caso se trate de uma inconsistência contábil.\n\nRessalta-se que, por se tratar de uma mensagem de alerta, não é necessário o envio de resposta informando as ações adotadas ou justificativas via Sistema de Atendimento ao Usuário (SAU).`
				: `Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com a reclassificação para as contas contábeis específicas adequadas.\n\nApós a regularização, ou caso haja justificativa técnica para a manutenção do saldo na referida conta, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem.`

		const ugsToInclude = Object.keys(result ?? {})
			.filter((ug) => !conferenteFilter || getConferente(ug) === conferenteFilter)
			.sort()

		let text = `Assunto: Identificação de Inconsistências Contábeis\n\nMensagem nº ${msgNumber}/SUCONT-3/${formatMilitaryDate(msgDate)}\n\n`
		text += `Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foram identificadas inconsistências apresentando saldo(s) diferente(s) de zero.\n\n`
		text += `Abaixo, detalhamos as inconsistências identificadas por Unidade Gestora:\n\n`

		for (const ug of ugsToInclude) {
			text += `UG: ${getUgName(ug)} (${ug})\n`
			const contas = result?.[ug]
			for (const conta of Object.keys(contas)) {
				text += `- Conta Contábil: ${conta}\n`
				contas[conta].forEach((reg) => {
					text += `  Conta Corrente / Mês: ${reg.mes} | Valor Alongado / Saldo: ${formatCurrency(reg.saldo)}\n`
				})
			}
			text += "\n"
		}

		text += `${deadlineText}\n${actionText}\n\nAtenciosamente,\n\nDivisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)\nSubdiretoria de Contabilidade (SUCONT)\nDiretoria de Economia e Finanças da Aeronáutica (DIREF)`
		return text
	}

	const copyToClipboard = (text: string, key: string) => {
		navigator.clipboard.writeText(text)
		setCopiedUg(key)
		setTimeout(() => setCopiedUg(null), 2000)
	}

	// ── Derived stats ────────────────────────────────────────────────────────────

	const totalUGs = result ? Object.keys(result).length : 0
	let totalContas = 0
	let totalSaldoGeral = 0
	let totalInconsistencias = 0

	const ugVolumes: { ug: string; volume: number; count: number }[] = []
	const contaFrequencies: Record<string, { count: number; volume: number }> = {}
	const conferenteStats: Record<string, { ugs: string[]; count: number }> = {}
	const racStatsMap: Record<string, { count: number; volume: number; ugs: Set<string> }> = {}
	const odsStatsMap: Record<string, { count: number; volume: number; ugs: Set<string> }> = {}
	const osStatsMap: Record<string, { count: number; volume: number; ugs: Set<string> }> = {}
	const ugInconsistencies: { ug: string; count: number; volume: number }[] = []

	RAC_QUESTIONS.forEach((q) => {
		racStatsMap[q.id] = { count: 0, volume: 0, ugs: new Set() }
	})

	if (result) {
		for (const [ug, contas] of Object.entries(result)) {
			let ugVolume = 0
			let ugCount = 0
			totalContas += Object.keys(contas).length
			const conferente = getConferente(ug)
			if (!conferenteStats[conferente]) conferenteStats[conferente] = { ugs: [], count: 0 }
			conferenteStats[conferente].ugs.push(ug)

			const ods = getOds(ug)
			const os = getOs(ug)
			if (!odsStatsMap[ods]) odsStatsMap[ods] = { count: 0, volume: 0, ugs: new Set() }
			if (!osStatsMap[os]) osStatsMap[os] = { count: 0, volume: 0, ugs: new Set() }
			odsStatsMap[ods].ugs.add(ug)
			osStatsMap[os].ugs.add(ug)

			for (const [conta, regs] of Object.entries(contas)) {
				let contaVol = 0
				const racInfo = getRacInfo(conta)
				for (const reg of regs) {
					totalSaldoGeral += reg.saldo
					ugVolume += reg.saldo
					contaVol += reg.saldo
					ugCount++
					totalInconsistencias++
					if (racStatsMap[racInfo.id]) {
						racStatsMap[racInfo.id].count++
						racStatsMap[racInfo.id].volume += reg.saldo
						racStatsMap[racInfo.id].ugs.add(ug)
					}
					odsStatsMap[ods].count++
					odsStatsMap[ods].volume += reg.saldo
					osStatsMap[os].count++
					osStatsMap[os].volume += reg.saldo
				}
				if (!contaFrequencies[conta]) contaFrequencies[conta] = { count: 0, volume: 0 }
				contaFrequencies[conta].count += regs.length
				contaFrequencies[conta].volume += contaVol
			}

			conferenteStats[conferente].count += ugCount
			ugVolumes.push({ ug, volume: ugVolume, count: ugCount })
			ugInconsistencies.push({ ug, count: ugCount, volume: ugVolume })
		}
	}

	const _topUgsByVolume = [...ugVolumes].sort((a, b) => b.volume - a.volume).slice(0, 3)
	const topContasByFreq = Object.entries(contaFrequencies)
		.map(([conta, d]) => ({ conta, ...d }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10)
	const topUgsByCount = [...ugInconsistencies].sort((a, b) => b.count - a.count).slice(0, 10)
	const topOdsByCount = Object.entries(odsStatsMap)
		.map(([ods, d]) => ({ ods, ...d }))
		.sort((a, b) => b.count - a.count)
	const topOsByCount = Object.entries(osStatsMap)
		.map(([os, d]) => ({ os, ...d }))
		.sort((a, b) => b.count - a.count)

	// ── Render ───────────────────────────────────────────────────────────────────

	return (
		<HubLayout>
			{/* PAGE HEADER */}
			<div className="flex items-center justify-between mb-8">
				<div className="flex items-center gap-4">
					<Search className="text-fab-blue w-5 h-5" />
					<h2 className="text-slate-700 font-bold uppercase tracking-widest text-sm">Analista Conta Genérica (Q35)</h2>
					<div className="flex-grow h-[1px] bg-slate-200" />
				</div>
				<div className="flex items-center gap-3 ml-4">
					{result && (
						<button
							type="button"
							onClick={resetApp}
							className="flex items-center gap-2 px-4 py-2 bg-fab-blue text-white hover:bg-fab-dark text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-sm"
						>
							<RefreshCw className="w-3.5 h-3.5" />
							Nova Missão
						</button>
					)}
					<Link
						to="/"
						className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 text-xs font-mono rounded-lg transition-colors shadow-sm"
					>
						<ArrowLeft className="w-3.5 h-3.5" />
						Voltar ao Hub
					</Link>
				</div>
			</div>

			{/* ERROR */}
			{error && (
				<div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 max-w-3xl mx-auto mb-8">
					<AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
					<p className="text-sm font-medium">{error}</p>
				</div>
			)}

			{/* UPLOAD STATE */}
			{!result && !isProcessing && (
				<>
					<div className="bg-white rounded-3xl shadow-2xl border border-fab-blue/20 p-10 max-w-3xl mx-auto mt-4 relative overflow-hidden">
						<div className="absolute top-0 right-0 w-64 h-64 bg-fab-blue/5 rounded-bl-full -mr-10 -mt-10" />
						<div className="absolute bottom-0 left-0 w-40 h-40 bg-fab-gold/10 rounded-tr-full -ml-10 -mb-10" />
						<div className="absolute top-1/2 right-10 opacity-5 pointer-events-none transform -translate-y-1/2">
							<Plane className="w-64 h-64 -rotate-45" />
						</div>

						<div className="text-center mb-10 relative z-10">
							<div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-fab-dark mb-6 border-4 border-fab-gold shadow-xl">
								<Shield className="w-12 h-12 text-white" />
							</div>
							<h2 className="text-4xl font-black text-fab-dark mb-3 tracking-tight uppercase">ANALISTA SUCONT</h2>
							<div className="flex items-center justify-center gap-3 mb-4">
								<div className="h-[2px] w-16 bg-fab-gold" />
								<span className="text-sm font-black text-fab-blue uppercase tracking-[0.3em]">Uso de Contas Contábeis Genéricas</span>
								<div className="h-[2px] w-16 bg-fab-gold" />
							</div>
							<p className="text-slate-600 max-w-lg mx-auto font-medium leading-relaxed">
								Plataforma oficial da <span className="text-fab-blue font-bold">SUCONT-3</span> para auditoria e acompanhamento contábil das Unidades Gestoras
								do COMAER.
							</p>
							<div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-fab-dark border border-fab-gold/30 rounded-full shadow-md">
								<Compass className="w-4 h-4 text-fab-gold" />
								<span className="text-[10px] font-black text-white uppercase tracking-widest">Questão 35 do Roteiro de Acompanhamento Contábil (SUCONT-3)</span>
							</div>
						</div>

						<div className="mb-8 relative z-10 bg-slate-50 border border-slate-200 rounded-xl p-5 text-left shadow-sm">
							<div className="flex items-center gap-2 mb-3">
								<Info className="w-4 h-4 text-fab-blue" />
								<span className="text-xs font-black text-slate-700 uppercase tracking-widest">Caminho do Relatório no Tesouro Gerencial</span>
							</div>
							<div className="text-[11px] text-slate-600 font-mono leading-relaxed bg-white p-4 rounded-lg border border-slate-200 shadow-inner break-words">
								<span className="font-bold text-fab-blue">TESOURO GERENCIAL</span>
								{" > "}Relatórios Compartilhados {" > "}Consultas Gerenciais {" > "}Relatórios de Bancada dos Órgãos Superiores {" > "}52000 - Ministério da
								Defesa {" > "}52111 - Comando da Aeronáutica {" > "}SEFA {" > "}DIREF {" > "}SUCONT-3 - ACOMPANHAMENTO
								{" > "} <span className="font-bold text-fab-dark">ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1</span>
							</div>
						</div>

						<button
							type="button"
							className={`w-full border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer relative z-10 ${
								file ? "border-fab-gold bg-fab-blue/5" : "border-fab-blue/30 hover:border-fab-blue hover:bg-fab-blue/5"
							}`}
							onDragOver={handleDragOver}
							onDrop={handleDrop}
							onClick={() => fileInputRef.current?.click()}
						>
							<input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx,.xls" className="hidden" />
							<div className="flex flex-col items-center justify-center gap-5">
								<div className={`p-6 rounded-full shadow-lg ${file ? "bg-fab-blue text-white" : "bg-white border border-slate-200 text-fab-blue"}`}>
									<Upload className="w-10 h-10" />
								</div>
								<div>
									<p className="text-lg font-black text-slate-700 uppercase tracking-tight">{file ? file.name : "Arraste o Relatório do Tesouro Gerencial"}</p>
									<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Identificação automática de contas com final "99"</p>
								</div>
							</div>
						</button>
					</div>

					<div className="max-w-4xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
						{[
							{
								icon: Search,
								color: "fab-blue",
								title: "O que está sendo analisado",
								text: 'Identificação do uso indevido de contas contábeis genéricas (terminadas em "99") pelas Unidades Gestoras do COMAER.',
								borderHover: "hover:border-fab-blue/50",
							},
							{
								icon: BookOpen,
								color: "fab-gold",
								title: "Referencial Teórico (RAC)",
								text: "Análise fundamentada no Roteiro de Acompanhamento Contábil (RAC) da SUCONT-3, visando garantir a fidedignidade dos registros.",
								borderHover: "hover:border-fab-gold/50",
							},
							{
								icon: MessageSquare,
								color: "emerald-600",
								title: "Mensagens Automáticas",
								text: "Geração automática de textos padronizados para envio via SIAFI às Unidades Gestoras, facilitando a cobrança e orientação técnica.",
								borderHover: "hover:border-emerald-500/50",
							},
						].map(({ icon: Icon, color, title, text, borderHover }) => (
							<div key={title} className={`bg-white p-6 rounded-2xl shadow-md border border-slate-200 ${borderHover} transition-colors group`}>
								<div className={`w-12 h-12 bg-${color}/10 rounded-xl flex items-center justify-center mb-4`}>
									<Icon className={`w-6 h-6 text-${color}`} />
								</div>
								<h3 className="text-xs font-black text-fab-dark uppercase tracking-widest mb-3">{title}</h3>
								<p className="text-[12px] text-slate-600 font-medium leading-relaxed">{text}</p>
							</div>
						))}
					</div>

					<div className="mt-8 text-center px-6 max-w-3xl mx-auto opacity-70">
						<p className="text-[10px] text-slate-500 leading-relaxed font-medium">
							Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel Int
							Carlos José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp CCO
							Jefferson Luís Reis Alves (Chefe da SUCONT-3.1).
						</p>
					</div>
				</>
			)}

			{/* PROCESSING */}
			{isProcessing && (
				<div className="flex flex-col items-center justify-center py-20">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fab-blue mb-4" />
					<span className="text-slate-600 font-medium text-lg">Processando relatório...</span>
					<span className="text-slate-400 text-sm mt-2">Aplicando regras de negócio da SUCONT-3</span>
				</div>
			)}

			{/* RESULTS */}
			{result && !isProcessing && (
				<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
					{/* Control info banner */}
					<div className="bg-fab-blue/5 border border-fab-blue/10 rounded-xl p-4 flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-full bg-fab-blue/10 flex items-center justify-center">
								<Compass className="w-4 h-4 text-fab-blue" />
							</div>
							<div>
								<h4 className="text-[10px] font-black text-fab-blue uppercase tracking-widest">Controle Interno SUCONT-3</h4>
								<p className="text-xs font-bold text-slate-600">Análise relativa à Questão 35 do Roteiro de Acompanhamento Contábil</p>
							</div>
						</div>
						<div className="hidden sm:block px-3 py-1 bg-fab-gold/10 border border-fab-gold/20 rounded text-[9px] font-black text-fab-dark uppercase tracking-tighter">
							Acompanhamento Contábil
						</div>
					</div>

					{/* View tabs */}
					<div className="flex gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
						{[
							{ id: "estrategica", label: "Visão Estratégica", icon: Landmark },
							{ id: "tatica", label: "Visão Tática", icon: Target },
							{ id: "operacional", label: "Visão Operacional", icon: FileSpreadsheet },
						].map(({ id, label, icon: Icon }) => (
							<button
								type="button"
								key={id}
								onClick={() => setActiveView(id as typeof activeView)}
								className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
									activeView === id ? "bg-fab-blue text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
								}`}
							>
								<Icon className="w-4 h-4" />
								{label}
							</button>
						))}
					</div>

					{/* Executive Summary */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<div className="bg-white p-6 rounded-2xl shadow-lg border-b-4 border-b-fab-blue flex flex-col justify-between relative overflow-hidden group">
							<div className="absolute top-0 right-0 w-24 h-24 bg-fab-blue/5 rounded-bl-full -mr-4 -mt-4 transition-all group-hover:bg-fab-blue/10" />
							<div className="flex items-center gap-3 mb-4">
								<div className="p-2.5 bg-fab-blue/10 text-fab-blue rounded-lg">
									<Building2 className="w-5 h-5" />
								</div>
								<h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Unidades Gestoras</h3>
							</div>
							<div className="flex items-baseline gap-2">
								<p className="text-4xl font-black text-fab-blue">{totalUGs}</p>
								<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inconsistentes</p>
							</div>
						</div>

						<div className="bg-white p-6 rounded-2xl shadow-lg border-b-4 border-b-fab-gold flex flex-col justify-between relative overflow-hidden group">
							<div className="absolute top-0 right-0 w-24 h-24 bg-fab-gold/5 rounded-bl-full -mr-4 -mt-4 transition-all group-hover:bg-fab-gold/10" />
							<div className="flex items-center gap-3 mb-4">
								<div className="p-2.5 bg-fab-gold/10 text-fab-dark rounded-lg">
									<Wallet className="w-5 h-5" />
								</div>
								<h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contas Genéricas</h3>
							</div>
							<div className="flex items-baseline gap-2">
								<p className="text-4xl font-black text-fab-dark">{totalContas}</p>
								<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Auditadas</p>
							</div>
						</div>

						<div className="bg-white p-6 rounded-2xl shadow-lg border-b-4 border-b-emerald-600 flex flex-col justify-between relative overflow-hidden group">
							<div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-all group-hover:bg-emerald-100" />
							<div className="flex items-center gap-3 mb-4">
								<div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-lg">
									<DollarSign className="w-5 h-5" />
								</div>
								<h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Volume Financeiro</h3>
							</div>
							<p className="text-3xl font-black text-emerald-700">{formatCurrency(totalSaldoGeral)}</p>
						</div>
					</div>

					{/* RAC methodological context */}
					<div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
						<div className="flex items-center gap-3 mb-5">
							<div className="p-2 bg-fab-blue/10 rounded-lg">
								<BookOpen className="w-5 h-5 text-fab-blue" />
							</div>
							<h3 className="text-sm font-black text-fab-dark uppercase tracking-widest">Referencial Metodológico - RAC</h3>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							<div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
								<h4 className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-2">
									<Target className="w-4 h-4 text-fab-blue" /> Objetivo da Análise
								</h4>
								<p className="text-[13px] text-slate-600 leading-relaxed font-medium">
									Identificar a utilização indevida de contas contábeis genéricas (terminadas em "99"), garantindo que o registro detalhe adequadamente a
									natureza do fato contábil.
								</p>
							</div>
							<div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100/50">
								<h4 className="text-xs font-bold text-amber-800 uppercase mb-3 flex items-center gap-2">
									<AlertTriangle className="w-4 h-4 text-amber-500" /> Risco Contábil
								</h4>
								<p className="text-[13px] text-amber-700/80 leading-relaxed font-medium">
									A falta de detalhamento omite informações relevantes, distorce a situação patrimonial do COMAER e prejudica a transparência e a tomada de
									decisão.
								</p>
							</div>
							<div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/50">
								<h4 className="text-xs font-bold text-emerald-800 uppercase mb-3 flex items-center gap-2">
									<ShieldCheck className="w-4 h-4 text-emerald-600" /> Importância
								</h4>
								<p className="text-[13px] text-emerald-700/80 leading-relaxed font-medium">
									Assegurar que as demonstrações contábeis representem de forma fidedigna os fatos administrativos, orientando a regularização e preservando a
									qualidade da informação.
								</p>
							</div>
						</div>
					</div>

					{/* RISK PANEL (estratégica + tática) */}
					{foundAny && (activeView === "estrategica" || activeView === "tatica") && (
						<div className="bg-slate-50 p-8 rounded-3xl shadow-inner border border-slate-200">
							<div className="flex items-center gap-4 mb-8 border-b-2 border-slate-200 pb-4">
								<div className="w-12 h-12 bg-fab-dark rounded-xl flex items-center justify-center shadow-lg border border-fab-gold/50">
									<Landmark className="w-7 h-7 text-fab-gold" />
								</div>
								<div>
									<h2 className="text-2xl font-black text-fab-blue uppercase tracking-tighter">Painel de Risco Contábil do COMAER</h2>
									<p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Análise Estratégica e Tática - SUCONT / DIREF</p>
								</div>
							</div>

							{/* Indicator grid */}
							<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
								{[
									{ label: "Total de Inconsistências", value: totalInconsistencias, color: "fab-blue", type: "number" },
									{ label: "Volume Financeiro em Risco", value: formatCurrency(totalSaldoGeral), color: "amber-500", type: "currency" },
									{ label: "UGs com Inconsistências", value: totalUGs, color: "emerald-500", type: "number" },
									{ label: "Média de Inconsistências / UG", value: (totalInconsistencias / (totalUGs || 1)).toFixed(1), color: "purple-500", type: "number" },
								].map(({ label, value, color, type }) => (
									<div key={label} className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-${color}`}>
										<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
										<p className={`${type === "currency" ? "text-xl mt-2" : "text-3xl"} font-black text-${color}`}>{value}</p>
									</div>
								))}
							</div>

							{/* Estratégica view */}
							{activeView === "estrategica" && (
								<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
									<div className="bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-fab-gold">
										<div className="flex items-center gap-2 mb-6">
											<TrendingUp className="w-5 h-5 text-fab-gold" />
											<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Visão Estratégica (DIREF)</h3>
										</div>
										<div className="space-y-6">
											<div>
												<h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
													<Landmark className="w-4 h-4" /> Distribuição por ODS (Risco Contábil)
												</h4>
												<div className="space-y-3">
													{topOdsByCount.map((ods, idx) => {
														const pct = ((ods.count / totalInconsistencias) * 100).toFixed(1)
														return (
															<div key={idx} className="flex flex-col gap-1">
																<div className="flex justify-between items-center text-sm">
																	<span className="font-bold text-fab-dark">{ods.ods}</span>
																	<span className="font-black text-fab-blue">
																		{pct}% <span className="text-xs text-slate-400 font-normal">({ods.count})</span>
																	</span>
																</div>
																<div className="w-full bg-slate-100 rounded-full h-2">
																	<div className="bg-fab-blue h-2 rounded-full" style={{ width: `${pct}%` }} />
																</div>
															</div>
														)
													})}
												</div>
											</div>
											<div>
												<h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
													<Building2 className="w-4 h-4" /> Concentração por Órgão Superior
												</h4>
												<div className="space-y-3">
													{topOsByCount.slice(0, 5).map((os, idx) => {
														const pct = ((os.count / totalInconsistencias) * 100).toFixed(1)
														return (
															<div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
																<span className="text-sm font-bold text-fab-dark">{os.os}</span>
																<span className="text-sm font-black text-slate-700">{pct}%</span>
															</div>
														)
													})}
												</div>
											</div>
										</div>
									</div>

									{/* Decision support */}
									<div className="space-y-6">
										<div className="bg-emerald-600 p-6 rounded-2xl shadow-xl border-b-4 border-emerald-800 flex flex-col justify-center text-white">
											<div className="flex items-center gap-3 mb-4">
												<DollarSign className="w-8 h-8 text-emerald-200" />
												<h3 className="text-lg font-black uppercase tracking-tight">Impacto Financeiro Total</h3>
											</div>
											<p className="text-4xl font-black mb-2">{formatCurrency(totalFinancialImpact)}</p>
											<p className="text-xs font-bold text-emerald-100 uppercase tracking-widest">Volume total em risco contábil</p>
										</div>

										<div className="bg-fab-dark p-6 rounded-2xl shadow-xl border-t-4 border-t-fab-gold">
											<div className="flex items-center gap-2 mb-6">
												<AlertOctagon className="w-5 h-5 text-fab-gold" />
												<h3 className="text-lg font-black text-white uppercase tracking-tight">Níveis Críticos</h3>
											</div>
											<div className="space-y-4">
												{[
													{ label: "ODS com Maior Risco", value: criticalSummary?.ods },
													{ label: "Órgão Superior Crítico", value: criticalSummary?.os },
													{
														label: "UG Maior Concentração",
														value: `UG ${criticalSummary?.ugCount} (${getUgName(criticalSummary?.ugCount || "")})`,
													},
													{
														label: "UG Maior Saldo Irregular",
														value: `UG ${criticalSummary?.ugVolume} (${getUgName(criticalSummary?.ugVolume || "")})`,
													},
												].map(({ label, value }) => (
													<div key={label} className="bg-white/5 p-4 rounded-xl border border-white/10">
														<p className="text-[9px] font-black text-fab-gold uppercase tracking-widest mb-1">{label}</p>
														<p className="text-lg font-black text-white">{value}</p>
													</div>
												))}
											</div>
										</div>
									</div>
								</div>
							)}

							{/* Tática view */}
							{activeView === "tatica" && (
								<div className="space-y-8">
									<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
										<div className="bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-fab-blue">
											<div className="flex items-center gap-2 mb-6">
												<Target className="w-5 h-5 text-fab-blue" />
												<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Visão Tática (SUCONT-3)</h3>
											</div>
											<div className="space-y-6">
												<div>
													<h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
														<AlertTriangle className="w-4 h-4" /> Top UGs com Mais Inconsistências
													</h4>
													<div className="space-y-2">
														{topUgsByCount.slice(0, 5).map((ug, idx) => (
															<div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
																<div className="flex items-center gap-2">
																	<span className="text-xs font-black text-slate-400 w-4">{idx + 1}º</span>
																	<div>
																		<span className="text-sm font-bold text-fab-dark block">
																			{getUgName(ug.ug)} ({ug.ug})
																		</span>
																		<span className="text-[10px] font-bold text-slate-500 uppercase">
																			{getOs(ug.ug)} / {getOds(ug.ug)}
																		</span>
																	</div>
																</div>
																<div className="flex items-center gap-3">
																	<span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{getConferente(ug.ug)}</span>
																	<span className="text-sm font-black text-amber-600">{ug.count}</span>
																</div>
															</div>
														))}
													</div>
												</div>
												<div>
													<h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
														<Wallet className="w-4 h-4" /> Contas Genéricas Mais Recorrentes
													</h4>
													<div className="space-y-2">
														{topContasByFreq.slice(0, 5).map((conta, idx) => (
															<div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
																<span className="text-sm font-bold text-fab-dark">{conta.conta}</span>
																<span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-1 rounded-full">{conta.count} ocorrências</span>
															</div>
														))}
													</div>
												</div>
											</div>
										</div>

										{/* Pareto + Priority */}
										<div className="space-y-6">
											<div className="bg-white p-6 rounded-2xl shadow-md border-l-8 border-l-purple-600">
												<div className="flex items-center gap-2 mb-4">
													<TrendingUp className="w-5 h-5 text-purple-600" />
													<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Análise de Concentração (Pareto)</h3>
												</div>
												<div className="bg-purple-50 p-4 rounded-xl border border-purple-100 mb-4">
													<p className="text-sm text-purple-900 font-bold leading-relaxed">
														<span className="text-2xl font-black text-purple-600">{paretoData?.ugPercentage}%</span> das UGs concentram{" "}
														<span className="text-2xl font-black text-purple-600">{paretoData?.inconsistencyPercentage}%</span> das inconsistências.
													</p>
												</div>
												<h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">UGs que compõem a concentração (Top 5)</h4>
												<div className="space-y-2">
													{paretoData?.topUgs.slice(0, 5).map((u, i) => (
														<div key={i} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded-lg">
															<span className="font-bold text-slate-700">
																UG {u.ug} ({getUgName(u.ug)})
															</span>
															<span className="font-black text-purple-600">{u.count} itens</span>
														</div>
													))}
												</div>
											</div>

											<div className="bg-white p-6 rounded-2xl shadow-md border-l-8 border-l-emerald-600">
												<div className="flex items-center gap-2 mb-4">
													<Target className="w-5 h-5 text-emerald-600" />
													<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Priorização de Atuação Imediata</h3>
												</div>
												<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Baseado em Score de Risco (Volume x Quantidade)</p>
												<div className="space-y-3">
													{priorityList.map((p, i) => (
														<div
															key={i}
															className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-emerald-50 transition-colors"
														>
															<div className="w-8 h-8 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-black text-sm">{i + 1}º</div>
															<div className="flex-1">
																<p className="text-sm font-black text-fab-dark">
																	UG {p.ug} ({getUgName(p.ug)})
																</p>
																<p className="text-[10px] font-bold text-slate-500 uppercase">
																	{p.ods} | {formatCurrency(p.volume)}
																</p>
															</div>
															<div className="text-right">
																<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Score</p>
																<p className="text-lg font-black text-emerald-600">{p.priorityScore}</p>
															</div>
														</div>
													))}
												</div>
											</div>
										</div>
									</div>

									{/* Conferente distribution */}
									<div className="bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-emerald-600">
										<div className="flex items-center gap-2 mb-6">
											<Award className="w-5 h-5 text-emerald-600" />
											<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Panorama de Distribuição SUCONT-3</h3>
										</div>
										<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
											{Object.entries(conferenteStats)
												.sort((a, b) => b[1].count - a[1].count)
												.map(([conf, stats]) => (
													<button
														type="button"
														key={conf}
														className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center hover:bg-emerald-50 transition-colors cursor-pointer"
														onClick={() => setConferenteFilter(conf)}
													>
														<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{conf}</p>
														<p className="text-2xl font-black text-emerald-700">{stats.count}</p>
														<p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Inconsistências</p>
													</button>
												))}
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
											{Object.entries(conferenteStats)
												.sort((a, b) => b[1].count - a[1].count)
												.map(([conferente, stats]) => (
													<div key={conferente} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden flex flex-col">
														<div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
															<span className="text-xs font-black text-fab-dark uppercase tracking-widest">Conferente: {conferente}</span>
															<span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full">
																{stats.count} Inconsistência(s)
															</span>
														</div>
														<div className="p-4 flex-1">
															<h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">UGs sob responsabilidade ({stats.ugs.length})</h4>
															<div className="flex flex-wrap gap-2">
																{stats.ugs.map((ug) => (
																	<span key={ug} className="px-2 py-1 bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded shadow-sm">
																		UG {ug}
																	</span>
																))}
															</div>
														</div>
													</div>
												))}
										</div>
									</div>

									{/* RAC panorama */}
									<div className="bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-fab-blue">
										<div className="flex items-center gap-2 mb-6">
											<Target className="w-5 h-5 text-fab-blue" />
											<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Panorama por Questão RAC</h3>
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
											{RAC_QUESTIONS.map((q) => (
												<div key={q.id} className="bg-slate-50 p-5 rounded-xl border border-slate-200 hover:bg-fab-blue/5 transition-colors">
													<div className="flex justify-between items-start mb-3">
														<span className="px-2 py-1 bg-fab-blue text-white text-[10px] font-black rounded uppercase tracking-widest">RAC {q.id}</span>
														<span className="text-xs font-black text-fab-blue">{racStatsMap[q.id].ugs.size} UGs</span>
													</div>
													<p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-4 h-8 line-clamp-2">{q.description}</p>
													<div className="flex items-end justify-between">
														<div>
															<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Volume</p>
															<p className="text-sm font-black text-fab-blue">{formatCurrency(racStatsMap[q.id].volume)}</p>
														</div>
														<div className="text-right">
															<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Itens</p>
															<p className="text-sm font-black text-slate-700">{racStatsMap[q.id].count}</p>
														</div>
													</div>
												</div>
											))}
										</div>
									</div>
								</div>
							)}

							{/* ODS Risk Map (both views) */}
							<div className="mt-8 bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-fab-blue">
								<div className="flex items-center justify-between mb-6">
									<div className="flex items-center gap-2">
										<Compass className="w-5 h-5 text-fab-blue" />
										<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Mapa de Risco por ODS</h3>
									</div>
									<span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Distribuição do Risco</span>
								</div>
								<div className="overflow-x-auto">
									<table className="w-full text-left">
										<thead>
											<tr className="border-b border-slate-100">
												{["ODS", "Inconsistências", "Saldo Associado", "% Total"].map((h) => (
													<th
														key={h}
														className={`pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest ${h !== "ODS" ? "text-center" : ""} ${h === "Saldo Associado" || h === "% Total" ? "text-right" : ""}`}
													>
														{h}
													</th>
												))}
											</tr>
										</thead>
										<tbody className="divide-y divide-slate-50">
											{odsRiskMap.map((item, idx) => (
												<tr key={idx} className="hover:bg-slate-50 transition-colors">
													<td className="py-4 font-bold text-fab-dark">{item.ods}</td>
													<td className="py-4 text-center font-black text-slate-600">{item.count}</td>
													<td className="py-4 text-right font-black text-emerald-700">{formatCurrency(item.volume)}</td>
													<td className="py-4 text-right">
														<span
															className={`px-2 py-1 rounded text-[10px] font-black ${idx === 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}
														>
															{item.percentage}%
														</span>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>

							{/* Oracle Chat */}
							<div className="mt-8 bg-white rounded-3xl shadow-2xl border-2 border-fab-blue/20 overflow-hidden">
								<div className="bg-fab-blue p-6 flex items-center justify-between">
									<div className="flex items-center gap-4">
										<div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20">
											<Lightbulb className="w-7 h-7 text-fab-gold" />
										</div>
										<div>
											<h3 className="text-xl font-black text-white uppercase tracking-tighter">Oráculo SUCONT</h3>
											<p className="text-[10px] font-black text-fab-gold uppercase tracking-[0.2em]">Inteligência Artificial de Apoio à Decisão</p>
										</div>
									</div>
									<div className="hidden md:flex gap-2">
										{["Qual ODS possui maior risco contábil?", "Quais são as 5 UGs mais críticas?", "Resuma o impacto financeiro total."].map((q) => (
											<button
												type="button"
												key={q}
												onClick={() => askOracle(q)}
												className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[9px] font-black rounded-lg uppercase tracking-widest transition-all border border-white/10"
											>
												{q.includes("ODS") ? "Risco ODS" : q.includes("5 UGs") ? "Top 5 UGs" : "Impacto"}
											</button>
										))}
										<button
											type="button"
											onClick={() => setChatMessages([])}
											className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-white text-[9px] font-black rounded-lg uppercase tracking-widest transition-all border border-white/10"
										>
											Limpar
										</button>
									</div>
								</div>

								<div className="h-[400px] overflow-y-auto p-6 bg-slate-50 space-y-4">
									{chatMessages.length === 0 ? (
										<div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
											<MessageSquare className="w-16 h-16 text-fab-blue" />
											<p className="text-sm font-bold text-slate-500 max-w-xs">
												Olá! Eu sou o Oráculo SUCONT. Analisei os dados do relatório e estou pronto para responder suas perguntas estratégicas.
											</p>
										</div>
									) : (
										chatMessages.map((msg, i) => (
											<div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
												<div
													className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${
														msg.role === "user" ? "bg-fab-blue text-white rounded-tr-none" : "bg-white text-slate-700 border border-slate-200 rounded-tl-none"
													}`}
												>
													<p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
												</div>
											</div>
										))
									)}
									{isAskingOracle && (
										<div className="flex justify-start">
											<div className="bg-white p-4 rounded-2xl border border-slate-200 rounded-tl-none flex items-center gap-2">
												<div className="flex gap-1">
													{[0, 0.2, 0.4].map((delay) => (
														<div key={delay} className="w-1.5 h-1.5 bg-fab-blue rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
													))}
												</div>
												<span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Oráculo está analisando...</span>
											</div>
										</div>
									)}
								</div>

								<div className="p-4 bg-white border-t border-slate-100">
									<div className="flex gap-2">
										<input
											type="text"
											value={oracleInput}
											onChange={(e) => setOracleInput(e.target.value)}
											onKeyDown={(e) => e.key === "Enter" && askOracle()}
											placeholder="Pergunte ao Oráculo sobre o risco contábil..."
											className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-fab-blue transition-all outline-none"
										/>
										<button
											type="button"
											onClick={() => askOracle()}
											disabled={isAskingOracle || !oracleInput.trim()}
											className="bg-fab-blue hover:bg-fab-dark disabled:opacity-50 text-white p-3 rounded-xl transition-all shadow-lg"
										>
											<ArrowRight className="w-5 h-5" />
										</button>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* OPERACIONAL + no found */}
					{!foundAny ? (
						<div className="bg-emerald-50 border-l-4 border-l-emerald-500 rounded-2xl p-8 text-center shadow-lg">
							<div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-sm">
								<CheckCircle className="w-10 h-10" />
							</div>
							<h3 className="text-2xl font-black text-emerald-800 mb-2 uppercase tracking-tight">Acompanhamento Concluído</h3>
							<p className="text-emerald-700 max-w-md mx-auto font-medium">
								Nenhuma inconsistência foi identificada no relatório analisado. A situação contábil está regular.
							</p>
						</div>
					) : (
						activeView === "operacional" && (
							<div className="space-y-10">
								<div className="flex items-center gap-4 border-b-2 border-slate-200 pb-4">
									<div className="w-12 h-12 bg-fab-dark rounded-xl flex items-center justify-center shadow-lg border border-fab-gold/50">
										<Compass className="w-7 h-7 text-fab-gold" />
									</div>
									<div>
										<h2 className="text-2xl font-black text-fab-blue uppercase tracking-tighter">Retrato das Inconsistências</h2>
										<p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ações de Cobrança e Auditoria SUCONT-3</p>
									</div>
								</div>

								{/* Filters */}
								<div className="space-y-4">
									<div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
										<div className="flex items-center gap-2 text-slate-500 mr-2">
											<MessageSquare className="w-4 h-4" />
											<span className="text-[10px] font-black uppercase tracking-widest">Modo de Mensagem:</span>
										</div>
										<div className="flex bg-slate-100 p-1 rounded-xl">
											{[
												{ id: "individual", label: "Mensagens Individuais" },
												{ id: "unica", label: "Mensagem Única (Agrupada)" },
											].map(({ id, label }) => (
												<button
													type="button"
													key={id}
													onClick={() => setMessageMode(id as typeof messageMode)}
													className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
														messageMode === id ? "bg-white text-fab-blue shadow-sm" : "text-slate-500 hover:text-slate-700"
													}`}
												>
													{label}
												</button>
											))}
										</div>
									</div>

									<div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
										<div className="flex items-center gap-2 text-slate-500 mr-2">
											<Award className="w-4 h-4" />
											<span className="text-[10px] font-black uppercase tracking-widest">Filtrar por Responsável:</span>
										</div>
										<div className="flex flex-wrap gap-2">
											<button
												type="button"
												onClick={() => setConferenteFilter(null)}
												className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
													!conferenteFilter
														? "bg-fab-blue text-white border-fab-blue shadow-md"
														: "bg-white text-slate-500 border-slate-200 hover:border-fab-blue/50"
												}`}
											>
												Modo Geral
											</button>
											{[...new Set(Object.values(CONFERENTES_MAP))].sort().map((conf) => (
												<button
													type="button"
													key={conf}
													onClick={() => setConferenteFilter(conf)}
													className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
														conferenteFilter === conf
															? "bg-emerald-600 text-white border-emerald-600 shadow-md"
															: "bg-white text-slate-500 border-slate-200 hover:border-emerald-600/50"
													}`}
												>
													{conf}
												</button>
											))}
										</div>
									</div>
								</div>

								{conferenteFilter && (
									<div className="flex justify-end">
										<button
											type="button"
											onClick={() => setConferenteFilter(null)}
											className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-200"
										>
											<RefreshCw className="w-3 h-3" /> Limpar Filtro
										</button>
									</div>
								)}

								{/* Única message */}
								{messageMode === "unica" ? (
									<div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col lg:flex-row diref-card">
										<div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/30 flex flex-col">
											<div className="p-6 border-b border-slate-200 bg-white">
												<div className="flex items-center gap-3 mb-4">
													<div className="w-10 h-10 bg-fab-blue/10 rounded-lg flex items-center justify-center">
														<MessageSquare className="w-6 h-6 text-fab-blue" />
													</div>
													<div>
														<h3 className="text-xl font-black text-fab-blue uppercase tracking-tighter">Mensagem Única</h3>
														<div className="text-xs font-bold text-slate-600 uppercase">Agrupamento Geral</div>
													</div>
												</div>
												<p className="text-sm text-slate-600 mb-4">Consolida as inconsistências de todas as UGs filtradas. Ideal para envio coletivo.</p>
											</div>
											<div className="p-6 flex-1 bg-slate-50">
												<MessageControls
													msgNumber={msgNumber}
													setMsgNumber={setMsgNumber}
													msgDate={msgDate}
													setMsgDate={setMsgDate}
													messageType={messageType}
													setMessageType={setMessageType}
													deadline={deadline}
													setDeadline={setDeadline}
												/>
											</div>
										</div>
										<div className="p-6 flex-1 bg-slate-50/30">
											<div className="bg-white border border-slate-200 rounded-xl p-6 shadow-inner h-full font-mono text-sm text-slate-700 leading-relaxed whitespace-pre-wrap relative">
												{generateSingleMessage()}
												<button
													type="button"
													onClick={() => {
														copyToClipboard(generateSingleMessage(), "unica")
													}}
													className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-fab-blue hover:text-white text-slate-500 rounded-lg transition-all shadow-sm"
													title="Copiar Mensagem"
												>
													{copiedUg === "unica" ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
												</button>
											</div>
										</div>
									</div>
								) : (
									/* Individual messages */
									Object.keys(result)
										.filter((ug) => !conferenteFilter || getConferente(ug) === conferenteFilter)
										.sort()
										.map((ug) => {
											const contas = result[ug]
											const message = generateMessage(ug, contas)
											let ugTotalBalance = 0
											for (const regs of Object.values(contas)) {
												for (const reg of regs) ugTotalBalance += reg.saldo
											}

											return (
												<div key={ug} className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col lg:flex-row diref-card">
													{/* Left: data portrait */}
													<div className="lg:w-5/12 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/30 flex flex-col">
														<div className="p-6 border-b border-slate-200 bg-white">
															<div className="flex items-center justify-between mb-2">
																<div className="flex items-center gap-3">
																	<div className="w-10 h-10 bg-fab-blue/10 rounded-lg flex items-center justify-center">
																		<Building2 className="w-6 h-6 text-fab-blue" />
																	</div>
																	<div>
																		<h3 className="text-xl font-black text-fab-blue uppercase tracking-tighter">UG {ug}</h3>
																		<div className="text-xs font-bold text-slate-600 uppercase mb-1">
																			{getUgName(ug)} ({ug}), subordinada ao {getOs(ug)} / {getOds(ug)}
																		</div>
																		<div className="military-label">Conferente: {getConferente(ug)}</div>
																	</div>
																</div>
																<span className="px-3 py-1 bg-fab-dark text-fab-gold text-[10px] font-black rounded uppercase tracking-widest">
																	{Object.keys(contas).length} Alerta(s)
																</span>
															</div>
															<div className="mt-4 p-3 bg-fab-blue/5 rounded-xl border border-fab-blue/10">
																<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Consolidado</p>
																<p className="text-2xl font-black text-fab-blue">{formatCurrency(ugTotalBalance)}</p>
															</div>
														</div>
														<div className="p-6 flex-1 overflow-y-auto">
															<h4 className="military-label mb-4">Dossiê de Inconsistências</h4>
															<div className="space-y-4">
																{Object.entries(contas).map(([conta, regs]) => (
																	<div key={conta} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm relative overflow-hidden group">
																		<div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
																			<FileSpreadsheet className="w-12 h-12" />
																		</div>
																		<div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
																			<Wallet className="w-4 h-4 text-fab-blue" />
																			<span className="font-mono font-black text-fab-blue">{conta}</span>
																		</div>
																		<div className="space-y-2">
																			{regs.map((reg, idx) => (
																				<div key={idx} className="flex items-center justify-between text-sm">
																					<div className="flex items-center gap-1.5 text-slate-500 font-bold uppercase text-[10px]">
																						<Calendar className="w-3.5 h-3.5 text-fab-gold" />
																						<span>{reg.mes}</span>
																					</div>
																					<span className="font-black text-slate-700">{formatCurrency(reg.saldo)}</span>
																				</div>
																			))}
																		</div>
																	</div>
																))}
															</div>
														</div>
													</div>

													{/* Right: message action */}
													<div className="lg:w-7/12 flex flex-col bg-white">
														<div className="px-6 py-4 border-b border-slate-200 flex flex-col gap-4 bg-slate-50">
															<div className="flex items-center justify-between">
																<div className="flex flex-col gap-1">
																	<div className="flex items-center gap-2 text-fab-blue">
																		<FileText className="w-5 h-5" />
																		<h4 className="font-black uppercase tracking-tight text-sm">Mensagem Institucional Pronta</h4>
																	</div>
																	<p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
																		UG {ug} — Conferente: {getConferente(ug)}
																		<br />
																		<span className="text-amber-600">Inconsistência identificada: utilização de conta contábil genérica.</span>
																	</p>
																</div>
																<button
																	type="button"
																	onClick={() => copyToClipboard(message, ug)}
																	className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
																		copiedUg === ug ? "bg-emerald-600 text-white shadow-lg" : "bg-fab-blue text-white hover:bg-fab-dark shadow-lg"
																	}`}
																>
																	{copiedUg === ug ? (
																		<>
																			<Check className="w-4 h-4" /> Copiado
																		</>
																	) : (
																		<>
																			<Copy className="w-4 h-4" /> Copiar Mensagem
																		</>
																	)}
																</button>
															</div>

															<div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-200">
																<MessageControls
																	msgNumber={msgNumber}
																	setMsgNumber={setMsgNumber}
																	msgDate={msgDate}
																	setMsgDate={setMsgDate}
																	messageType={messageType}
																	setMessageType={setMessageType}
																	deadline={deadline}
																	setDeadline={setDeadline}
																/>
															</div>
														</div>
														<div className="p-6 flex-1 bg-slate-50/30">
															<div className="bg-white border border-slate-200 rounded-xl p-6 shadow-inner h-full font-mono text-sm text-slate-700 leading-relaxed whitespace-pre-wrap relative">
																<div className="absolute top-4 right-4 opacity-10 pointer-events-none">
																	<Shield className="w-12 h-12 text-fab-blue" />
																</div>
																{message}
															</div>
														</div>
													</div>
												</div>
											)
										})
								)}
							</div>
						)
					)}
				</div>
			)}
		</HubLayout>
	)
}

// ── Sub-component: shared message controls ───────────────────────────────────

function MessageControls({
	msgNumber,
	setMsgNumber,
	msgDate,
	setMsgDate,
	messageType,
	setMessageType,
	deadline,
	setDeadline,
}: {
	msgNumber: string
	setMsgNumber: (v: string) => void
	msgDate: string
	setMsgDate: (v: string) => void
	messageType: "prazo" | "sem_prazo" | "alerta"
	setMessageType: (v: "prazo" | "sem_prazo" | "alerta") => void
	deadline: string
	setDeadline: (v: string) => void
}) {
	const inputCls =
		"px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20 focus:border-fab-blue transition-all"

	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
				<span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Nº Mensagem:</span>
				<input type="text" value={msgNumber} onChange={(e) => setMsgNumber(e.target.value)} placeholder="Ex: 001" className={`${inputCls} w-16 text-center`} />
			</div>
			<div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
				<span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Data:</span>
				<input type="date" value={msgDate} onChange={(e) => setMsgDate(e.target.value)} className={inputCls} />
			</div>
			<div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
				<span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Tipo:</span>
				<select value={messageType} onChange={(e) => setMessageType(e.target.value as typeof messageType)} className={inputCls}>
					<option value="sem_prazo">Sem Prazo</option>
					<option value="prazo">Com Prazo</option>
					<option value="alerta">Apenas Alerta</option>
				</select>
			</div>
			{messageType === "prazo" && (
				<div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
					<span className="text-[10px] text-fab-blue font-black uppercase tracking-widest">Data Limite:</span>
					<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
				</div>
			)}
		</div>
	)
}
