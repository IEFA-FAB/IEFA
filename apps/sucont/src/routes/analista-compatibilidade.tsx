import { createFileRoute } from "@tanstack/react-router"
import {
	AlertCircle,
	AlertTriangle,
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
	Search,
	ShieldAlert,
	TrendingDown,
	Upload,
	Users,
} from "lucide-react"
import { type ChangeEvent, useCallback, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts"
import * as XLSX from "xlsx"
import { HubLayout } from "#/components/hub-layout"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip"
import { chartChrome } from "#/lib/chart-theme"
import { agregarSaldos, compararPares, type LinhaSaldo, PARES } from "#/lib/compatibilidade/pares"
import { getUg } from "#/lib/ug/registry"

export const Route = createFileRoute("/analista-compatibilidade")({
	component: AnalistaCompatibilidade,
})

/**
 * Conferentes da seção, e o nome como ele aparece na coluna da planilha.
 *
 * Um só lugar: a lista de abas e o filtro liam a mesma informação de dois pontos
 * diferentes — a lista de botões trazia os primeiros nomes, e uma cadeia de
 * `else if` trazia as matrículas. Incluir alguém exigia lembrar dos dois.
 */
const CONFERENTE_NA_PLANILHA: Record<string, string> = {
	Jefferson: "1T JEFFERSON LUÍS",
	Érika: "1T ÉRIKA VICENTE",
	Eliana: "1S ELIANA",
	Pâmela: "2S PÂMELA",
}

const CONFERENTES = Object.keys(CONFERENTE_NA_PLANILHA)

// ─── Constants ────────────────────────────────────────────────────────────────

const PAIRS = PARES

// Paleta CATEGÓRICA de visualização: existe para distinguir categorias entre si.
// Fica em hex explícito de propósito (ver STYLE_CONTRACT §8) — mapeá-la para
// tokens de estado colapsa cores diferentes na mesma e a legenda passa a afirmar
// que duas categorias são a mesma coisa.
const PAIR_COLORS = ["#ef4444", "#f97316", "#eab308"]

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
		const linhas: LinhaSaldo[] = []

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

			linhas.push({ ug, conta, saldo })
		}

		// `agregarSaldos` SOMA por UG × conta. O relatório do Tesouro Gerencial pode
		// trazer mais de uma linha para o mesmo par (por conta corrente, mês ou fonte);
		// a versão anterior guardava só a última linha do arquivo e descartava o resto
		// em silêncio, produzindo divergência onde o par estava equilibrado.
		const ugs = agregarSaldos(linhas)

		const newReports: UGReport[] = []

		for (const ug in ugs) {
			const { divergentes, totalDiff } = compararPares(ugs[ug])

			const chartData = divergentes.map(({ par, indice, absDiff }) => ({
				name: `Par ${indice + 1}`,
				description: `${par.a} (${par.nameA}) × ${par.b} (${par.nameB})`,
				value: absDiff,
				color: PAIR_COLORS[indice],
				question: par.question,
			}))

			const divergentPairs: DivergentPair[] = divergentes.map(({ par, saldoA, saldoB, diff, hasA, hasB }) => ({
				...par,
				saldoA,
				saldoB,
				diff,
				hasA,
				hasB,
			}))

			const divergencias = divergentes.map(({ par, indice, saldoA, saldoB, diff, hasA, hasB }) => {
				const displayA = hasA && saldoA !== undefined ? formatCurrency(saldoA) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"
				const displayB = hasB && saldoB !== undefined ? formatCurrency(saldoB) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"

				return `
${indice + 1}) Conta ${par.a} - ${par.nameA} × Conta ${par.b} - ${par.nameB}

Saldo da conta ${par.a}: ${displayA}
Saldo da conta ${par.b}: ${displayB}

Diferença apurada: ${formatCurrency(diff)}
`.trim()
			})

			// A lista de divergentes manda, não o somatório: par com um lado só e saldo
			// zerado do outro é divergência (falta o registro espelhado) com `absDiff`
			// zero. Comparando `totalDiff > 0`, essa UG sumia do relatório — e, se fosse
			// a única, a tela dizia "nenhuma divergência encontrada".
			if (divergentes.length > 0) {
				const ugMatch = ug.match(/\d{6}/)
				const ugCode = ugMatch ? ugMatch[0] : ug
				const metadata = getUg(ugCode)
				const ugName = metadata ? metadata.sigla : ug.includes(" - ") ? ug.split(" - ")[1] : ug
				const superior = metadata?.orgaoSuperior ?? "Não Identificado"
				const ods = metadata?.ods ?? "Não Identificado"
				const conferente = metadata?.conferente ?? "Não Identificado"

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
					const displayA = p.hasA ? formatCurrency(p.saldoA ?? 0) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"
					const displayB = p.hasB ? formatCurrency(p.saldoB ?? 0) : "CONTA NÃO LOCALIZADA NO RELATÓRIO"
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
			// `fill` além de `color`: o recharts só lê `fill` da linha — para o setor, para a
			// legenda e para o marcador do tooltip. `color` segue servindo as listas em HTML.
			fill: PAIR_COLORS[p.id - 1],
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
			targetConferente = CONFERENTE_NA_PLANILHA[userProfile] ?? targetConferente
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
		<HubLayout
			width="wide"
			actions={
				reports.length > 0 && (
					<Button type="button" variant="outline" size="sm" onClick={handleReset}>
						<RefreshCw className="w-3.5 h-3.5" />
						Nova análise
					</Button>
				)
			}
		>
			{/*
			 * "Identificar-se" é filtro da tela, não navegação: fica no corpo, com
			 * rótulo, e não no cabeçalho fixo. Antes era um bloco de `<button>`
			 * nativos sem `role="tab"` — não dava para trocar de conferente pelo
			 * teclado.
			 */}
			<div className="mb-8 flex flex-col gap-2">
				<span className="text-label text-muted-foreground">Identificar-se</span>
				<SegmentedControl
					label="Identificar-se"
					value={userProfile ?? "all"}
					onValueChange={(value) => {
						const next = value === "all" ? null : value
						setUserProfile(next)
						setConferenteFilter(next ? "minhas" : "all")
					}}
					options={[{ value: "all", label: "Todos" }, ...CONFERENTES.map((name) => ({ value: name, label: name }))]}
				/>
			</div>

			{/* ── Upload section ─────────────────────────────────────────────────── */}
			{reports.length === 0 && (
				<div className="space-y-6">
					{/* Info cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						<div className="bg-card p-6 rounded-xl shadow-sm border border-border hover:border-action/50 transition-colors">
							<div className="bg-action/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
								<Search className="w-6 h-6 text-foreground" />
							</div>
							<h3 className="text-heading text-foreground mb-2">O que está sendo analisado</h3>
							<p className="text-body text-muted-foreground leading-relaxed">
								Análise de conformidade entre saldos de contas de controle e contas patrimoniais (ex: Cauções, Almoxarifado e Bens Móveis em Trânsito),
								identificando inconsistências nos registros das Unidades Gestoras.
							</p>
						</div>

						<div className="bg-card p-6 rounded-xl shadow-sm border border-border hover:border-action/50 transition-colors">
							<div className="bg-action/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
								<BookOpen className="w-6 h-6 text-foreground" />
							</div>
							<h3 className="text-heading text-foreground mb-2">Referencial Teórico (RAC)</h3>
							<p className="text-body text-muted-foreground leading-relaxed">
								Baseado no Roteiro de Acompanhamento Contábil (RAC) da SUCONT-3, o aplicativo orienta a atuação da Setorial Contábil para garantir a
								fidedignidade do balanço patrimonial do COMAER.
							</p>
						</div>

						<div className="bg-card p-6 rounded-xl shadow-sm border border-border hover:border-action/50 transition-colors">
							<div className="bg-action/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4">
								<MessageSquareText className="w-6 h-6 text-foreground" />
							</div>
							<h3 className="text-heading text-foreground mb-2">Mensagens Automáticas</h3>
							<p className="text-body text-muted-foreground leading-relaxed">
								Geração instantânea de mensagens padronizadas de cobrança e orientação para as UGs, prontas para envio via SAU, otimizando o processo de
								regularização contábil.
							</p>
						</div>
					</div>

					{/* Upload card */}
					<div className="bg-card rounded-xl shadow-sm border border-border p-6">
						<h2 className="text-heading mb-4 flex items-center gap-2 text-foreground">
							<FileSpreadsheet className="w-5 h-5 text-action" />
							Importar Relatório
						</h2>

						<div className="mb-6 bg-action/5 border border-action/30 rounded-xl p-4">
							<div className="flex items-start gap-3">
								<Info className="w-5 h-5 text-action shrink-0 mt-0.5" />
								<div>
									<h3 className="text-subheading text-foreground mb-1.5">Caminho do Relatório no Tesouro Gerencial:</h3>
									<div className="text-caption text-muted-foreground leading-relaxed flex flex-wrap items-center gap-x-1.5 gap-y-1">
										<span className="font-medium text-foreground">TESOURO GERENCIAL</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span>Relatórios Compartilhados</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span>Consultas Gerenciais</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span>Relatórios de Bancada dos Órgãos Superiores</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span>52000 - Ministério da Defesa</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span>52111 - Comando da Aeronáutica</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span>SEFA</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span>DIREF</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span>SUCONT-3 - ACOMPANHAMENTO</span>
										<ChevronRight className="w-3 h-3 text-muted-foreground" />
										<span className="font-bold text-foreground">ACOMPANHAMENTO CONTÁBIL - SUCONT-3.1</span>
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
								className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isProcessing ? "border-border bg-muted" : "border-action/30 bg-action/5 hover:bg-action/10"}`}
							>
								<Upload className={`w-8 h-8 mx-auto mb-3 ${isProcessing ? "text-muted-foreground" : "text-foreground"}`} />
								{isProcessing ? (
									<p className="text-muted-foreground font-medium">Processando planilha...</p>
								) : fileName ? (
									<div>
										<p className="text-foreground font-medium">{fileName}</p>
										<p className="text-muted-foreground text-body mt-1">Clique ou arraste outro arquivo para substituir</p>
									</div>
								) : (
									<div>
										<p className="text-foreground font-medium">Clique ou arraste o arquivo do Tesouro Gerencial (.xlsx)</p>
										<p className="text-muted-foreground text-body mt-1">Colunas necessárias: UG, Conta Contábil, Saldo</p>
									</div>
								)}
							</div>
						</div>

						{error && (
							<div className="mt-4 p-4 bg-destructive/10 text-destructive rounded-lg flex items-start gap-3 text-body">
								<AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
								<p>{error}</p>
							</div>
						)}
					</div>
				</div>
			)}

			{/* ── Results section ────────────────────────────────────────────────── */}
			{reports.length > 0 && (
				<div className="space-y-6">
					{/* Tab switcher */}
					<div className="flex items-center gap-2 border-b border-border pb-4">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setActiveTab("operacional")}
							className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-subheading transition-all ${activeTab === "operacional" ? "bg-tech-blue text-surface-inverted-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-muted border border-border"}`}
						>
							<FileText className="w-4 h-4" />
							Visão Operacional (UGs)
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setActiveTab("gerencial")}
							className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-subheading transition-all ${activeTab === "gerencial" ? "bg-tech-blue text-surface-inverted-foreground shadow-md" : "bg-card text-muted-foreground hover:bg-muted border border-border"}`}
						>
							<LayoutDashboard className="w-4 h-4" />
							Painel Gerencial (RAC)
						</Button>
					</div>

					{/* ── Operacional tab ─────────────────────────────────────────────── */}
					{activeTab === "operacional" && (
						<>
							{/* Filter bar */}
							<div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-xl shadow-sm border border-border">
								<div className="flex items-center gap-3">
									<div className="bg-success/15 p-2 rounded-lg">
										<CheckCircle2 className="w-6 h-6 text-success" />
									</div>
									<div>
										<h2 className="text-heading text-foreground">
											{filteredReports.length} {filteredReports.length === 1 ? "Unidade com Divergência" : "Unidades com Divergências"}
										</h2>
										<p className="text-body text-muted-foreground">
											{conferenteFilter === "all" && racFilter === "all"
												? "Panorama Geral"
												: `Filtrado por: ${conferenteFilter === "minhas" ? `Minhas UGs (${userProfile})` : conferenteFilter !== "all" ? conferenteFilter : ""} ${racFilter !== "all" ? (conferenteFilter !== "all" ? " + " : "") + racFilter : ""}`}
										</p>
									</div>
								</div>

								<div className="flex flex-wrap items-center gap-3">
									{/* RAC Question Filter */}
									<div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => setRacFilter("all")}
											className={`px-3 py-1.5 text-label rounded-md transition-all ${racFilter === "all" ? "bg-tech-blue text-surface-inverted-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
										>
											Todas Questões
										</Button>
										<Select value={racFilter !== "all" ? racFilter : null} onValueChange={(v) => setRacFilter(v ?? "all")}>
											<SelectTrigger className="data-[size=default]:h-auto rounded-none border-0 border-l border-border bg-transparent px-2 py-1.5 text-label text-muted-foreground shadow-none focus-visible:ring-0">
												<SelectValue placeholder="Filtrar por Questão RAC" />
											</SelectTrigger>
											<SelectContent>
												{racQuestionsList.map((q) => (
													<SelectItem key={q} value={q}>
														{q}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Conferente Filter */}
									<div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => setConferenteFilter("all")}
											className={`px-3 py-1.5 text-label rounded-md transition-all ${conferenteFilter === "all" ? "bg-tech-blue text-surface-inverted-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
										>
											Geral
										</Button>
										{userProfile && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={() => setConferenteFilter("minhas")}
												className={`px-3 py-1.5 text-label rounded-md transition-all ${conferenteFilter === "minhas" ? "bg-action text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
											>
												Minhas UGs
											</Button>
										)}
										<Select
											value={conferenteFilter !== "all" && conferenteFilter !== "minhas" ? conferenteFilter : null}
											onValueChange={(v) => setConferenteFilter(v ?? "all")}
										>
											<SelectTrigger className="data-[size=default]:h-auto rounded-none border-0 border-l border-border bg-transparent px-2 py-1.5 text-label text-muted-foreground shadow-none focus-visible:ring-0">
												<SelectValue placeholder="Todos" />
											</SelectTrigger>
											<SelectContent>
												{conferentesList.map((c) => (
													<SelectItem key={c} value={c}>
														{c}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{racFilter !== "all" && (
										<Tooltip>
											<TooltipTrigger
												render={
													<Button
														type="button"
														variant="success"
														onClick={copyRacSummary}
														className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-subheading transition-colors shadow-sm"
													>
														<Copy className="w-4 h-4" />
														Copiar Resumo {racFilter}
													</Button>
												}
											/>
											<TooltipContent>Copiar resumo simplificado para esta questão</TooltipContent>
										</Tooltip>
									)}

									<Button
										type="button"
										variant="ghost"
										onClick={copyAll}
										className="flex items-center gap-2 px-5 py-2.5 bg-tech-blue hover:bg-tech-blue/90 text-surface-inverted-foreground rounded-lg text-subheading transition-colors shadow-sm"
									>
										<Copy className="w-4 h-4" />
										Copiar Mensagens Filtradas
									</Button>
								</div>
							</div>

							{/* UG cards */}
							<div className="space-y-8">
								{racFilter !== "all" && filteredReports.length > 0 && (
									<div className="bg-action text-action-foreground px-6 py-4 rounded-xl shadow-md flex items-center gap-3">
										<BookOpen className="w-6 h-6" />
										<div>
											<h3 className="text-heading">{racFilter}</h3>
											<p className="text-action-foreground text-body">
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
										<div key={idx} className="bg-card rounded-xl shadow-md border border-border overflow-hidden flex flex-col">
											{/* Card header */}
											<div className="bg-gradient-to-r from-tech-blue to-tech-blue px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-tech-blue">
												<div className="flex items-center gap-3">
													<div className="bg-action text-foreground font-mono text-subheading px-2 py-1 rounded shadow-sm">#{idx + 1}</div>
													<h3 className="text-heading text-white flex flex-wrap items-center gap-3">
														{report.ugName} (UG {report.ugCode})
														<span className="text-caption bg-white/20 text-surface-inverted-accent px-2.5 py-1 rounded-md border border-white/10 flex items-center gap-1.5">
															<Building2 className="w-3.5 h-3.5" />
															{report.superior} / {report.ods}
														</span>
														<span className="text-caption bg-white/20 text-surface-inverted-accent px-2.5 py-1 rounded-md border border-white/10 flex items-center gap-1.5">
															<Users className="w-3.5 h-3.5" />
															Conferente: {report.conferente}
														</span>
													</h3>
												</div>
												<div className="flex items-center gap-2 bg-destructive/20 px-4 py-2 rounded-lg border border-destructive/30">
													<TrendingDown className="w-5 h-5 text-destructive" />
													<span className="text-destructive text-subheading">Diferença Total:</span>
													<span className="text-white font-bold">{formatCurrency(report.totalDiff)}</span>
												</div>
											</div>

											{/* Card body */}
											<div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border">
												{/* Left: Divergences */}
												<div className="p-6 lg:col-span-5 bg-muted/50 flex flex-col border-r border-border">
													<h4 className="text-label text-muted-foreground mb-6 flex items-center gap-2">
														<AlertTriangle className="w-4 h-4" />
														Evidenciação das Divergências
													</h4>
													<div className="flex-1 flex flex-col gap-4">
														{report.chartData.map((data, i) => (
															<div
																key={i}
																className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm relative overflow-hidden gap-3"
															>
																<div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: data.color }} />
																<div className="pl-2 flex-1">
																	<p className="text-label text-muted-foreground mb-1">{data.name}</p>
																	<p className="text-subheading text-foreground leading-snug">{data.description.split(" × ")[0]}</p>
																	<p className="text-caption text-muted-foreground my-0.5">×</p>
																	<p className="text-subheading text-foreground leading-snug">{data.description.split(" × ")[1]}</p>
																	<div className="mt-2 pt-2 border-t border-border">
																		<p className="text-label text-action mb-0.5">Controle Interno SUCONT-3:</p>
																		<p className="text-hint text-muted-foreground leading-tight italic">{data.question}</p>
																	</div>
																</div>
																<div className="sm:text-right pl-2 sm:pl-0 border-t sm:border-t-0 border-border pt-2 sm:pt-0 mt-2 sm:mt-0">
																	<p className="text-label text-muted-foreground mb-1">Diferença</p>
																	<p className="text-heading" style={{ color: data.color }}>
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
														<h4 className="text-label text-muted-foreground">Mensagem Institucional</h4>

														<div className="flex flex-wrap items-center gap-3">
															<div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
																<label htmlFor={`msg-num-${report.ug}`} className="text-caption text-muted-foreground whitespace-nowrap">
																	Nº da Mensagem:
																</label>
																<Input
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
																	className="w-16 px-2 py-1 text-body border border-border rounded focus:ring-1 focus:ring-action focus:border-action outline-none bg-card"
																/>
															</div>

															<div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
																<label htmlFor={`msg-date-${report.ug}`} className="text-caption text-muted-foreground whitespace-nowrap">
																	Data:
																</label>
																<Input
																	id={`msg-date-${report.ug}`}
																	type="date"
																	value={currentMsgDate}
																	onChange={(e) =>
																		setMsgDates((prev) => ({
																			...prev,
																			[report.ug]: e.target.value,
																		}))
																	}
																	className="px-2 py-1 text-body border border-border rounded focus:ring-1 focus:ring-action focus:border-action outline-none bg-card"
																/>
															</div>

															<div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
																<label htmlFor={`msg-subject-${report.ug}`} className="text-caption text-muted-foreground whitespace-nowrap">
																	Assunto:
																</label>
																<Input
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
																	className="w-48 px-2 py-1 text-body border border-border rounded focus:ring-1 focus:ring-action focus:border-action outline-none bg-card"
																/>
															</div>

															<div className="flex items-center bg-muted p-1 rounded-lg border border-border">
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() =>
																		setMessageTypes((prev) => ({
																			...prev,
																			[report.ug]: "com_prazo",
																		}))
																	}
																	className={`px-3 py-1.5 text-caption rounded-md transition-all ${msgType === "com_prazo" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
																>
																	Com Prazo
																</Button>
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() =>
																		setMessageTypes((prev) => ({
																			...prev,
																			[report.ug]: "sem_prazo",
																		}))
																	}
																	className={`px-3 py-1.5 text-caption rounded-md transition-all ${msgType === "sem_prazo" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
																>
																	Sem Prazo
																</Button>
																<Button
																	type="button"
																	variant="ghost"
																	size="sm"
																	onClick={() =>
																		setMessageTypes((prev) => ({
																			...prev,
																			[report.ug]: "alerta",
																		}))
																	}
																	className={`px-3 py-1.5 text-caption rounded-md transition-all ${msgType === "alerta" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
																>
																	Alerta
																</Button>
															</div>

															{msgType === "com_prazo" && (
																<div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
																	<CalendarClock className="w-4 h-4 text-muted-foreground" />
																	<label htmlFor={`msg-prazo-${report.ug}`} className="text-caption text-muted-foreground whitespace-nowrap">
																		Prazo:
																	</label>
																	<Input
																		id={`msg-prazo-${report.ug}`}
																		type="date"
																		value={currentPrazo}
																		onChange={(e) =>
																			setPrazos((prev) => ({
																				...prev,
																				[report.ug]: e.target.value,
																			}))
																		}
																		className="px-2 py-1 text-body border border-border rounded focus:ring-1 focus:ring-action focus:border-action outline-none bg-card"
																	/>
																</div>
															)}

															<Button
																type="button"
																variant="ghost"
																onClick={() => copyToClipboard(msgText)}
																className="flex items-center gap-1.5 px-3 py-1.5 bg-action/10 hover:bg-action/20 text-foreground rounded-lg text-subheading transition-colors border border-action/30 whitespace-nowrap"
															>
																<Copy className="w-4 h-4" />
																Copiar
															</Button>
														</div>
													</div>

													<div className="bg-muted rounded-xl p-5 border border-border flex-1">
														<pre className="whitespace-pre-wrap font-mono text-body text-foreground leading-relaxed">{msgText}</pre>
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
								<div className="bg-card p-6 rounded-xl shadow-sm border border-border flex flex-col">
									<p className="text-label text-muted-foreground mb-1">Total de UGs com Divergência</p>
									<p className="text-display text-foreground">{reports.length}</p>
								</div>
								<div className="bg-card p-6 rounded-xl shadow-sm border border-border flex flex-col">
									<p className="text-label text-muted-foreground mb-1">Volume Financeiro Total</p>
									<p className="text-display text-destructive">{formatCurrency(managerialData.totalVolume)}</p>
								</div>
								<div className="bg-card p-6 rounded-xl shadow-sm border border-border flex flex-col">
									<p className="text-label text-muted-foreground mb-1">Média por UG</p>
									<p className="text-display text-warning">{formatCurrency(managerialData.totalVolume / reports.length)}</p>
								</div>
							</div>

							{/* Charts */}
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
								{/* Bar chart: Top 5 UGs */}
								<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
									<h3 className="text-heading text-foreground mb-4 flex items-center gap-2">
										<BarChart3 className="w-5 h-5 text-action" />
										Top 5 UGs por Volume de Divergência
									</h3>
									<div className="h-72">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={managerialData.topUGs} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
												<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartChrome.grid} />
												<XAxis type="number" tickFormatter={(value: number) => `R$ ${(value / 1000000).toFixed(1)}M`} stroke={chartChrome.axis} fontSize={12} />
												<YAxis dataKey="name" type="category" stroke={chartChrome.axis} fontSize={12} fontWeight="bold" />
												<RechartsTooltip
													formatter={(value) => formatCurrency(typeof value === "number" ? value : Number(value))}
													labelFormatter={(label, payload) => {
														const first = payload?.[0]?.payload
														if (first) {
															return `${String(label)} — Conferente: ${first.conferente}`
														}
														return String(label)
													}}
													cursor={{ fill: chartChrome.surfaceMuted }}
													contentStyle={{
														borderRadius: "8px",
														border: "none",
														boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
													}}
												/>
												<Bar dataKey="volume" fill="var(--series-siafi)" radius={[0, 4, 4, 0]} barSize={32} />
											</BarChart>
										</ResponsiveContainer>
									</div>
								</div>

								{/* Pie chart: Pairs */}
								<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
									<h3 className="text-heading text-foreground mb-4 flex items-center gap-2">
										<PieChartIcon className="w-5 h-5 text-action" />
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
												/>
												<RechartsTooltip
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
							<div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
								<div className="bg-muted/50 border-b border-border px-6 py-4">
									<h3 className="text-heading text-foreground flex items-center gap-2">
										<Building2 className="w-5 h-5 text-action" />
										Distribuição por Órgão Superior
									</h3>
								</div>
								<div className="p-6">
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
										{managerialData.superiorStats.map((sup, idx) => (
											<div key={idx} className="bg-muted/50 rounded-xl border border-border p-5 flex flex-col">
												<div className="flex items-center justify-between mb-4 border-b border-border pb-3">
													<h4 className="font-bold text-foreground flex items-center gap-2">
														<Building2 className="w-4 h-4 text-muted-foreground" />
														{sup.name}
													</h4>
													<span className="bg-action/15 text-action text-label px-2 py-1 rounded-full">
														{sup.count} UG{sup.count > 1 ? "s" : ""}
													</span>
												</div>
												<div className="flex-1">
													<p className="text-label text-muted-foreground mb-2">Unidades com Inconsistências:</p>
													<div className="flex flex-wrap gap-1.5">
														{sup.ugs.map((ug, i) => (
															<span key={i} className="text-caption bg-card border border-border text-foreground px-2 py-1 rounded-md shadow-sm">
																{ug.includes(" - ") ? `${ug.split(" - ")[1]} (${ug.split(" - ")[0]})` : `UG ${ug}`}
															</span>
														))}
													</div>
												</div>
												<div className="mt-4 pt-3 border-t border-border">
													<p className="text-caption text-muted-foreground">
														Volume Total: <span className="font-bold text-foreground">{formatCurrency(sup.volume)}</span>
													</p>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>

							{/* Distribution: ODS */}
							<div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
								<div className="bg-muted/50 border-b border-border px-6 py-4">
									<h3 className="text-heading text-foreground flex items-center gap-2">
										<LayoutDashboard className="w-5 h-5 text-action" />
										Distribuição por ODS (Órgão de Direção Setorial)
									</h3>
								</div>
								<div className="p-6">
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
										{managerialData.odsStats.map((ods, idx) => (
											<div key={idx} className="bg-muted/50 rounded-xl border border-border p-5 flex flex-col">
												<div className="flex items-center justify-between mb-4 border-b border-border pb-3">
													<h4 className="font-bold text-foreground flex items-center gap-2">
														<LayoutDashboard className="w-4 h-4 text-muted-foreground" />
														{ods.name}
													</h4>
													<span className="bg-success/15 text-success text-label px-2 py-1 rounded-full">
														{ods.count} UG{ods.count > 1 ? "s" : ""}
													</span>
												</div>
												<div className="flex-1">
													<p className="text-label text-muted-foreground mb-2">Unidades com Inconsistências:</p>
													<div className="flex flex-wrap gap-1.5">
														{ods.ugs.map((ug, i) => (
															<span key={i} className="text-caption bg-card border border-border text-foreground px-2 py-1 rounded-md shadow-sm">
																{ug.includes(" - ") ? `${ug.split(" - ")[1]} (${ug.split(" - ")[0]})` : `UG ${ug}`}
															</span>
														))}
													</div>
												</div>
												<div className="mt-4 pt-3 border-t border-border">
													<p className="text-caption text-muted-foreground">
														Volume Total: <span className="font-bold text-foreground">{formatCurrency(ods.volume)}</span>
													</p>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>

							{/* Distribution: Conferente */}
							<div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
								<div className="bg-muted/50 border-b border-border px-6 py-4">
									<h3 className="text-heading text-foreground flex items-center gap-2">
										<Users className="w-5 h-5 text-action" />
										Filtro Gerencial por Conferente
									</h3>
								</div>
								<div className="p-6">
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
										{managerialData.conferenteStats.map((conf, idx) => (
											<div key={idx} className="bg-muted/50 rounded-xl border border-border p-5 flex flex-col">
												<div className="flex items-center justify-between mb-4 border-b border-border pb-3">
													<h4 className="font-bold text-foreground flex items-center gap-2">
														<Users className="w-4 h-4 text-muted-foreground" />
														{conf.name}
													</h4>
													<span className="bg-destructive/15 text-destructive text-label px-2 py-1 rounded-full">
														{conf.count} UG{conf.count > 1 ? "s" : ""}
													</span>
												</div>
												<div className="flex-1">
													<p className="text-label text-muted-foreground mb-2">Unidades com Inconsistências:</p>
													<div className="flex flex-wrap gap-1.5">
														{conf.ugs.map((ug, i) => (
															<span key={i} className="text-caption bg-card border border-border text-foreground px-2 py-1 rounded-md shadow-sm">
																{ug.includes(" - ") ? `${ug.split(" - ")[1]} (${ug.split(" - ")[0]})` : `UG ${ug}`}
															</span>
														))}
													</div>
												</div>
												<div className="mt-4 pt-3 border-t border-border">
													<p className="text-caption text-muted-foreground">
														Volume Total: <span className="font-bold text-foreground">{formatCurrency(conf.volume)}</span>
													</p>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>

							{/* Risk analysis */}
							<div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
								<div className="bg-muted/50 border-b border-border px-6 py-4">
									<h3 className="text-heading text-foreground flex items-center gap-2">
										<ShieldAlert className="w-5 h-5 text-action" />
										Análise de Risco e Contexto Metodológico (RAC)
									</h3>
								</div>
								<div className="p-6 space-y-6">
									{managerialData.pairStats.map((pair, idx) => {
										if (pair.count === 0) return null
										return (
											<div key={idx} className="flex flex-col md:flex-row gap-4 pb-6 border-b border-border last:border-0 last:pb-0">
												<div className="md:w-1/3">
													<div className="flex items-center gap-2 mb-2">
														<div className="w-3 h-3 rounded-full" style={{ backgroundColor: pair.color }} />
														<h4 className="font-bold text-foreground">{pair.name}</h4>
													</div>
													<p className="text-subheading text-muted-foreground mb-1">{pair.description.split(" × ")[0]}</p>
													<p className="text-subheading text-muted-foreground">{pair.description.split(" × ")[1]}</p>
													<div className="mt-3 bg-muted/50 p-3 rounded-lg border border-border">
														<p className="text-label text-muted-foreground mb-1">Volume Envolvido</p>
														<p className="text-heading text-foreground">{formatCurrency(pair.volume)}</p>
													</div>
												</div>
												<div className="md:w-2/3 bg-action/5 p-4 rounded-xl border border-action/30">
													<h5 className="text-subheading text-foreground mb-2">Objetivo da Verificação:</h5>
													<p className="text-body text-foreground mb-4 leading-relaxed">
														{pair.name === "Par 1"
															? "Garantir que os saldos de caução em espécie registrados no ativo (1.1.1.1.1.19.03) estejam integralmente refletidos na conta de controle (8.1.1.1.1.01.13)."
															: "Garantir a compatibilidade entre os saldos dos sistemas SIAFI e SILOMS, assegurando que os bens em trânsito ou enviados estejam corretamente registrados e baixados."}
													</p>
													<h5 className="text-subheading text-destructive mb-2">Risco Contábil Associado:</h5>
													<p className="text-body text-foreground leading-relaxed">
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
