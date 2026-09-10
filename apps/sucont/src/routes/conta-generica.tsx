import { createFileRoute } from "@tanstack/react-router"
import {
	AlertOctagon,
	AlertTriangle,
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
	Landmark,
	Lightbulb,
	MessageSquare,
	RefreshCw,
	Search,
	Target,
	TrendingUp,
	Wallet,
} from "lucide-react"
import { useState } from "react"
import * as XLSX from "xlsx"
import { AnalysisGuide } from "#/components/analysis-guide"
import { AnalysisStart } from "#/components/analysis-start"
import { EditableMessage } from "#/components/editable-message"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { EXCEL_ACCEPT, FileDropzone } from "#/components/ui/file-dropzone"
import { Input } from "#/components/ui/input"
import { SectionHeader } from "#/components/ui/section-header"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { StatTile } from "#/components/ui/stat-tile"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip"
import { CONSOLIDATED_DRAFT_KEY, useMessageDrafts } from "#/hooks/use-editable-message"
import { blocoFundamentacao, FUNDAMENTO_CONTA_GENERICA } from "#/lib/normas"
import { CONFERENTES, getUg } from "#/lib/ug/registry"
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

const RAC_QUESTIONS = [
	{
		id: "29",
		title: "Questão RAC 29",
		description: "Utilização de conta genérica",
		classes: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
	},
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const getConferente = (ug: string) => getUg(ug)?.conferente || "NÃO MAPEADO"

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

const getOds = (ug: string) => getUg(ug)?.ods || "OUTROS"
const getOs = (ug: string) => getUg(ug)?.orgaoSuperior || "OUTROS"
const getUgName = (ug: string) => getUg(ug)?.sigla || "NÃO IDENTIFICADA"

const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)

const formatMilitaryDate = (dateStr: string) => {
	if (!dateStr) return "XXXMÊSANO"
	const date = new Date(`${dateStr}T12:00:00`)
	const day = String(date.getDate()).padStart(2, "0")
	const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
	return `${day}${months[date.getMonth()]}${date.getFullYear()}`
}

// ── Route ────────────────────────────────────────────────────────────────────

/**
 * O que a ferramenta faz com a planilha. Último bloco da tela inicial: é a
 * única parte que se pode ler depois de já ter enviado o arquivo.
 */
const ANALYSIS_NOTES = [
	{
		icon: Search,
		title: "O que é analisado",
		text: 'Uso indevido de contas contábeis genéricas (terminadas em "99") pelas Unidades Gestoras do COMAER.',
	},
	{
		icon: MessageSquare,
		title: "O que é gerado",
		text: "Texto padronizado por UG, pronto para envio via SIAFI, com a fundamentação normativa já embutida.",
	},
	{
		icon: BookOpen,
		title: "Como o resultado é lido",
		text: "Três visões do mesmo dado — estratégica, tática e operacional —, além do oráculo de IA sobre o conjunto carregado.",
	},
] as const

export const Route = createFileRoute("/conta-generica")({
	component: ContaGenerica,
})

