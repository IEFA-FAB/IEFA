import {
	AlertCircle,
	AlertOctagon,
	AlertTriangle,
	ArrowRight,
	Award,
	BarChart3,
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

const getConferente = (ug: string) => {
	return CONFERENTES_MAP[ug] || "NÃO MAPEADO"
}

const RAC_QUESTIONS = [
	{ id: "35", title: "Questão RAC 35", description: "Utilização de conta genérica", classes: ["1", "2", "3", "4", "5", "6", "7", "8", "9"] },
]

const getRacInfo = (conta: string) => {
	const firstDigit = conta.charAt(0)
	return RAC_QUESTIONS.find((q) => q.classes.includes(firstDigit)) || { id: "XX", title: "Questão RAC XX", description: "Utilização de conta genérica" }
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

const getOds = (ug: string) => {
	return UG_INFO_MAP[ug]?.ods || "OUTROS"
}

const getOs = (ug: string) => {
	return UG_INFO_MAP[ug]?.os || "OUTROS"
}

const getUgName = (ug: string) => {
	return UG_INFO_MAP[ug]?.nome || "NÃO IDENTIFICADA"
}

export default function App() {
	const [file, setFile] = useState<File | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)
	const [result, setResult] = useState<GroupedData | null>(null)
	const [foundAny, setFoundAny] = useState<boolean>(false)
	const [copiedUg, setCopiedUg] = useState<string | null>(null)
	const [messageMode, setMessageMode] = useState<"individual" | "unica">("individual")
	const [deadline, setDeadline] = useState<string>("")
	const [messageType, setMessageType] = useState<"prazo" | "sem_prazo" | "alerta">("sem_prazo")
	const [msgNumber, setMsgNumber] = useState<string>("")
	const [msgDate, setMsgDate] = useState<string>(new Date().toISOString().split("T")[0])
	const [conferenteFilter, setConferenteFilter] = useState<string | null>(null)
	const [activeView, setActiveView] = useState<"operacional" | "tatica" | "estrategica">("estrategica")

	// Advanced Analysis States
	const [paretoData, setParetoData] = useState<{ ugPercentage: number; inconsistencyPercentage: number; topUgs: any[] } | null>(null)
	const [priorityList, setPriorityList] = useState<any[]>([])
	const [criticalSummary, setCriticalSummary] = useState<{ ods: string; os: string; ugCount: string; ugVolume: string } | null>(null)
	const [odsRiskMap, setOdsRiskMap] = useState<any[]>([])
	const [totalFinancialImpact, setTotalFinancialImpact] = useState<number>(0)

	// Oracle Chat States
	const [chatMessages, setChatMessages] = useState<{ role: "user" | "model"; text: string }[]>([])
	const [isAskingOracle, setIsAskingOracle] = useState(false)
	const [oracleInput, setOracleInput] = useState("")

	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFile = e.target.files?.[0]
		if (selectedFile) {
			setFile(selectedFile)
			processFile(selectedFile)
		}
	}

	const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		e.stopPropagation()
	}

	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		e.stopPropagation()
		const droppedFile = e.dataTransfer.files?.[0]
		if (droppedFile && (droppedFile.name.endsWith(".xlsx") || droppedFile.name.endsWith(".xls"))) {
			setFile(droppedFile)
			processFile(droppedFile)
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
		if (fileInputRef.current) {
			fileInputRef.current.value = ""
		}
	}

	const processFile = (file: File) => {
		setIsProcessing(true)
		setError(null)
		setResult(null)
		setFoundAny(false)

		const reader = new FileReader()
		reader.onload = (evt) => {
			try {
				const ab = evt.target?.result
				const wb = XLSX.read(ab, { type: "array" })
				const wsname = wb.SheetNames[0]
				const ws = wb.Sheets[wsname]
				const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

				processData(data as any[][])
			} catch (_err) {
				setError("Erro ao processar o arquivo. Certifique-se de que é um arquivo Excel válido (.xlsx).")
				setIsProcessing(false)
			}
		}
		reader.onerror = () => {
			setError("Erro ao ler o arquivo.")
			setIsProcessing(false)
		}
		reader.readAsArrayBuffer(file)
	}

	const processData = (data: any[][]) => {
		let headerRowIndex = -1
		let colIndices = { ug: -1, conta: -1, mes: -1, saldo: -1 }

		// 1. Find header row
		for (let i = 0; i < data.length; i++) {
			const row = data[i]
			if (!Array.isArray(row)) continue

			const normalizedRow = row.map((cell) =>
				String(cell || "")
					.trim()
					.toLowerCase()
			)

			const ugIdx = normalizedRow.indexOf("ug")
			const contaIdx = normalizedRow.findIndex((c) => c === "conta contábil" || c === "conta contabil")
			const mesIdx = normalizedRow.findIndex((c) => c === "mês" || c === "mes" || c === "conta corrente")
			const saldoIdx = normalizedRow.findIndex((c) => c === "saldo - r$" || c === "saldo - r $" || c === "saldo" || c === "valor alongado")

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

		// 2. Process rows
		const grouped: GroupedData = {}
		let hasGenericAccounts = false

		for (let i = headerRowIndex + 1; i < data.length; i++) {
			const row = data[i]
			if (!Array.isArray(row) || row.length === 0) continue

			const rawUg = row[colIndices.ug]
			const rawConta = row[colIndices.conta]
			const rawMes = row[colIndices.mes]
			const rawSaldo = row[colIndices.saldo]

			if (rawUg === undefined || rawConta === undefined || rawMes === undefined || rawSaldo === undefined) continue
			if (rawUg === "" || rawConta === "") continue

			const ug = String(rawUg).trim()
			const conta = String(rawConta).replace(/\s+/g, "").replace(/\./g, "")
			const mes = String(rawMes).trim()

			let saldo = 0
			if (typeof rawSaldo === "number") {
				saldo = rawSaldo
			} else {
				const saldoStr = String(rawSaldo).replace(/\./g, "").replace(",", ".")
				saldo = parseFloat(saldoStr)
			}

			if (Number.isNaN(saldo) || saldo === 0) continue

			if (conta.length > 0) {
				hasGenericAccounts = true
				if (!grouped[ug]) grouped[ug] = {}
				if (!grouped[ug][conta]) grouped[ug][conta] = []
				grouped[ug][conta].push({ mes, saldo })
			}
		}

		setResult(grouped)
		setFoundAny(hasGenericAccounts)

		if (hasGenericAccounts) {
			performAdvancedAnalysis(grouped)
		}

		setIsProcessing(false)
	}

	const performAdvancedAnalysis = (grouped: GroupedData) => {
		const ugStats: any[] = []
		const odsStats: Record<string, { count: number; volume: number }> = {}
		const osStats: Record<string, { count: number; volume: number }> = {}
		let totalInconsistencies = 0
		let totalVolume = 0

		Object.entries(grouped).forEach(([ug, contas]) => {
			let ugCount = 0
			let ugVolume = 0
			const ods = getOds(ug)
			const os = getOs(ug)

			Object.values(contas).forEach((registros) => {
				registros.forEach((reg) => {
					ugCount++
					ugVolume += reg.saldo
				})
			})

			totalInconsistencies += ugCount
			totalVolume += ugVolume

			ugStats.push({ ug, count: ugCount, volume: ugVolume, ods, os })

			if (!odsStats[ods]) odsStats[ods] = { count: 0, volume: 0 }
			odsStats[ods].count += ugCount
			odsStats[ods].volume += ugVolume

			if (!osStats[os]) osStats[os] = { count: 0, volume: 0 }
			osStats[os].count += ugCount
			osStats[os].volume += ugVolume
		})

		// 1. Pareto Analysis
		const sortedByCount = [...ugStats].sort((a, b) => b.count - a.count)
		let runningCount = 0
		let paretoIndex = -1
		for (let i = 0; i < sortedByCount.length; i++) {
			runningCount += sortedByCount[i].count
			if (runningCount >= totalInconsistencies * 0.8 && paretoIndex === -1) {
				paretoIndex = i
			}
		}

		const ugPercentage = Math.round(((paretoIndex + 1) / ugStats.length) * 100)
		const _inconsistencyPercentage = Math.round((runningCount / totalInconsistencies) * 100)

		setParetoData({
			ugPercentage,
			inconsistencyPercentage: Math.round((sortedByCount.slice(0, paretoIndex + 1).reduce((acc, curr) => acc + curr.count, 0) / totalInconsistencies) * 100),
			topUgs: sortedByCount.slice(0, Math.max(3, paretoIndex + 1)).slice(0, 10),
		})

		// 2. Risk Map (ODS)
		const riskMap = Object.entries(odsStats)
			.map(([ods, data]) => ({
				ods,
				count: data.count,
				volume: data.volume,
				percentage: Math.round((data.count / totalInconsistencies) * 100),
			}))
			.sort((a, b) => b.count - a.count)
		setOdsRiskMap(riskMap)

		// 3. Critical Levels
		const criticalOds = riskMap[0]?.ods || "N/A"
		const criticalOs = Object.entries(osStats).sort((a, b) => b[1].count - a[1].count)[0]?.[0] || "N/A"
		const criticalUgCount = sortedByCount[0]?.ug || "N/A"
		const criticalUgVolume = [...ugStats].sort((a, b) => b.volume - a.volume)[0]?.ug || "N/A"

		setCriticalSummary({
			ods: criticalOds,
			os: criticalOs,
			ugCount: criticalUgCount,
			ugVolume: criticalUgVolume,
		})

		// 4. Prioritization (Score based on count and volume)
		const maxCount = Math.max(...ugStats.map((u) => u.count))
		const maxVolume = Math.max(...ugStats.map((u) => u.volume))

		const prioritized = ugStats
			.map((u) => {
				const countScore = (u.count / maxCount) * 50
				const volumeScore = (u.volume / maxVolume) * 50
				return { ...u, priorityScore: Math.round(countScore + volumeScore) }
			})
			.sort((a, b) => b.priorityScore - a.priorityScore)
			.slice(0, 5)

		setPriorityList(prioritized)
		setTotalFinancialImpact(totalVolume)
	}

	const askOracle = async (question?: string) => {
		const query = question || oracleInput
		if (!query.trim()) return

		const newUserMessage = { role: "user" as const, text: query }
		setChatMessages((prev) => [...prev, newUserMessage])
		setOracleInput("")
		setIsAskingOracle(true)

		try {
			const { GoogleGenAI } = await import("@google/genai")
			const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

			const context = `
        Você é o Oráculo SUCONT, assistente de análise contábil do COMAER.
        Dados da análise atual:
        - Impacto Financeiro Total em Risco: ${formatCurrency(totalFinancialImpact)}
        - Total de inconsistências: ${odsRiskMap.reduce((acc, curr) => acc + curr.count, 0)}
        - ODS mais crítico: ${criticalSummary?.ods}
        - Órgão Superior mais crítico: ${criticalSummary?.os}
        - UG com mais inconsistências: ${criticalSummary?.ugCount} (${getUgName(criticalSummary?.ugCount || "")})
        - UG com maior volume irregular: ${criticalSummary?.ugVolume} (${getUgName(criticalSummary?.ugVolume || "")})
        - Análise de Pareto: ${paretoData?.ugPercentage}% das UGs concentram ${paretoData?.inconsistencyPercentage}% das inconsistências.
        
        Mapa de Risco por ODS:
        ${odsRiskMap.map((o) => `- ${o.ods}: ${o.count} inconsistências (${o.percentage}%), Volume: R$ ${o.volume.toLocaleString("pt-BR")}`).join("\n")}
        
        Prioridades de Atuação:
        ${priorityList.map((p, i) => `${i + 1}º: UG ${p.ug} (${getUgName(p.ug)}) - Score: ${p.priorityScore}`).join("\n")}
      `

			const response = await ai.models.generateContent({
				model: "gemini-3-flash-preview",
				contents: query,
				config: {
					systemInstruction:
						context +
						"\nResponda de forma técnica, militar e objetiva. Use negrito para destacar pontos críticos. Se o usuário perguntar sobre o impacto financeiro, cite o valor total de " +
						formatCurrency(totalFinancialImpact) +
						".",
				},
			})

			const modelText = response.text || "Desculpe, não consegui processar sua pergunta."
			setChatMessages((prev) => [...prev, { role: "model", text: modelText }])
		} catch (_err) {
			setChatMessages((prev) => [...prev, { role: "model", text: "Erro ao conectar com o Oráculo. Verifique sua conexão." }])
		} finally {
			setIsAskingOracle(false)
		}
	}

	const generateSingleMessage = () => {
		const deadlineText =
			messageType === "prazo" && deadline
				? `\nSolicitamos que as providências sejam adotadas até a data de ${new Date(`${deadline}T12:00:00`).toLocaleDateString("pt-BR")}, a contar do recebimento desta mensagem.\n`
				: ""

		const formatMilitaryDate = (dateStr: string) => {
			if (!dateStr) return "XXXMÊSANO"
			const date = new Date(`${dateStr}T12:00:00`)
			const day = String(date.getDate()).padStart(2, "0")
			const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
			const month = months[date.getMonth()]
			const year = date.getFullYear()
			return `${day}${month}${year}`
		}

		const actionText =
			messageType === "alerta"
				? `A intenção deste acompanhamento é que as Unidades Gestoras verifiquem a situação apresentada e realizem as respectivas regularizações, caso se trate de uma inconsistência contábil.\n\nRessalta-se que, por se tratar de uma mensagem de alerta, não é necessário o envio de resposta informando as ações adotadas ou justificativas via Sistema de Atendimento ao Usuário (SAU).`
				: `Solicitamos a análise e a adoção das providências necessárias para a regularização contábil dos saldos apontados, procedendo com a reclassificação para as contas contábeis específicas adequadas.\n\nApós a regularização, ou caso haja justificativa técnica para a manutenção do saldo na referida conta, solicitamos que a resposta seja encaminhada por meio do Sistema de Atendimento ao Usuário (SAU), fazendo referência a esta mensagem.`

		let text = `Assunto: Identificação de Inconsistências Contábeis\n\nMensagem nº ${msgNumber}/SUCONT-3/${formatMilitaryDate(msgDate)}\n\n`
		text += `Em análise contábil realizada pela Divisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3) no Tesouro Gerencial (Base SIAFI), foram identificadas inconsistências apresentando saldo(s) diferente(s) de zero.\n\n`
		text += `Abaixo, detalhamos as inconsistências identificadas por Unidade Gestora:\n\n`

		const ugsToInclude = Object.keys(result)
			.filter((ug) => !conferenteFilter || getConferente(ug) === conferenteFilter)
			.sort()

		ugsToInclude.forEach((ug) => {
			text += `UG: ${getUgName(ug)} (${ug})\n`
			const contas = result[ug]
			for (const conta of Object.keys(contas)) {
				text += `- Conta Contábil: ${conta}\n`
				contas[conta].forEach((reg) => {
					const saldoFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(reg.saldo)
					text += `  Conta Corrente / Mês: ${reg.mes} | Valor Alongado / Saldo: ${saldoFormatado}\n`
				})
			}
			text += `\n`
		})

		text += `${deadlineText}\n${actionText}\n\nAtenciosamente,\n\nDivisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)\nSubdiretoria de Contabilidade (SUCONT)\nDiretoria de Economia e Finanças da Aeronáutica (DIREF)`

		return text
	}

	const generateMessage = (ug: string, contas: GroupedData[string]) => {
		// Group accounts by RAC question
		const racGroups: Record<string, { info: any; accounts: string[] }> = {}

		for (const conta of Object.keys(contas)) {
			const racInfo = getRacInfo(conta)
			if (!racGroups[racInfo.id]) {
				racGroups[racInfo.id] = { info: racInfo, accounts: [] }
			}
			racGroups[racInfo.id].accounts.push(conta)
		}

		let contasText = ""
		for (const group of Object.values(racGroups)) {
			contasText += `\n`
			for (const conta of group.accounts) {
				const registros = contas[conta]
				contasText += `- Conta Contábil: ${conta}\n`
				registros.forEach((reg) => {
					const saldoFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(reg.saldo)
					contasText += `  Conta Corrente / Mês: ${reg.mes} | Valor Alongado / Saldo: ${saldoFormatado}\n`
				})
			}
		}

		const deadlineText =
			messageType === "prazo" && deadline
				? `\nSolicitamos que as providências sejam adotadas até a data de ${new Date(`${deadline}T12:00:00`).toLocaleDateString("pt-BR")}, a contar do recebimento desta mensagem.\n`
				: ""

		const formatMilitaryDate = (dateStr: string) => {
			if (!dateStr) return "XXXMÊSANO"
			const date = new Date(`${dateStr}T12:00:00`)
			const day = String(date.getDate()).padStart(2, "0")
			const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
			const month = months[date.getMonth()]
			const year = date.getFullYear()
			return `${day}${month}${year}`
		}

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

	const copyToClipboard = (text: string, ug: string) => {
		navigator.clipboard.writeText(text)
		setCopiedUg(ug)
		setTimeout(() => setCopiedUg(null), 2000)
	}

	const formatCurrency = (value: number) => {
		return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
	}

	// Calculate summary stats
	const totalUGs = result ? Object.keys(result).length : 0
	let totalContas = 0
	let totalSaldoGeral = 0

	// For Tactical Analysis
	const ugVolumes: { ug: string; volume: number; count: number }[] = []
	const contaFrequencies: { [conta: string]: { count: number; volume: number } } = {}
	const conferenteStats: Record<string, { ugs: string[]; count: number }> = {}
	const racStats: Record<string, { count: number; volume: number; ugs: Set<string> }> = {}
	const odsStats: Record<string, { count: number; volume: number; ugs: Set<string> }> = {}
	const osStats: Record<string, { count: number; volume: number; ugs: Set<string> }> = {}
	const ugInconsistencies: { ug: string; count: number; volume: number }[] = []
	let totalInconsistencias = 0

	RAC_QUESTIONS.forEach((q) => {
		racStats[q.id] = { count: 0, volume: 0, ugs: new Set() }
	})

	if (result) {
		Object.entries(result).forEach(([ug, contas]) => {
			let ugVolume = 0
			let ugCount = 0
			totalContas += Object.keys(contas).length

			const conferente = getConferente(ug)
			if (!conferenteStats[conferente]) {
				conferenteStats[conferente] = { ugs: [], count: 0 }
			}
			conferenteStats[conferente].ugs.push(ug)

			const ods = getOds(ug)
			const os = getOs(ug)

			if (!odsStats[ods]) odsStats[ods] = { count: 0, volume: 0, ugs: new Set() }
			if (!osStats[os]) osStats[os] = { count: 0, volume: 0, ugs: new Set() }

			odsStats[ods].ugs.add(ug)
			osStats[os].ugs.add(ug)

			Object.entries(contas).forEach(([conta, registros]) => {
				let contaVolume = 0
				const racInfo = getRacInfo(conta)

				registros.forEach((reg: any) => {
					totalSaldoGeral += reg.saldo
					ugVolume += reg.saldo
					contaVolume += reg.saldo
					ugCount++
					totalInconsistencias++

					if (racStats[racInfo.id]) {
						racStats[racInfo.id].count++
						racStats[racInfo.id].volume += reg.saldo
						racStats[racInfo.id].ugs.add(ug)
					}

					odsStats[ods].count++
					odsStats[ods].volume += reg.saldo
					osStats[os].count++
					osStats[os].volume += reg.saldo
				})

				if (!contaFrequencies[conta]) {
					contaFrequencies[conta] = { count: 0, volume: 0 }
				}
				contaFrequencies[conta].count += registros.length
				contaFrequencies[conta].volume += contaVolume
			})

			conferenteStats[conferente].count += ugCount
			ugVolumes.push({ ug, volume: ugVolume, count: ugCount })
			ugInconsistencies.push({ ug, count: ugCount, volume: ugVolume })
		})
	}

	// Sort for top 3
	const _topUgsByVolume = [...ugVolumes].sort((a, b) => b.volume - a.volume).slice(0, 3)
	const topContasByFreq = Object.entries(contaFrequencies)
		.map(([conta, data]) => ({ conta, ...data }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10)

	const topUgsByCount = [...ugInconsistencies].sort((a, b) => b.count - a.count).slice(0, 10)
	const topOdsByCount = Object.entries(odsStats)
		.map(([ods, data]) => ({ ods, ...data }))
		.sort((a, b) => b.count - a.count)
	const topOsByCount = Object.entries(osStats)
		.map(([os, data]) => ({ os, ...data }))
		.sort((a, b) => b.count - a.count)

	return (
		<div className="min-h-screen text-slate-900 font-sans">
			<header className="bg-fab-dark border-b-4 border-b-fab-gold shadow-md sticky top-0 z-10">
				<div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
					<div className="flex items-center gap-5">
						<div className="relative">
							<div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-lg border-2 border-fab-gold">
								<Shield className="text-fab-blue w-8 h-8" />
							</div>
							<div className="absolute -bottom-1 -right-1 w-6 h-6 bg-fab-gold rounded-full flex items-center justify-center border-2 border-fab-dark shadow-sm">
								<Award className="text-fab-dark w-3.5 h-3.5" />
							</div>
						</div>
						<div>
							<div className="flex items-center gap-2">
								<h1 className="text-xl font-black text-white tracking-tighter leading-tight uppercase">ANALISTA SUCONT</h1>
								<div className="h-4 w-[2px] bg-fab-blue mx-1"></div>
								<span className="text-xs font-bold text-fab-dark bg-fab-gold px-2 py-0.5 rounded tracking-widest uppercase">DIREF</span>
							</div>
							<div className="flex items-center gap-2">
								<p className="text-[10px] text-fab-silver font-black uppercase tracking-[0.2em]">Diretoria de Economia e Finanças da Aeronáutica</p>
								<div className="h-2 w-2 rounded-full bg-fab-gold/50"></div>
								<span className="text-[9px] font-black text-fab-gold uppercase tracking-tighter">Questão 35 - Roteiro SUCONT-3</span>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-4">
						<div className="hidden md:flex flex-col items-end mr-4">
							<span className="text-[9px] font-black text-fab-silver uppercase tracking-widest">Força Aérea Brasileira</span>
							<span className="text-[10px] font-bold text-fab-gold uppercase">Asas que protegem o país</span>
						</div>
						{result && (
							<button
								onClick={resetApp}
								className="flex items-center gap-2 px-4 py-2 bg-fab-blue hover:bg-fab-gold hover:text-fab-dark text-white rounded-lg text-sm font-bold transition-all border border-fab-blue shadow-sm"
							>
								<RefreshCw className="w-4 h-4" />
								Nova Missão
							</button>
						)}
					</div>
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
				{!result && !isProcessing && (
					<>
						<div className="bg-white rounded-3xl shadow-2xl border border-fab-blue/20 p-10 max-w-3xl mx-auto mt-10 relative overflow-hidden">
							<div className="absolute top-0 right-0 w-64 h-64 bg-fab-blue/5 rounded-bl-full -mr-10 -mt-10 transition-all"></div>
							<div className="absolute bottom-0 left-0 w-40 h-40 bg-fab-gold/10 rounded-tr-full -ml-10 -mb-10 transition-all"></div>
							<div className="absolute top-1/2 right-10 opacity-5 pointer-events-none transform -translate-y-1/2">
								<Plane className="w-64 h-64 -rotate-45" />
							</div>

							<div className="text-center mb-10 relative z-10">
								<div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-fab-dark mb-6 border-4 border-fab-gold shadow-xl">
									<Shield className="w-12 h-12 text-white" />
								</div>
								<h2 className="text-4xl font-black text-fab-dark mb-3 tracking-tight uppercase">ANALISTA SUCONT</h2>
								<div className="flex items-center justify-center gap-3 mb-4">
									<div className="h-[2px] w-16 bg-fab-gold"></div>
									<span className="text-sm font-black text-fab-blue uppercase tracking-[0.3em]">Uso de Contas Contábeis Genéricas</span>
									<div className="h-[2px] w-16 bg-fab-gold"></div>
								</div>
								<p className="text-slate-600 max-w-lg mx-auto font-medium leading-relaxed">
									Plataforma oficial da <span className="text-fab-blue font-bold">SUCONT-3</span> para auditoria e acompanhamento contábil das Unidades Gestoras
									do COMAER.
								</p>

								<div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-fab-dark border border-fab-gold/30 rounded-full shadow-md">
									<Compass className="w-4 h-4 text-fab-gold" />
									<span className="text-[10px] font-black text-white uppercase tracking-widest">
										Questão 35 do Roteiro de Acompanhamento Contábil (SUCONT-3)
									</span>
								</div>
							</div>

							<div className="mb-8 relative z-10 bg-slate-50 border border-slate-200 rounded-xl p-5 text-left shadow-sm">
								<div className="flex items-center gap-2 mb-3">
									<Info className="w-4 h-4 text-fab-blue" />
									<span className="text-xs font-black text-slate-700 uppercase tracking-widest">Caminho do Relatório no Tesouro Gerencial</span>
								</div>
								<div className="text-[11px] text-slate-600 font-mono leading-relaxed bg-white p-4 rounded-lg border border-slate-200 shadow-inner break-words">
									<span className="font-bold text-fab-blue">TESOURO GERENCIAL</span> &gt; Relatórios Compartilhados &gt; Consultas Gerenciais &gt; Relatórios de
									Bancada dos Órgãos Superiores &gt; 52000 - Ministério da Defesa &gt; 52111 - Comando da Aeronáutica &gt; SEFA &gt; DIREF &gt; SUCONT-3 -
									ACOMPANHAMENTO &gt; <span className="font-bold text-fab-dark">ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1</span>
								</div>
							</div>

							<div
								className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer relative z-10 ${
									file ? "border-fab-gold bg-fab-blue/5" : "border-fab-blue/30 hover:border-fab-blue hover:bg-fab-blue/5"
								}`}
								onDragOver={handleDragOver}
								onDrop={handleDrop}
								onClick={() => fileInputRef.current?.click()}
							>
								<input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" className="hidden" />

								<div className="flex flex-col items-center justify-center gap-5">
									<div className={`p-6 rounded-full shadow-lg ${file ? "bg-fab-blue text-white" : "bg-white border border-slate-200 text-fab-blue"}`}>
										<Upload className="w-10 h-10" />
									</div>
									<div>
										<p className="text-lg font-black text-slate-700 uppercase tracking-tight">
											{file ? file.name : "Arraste o Relatório do Tesouro Gerencial"}
										</p>
										<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Identificação automática de contas com final "99"</p>
									</div>
								</div>
							</div>
						</div>

						<div className="max-w-4xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
							<div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 hover:border-fab-blue/50 transition-colors group">
								<div className="w-12 h-12 bg-fab-blue/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-fab-blue/20 transition-colors">
									<Search className="w-6 h-6 text-fab-blue" />
								</div>
								<h3 className="text-xs font-black text-fab-dark uppercase tracking-widest mb-3">O que está sendo analisado</h3>
								<p className="text-[12px] text-slate-600 font-medium leading-relaxed">
									Identificação do uso indevido de contas contábeis genéricas (terminadas em "99") pelas Unidades Gestoras do COMAER, o que pode omitir
									informações relevantes e distorcer a situação patrimonial.
								</p>
							</div>

							<div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 hover:border-fab-gold/50 transition-colors group">
								<div className="w-12 h-12 bg-fab-gold/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-fab-gold/20 transition-colors">
									<BookOpen className="w-6 h-6 text-fab-gold" />
								</div>
								<h3 className="text-xs font-black text-fab-dark uppercase tracking-widest mb-3">Referencial Teórico (RAC)</h3>
								<p className="text-[12px] text-slate-600 font-medium leading-relaxed">
									Análise fundamentada no Roteiro de Acompanhamento Contábil (RAC) da SUCONT-3, visando garantir a fidedignidade dos registros e orientar a
									regularização contábil.
								</p>
							</div>

							<div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 hover:border-emerald-500/50 transition-colors group">
								<div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-200 transition-colors">
									<MessageSquare className="w-6 h-6 text-emerald-600" />
								</div>
								<h3 className="text-xs font-black text-fab-dark uppercase tracking-widest mb-3">Mensagens Automáticas</h3>
								<p className="text-[12px] text-slate-600 font-medium leading-relaxed">
									Geração automática de textos padronizados para envio via SIAFI (Mensagem) às Unidades Gestoras, facilitando a cobrança e a orientação técnica.
								</p>
							</div>
						</div>

						<div className="mt-8 text-center px-6 max-w-3xl mx-auto opacity-70">
							<p className="text-[10px] text-slate-500 leading-relaxed font-medium">
								Aplicativo desenvolvido no âmbito da Subdiretoria de Contabilidade (SUCONT/DIREF), alinhado às diretrizes do Subdiretor de Contabilidade, Cel
								Int Carlos José Rodrigues, com supervisão do Cel Int Eduardo de Oliveira Silva (Chefe da SUCONT-3) e desenvolvimento técnico do 1º Ten QOAp CCO
								Jefferson Luís Reis Alves (Chefe da SUCONT-3.1).
							</p>
						</div>
					</>
				)}

				{error && (
					<div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 max-w-3xl mx-auto">
						<AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
						<p className="text-sm font-medium">{error}</p>
					</div>
				)}

				{isProcessing && (
					<div className="flex flex-col items-center justify-center py-20">
						<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-fab-blue mb-4"></div>
						<span className="text-slate-600 font-medium text-lg">Processando relatório...</span>
						<span className="text-slate-400 text-sm mt-2">Aplicando regras de negócio da SUCONT-3</span>
					</div>
				)}

				{result && !isProcessing && (
					<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
						{/* Internal Control Info */}
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

						{/* View Navigation */}
						<div className="flex gap-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
							{[
								{ id: "estrategica", label: "Visão Estratégica", icon: Landmark },
								{ id: "tatica", label: "Visão Tática", icon: Target },
								{ id: "operacional", label: "Visão Operacional", icon: FileSpreadsheet },
							].map((view) => (
								<button
									key={view.id}
									onClick={() => setActiveView(view.id as any)}
									className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${activeView === view.id ? "bg-fab-blue text-white shadow-md" : "text-slate-500 hover:bg-slate-50"}`}
								>
									<view.icon className="w-4 h-4" />
									{view.label}
								</button>
							))}
						</div>

						{/* Executive Summary */}
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
							<div className="bg-white p-6 rounded-2xl shadow-lg border-b-4 border-b-fab-blue flex flex-col justify-between relative overflow-hidden group">
								<div className="absolute top-0 right-0 w-24 h-24 bg-fab-blue/5 rounded-bl-full -mr-4 -mt-4 transition-all group-hover:bg-fab-blue/10"></div>
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
								<div className="absolute top-0 right-0 w-24 h-24 bg-fab-gold/5 rounded-bl-full -mr-4 -mt-4 transition-all group-hover:bg-fab-gold/10"></div>
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
								<div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full -mr-4 -mt-4 transition-all group-hover:bg-emerald-100"></div>
								<div className="flex items-center gap-3 mb-4">
									<div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-lg">
										<DollarSign className="w-5 h-5" />
									</div>
									<h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Volume Financeiro</h3>
								</div>
								<div className="flex items-baseline gap-2">
									<p className="text-3xl font-black text-emerald-700">{formatCurrency(totalSaldoGeral)}</p>
								</div>
							</div>
						</div>

						{/* Contexto Metodológico RAC */}
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
										decisão da administração.
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

						{/* Painel de Risco Contábil do COMAER */}
						{foundAny && (
							<div
								className={
									activeView === "estrategica" || activeView === "tatica" ? "bg-slate-50 p-8 rounded-3xl shadow-inner border border-slate-200" : "hidden"
								}
							>
								<div className="flex items-center gap-4 mb-8 border-b-2 border-slate-200 pb-4">
									<div className="w-12 h-12 bg-fab-dark rounded-xl flex items-center justify-center shadow-lg border border-fab-gold/50">
										<Landmark className="w-7 h-7 text-fab-gold" />
									</div>
									<div>
										<h2 className="text-2xl font-black text-fab-blue uppercase tracking-tighter">Painel de Risco Contábil do COMAER</h2>
										<p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Análise Estratégica e Tática - SUCONT / DIREF</p>
									</div>
								</div>

								{/* Indicadores Gerenciais (Estratégico) */}
								<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
									<div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-fab-blue">
										<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Inconsistências</p>
										<p className="text-3xl font-black text-fab-blue">{totalInconsistencias}</p>
									</div>
									<div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
										<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Volume Financeiro em Risco</p>
										<p className="text-xl font-black text-amber-600 mt-2">{formatCurrency(totalSaldoGeral)}</p>
									</div>
									<div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
										<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">UGs com Inconsistências</p>
										<p className="text-3xl font-black text-emerald-600">{totalUGs}</p>
									</div>
									<div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-purple-500">
										<p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Média de Inconsistências / UG</p>
										<p className="text-3xl font-black text-purple-600">{(totalInconsistencias / totalUGs || 0).toFixed(1)}</p>
									</div>
								</div>

								<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
									{/* Nível Estratégico */}
									<div className={activeView === "estrategica" ? "bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-fab-gold" : "hidden"}>
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
														const percentage = ((ods.count / totalInconsistencias) * 100).toFixed(1)
														return (
															<div key={idx} className="flex flex-col gap-1">
																<div className="flex justify-between items-center text-sm">
																	<span className="font-bold text-fab-dark">{ods.ods}</span>
																	<span className="font-black text-fab-blue">
																		{percentage}% <span className="text-xs text-slate-400 font-normal">({ods.count})</span>
																	</span>
																</div>
																<div className="w-full bg-slate-100 rounded-full h-2">
																	<div className="bg-fab-blue h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
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
														const percentage = ((os.count / totalInconsistencias) * 100).toFixed(1)
														return (
															<div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
																<span className="text-sm font-bold text-fab-dark">{os.os}</span>
																<span className="text-sm font-black text-slate-700">{percentage}%</span>
															</div>
														)
													})}
												</div>
											</div>
										</div>
									</div>

									{/* Nível Tático */}
									<div className={activeView === "tatica" ? "bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-fab-blue" : "hidden"}>
										<div className="flex items-center gap-2 mb-6">
											<Target className="w-5 h-5 text-fab-blue" />
											<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Visão Tática (SUCONT-3)</h3>
										</div>

										<div className="space-y-6">
											<div>
												<h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
													<AlertTriangle className="w-4 h-4" /> Top 10 UGs com Mais Inconsistências
												</h4>
												<div className="space-y-2">
													{topUgsByCount.slice(0, 5).map((ug, idx) => (
														<div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
															<div className="flex items-center gap-2">
																<span className="text-xs font-black text-slate-400 w-4">{idx + 1}º</span>
																<div className="flex flex-col">
																	<span className="text-sm font-bold text-fab-dark">
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
								</div>

								{/* Filtro Gerencial por Conferente */}
								<div className={activeView === "tatica" ? "mt-8 bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-emerald-600" : "hidden"}>
									<div className="flex items-center gap-2 mb-6">
										<Award className="w-5 h-5 text-emerald-600" />
										<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Panorama de Distribuição SUCONT-3</h3>
									</div>

									<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
										{Object.entries(conferenteStats)
											.sort((a, b) => b[1].count - a[1].count)
											.map(([conf, stats]) => (
												<div
													key={conf}
													className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center hover:bg-emerald-50 transition-colors cursor-pointer"
													onClick={() => setConferenteFilter(conf)}
												>
													<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{conf}</p>
													<p className="text-2xl font-black text-emerald-700">{stats.count}</p>
													<p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Inconsistências</p>
												</div>
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

								{/* Panorama por Questão RAC */}
								<div className={activeView === "tatica" ? "mt-8 bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-fab-blue" : "hidden"}>
									<div className="flex items-center gap-2 mb-6">
										<Target className="w-5 h-5 text-fab-blue" />
										<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Panorama por Questão RAC</h3>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
										{RAC_QUESTIONS.map((q) => (
											<div key={q.id} className="bg-slate-50 p-5 rounded-xl border border-slate-200 hover:bg-fab-blue/5 transition-colors">
												<div className="flex justify-between items-start mb-3">
													<span className="px-2 py-1 bg-fab-blue text-white text-[10px] font-black rounded uppercase tracking-widest">RAC {q.id}</span>
													<span className="text-xs font-black text-fab-blue">{racStats[q.id].ugs.size} UGs</span>
												</div>
												<p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-4 h-8 line-clamp-2">{q.description}</p>
												<div className="flex items-end justify-between">
													<div>
														<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Volume</p>
														<p className="text-sm font-black text-fab-blue">{formatCurrency(racStats[q.id].volume)}</p>
													</div>
													<div className="text-right">
														<p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Itens</p>
														<p className="text-sm font-black text-slate-700">{racStats[q.id].count}</p>
													</div>
												</div>
											</div>
										))}
									</div>
								</div>

								{/* NOVO: Painel de Apoio à Decisão e Mapa de Risco */}
								<div className="mt-12 space-y-8">
									<div className="flex items-center gap-4 border-b-2 border-slate-200 pb-4">
										<div className="w-12 h-12 bg-fab-blue rounded-xl flex items-center justify-center shadow-lg border border-fab-gold/50">
											<BarChart3 className="w-7 h-7 text-white" />
										</div>
										<div>
											<h2 className="text-2xl font-black text-fab-blue uppercase tracking-tighter">Apoio à Decisão e Mapa de Risco</h2>
											<p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Inteligência Estratégica SUCONT-3</p>
										</div>
									</div>

									<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
										{/* Impacto Financeiro Total */}
										<div className="bg-emerald-600 p-6 rounded-2xl shadow-xl border-b-4 border-emerald-800 flex flex-col justify-center text-white">
											<div className="flex items-center gap-3 mb-4">
												<DollarSign className="w-8 h-8 text-emerald-200" />
												<h3 className="text-lg font-black uppercase tracking-tight">Impacto Financeiro Total</h3>
											</div>
											<p className="text-4xl font-black mb-2">{formatCurrency(totalFinancialImpact)}</p>
											<p className="text-xs font-bold text-emerald-100 uppercase tracking-widest">Volume total em risco contábil</p>
										</div>

										{/* Mapa de Risco Consolidado */}
										<div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-md border-t-4 border-t-fab-blue">
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
															<th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">ODS</th>
															<th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Inconsistências</th>
															<th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Saldo Associado</th>
															<th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">% Total</th>
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

										{/* Níveis Críticos */}
										<div className="bg-fab-dark p-6 rounded-2xl shadow-xl border-t-4 border-t-fab-gold">
											<div className="flex items-center gap-2 mb-6">
												<AlertOctagon className="w-5 h-5 text-fab-gold" />
												<h3 className="text-lg font-black text-white uppercase tracking-tight">Níveis Críticos</h3>
											</div>

											<div className="space-y-6">
												<div className="bg-white/5 p-4 rounded-xl border border-white/10">
													<p className="text-[9px] font-black text-fab-gold uppercase tracking-widest mb-1">ODS com Maior Risco</p>
													<p className="text-xl font-black text-white">{criticalSummary?.ods}</p>
												</div>
												<div className="bg-white/5 p-4 rounded-xl border border-white/10">
													<p className="text-[9px] font-black text-fab-gold uppercase tracking-widest mb-1">Órgão Superior Crítico</p>
													<p className="text-xl font-black text-white">{criticalSummary?.os}</p>
												</div>
												<div className="bg-white/5 p-4 rounded-xl border border-white/10">
													<p className="text-[9px] font-black text-fab-gold uppercase tracking-widest mb-1">UG Maior Concentração</p>
													<p className="text-lg font-black text-white">
														UG {criticalSummary?.ugCount} <span className="text-[10px] text-fab-gold/60">({getUgName(criticalSummary?.ugCount || "")})</span>
													</p>
												</div>
												<div className="bg-white/5 p-4 rounded-xl border border-white/10">
													<p className="text-[9px] font-black text-fab-gold uppercase tracking-widest mb-1">UG Maior Saldo Irregular</p>
													<p className="text-lg font-black text-white">
														UG {criticalSummary?.ugVolume} <span className="text-[10px] text-fab-gold/60">({getUgName(criticalSummary?.ugVolume || "")})</span>
													</p>
												</div>
											</div>
										</div>
									</div>

									<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
										{/* Análise de Pareto */}
										<div className="bg-white p-6 rounded-2xl shadow-md border-l-8 border-l-purple-600">
											<div className="flex items-center gap-2 mb-4">
												<TrendingUp className="w-5 h-5 text-purple-600" />
												<h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Análise de Concentração (Pareto)</h3>
											</div>
											<div className="bg-purple-50 p-4 rounded-xl border border-purple-100 mb-6">
												<p className="text-sm text-purple-900 font-bold leading-relaxed">
													<span className="text-2xl font-black text-purple-600">{paretoData?.ugPercentage}%</span> das UGs analisadas concentram{" "}
													<span className="text-2xl font-black text-purple-600">{paretoData?.inconsistencyPercentage}%</span> das inconsistências contábeis
													identificadas.
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

										{/* Priorização de Atuação */}
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

									{/* Oráculo SUCONT - Chat Inteligente */}
									<div className="bg-white rounded-3xl shadow-2xl border-2 border-fab-blue/20 overflow-hidden">
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
												<button
													onClick={() => askOracle("Qual ODS possui maior risco contábil?")}
													className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[9px] font-black rounded-lg uppercase tracking-widest transition-all border border-white/10"
												>
													Risco ODS
												</button>
												<button
													onClick={() => askOracle("Quais são as 5 UGs mais críticas?")}
													className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[9px] font-black rounded-lg uppercase tracking-widest transition-all border border-white/10"
												>
													Top 5 UGs
												</button>
												<button
													onClick={() => askOracle("Resuma o impacto financeiro total.")}
													className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[9px] font-black rounded-lg uppercase tracking-widest transition-all border border-white/10"
												>
													Impacto Financeiro
												</button>
												<button
													onClick={() => setChatMessages([])}
													className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-white text-[9px] font-black rounded-lg uppercase tracking-widest transition-all border border-white/10"
												>
													Limpar Chat
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
															className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${msg.role === "user" ? "bg-fab-blue text-white rounded-tr-none" : "bg-white text-slate-700 border border-slate-200 rounded-tl-none"}`}
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
															<div className="w-1.5 h-1.5 bg-fab-blue rounded-full animate-bounce"></div>
															<div className="w-1.5 h-1.5 bg-fab-blue rounded-full animate-bounce [animation-delay:0.2s]"></div>
															<div className="w-1.5 h-1.5 bg-fab-blue rounded-full animate-bounce [animation-delay:0.4s]"></div>
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
													className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-fab-blue transition-all"
												/>
												<button
													onClick={() => askOracle()}
													disabled={isAskingOracle || !oracleInput.trim()}
													className="bg-fab-blue hover:bg-fab-dark disabled:opacity-50 text-white p-3 rounded-xl transition-all shadow-lg shadow-fab-blue/20"
												>
													<ArrowRight className="w-5 h-5" />
												</button>
											</div>
										</div>
									</div>
								</div>
							</div>
						)}

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
							<div className={activeView === "operacional" ? "space-y-10" : "hidden"}>
								<div className="flex items-center gap-4 border-b-2 border-slate-200 pb-4">
									<div className="w-12 h-12 bg-fab-dark rounded-xl flex items-center justify-center shadow-lg border border-fab-gold/50">
										<Compass className="w-7 h-7 text-fab-gold" />
									</div>
									<div>
										<h2 className="text-2xl font-black text-fab-blue uppercase tracking-tighter">Retrato das Inconsistências</h2>
										<p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ações de Cobrança e Auditoria SUCONT-3</p>
									</div>
								</div>

								{/* Filtros de Análise */}
								<div className="space-y-4">
									{/* Modo de Mensagem */}
									<div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
										<div className="flex items-center gap-2 text-slate-500 mr-2">
											<MessageSquare className="w-4 h-4" />
											<span className="text-[10px] font-black uppercase tracking-widest">Modo de Mensagem:</span>
										</div>
										<div className="flex bg-slate-100 p-1 rounded-xl">
											<button
												onClick={() => setMessageMode("individual")}
												className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${messageMode === "individual" ? "bg-white text-fab-blue shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
											>
												Mensagens Individuais
											</button>
											<button
												onClick={() => setMessageMode("unica")}
												className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${messageMode === "unica" ? "bg-white text-fab-blue shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
											>
												Mensagem Única (Agrupada)
											</button>
										</div>
									</div>

									{/* Filtro por Conferente */}
									<div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
										<div className="flex items-center gap-2 text-slate-500 mr-2">
											<Award className="w-4 h-4" />
											<span className="text-[10px] font-black uppercase tracking-widest">Filtrar por Responsável:</span>
										</div>
										<div className="flex flex-wrap gap-2">
											<button
												onClick={() => setConferenteFilter(null)}
												className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${!conferenteFilter ? "bg-fab-blue text-white border-fab-blue shadow-md shadow-fab-blue/20" : "bg-white text-slate-500 border-slate-200 hover:border-fab-blue/50"}`}
											>
												Modo Geral
											</button>
											{[...new Set(Object.values(CONFERENTES_MAP))].sort().map((conf) => (
												<button
													key={conf}
													onClick={() => setConferenteFilter(conf)}
													className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${conferenteFilter === conf ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20" : "bg-white text-slate-500 border-slate-200 hover:border-emerald-600/50"}`}
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
											onClick={() => setConferenteFilter(null)}
											className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-200"
										>
											<RefreshCw className="w-3 h-3" /> Limpar Filtro
										</button>
									</div>
								)}

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
												<p className="text-sm text-slate-600 mb-4">
													Esta mensagem consolida as inconsistências de todas as Unidades Gestoras filtradas. Ideal para envio coletivo.
												</p>
											</div>
											<div className="p-6 flex-1 bg-slate-50">
												<div className="space-y-4">
													<div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
														<span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Nº da Mensagem:</span>
														<input
															type="text"
															value={msgNumber}
															onChange={(e) => setMsgNumber(e.target.value)}
															placeholder="Ex: 123"
															className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20 focus:border-fab-blue transition-all"
														/>
													</div>

													<div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
														<span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Data:</span>
														<input
															type="date"
															value={msgDate}
															onChange={(e) => setMsgDate(e.target.value)}
															className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20 focus:border-fab-blue transition-all"
														/>
													</div>

													<div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
														<span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Tipo de Mensagem:</span>
														<select
															value={messageType}
															onChange={(e) => setMessageType(e.target.value as "prazo" | "sem_prazo" | "alerta")}
															className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20 focus:border-fab-blue transition-all"
														>
															<option value="sem_prazo">Sem Prazo</option>
															<option value="prazo">Com Prazo</option>
															<option value="alerta">Apenas Alerta</option>
														</select>
													</div>

													{messageType === "prazo" && (
														<div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
															<span className="text-[10px] text-fab-blue font-black uppercase tracking-widest">Data Limite:</span>
															<input
																type="date"
																value={deadline}
																onChange={(e) => setDeadline(e.target.value)}
																className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20 focus:border-fab-blue transition-all"
															/>
														</div>
													)}
												</div>
											</div>
										</div>
										<div className="p-6 flex-1 bg-slate-50/30">
											<div className="bg-white border border-slate-200 rounded-xl p-6 shadow-inner h-full font-mono text-sm text-slate-700 leading-relaxed whitespace-pre-wrap relative">
												{generateSingleMessage()}
												<button
													onClick={() => {
														navigator.clipboard.writeText(generateSingleMessage())
														setCopiedUg("unica")
														setTimeout(() => setCopiedUg(null), 2000)
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
									Object.keys(result)
										.filter((ug) => !conferenteFilter || getConferente(ug) === conferenteFilter)
										.sort()
										.map((ug) => {
											const contas = result[ug]

											const message = generateMessage(ug, contas)

											// Calculate total balance for this specific UG
											let ugTotalBalance = 0
											Object.values(contas).forEach((registros: any) => {
												registros.forEach((reg: any) => {
													ugTotalBalance += reg.saldo
												})
											})

											return (
												<div key={ug} className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col lg:flex-row diref-card">
													{/* Left Column: The Portrait (Data) */}
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
																{Object.entries(contas).map(([conta, registros]: [string, any]) => (
																	<div key={conta} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm relative overflow-hidden group">
																		<div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
																			<FileSpreadsheet className="w-12 h-12" />
																		</div>
																		<div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
																			<Wallet className="w-4 h-4 text-fab-blue" />
																			<span className="font-mono font-black text-fab-blue">{conta}</span>
																		</div>
																		<div className="space-y-2">
																			{registros.map((reg, idx) => (
																				<div key={idx} className="flex items-center justify-between text-sm">
																					<div
																						className="flex items-center gap-1.5 text-slate-500 font-bold uppercase text-[10px]"
																						title="Conta Corrente / Mês"
																					>
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

													{/* Right Column: The Action (Message) */}
													<div className="lg:w-7/12 flex flex-col bg-white">
														<div className="px-6 py-4 border-b border-slate-200 flex flex-col gap-4 bg-slate-50">
															<div className="flex items-center justify-between">
																<div className="flex flex-col gap-1">
																	<div className="flex items-center gap-2 text-fab-blue">
																		<FileText className="w-5 h-5" />
																		<h4 className="font-black uppercase tracking-tight text-sm">Mensagem Institucional Pronta</h4>
																	</div>
																	<p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
																		UG {ug} — Conferente: {getConferente(ug)} <br />
																		<span className="text-amber-600">Inconsistência identificada: utilização de conta contábil genérica.</span>
																	</p>
																</div>
																<button
																	onClick={() => copyToClipboard(message, ug)}
																	className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
																		copiedUg === ug
																			? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
																			: "bg-fab-blue text-white hover:bg-fab-dark shadow-lg shadow-fab-blue/20"
																	}`}
																>
																	{copiedUg === ug ? (
																		<>
																			<Check className="w-4 h-4" />
																			Copiado
																		</>
																	) : (
																		<>
																			<Copy className="w-4 h-4" />
																			Copiar Mensagem
																		</>
																	)}
																</button>
															</div>

															<div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-200">
																<div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
																	<span className="text-[10px] text-fab-blue font-black uppercase tracking-widest">Nº Mensagem:</span>
																	<input
																		type="text"
																		value={msgNumber}
																		onChange={(e) => setMsgNumber(e.target.value)}
																		placeholder="Ex: 001"
																		className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20 focus:border-fab-blue w-16 text-center"
																	/>
																</div>

																<div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
																	<span className="text-[10px] text-fab-blue font-black uppercase tracking-widest">Data Mensagem:</span>
																	<input
																		type="date"
																		value={msgDate}
																		onChange={(e) => setMsgDate(e.target.value)}
																		className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20 focus:border-fab-blue transition-all"
																	/>
																</div>

																<div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
																	<span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Tipo de Mensagem:</span>
																	<select
																		value={messageType}
																		onChange={(e) => setMessageType(e.target.value as "prazo" | "sem_prazo" | "alerta")}
																		className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20 focus:border-fab-blue transition-all"
																	>
																		<option value="sem_prazo">Sem Prazo</option>
																		<option value="prazo">Com Prazo</option>
																		<option value="alerta">Apenas Alerta</option>
																	</select>
																</div>

																{messageType === "prazo" && (
																	<div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
																		<span className="text-[10px] text-fab-blue font-black uppercase tracking-widest">Data Limite:</span>
																		<input
																			type="date"
																			value={deadline}
																			onChange={(e) => setDeadline(e.target.value)}
																			className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-black text-fab-blue focus:outline-none focus:ring-2 focus:ring-fab-blue/20 focus:border-fab-blue transition-all"
																		/>
																	</div>
																)}
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
						)}
					</div>
				)}
			</main>
		</div>
	)
}