function ContaGenerica() {
	const [error, setError] = useState<string | null>(null)
	const [isProcessing, setIsProcessing] = useState(false)
	const [result, setResult] = useState<GroupedData | null>(null)
	const [foundAny, setFoundAny] = useState(false)
	const [copiedUg, setCopiedUg] = useState<string | null>(null)
	const drafts = useMessageDrafts()
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

	// ── File handling ───────────────────────────────────────────────────────────

	const handleFiles = (files: File[]) => {
		const f = files[0]
		if (f) processFile(f)
	}

	const resetApp = () => {
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
		drafts.resetAll()
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

${blocoFundamentacao(FUNDAMENTO_CONTA_GENERICA)}

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
			if (!contas) continue
			for (const conta of Object.keys(contas)) {
				text += `- Conta Contábil: ${conta}\n`
				contas[conta].forEach((reg) => {
					text += `  Conta Corrente / Mês: ${reg.mes} | Valor Alongado / Saldo: ${formatCurrency(reg.saldo)}\n`
				})
			}
			text += "\n"
		}

		text += `${deadlineText}\n${actionText}\n\n${blocoFundamentacao(FUNDAMENTO_CONTA_GENERICA)}\n\nAtenciosamente,\n\nDivisão de Acompanhamento Contábil e Suporte ao Usuário (SUCONT-3)\nSubdiretoria de Contabilidade (SUCONT)\nDiretoria de Economia e Finanças da Aeronáutica (DIREF)`
		return text
	}

	// A mensagem única concatena todas as UGs do resultado; só é montada no modo em
	// que ela aparece, senão sai refeita a cada tecla digitada nas mensagens por UG.
	const singleMessage = messageMode === "unica" ? drafts.of(CONSOLIDATED_DRAFT_KEY, generateSingleMessage()) : null

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

	const guide = (
		<AnalysisGuide
			source={<TesouroGerencialPath />}
			reference={
				<RacReference
					statement="As Unidades Gestoras utilizam contas contábeis genéricas no registro de suas transações?"
					objective='Identificar o uso indevido de contas contábeis genéricas (terminadas em "99") pelas Unidades Gestoras do COMAER.'
					risk="A conta genérica esconde a natureza real do registro, impede a conciliação por natureza de despesa e distorce a leitura das demonstrações."
					importance="A reclassificação preserva a fidedignidade dos registros e sustenta a atuação da Setorial Contábil junto à UG."
				/>
			}
			notes={ANALYSIS_NOTES}
		/>
	)

	return (
		<HubLayout
			guide={guide}
			actions={
				result && (
					<Button variant="outline" size="sm" onClick={resetApp}>
						<RefreshCw className="w-3.5 h-3.5" />
						Nova análise
					</Button>
				)
			}
		>
			{/*
			 * Capa removida: um escudo de 96px com anel dourado, o título "ANALISTA
			 * SUCONT" entre dois filetes de ouro, blobs decorativos em quarto-de-
			 * círculo, um avião de marca-d'água e uma pílula repetindo a Questão 29 —
			 * que já é a pílula ao lado da trilha. Nada disso é a tarefa.
			 *
			 * O carregamento também deixou de ser uma tela própria: era um bloco de
			 * `py-20` com anel girando que SUBSTITUÍA a zona de envio, então o campo
			 * sumia da página enquanto lia. Agora o estado vive na própria zona, como
			 * nas outras seis ferramentas.
			 */}
			{!result && (
				<AnalysisStart
					dropzone={
						<FileDropzone
							accept={EXCEL_ACCEPT}
							onFiles={handleFiles}
							hint='Excel do Tesouro Gerencial — contas com final "99" são identificadas automaticamente'
							columns={["UG", "Conta Contábil", "Mês", "Saldo - R$"]}
							isLoading={isProcessing}
						/>
					}
					error={error}
				/>
			)}

			{/* RESULTS */}
			{result && !isProcessing && (
				<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
					{/*
					 * O banner "Controle Interno SUCONT-3 — Questão 29" e o card "Referencial
					 * Metodológico" que ficavam aqui repetiam, DEPOIS do resultado, o que a
					 * trilha (pílula Q29) e a tela inicial (`RacReference`) já disseram.
					 */}
					<SegmentedControl
						label="Visão do painel"
						size="lg"
						value={activeView}
						onValueChange={setActiveView}
						options={[
							{
								value: "estrategica",
								label: (
									<>
										<Landmark /> Estratégica
									</>
								),
							},
							{
								value: "tatica",
								label: (
									<>
										<Target /> Tática
									</>
								),
							},
							{
								value: "operacional",
								label: (
									<>
										<FileSpreadsheet /> Operacional
									</>
								),
							},
						]}
					/>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<StatTile icon={<Building2 />} label="Unidades Gestoras" value={totalUGs} hint="com inconsistência" />
						<StatTile icon={<Wallet />} label="Contas genéricas" value={totalContas} hint="auditadas" />
						<StatTile icon={<DollarSign />} label="Volume financeiro" value={formatCurrency(totalSaldoGeral)} status="success" />
					</div>

					{/* RISK PANEL (estratégica + tática) */}
					{foundAny && (activeView === "estrategica" || activeView === "tatica") && (
						<div className="space-y-6">
							<SectionHeader icon={<Landmark />} title="Painel de risco contábil do COMAER" description="Análise estratégica e tática — SUCONT / DIREF" />

							<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
								<StatTile label="Total de inconsistências" value={totalInconsistencias} />
								<StatTile label="Volume financeiro em risco" value={formatCurrency(totalSaldoGeral)} status="destructive" />
								<StatTile label="UGs com inconsistências" value={totalUGs} status="warning" />
								<StatTile label="Média de inconsistências / UG" value={(totalInconsistencias / (totalUGs || 1)).toFixed(1)} status="action" />
							</div>

							{/* Estratégica view */}
							{activeView === "estrategica" && (
								<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
									<div className="bg-card p-6 rounded-xl border border-border">
										<div className="flex items-center gap-2 mb-6">
											<TrendingUp className="w-5 h-5 text-warning" />
											<h3 className="text-heading text-foreground">Visão Estratégica (DIREF)</h3>
										</div>
										<div className="space-y-6">
											<div>
												<h4 className="text-label text-muted-foreground mb-3 flex items-center gap-2">
													<Landmark className="w-4 h-4" /> Distribuição por ODS (Risco Contábil)
												</h4>
												<div className="space-y-3">
													{topOdsByCount.map((ods, idx) => {
														const pct = ((ods.count / totalInconsistencias) * 100).toFixed(1)
														return (
															<div key={idx} className="flex flex-col gap-1">
																<div className="flex justify-between items-center text-body">
																	<span className="font-bold text-foreground">{ods.ods}</span>
																	<span className="font-bold text-foreground">
																		{pct}% <span className="text-caption text-muted-foreground">({ods.count})</span>
																	</span>
																</div>
																<div className="w-full bg-muted rounded-full h-2">
																	<div className="bg-action h-2 rounded-full" style={{ width: `${pct}%` }} />
																</div>
															</div>
														)
													})}
												</div>
											</div>
											<div>
												<h4 className="text-label text-muted-foreground mb-3 flex items-center gap-2">
													<Building2 className="w-4 h-4" /> Concentração por Órgão Superior
												</h4>
												<div className="space-y-3">
													{topOsByCount.slice(0, 5).map((os, idx) => {
														const pct = ((os.count / totalInconsistencias) * 100).toFixed(1)
														return (
															<div key={idx} className="flex justify-between items-center bg-muted/50 p-2 rounded-lg border border-border">
																<span className="text-subheading text-foreground">{os.os}</span>
																<span className="text-subheading text-foreground">{pct}%</span>
															</div>
														)
													})}
												</div>
											</div>
										</div>
									</div>

									{/* Decision support */}
									<div className="space-y-6">
										<StatTile
											icon={<DollarSign />}
											label="Impacto financeiro total"
											value={formatCurrency(totalFinancialImpact)}
											hint="volume total em risco contábil"
											status="success"
										/>

										{/* Era um painel escuro (`bg-surface-inverted`, `shadow-xl`, texto branco)
										    no meio de uma grade clara — o único do app. */}
										<div className="bg-card p-6 rounded-xl border border-border">
											<div className="flex items-center gap-2 mb-6">
												<AlertOctagon className="w-5 h-5 text-warning" />
												<h3 className="text-heading text-foreground">Níveis críticos</h3>
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
													<div key={label} className="bg-muted/50 p-4 rounded-lg border border-border">
														<p className="text-label text-muted-foreground mb-1">{label}</p>
														<p className="text-subheading text-foreground">{value}</p>
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
										<div className="bg-card p-6 rounded-xl border border-border">
											<div className="flex items-center gap-2 mb-6">
												<Target className="w-5 h-5 text-foreground" />
												<h3 className="text-heading text-foreground">Visão Tática (SUCONT-3)</h3>
											</div>
											<div className="space-y-6">
												<div>
													<h4 className="text-label text-muted-foreground mb-3 flex items-center gap-2">
														<AlertTriangle className="w-4 h-4" /> Top UGs com Mais Inconsistências
													</h4>
													<div className="space-y-2">
														{topUgsByCount.slice(0, 5).map((ug, idx) => (
															<div key={idx} className="flex justify-between items-center bg-muted/50 p-2 rounded-lg border border-border">
																<div className="flex items-center gap-2">
																	<span className="text-caption text-muted-foreground w-4">{idx + 1}º</span>
																	<div>
																		<span className="text-subheading text-foreground block">
																			{getUgName(ug.ug)} ({ug.ug})
																		</span>
																		<span className="text-label text-muted-foreground">
																			{getOs(ug.ug)} / {getOds(ug.ug)}
																		</span>
																	</div>
																</div>
																<div className="flex items-center gap-3">
																	<span className="text-label text-muted-foreground">{getConferente(ug.ug)}</span>
																	<span className="text-subheading text-warning">{ug.count}</span>
																</div>
															</div>
														))}
													</div>
												</div>
												<div>
													<h4 className="text-label text-muted-foreground mb-3 flex items-center gap-2">
														<Wallet className="w-4 h-4" /> Contas Genéricas Mais Recorrentes
													</h4>
													<div className="space-y-2">
														{topContasByFreq.slice(0, 5).map((conta, idx) => (
															<div key={idx} className="flex justify-between items-center bg-muted/50 p-2 rounded-lg border border-border">
																<span className="text-subheading text-foreground">{conta.conta}</span>
																<span className="text-caption text-muted-foreground bg-muted px-2 py-1 rounded-full">{conta.count} ocorrências</span>
															</div>
														))}
													</div>
												</div>
											</div>
										</div>

										{/* Pareto + Priority */}
										<div className="space-y-6">
											<div className="bg-card p-6 rounded-xl border border-border">
												<div className="flex items-center gap-2 mb-4">
													<TrendingUp className="w-5 h-5 text-action" />
													<h3 className="text-heading text-foreground">Análise de Concentração (Pareto)</h3>
												</div>
												<div className="bg-action/10 p-4 rounded-xl border border-action/30 mb-4">
													<p className="text-subheading text-action leading-relaxed">
														<span className="text-display text-action">{paretoData?.ugPercentage}%</span> das UGs concentram{" "}
														<span className="text-display text-action">{paretoData?.inconsistencyPercentage}%</span> das inconsistências.
													</p>
												</div>
												<h4 className="text-label text-muted-foreground mb-3">UGs que compõem a concentração (Top 5)</h4>
												<div className="space-y-2">
													{paretoData?.topUgs.slice(0, 5).map((u, i) => (
														<div key={i} className="flex justify-between items-center text-caption p-2 bg-muted/50 rounded-lg">
															<span className="font-bold text-foreground">
																UG {u.ug} ({getUgName(u.ug)})
															</span>
															<span className="font-bold text-action">{u.count} itens</span>
														</div>
													))}
												</div>
											</div>

											<div className="bg-card p-6 rounded-xl border border-border">
												<div className="flex items-center gap-2 mb-4">
													<Target className="w-5 h-5 text-success" />
													<h3 className="text-heading text-foreground">Priorização de Atuação Imediata</h3>
												</div>
												<p className="text-label text-muted-foreground mb-4">Baseado em Score de Risco (Volume x Quantidade)</p>
												<div className="space-y-3">
													{priorityList.map((p, i) => (
														<div
															key={i}
															className="flex items-center gap-4 p-3 bg-muted/50 rounded-xl border border-border hover:bg-success/10 transition-colors"
														>
															<div className="w-8 h-8 bg-success text-success-foreground rounded-lg flex items-center justify-center text-subheading">
																{i + 1}º
															</div>
															<div className="flex-1">
																<p className="text-subheading text-foreground">
																	UG {p.ug} ({getUgName(p.ug)})
																</p>
																<p className="text-label text-muted-foreground">
																	{p.ods} | {formatCurrency(p.volume)}
																</p>
															</div>
															<div className="text-right">
																<p className="text-label text-muted-foreground">Score</p>
																<p className="text-heading text-success">{p.priorityScore}</p>
															</div>
														</div>
													))}
												</div>
											</div>
										</div>
									</div>

									{/* Conferente distribution */}
									<div className="bg-card p-6 rounded-xl border border-border">
										<div className="flex items-center gap-2 mb-6">
											<Award className="w-5 h-5 text-success" />
											<h3 className="text-heading text-foreground">Panorama de Distribuição SUCONT-3</h3>
										</div>
										<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
											{Object.entries(conferenteStats)
												.sort((a, b) => b[1].count - a[1].count)
												.map(([conf, stats]) => (
													<button
														type="button"
														key={conf}
														className="bg-muted/50 p-4 rounded-xl border border-border text-center hover:bg-success/10 transition-colors cursor-pointer focus-visible:ring-[3px] focus-visible:ring-ring/50"
														onClick={() => setConferenteFilter(conf)}
													>
														<p className="text-label text-muted-foreground mb-1">{conf}</p>
														<p className="text-display text-success">{stats.count}</p>
														<p className="text-label text-muted-foreground">Inconsistências</p>
													</button>
												))}
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
											{Object.entries(conferenteStats)
												.sort((a, b) => b[1].count - a[1].count)
												.map(([conferente, stats]) => (
													<div key={conferente} className="bg-muted/50 rounded-xl border border-border overflow-hidden flex flex-col">
														<div className="bg-muted px-4 py-3 border-b border-border flex justify-between items-center">
															<span className="text-label text-foreground">Conferente: {conferente}</span>
															<span className="px-2 py-1 bg-success/15 text-success text-hint rounded-full">{stats.count} Inconsistência(s)</span>
														</div>
														<div className="p-4 flex-1">
															<h4 className="text-label text-muted-foreground mb-2">UGs sob responsabilidade ({stats.ugs.length})</h4>
															<div className="flex flex-wrap gap-2">
																{stats.ugs.map((ug) => (
																	<span key={ug} className="px-2 py-1 bg-card border border-border text-caption text-foreground rounded shadow-sm">
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
									<div className="bg-card p-6 rounded-xl border border-border">
										<div className="flex items-center gap-2 mb-6">
											<Target className="w-5 h-5 text-foreground" />
											<h3 className="text-heading text-foreground">Panorama por Questão RAC</h3>
										</div>
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
											{RAC_QUESTIONS.map((q) => (
												<div key={q.id} className="bg-muted/50 p-5 rounded-xl border border-border hover:bg-action/5 transition-colors">
													<div className="flex justify-between items-start mb-3">
														<Badge variant="action">RAC {q.id}</Badge>
														<span className="text-caption text-foreground">{racStatsMap[q.id].ugs.size} UGs</span>
													</div>
													<p className="text-label text-muted-foreground mb-4 h-8 line-clamp-2">{q.description}</p>
													<div className="flex items-end justify-between">
														<div>
															<p className="text-label text-muted-foreground">Volume</p>
															<p className="text-subheading text-foreground">{formatCurrency(racStatsMap[q.id].volume)}</p>
														</div>
														<div className="text-right">
															<p className="text-label text-muted-foreground">Itens</p>
															<p className="text-subheading text-foreground">{racStatsMap[q.id].count}</p>
														</div>
													</div>
												</div>
											))}
										</div>
									</div>
								</div>
							)}

							{/* ODS Risk Map (both views) */}
							<div className="mt-8 bg-card p-6 rounded-xl border border-border">
								<div className="flex items-center justify-between mb-6">
									<div className="flex items-center gap-2">
										<Compass className="w-5 h-5 text-foreground" />
										<h3 className="text-heading text-foreground">Mapa de Risco por ODS</h3>
									</div>
									<span className="text-label text-muted-foreground">Distribuição do Risco</span>
								</div>
								<div className="overflow-x-auto">
									<table className="w-full text-left">
										<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
											<tr>
												{["ODS", "Inconsistências", "Saldo Associado", "% Total"].map((h) => (
													<th
														key={h}
														className={`px-4 py-3 ${h !== "ODS" ? "text-center" : ""} ${h === "Saldo Associado" || h === "% Total" ? "text-right" : ""}`}
													>
														{h}
													</th>
												))}
											</tr>
										</thead>
										<tbody className="divide-y divide-border">
											{odsRiskMap.map((item, idx) => (
												<tr key={idx} className="hover:bg-muted/50 transition-colors">
													<td className="py-4 font-bold text-foreground">{item.ods}</td>
													<td className="py-4 text-center font-bold text-muted-foreground">{item.count}</td>
													<td className="py-4 text-right font-bold text-success">{formatCurrency(item.volume)}</td>
													<td className="py-4 text-right">
														<span
															className={`px-2 py-1 rounded text-hint ${idx === 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}
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
							{/* Era o único painel com cabeçalho azul sólido, `shadow-2xl` e borda
							    dupla — o chat do monitoramento, que faz a mesma coisa, é um card. */}
							<div className="mt-8 bg-card rounded-xl border border-border overflow-hidden">
								<div className="p-4 border-b border-border">
									<SectionHeader
										icon={<Lightbulb />}
										title="Oráculo SUCONT"
										description="Inteligência artificial de apoio à decisão"
										actions={
											<>
												{["Qual ODS possui maior risco contábil?", "Quais são as 5 UGs mais críticas?", "Resuma o impacto financeiro total."].map((q) => (
													<Button key={q} type="button" size="sm" variant="outline" onClick={() => askOracle(q)}>
														{q.includes("ODS") ? "Risco ODS" : q.includes("5 UGs") ? "Top 5 UGs" : "Impacto"}
													</Button>
												))}
												<Button type="button" size="sm" variant="ghost" onClick={() => setChatMessages([])}>
													Limpar
												</Button>
											</>
										}
									/>
								</div>

								<div className="h-[400px] overflow-y-auto p-6 bg-muted/50 space-y-4">
									{chatMessages.length === 0 ? (
										<div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
											<MessageSquare className="w-16 h-16 text-foreground" />
											<p className="text-subheading text-muted-foreground max-w-xs">
												Olá! Eu sou o Oráculo SUCONT. Analisei os dados do relatório e estou pronto para responder suas perguntas estratégicas.
											</p>
										</div>
									) : (
										chatMessages.map((msg, i) => (
											<div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
												<div
													className={`max-w-[80%] p-4 rounded-xl shadow-sm ${
														msg.role === "user"
															? "bg-primary text-primary-foreground rounded-tr-none"
															: "bg-card text-foreground border border-border rounded-tl-none"
													}`}
												>
													<p className="text-body leading-relaxed whitespace-pre-wrap">{msg.text}</p>
												</div>
											</div>
										))
									)}
									{isAskingOracle && (
										<div className="flex justify-start">
											<div className="bg-card p-4 rounded-xl border border-border rounded-tl-none flex items-center gap-2">
												<div className="flex gap-1">
													{[0, 0.2, 0.4].map((delay) => (
														<div key={delay} className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: `${delay}s` }} />
													))}
												</div>
												<span className="text-label text-muted-foreground">Oráculo está analisando...</span>
											</div>
										</div>
									)}
								</div>

								<div className="p-4 bg-card border-t border-border">
									<div className="flex gap-2">
										<Input
											type="text"
											value={oracleInput}
											onChange={(e) => setOracleInput(e.target.value)}
											onKeyDown={(e) => e.key === "Enter" && askOracle()}
											placeholder="Pergunte ao Oráculo sobre o risco contábil..."
											className="flex-1"
										/>
										<Button size="icon" aria-label="Enviar pergunta" onClick={() => askOracle()} disabled={isAskingOracle || !oracleInput.trim()}>
											<ArrowRight className="w-5 h-5" />
										</Button>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* OPERACIONAL + no found */}
					{!foundAny ? (
						<Alert variant="success">
							<CheckCircle />
							<AlertTitle>Acompanhamento concluído</AlertTitle>
							<AlertDescription>Nenhuma inconsistência foi identificada no relatório analisado. A situação contábil está regular.</AlertDescription>
						</Alert>
					) : (
						activeView === "operacional" && (
							<div className="space-y-10">
								<SectionHeader
									icon={<Compass />}
									title="Retrato das inconsistências"
									description="Ações de cobrança e auditoria SUCONT-3"
									actions={
										<SegmentedControl
											label="Modo de mensagem"
											value={messageMode}
											onValueChange={setMessageMode}
											options={[
												{ value: "individual", label: "Mensagens individuais" },
												{ value: "unica", label: "Mensagem única (agrupada)" },
											]}
										/>
									}
								/>

								{/* Filtro no corpo, com rótulo — o segmentado do hub, não N botões
								    pintados de `tech-blue`/`success` conforme o estado. */}
								<div className="flex flex-col gap-2">
									<span className="text-label text-muted-foreground">Filtrar por responsável</span>
									<SegmentedControl
										label="Filtrar por responsável"
										value={conferenteFilter ?? "all"}
										onValueChange={(value) => setConferenteFilter(value === "all" ? null : value)}
										options={[{ value: "all", label: "Todos" }, ...CONFERENTES.map((conf) => ({ value: conf, label: conf }))]}
									/>
								</div>

								{/* Única message */}
								{messageMode === "unica" && singleMessage ? (
									<div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col lg:flex-row">
										<div className="lg:w-1/3 border-b lg:border-b-0 lg:border-r border-border bg-muted/30 flex flex-col">
											<div className="p-6 border-b border-border bg-card">
												<div className="flex items-center gap-3 mb-4">
													<div className="w-10 h-10 bg-action/10 rounded-lg flex items-center justify-center">
														<MessageSquare className="w-6 h-6 text-foreground" />
													</div>
													<div>
														<h3 className="text-heading text-foreground">Mensagem Única</h3>
														<div className="text-label text-muted-foreground">Agrupamento Geral</div>
													</div>
												</div>
												<p className="text-body text-muted-foreground mb-4">
													Consolida as inconsistências de todas as UGs filtradas. Ideal para envio coletivo.
												</p>
											</div>
											<div className="p-6 flex-1 bg-muted/50">
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
										<div className="p-6 flex-1 bg-muted/30">
											<div className="relative flex h-full flex-col">
												<EditableMessage
													label="Mensagem institucional consolidada"
													value={singleMessage.text}
													onChange={singleMessage.setText}
													onReset={singleMessage.reset}
													isEdited={singleMessage.isEdited}
													isStale={singleMessage.isStale}
													className="h-full"
													textClassName="rounded-xl bg-card p-6 pr-16 font-mono"
												/>
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																size="icon-sm"
																aria-label="Copiar Mensagem"
																onClick={() => {
																	copyToClipboard(singleMessage.text, "unica")
																}}
																variant="outline"
																className="absolute top-4 right-4"
															>
																{copiedUg === "unica" ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
															</Button>
														}
													/>
													<TooltipContent>Copiar Mensagem</TooltipContent>
												</Tooltip>
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
											const message = drafts.of(ug, generateMessage(ug, contas))
											let ugTotalBalance = 0
											for (const regs of Object.values(contas)) {
												for (const reg of regs) ugTotalBalance += reg.saldo
											}

											return (
												<div key={ug} className="bg-card rounded-xl border border-border overflow-hidden flex flex-col lg:flex-row">
													{/* Left: data portrait */}
													<div className="lg:w-5/12 border-b lg:border-b-0 lg:border-r border-border bg-muted/30 flex flex-col">
														<div className="p-6 border-b border-border bg-card">
															<div className="flex items-center justify-between mb-2">
																<div className="flex items-center gap-3">
																	<div className="w-10 h-10 bg-action/10 rounded-lg flex items-center justify-center">
																		<Building2 className="w-6 h-6 text-foreground" />
																	</div>
																	<div>
																		<h3 className="text-heading text-foreground">UG {ug}</h3>
																		<div className="text-label text-muted-foreground mb-1">
																			{getUgName(ug)} ({ug}), subordinada ao {getOs(ug)} / {getOds(ug)}
																		</div>
																		<div className="military-label">Conferente: {getConferente(ug)}</div>
																	</div>
																</div>
																<Badge variant="warning">{Object.keys(contas).length} alerta(s)</Badge>
															</div>
															<div className="mt-4 p-3 bg-action/5 rounded-xl border border-border">
																<p className="text-label text-muted-foreground mb-1">Saldo Consolidado</p>
																<p className="text-display text-foreground">{formatCurrency(ugTotalBalance)}</p>
															</div>
														</div>
														<div className="p-6 flex-1 overflow-y-auto">
															<h4 className="military-label mb-4">Dossiê de Inconsistências</h4>
															<div className="space-y-4">
																{Object.entries(contas).map(([conta, regs]) => (
																	<div key={conta} className="bg-card rounded-xl p-4 border border-border shadow-sm relative overflow-hidden group">
																		<div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
																			<FileSpreadsheet className="w-12 h-12" />
																		</div>
																		<div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
																			<Wallet className="w-4 h-4 text-foreground" />
																			<span className="font-mono font-bold text-foreground">{conta}</span>
																		</div>
																		<div className="space-y-2">
																			{regs.map((reg, idx) => (
																				<div key={idx} className="flex items-center justify-between text-body">
																					<div className="flex items-center gap-1.5 text-muted-foreground text-label">
																						<Calendar className="w-3.5 h-3.5 text-warning" />
																						<span>{reg.mes}</span>
																					</div>
																					<span className="font-bold text-foreground">{formatCurrency(reg.saldo)}</span>
																				</div>
																			))}
																		</div>
																	</div>
																))}
															</div>
														</div>
													</div>

													{/* Right: message action */}
													<div className="lg:w-7/12 flex flex-col bg-card">
														<div className="px-6 py-4 border-b border-border flex flex-col gap-4 bg-muted/50">
															<div className="flex items-center justify-between">
																<div className="flex flex-col gap-1">
																	<div className="flex items-center gap-2 text-foreground">
																		<FileText className="w-5 h-5" />
																		<h4 className="text-label">Mensagem Institucional Pronta</h4>
																	</div>
																	<p className="text-label text-muted-foreground">
																		UG {ug} — Conferente: {getConferente(ug)}
																		<br />
																		<span className="text-warning">Inconsistência identificada: utilização de conta contábil genérica.</span>
																	</p>
																</div>
																<Button type="button" onClick={() => copyToClipboard(message.text, ug)} variant={copiedUg === ug ? "success" : "default"}>
																	{copiedUg === ug ? (
																		<>
																			<Check className="w-4 h-4" /> Copiado
																		</>
																	) : (
																		<>
																			<Copy className="w-4 h-4" /> Copiar Mensagem
																		</>
																	)}
																</Button>
															</div>

															<div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
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
														<div className="p-6 flex-1 bg-muted/30">
															<EditableMessage
																label={`Mensagem institucional da UG ${ug}`}
																value={message.text}
																onChange={message.setText}
																onReset={message.reset}
																isEdited={message.isEdited}
																isStale={message.isStale}
																className="h-full"
																textClassName="rounded-xl bg-card p-6 font-mono"
															/>
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
		"px-2 py-1 bg-muted/50 border border-border rounded text-caption text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-tech-blue transition-all"

	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="flex items-center gap-3 bg-card px-3 py-1.5 rounded-lg border border-border">
				<span className="text-label text-muted-foreground">Nº Mensagem:</span>
				<Input type="text" value={msgNumber} onChange={(e) => setMsgNumber(e.target.value)} placeholder="Ex: 001" className={`${inputCls} w-16 text-center`} />
			</div>
			<div className="flex items-center gap-3 bg-card px-3 py-1.5 rounded-lg border border-border">
				<span className="text-label text-muted-foreground">Data:</span>
				<Input type="date" value={msgDate} onChange={(e) => setMsgDate(e.target.value)} className={inputCls} />
			</div>
			<div className="flex items-center gap-3 bg-card px-3 py-1.5 rounded-lg border border-border">
				<span className="text-label text-muted-foreground">Tipo:</span>
				<Select
					items={{ sem_prazo: "Sem Prazo", prazo: "Com Prazo", alerta: "Apenas Alerta" }}
					value={messageType}
					onValueChange={(value) => setMessageType(value as typeof messageType)}
				>
					<SelectTrigger className={`data-[size=default]:h-auto shadow-none ${inputCls}`}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="sem_prazo">Sem Prazo</SelectItem>
						<SelectItem value="prazo">Com Prazo</SelectItem>
						<SelectItem value="alerta">Apenas Alerta</SelectItem>
					</SelectContent>
				</Select>
			</div>
			{messageType === "prazo" && (
				<div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2 duration-300 bg-card px-3 py-1.5 rounded-lg border border-border">
					<span className="text-label text-foreground">Data Limite:</span>
					<Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
				</div>
			)}
		</div>
	)
}
