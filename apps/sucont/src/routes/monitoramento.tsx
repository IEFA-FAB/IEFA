import { createFileRoute } from "@tanstack/react-router"
import {
	AlertCircle,
	AlertTriangle,
	BarChart3,
	BookOpen,
	Building2,
	CheckCircle2,
	DollarSign,
	FileText,
	Lightbulb,
	MessageSquare,
	PieChart as PieChartIcon,
	Search,
	ShieldAlert,
	Target,
	Trash2,
	TrendingUp,
	Users,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import * as XLSX from "xlsx"
import { ChatAssistant } from "#/components/analista/chat-assistant"
import { ConsolidatedMessageCard } from "#/components/analista/consolidated-message-card"
import { UGCard } from "#/components/analista/ug-card"
import { AnalysisGuide } from "#/components/analysis-guide"
import { AnalysisStart } from "#/components/analysis-start"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { FileDropzone } from "#/components/ui/file-dropzone"
import { Label } from "#/components/ui/label"
import { SectionHeader } from "#/components/ui/section-header"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select"
import { StatTile } from "#/components/ui/stat-tile"
import { getOrganizacao } from "#/lib/analista/organizacao"
import { classifyAccount, formatCurrency, getRacDescription, type ProcessedRow } from "#/lib/analista/types"
import { chartChrome } from "#/lib/chart-theme"
import { getConferente, isUgAcompanhada } from "#/lib/ug/registry"
import { cn } from "#/lib/utils"

// Paleta CATEGÓRICA de visualização: existe para distinguir categorias entre si.
// Fica em hex explícito de propósito (ver STYLE_CONTRACT §8) — mapeá-la para
// tokens de estado colapsa cores diferentes na mesma e a legenda passa a afirmar
// que duas categorias são a mesma coisa.
const PIE_COLORS = ["#3b82f6", "#8b5cf6", "#6366f1", "#ef4444", "#f43f5e", "#f97316"]

// Paleta do donut de ODS — era um literal dentro do JSX quando cada fatia era um
// `<Cell>`; virou constante para não remontar o array a cada render.
const ODS_PIE_COLORS = ["var(--success)", "var(--series-bmp)", "var(--warning)", "var(--destructive)", "var(--series-pareto)", chartChrome.axis]

/** As quatro visões da ferramenta. Uma lista só: o rótulo e a ordem vinham inline. */
type ActiveView = "operacional" | "tatico" | "estrategico" | "decisao"

const VIEW_TABS: Array<{ id: ActiveView; label: string }> = [
	{ id: "operacional", label: "Visão operacional" },
	{ id: "tatico", label: "Visão tática" },
	{ id: "estrategico", label: "Visão estratégica" },
	{ id: "decisao", label: "Apoio à decisão" },
]

/**
 * O que a ferramenta faz com a planilha. Último bloco da tela inicial: é a
 * única parte que se pode ler depois de já ter enviado o arquivo.
 */
const ANALYSIS_NOTES = [
	{
		icon: Search,
		title: "O que é analisado",
		text: "Saldos de contas transitórias e de controle, classificados pelas 33 regras derivadas das questões do RAC no escopo.",
	},
	{
		icon: MessageSquare,
		title: "O que é gerado",
		text: "Proposta de mensagem de cobrança e orientação por UG, padronizada e pronta para revisão antes do envio.",
	},
	{
		icon: BookOpen,
		title: "Como o resultado é lido",
		text: "Quatro visões do mesmo dado, da operacional à estratégica; conta fora do escopo parametrizado aparece em seção própria para revisão manual.",
	},
] as const

export const Route = createFileRoute("/monitoramento")({
	component: MonitoramentoPage,
})

function MonitoramentoPage() {
	const [data, setData] = useState<ProcessedRow[]>([])
	const [fileName, setFileName] = useState<string | null>(null)
	const [isReading, setIsReading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<"ALL" | "COBRANCAS" | "EXCECOES" | "FORA_ESCOPO">("ALL")
	const [activeView, setActiveView] = useState<ActiveView>("operacional")
	const [activeConferenteFilter, setActiveConferenteFilter] = useState("TODOS")
	const [activeRacFilter, setActiveRacFilter] = useState("TODOS")

	const processFile = (file: File) => {
		setError(null)
		setIsReading(true)
		const reader = new FileReader()
		reader.onload = (e) => {
			const rawData = e.target?.result
			const workbook = XLSX.read(rawData, { type: "array" })
			const firstSheetName = workbook.SheetNames[0]
			const worksheet = workbook.Sheets[firstSheetName]
			const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
				header: 1,
				defval: null,
			})

			const processed: ProcessedRow[] = []

			const normalizeString = (str: unknown) => {
				if (typeof str !== "string") return ""
				return str
					.toLowerCase()
					.normalize("NFD")
					.replace(/[\u0300-\u036f]/g, "")
					.replace(/\s+/g, " ")
					.trim()
			}

			let colIndices = { ug: -1, mes: -1, conta: -1, saldo: -1 }
			let dataStartIndex = -1

			for (let i = 0; i < rows.length; i++) {
				const row = rows[i]
				if (!Array.isArray(row)) continue

				const tempIndices = { ug: -1, mes: -1, conta: -1, saldo: -1 }

				row.forEach((cell, index) => {
					const norm = normalizeString(cell)
					if (!norm) return

					if (["ug", "unidade gestora", "cod ug", "codigo ug"].some((k) => norm.includes(k))) {
						tempIndices.ug = index
					} else if (["mes", "referencia", "periodo"].some((k) => norm.includes(k))) {
						tempIndices.mes = index
					} else if (["conta", "conta contabil", "cod conta"].some((k) => norm.includes(k)) && !norm.includes("bancaria")) {
						tempIndices.conta = index
					} else if (["saldo", "valor"].some((k) => norm.includes(k))) {
						tempIndices.saldo = index
					}
				})

				if (tempIndices.ug !== -1 && tempIndices.mes !== -1 && tempIndices.conta !== -1 && tempIndices.saldo !== -1) {
					colIndices = tempIndices
					dataStartIndex = i + 1
					break
				}
			}

			const parseSaldo = (saldoRaw: unknown): number => {
				if (typeof saldoRaw === "number") return saldoRaw
				if (typeof saldoRaw === "string") {
					const cleaned = saldoRaw.replace(/[R$\s]/g, "")
					if (cleaned.includes(",") && cleaned.includes(".")) {
						return parseFloat(cleaned.replace(/\./g, "").replace(",", "."))
					} else if (cleaned.includes(",")) {
						return parseFloat(cleaned.replace(",", "."))
					} else {
						return parseFloat(cleaned)
					}
				}
				return NaN
			}

			if (dataStartIndex !== -1) {
				for (let i = dataStartIndex; i < rows.length; i++) {
					const row = rows[i]
					if (!Array.isArray(row)) continue

					const ugRaw = row[colIndices.ug]
					const mesRaw = row[colIndices.mes]
					const contaRaw = row[colIndices.conta]
					const saldoRaw = row[colIndices.saldo]

					if (
						ugRaw != null &&
						String(ugRaw).trim() !== "" &&
						mesRaw != null &&
						String(mesRaw).trim() !== "" &&
						contaRaw != null &&
						String(contaRaw).trim() !== "" &&
						saldoRaw != null &&
						String(saldoRaw).trim() !== ""
					) {
						const ug = String(ugRaw).trim()
						const mes = String(mesRaw).trim()
						const conta = String(contaRaw).trim()
						const saldo = parseSaldo(saldoRaw)

						if (!Number.isNaN(saldo) && saldo !== 0 && isUgAcompanhada(ug)) {
							const { classification, description, observation, accountCode, questaoRAC } = classifyAccount(ug, conta, saldo)
							processed.push({
								ug,
								mes,
								conta: accountCode,
								descricao: description,
								saldo,
								classificacao: classification,
								observacao: observation,
								questaoRAC,
							})
						}
					}
				}
			}

			// Fallback heurístico
			if (processed.length === 0) {
				for (let i = 0; i < rows.length; i++) {
					const row = rows[i]
					if (!Array.isArray(row)) continue

					let ug = "",
						mes = "",
						conta = "",
						saldo = 0
					let foundUg = false,
						foundMes = false,
						foundConta = false,
						foundSaldo = false

					row.forEach((cell) => {
						if (cell == null || String(cell).trim() === "") return
						const str = String(cell).trim()

						if (!foundUg && /^\d{6}$/.test(str)) {
							ug = str
							foundUg = true
						} else if (!foundConta && /^\d{9}$/.test(str)) {
							conta = str
							foundConta = true
						} else if (
							!foundMes &&
							(/^[A-Za-z]{3,}\/?\d{0,4}$/.test(str) ||
								/^\d{2}\/\d{4}$/.test(str) ||
								/^(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)$/i.test(str))
						) {
							mes = str
							foundMes = true
						} else if (!foundSaldo) {
							const parsed = parseSaldo(cell)
							if (!Number.isNaN(parsed)) {
								saldo = parsed
								foundSaldo = true
							}
						}
					})

					if (foundUg && foundMes && foundConta && foundSaldo && saldo !== 0 && isUgAcompanhada(ug)) {
						const { classification, description, observation, accountCode, questaoRAC } = classifyAccount(ug, conta, saldo)
						processed.push({
							ug,
							mes,
							conta: accountCode,
							descricao: description,
							saldo,
							classificacao: classification,
							observacao: observation,
							questaoRAC,
						})
					}
				}
			}

			setIsReading(false)

			// Cabeçalho não encontrado é FALHA de leitura, não competência limpa: antes
			// caía em `setData([])` com o nome do arquivo já gravado, e a tela trocava
			// para o painel mostrando zero ocorrência (§7.1). Nenhuma linha aproveitada
			// COM o cabeçalho lido é vazio de verdade, e segue para o painel.
			if (dataStartIndex === -1) {
				setError("Não foi possível encontrar o cabeçalho da tabela com as colunas UG, Mês, Conta Contábil e Saldo. Verifique o formato do arquivo.")
				return
			}

			setFileName(file.name)
			setData(processed)
		}
		reader.onerror = () => {
			setIsReading(false)
			setError("Não foi possível ler o arquivo.")
		}
		reader.readAsArrayBuffer(file)
	}

	const handleFiles = (files: File[]) => {
		const file = files[0]
		if (file) processFile(file)
	}

	const clearData = () => {
		setData([])
		setFileName(null)
		setError(null)
	}

	const filteredData = useMemo(() => {
		let filtered = data
		if (activeConferenteFilter !== "TODOS") {
			filtered = filtered.filter((row) => getConferente(row.ug) === activeConferenteFilter)
		}
		if (activeRacFilter !== "TODOS") {
			filtered = filtered.filter((row) => row.questaoRAC === activeRacFilter)
		}
		return filtered
	}, [data, activeConferenteFilter, activeRacFilter])

	const groupedData = filteredData.reduce(
		(acc, row) => {
			const key = `${row.ug}-${row.mes}`
			if (!acc[key]) acc[key] = { ug: row.ug, mes: row.mes, rows: [] }
			acc[key].rows.push(row)
			return acc
		},
		{} as Record<string, { ug: string; mes: string; rows: ProcessedRow[] }>
	)

	const excecoesData = filteredData.filter((r) => r.classificacao === "EXCEÇÃO PREVISTA")
	const outOfScopeData = filteredData.filter((r) => r.classificacao === "FORA DO ESCOPO PARAMETRIZADO")

	const dashboardData = useMemo(() => {
		if (filteredData.length === 0) return null
		const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const excecoes = filteredData.filter((r) => r.classificacao === "EXCEÇÃO PREVISTA")
		const foraEscopo = filteredData.filter((r) => r.classificacao === "FORA DO ESCOPO PARAMETRIZADO")
		return {
			totalRegistros: filteredData.length,
			totalCobrancas: cobrancas.length,
			ugsComInconsistencia: new Set(cobrancas.map((r) => r.ug)).size,
			totalExcecoes: excecoes.length,
			totalForaEscopo: foraEscopo.length,
			volumeFinanceiro: cobrancas.reduce((acc, r) => acc + Math.abs(r.saldo), 0),
		}
	}, [filteredData])

	const managerialData = useMemo(() => {
		if (filteredData.length === 0) return null
		const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const totalRiskValue = cobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
		const ugMap = new Map<string, { count: number; value: number }>()
		const racMap = new Map<string, number>()
		const conferenteMap = new Map<string, { count: number; ugs: Set<string> }>()

		for (const item of cobrancas) {
			const ugData = ugMap.get(item.ug) || { count: 0, value: 0 }
			ugData.count += 1
			ugData.value += Math.abs(item.saldo)
			ugMap.set(item.ug, ugData)

			const rac = item.questaoRAC || "Outras Inconsistências"
			racMap.set(rac, (racMap.get(rac) || 0) + 1)

			const conferente = getConferente(item.ug)
			const confData = conferenteMap.get(conferente) || {
				count: 0,
				ugs: new Set<string>(),
			}
			confData.count += 1
			confData.ugs.add(item.ug)
			conferenteMap.set(conferente, confData)
		}

		return {
			totalRiskValue,
			topUgs: Array.from(ugMap.entries())
				.map(([ug, d]) => ({ ug, ...d }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10),
			topRacs: Array.from(racMap.entries())
				.map(([name, value]) => ({ name, value }))
				.sort((a, b) => b.value - a.value)
				// A cor mora no dado: o recharts pinta o setor por `fill` da linha e é dela
				// que saem legenda e marcador do tooltip. Cor só no `shape` (ou só no
				// `<Cell>`) deixa os dois no cinza padrão.
				.map((rac, index) => ({ ...rac, fill: PIE_COLORS[index % PIE_COLORS.length] })),
			totalIssues: cobrancas.length,
			conferentes: Array.from(conferenteMap.entries())
				.map(([name, d]) => ({
					name,
					count: d.count,
					ugs: Array.from(d.ugs).sort(),
				}))
				.sort((a, b) => b.count - a.count),
		}
	}, [filteredData])

	const estrategicoData = useMemo(() => {
		if (filteredData.length === 0) return null
		const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const totalRiskValue = cobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
		const odsMap = new Map<string, { count: number; value: number }>()
		const orgaoSuperiorMap = new Map<string, { count: number; value: number }>()
		const contaMap = new Map<string, { count: number; value: number; descricao: string }>()

		for (const item of cobrancas) {
			const org = getOrganizacao(item.ug)

			const odsData = odsMap.get(org.ods) || { count: 0, value: 0 }
			odsData.count += 1
			odsData.value += Math.abs(item.saldo)
			odsMap.set(org.ods, odsData)

			const orgaoSupData = orgaoSuperiorMap.get(org.orgaoSuperior) || {
				count: 0,
				value: 0,
			}
			orgaoSupData.count += 1
			orgaoSupData.value += Math.abs(item.saldo)
			orgaoSuperiorMap.set(org.orgaoSuperior, orgaoSupData)

			const contaData = contaMap.get(item.conta) || {
				count: 0,
				value: 0,
				descricao: item.descricao,
			}
			contaData.count += 1
			contaData.value += Math.abs(item.saldo)
			contaMap.set(item.conta, contaData)
		}

		const topOds = Array.from(odsMap.entries())
			.map(([name, d]) => ({
				name,
				...d,
				percent: (d.count / cobrancas.length) * 100,
			}))
			.sort((a, b) => b.count - a.count)
			// Idem: `fill` na linha alimenta setor, legenda e tooltip da mesma fonte.
			.map((ods, index) => ({ ...ods, fill: ODS_PIE_COLORS[index % ODS_PIE_COLORS.length] }))

		return {
			totalRiskValue,
			topOds,
			topOrgaosSuperiores: Array.from(orgaoSuperiorMap.entries())
				.map(([name, d]) => ({
					name,
					...d,
					percent: (d.count / cobrancas.length) * 100,
				}))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10),
			topContas: Array.from(contaMap.entries())
				.map(([conta, d]) => ({ conta, ...d }))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10),
			totalIssues: cobrancas.length,
		}
	}, [filteredData])

	const decisaoData = useMemo(() => {
		if (filteredData.length === 0) return null
		const cobrancas = filteredData.filter((r) => r.classificacao === "COBRANÇA" || r.classificacao === "COBRANÇA COM OBSERVAÇÃO")
		const totalIssues = cobrancas.length

		const ugMap = new Map<string, number>()
		for (const r of cobrancas) ugMap.set(r.ug, (ugMap.get(r.ug) || 0) + 1)

		const sortedUgs = Array.from(ugMap.entries())
			.map(([ug, count]) => ({ ug, count }))
			.sort((a, b) => b.count - a.count)

		const totalUgs = sortedUgs.length
		const twentyPercentCount = Math.max(1, Math.round(totalUgs * 0.2))
		const topTwentyUgs = sortedUgs.slice(0, twentyPercentCount)
		const topTwentyIssuesCount = topTwentyUgs.reduce((acc, curr) => acc + curr.count, 0)
		const paretoPercent = (topTwentyIssuesCount / totalIssues) * 100

		const maxCount = sortedUgs[0]?.count || 1
		const maxValue = Math.max(...sortedUgs.map((u) => cobrancas.filter((c) => c.ug === u.ug).reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)))

		const prioritizedUgs = sortedUgs
			.map((u) => {
				const ugCobrancas = cobrancas.filter((c) => c.ug === u.ug)
				const value = ugCobrancas.reduce((acc, curr) => acc + Math.abs(curr.saldo), 0)
				const org = getOrganizacao(u.ug)
				const score = (u.count / maxCount) * 0.4 + (value / (maxValue || 1)) * 0.4 + 0.2
				return {
					...u,
					value,
					nome: org.nome,
					ods: org.ods,
					superior: org.orgaoSuperior,
					score,
				}
			})
			.sort((a, b) => b.score - a.score)

		return {
			pareto: {
				totalUgs,
				twentyPercentCount,
				paretoPercent,
				topTwentyUgs: prioritizedUgs.slice(0, twentyPercentCount),
			},
			priorities: prioritizedUgs.slice(0, 15),
			criticalLevels: {
				ods: estrategicoData?.topOds[0]?.name ?? "-",
				superior: estrategicoData?.topOrgaosSuperiores[0]?.name ?? "-",
				ugCount: sortedUgs[0]?.ug ?? "-",
				ugValue: prioritizedUgs.sort((a, b) => b.value - a.value)[0]?.ug ?? "-",
			},
		}
	}, [filteredData, estrategicoData])

	const guide = (
		<AnalysisGuide
			source={<TesouroGerencialPath />}
			reference={
				<RacReference
					objective="Acompanhar os saldos de contas transitórias e de controle do COMAER, extraídos do Tesouro Gerencial, para achar o que está fora da conformidade."
					risk="Saldo transitório que não se movimenta deixa de ser transitório: encobre pendência de conciliação e distorce a posição patrimonial da UG."
					importance="O acompanhamento por competência mostra a evolução do saldo e separa o que regularizou do que só mudou de lugar."
				/>
			}
			notes={ANALYSIS_NOTES}
		/>
	)

	return (
		<HubLayout
			guide={guide}
			width="wide"
			actions={
				fileName && (
					<Button type="button" variant="outline" size="sm" onClick={clearData}>
						<Trash2 className="w-4 h-4" />
						<span>Nova análise</span>
					</Button>
				)
			}
		>
			{!fileName ? (
				<AnalysisStart
					dropzone={
						<FileDropzone
							accept=".xlsx,.xls"
							onFiles={handleFiles}
							prompt="ou arraste o relatório"
							hint="Excel do Tesouro Gerencial (.xlsx, .xls)"
							columns={["UG", "Mês", "Conta Contábil", "Saldo"]}
							isLoading={isReading}
							loadingLabel="Lendo a planilha…"
						/>
					}
					error={error}
					errorTitle="Não foi possível processar a planilha"
				/>
			) : (
				<div className="space-y-8">
					{/* O card "Escopo da Análise (RAC)" com as seis pílulas repetia a pílula
					    da trilha e o `RacReference` da tela inicial. O que era próprio dele —
					    o aviso sobre conta fora do escopo — fica. */}
					<Alert variant="warning">
						<AlertTriangle />
						<AlertTitle>Conta fora do escopo também é analisada</AlertTitle>
						<AlertDescription>
							Contas presentes na planilha que não fazem parte do escopo parametrizado do RAC são destacadas em seção própria, para revisão manual.
						</AlertDescription>
					</Alert>

					<div className="flex flex-wrap items-end gap-6">
						<div className="flex flex-col gap-2">
							<Label htmlFor="rac-filter">Questão do RAC</Label>
							<Select items={{ TODOS: "Todas as questões" }} value={activeRacFilter} onValueChange={(v) => setActiveRacFilter(v ?? "TODOS")}>
								<SelectTrigger id="rac-filter" className="w-56">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="TODOS">Todas as questões</SelectItem>
									{Array.from(new Set(data.map((r) => r.questaoRAC).filter((rac): rac is string => Boolean(rac))))
										.sort()
										.map((rac) => (
											<SelectItem key={rac} value={rac}>
												{rac}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="conferente-filter">Conferente</Label>
							<Select items={{ TODOS: "Todos os conferentes" }} value={activeConferenteFilter} onValueChange={(v) => setActiveConferenteFilter(v ?? "TODOS")}>
								<SelectTrigger id="conferente-filter" className="w-56">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="TODOS">Todos os conferentes</SelectItem>
									{Array.from(new Set(data.map((r) => getConferente(r.ug))))
										.sort()
										.map((conf) => (
											<SelectItem key={conf} value={conf}>
												{conf}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
						{(activeRacFilter !== "TODOS" || activeConferenteFilter !== "TODOS") && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => {
									setActiveRacFilter("TODOS")
									setActiveConferenteFilter("TODOS")
								}}
							>
								<Trash2 />
								Limpar filtros
							</Button>
						)}
					</div>

					{/*
					 * Segmentado do hub, não `Tabs`: estas quatro visões reconfiguram o painel
					 * abaixo sem que exista um `tabpanel` para cada uma.
					 *
					 * Eram quatro `<Button variant="ghost">` sem papel nenhum de ARIA e sem
					 * navegação por seta, e o estado ativo saía de `text-${color}-600
					 * border-b-2 border-${color}-600 bg-${color}-50/50` — classe INTERPOLADA.
					 * O Tailwind varre o código-fonte por string literal, então nenhuma dessas
					 * regras chegou a existir no CSS: a visão ativa estava, na prática, sem
					 * estilo nenhum desde que a tela foi escrita.
					 */}
					<SegmentedControl
						label="Visão do painel"
						value={activeView}
						onValueChange={setActiveView}
						size="lg"
						options={VIEW_TABS.map(({ id, label }) => ({ value: id, label }))}
					/>

					{activeView === "operacional" && activeRacFilter !== "TODOS" && (
						<Alert variant="info">
							<BookOpen />
							<AlertTitle>
								{activeRacFilter} — {getRacDescription(activeRacFilter)}
							</AlertTitle>
							<AlertDescription>
								Mostrando apenas UGs com inconsistências nesta questão do RAC.{" "}
								<Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setActiveRacFilter("TODOS")}>
									Limpar filtro
								</Button>
							</AlertDescription>
						</Alert>
					)}

					{/* ── VISÃO TÁTICA ── */}
					{activeView === "tatico" && managerialData && (
						<div className="space-y-8">
							<SectionHeader
								icon={<Target />}
								title="Painel de análise tática (SUCONT-3)"
								description="Traduz os achados operacionais em informação gerencial para a divisão, alinhada ao RAC."
							/>

							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
								<StatTile label="Total de inconsistências" value={managerialData.totalIssues} hint="registros fora da conformidade RAC" />
								<StatTile
									label="Volume financeiro em risco"
									value={formatCurrency(managerialData.totalRiskValue)}
									hint="soma absoluta dos saldos irregulares"
									status="destructive"
								/>
								<StatTile label="UG mais crítica (volume)" value={managerialData.topUgs[0]?.ug || "-"} hint="maior concentração de inconsistências" />
								<StatTile
									label="Questão RAC mais frequente"
									value={managerialData.topRacs[0]?.name || "-"}
									hint="principal ofensor sistêmico"
									status="action"
								/>
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
								<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
									<h3 className="text-heading text-foreground mb-6 flex items-center">
										<TrendingUp className="w-5 h-5 mr-2 text-action" />
										Top 10 UGs por Volume de Inconsistências
									</h3>
									<div className="h-80">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={managerialData.topUgs} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
												<CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartChrome.grid} />
												<XAxis type="number" hide />
												<YAxis dataKey="ug" type="category" axisLine={false} tickLine={false} tick={{ fill: chartChrome.axis, fontSize: 12 }} />
												<Tooltip
													cursor={{ fill: chartChrome.surfaceMuted }}
													contentStyle={{
														borderRadius: "8px",
														border: "none",
														boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
													}}
													formatter={(value) => [Number(value), "Ocorrências"]}
												/>
												<Bar dataKey="count" fill={"var(--series-bmp)"} radius={[0, 4, 4, 0]} barSize={20} />
											</BarChart>
										</ResponsiveContainer>
									</div>
								</div>

								<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
									<h3 className="text-heading text-foreground mb-6 flex items-center">
										<PieChartIcon className="w-5 h-5 mr-2 text-action" />
										Distribuição por Questão RAC
									</h3>
									<div className="h-80">
										<ResponsiveContainer width="100%" height="100%">
											<PieChart>
												<Pie data={managerialData.topRacs} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" />
												<Tooltip
													contentStyle={{
														borderRadius: "8px",
														border: "none",
														boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
													}}
													formatter={(value) => [Number(value), "Ocorrências"]}
												/>
												<Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "12px", color: chartChrome.axis }} />
											</PieChart>
										</ResponsiveContainer>
									</div>
								</div>
							</div>

							<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
								<h3 className="text-heading text-foreground mb-6 flex items-center">
									<Users className="w-5 h-5 mr-2 text-success" />
									Distribuição de Inconsistências por Conferente
								</h3>
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
									{managerialData.conferentes.map((conf, idx) => (
										<div key={idx} className="border border-border rounded-xl p-4 bg-muted/50">
											<div className="flex justify-between items-start mb-3">
												<h4 className="text-foreground text-subheading">Conferente: {conf.name}</h4>
												<span className="inline-flex items-center px-2 py-0.5 rounded text-caption bg-success/15 text-success">
													{conf.count} Inconsistências
												</span>
											</div>
											<div className="text-caption text-muted-foreground mb-2">UGs com inconsistências:</div>
											<div className="flex flex-wrap gap-1.5">
												{conf.ugs.map((ug) => (
													<span key={ug} className="inline-flex items-center px-2 py-0.5 rounded text-caption bg-card border border-border text-foreground">
														UG {ug}
													</span>
												))}
											</div>
										</div>
									))}
								</div>
							</div>

							<div className="bg-action/10 border border-action/30 rounded-xl p-6">
								<h3 className="text-heading text-action mb-4 flex items-center">
									<Lightbulb className="w-5 h-5 mr-2 text-action" />
									Recomendações Estratégicas (Foco de Atuação)
								</h3>
								<ul className="space-y-3 text-action text-body">
									{managerialData.topUgs.length > 0 && (
										<li className="flex items-start">
											<span className="w-1.5 h-1.5 rounded-full bg-action mt-1.5 mr-2 shrink-0" />A UG <strong>{managerialData.topUgs[0].ug}</strong> concentra
											a maior parte das inconsistências. Recomenda-se uma ação de orientação técnica direcionada à Setorial Contábil desta unidade.
										</li>
									)}
									{managerialData.topRacs.length > 0 && (
										<li className="flex items-start">
											<span className="w-1.5 h-1.5 rounded-full bg-action mt-1.5 mr-2 shrink-0" />A <strong>{managerialData.topRacs[0].name}</strong> é a
											principal ofensora do COMAER neste período. Sugere-se avaliar a necessidade de capacitação das UGs ou a emissão de um boletim de
											orientação específico.
										</li>
									)}
									<li className="flex items-start">
										<span className="w-1.5 h-1.5 rounded-full bg-action mt-1.5 mr-2 shrink-0" />O volume financeiro total em risco é de{" "}
										<strong>{formatCurrency(managerialData.totalRiskValue)}</strong>. A não regularização pode comprometer a fidedignidade das demonstrações
										contábeis do COMAER.
									</li>
								</ul>
							</div>

							<ChatAssistant managerialData={managerialData} estrategicoData={estrategicoData ?? null} decisaoData={decisaoData} />
						</div>
					)}

					{/* ── VISÃO ESTRATÉGICA ── */}
					{activeView === "estrategico" && estrategicoData && (
						<div className="space-y-8">
							<SectionHeader
								icon={<Building2 />}
								title="Painel de risco contábil do COMAER (estratégico)"
								description="Visão consolidada para a decisão da chefia da SUCONT, da DIREF e dos altos escalões do COMAER."
							/>

							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								<StatTile label="Total de inconsistências" value={estrategicoData.totalIssues} hint="registros fora da conformidade RAC" />
								<StatTile
									label="Volume financeiro em risco"
									value={formatCurrency(estrategicoData.totalRiskValue)}
									hint="soma absoluta dos saldos irregulares"
									status="destructive"
								/>
								<StatTile
									label="Maior risco por ODS"
									value={estrategicoData.topOds[0]?.name || "-"}
									hint={`${estrategicoData.topOds[0]?.percent.toFixed(1)}% das inconsistências`}
								/>
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
								<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
									<h3 className="text-heading text-foreground mb-6 flex items-center">
										<PieChartIcon className="w-5 h-5 mr-2 text-success" />
										Distribuição Percentual por ODS
									</h3>
									<div className="h-80">
										<ResponsiveContainer width="100%" height="100%">
											<PieChart>
												<Pie
													data={estrategicoData.topOds}
													cx="50%"
													cy="50%"
													innerRadius={60}
													outerRadius={100}
													paddingAngle={5}
													dataKey="count"
													nameKey="name"
												/>
												<Tooltip
													contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
													formatter={(value, _name, item) => [`${Number(value)} (${(Number(item?.payload?.percent) || 0).toFixed(1)}%)`, "Inconsistências"]}
												/>
												<Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "12px", color: chartChrome.axis }} />
											</PieChart>
										</ResponsiveContainer>
									</div>
								</div>

								<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
									<h3 className="text-heading text-foreground mb-6 flex items-center">
										<BarChart3 className="w-5 h-5 mr-2 text-success" />
										Ranking de Órgãos Superiores
									</h3>
									<div className="h-80">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={estrategicoData.topOrgaosSuperiores} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
												<CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke={chartChrome.grid} />
												<XAxis type="number" tick={{ fontSize: 12, fill: chartChrome.axis }} axisLine={false} tickLine={false} />
												<YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: chartChrome.axis }} axisLine={false} tickLine={false} />
												<Tooltip
													cursor={{ fill: chartChrome.surfaceMuted }}
													contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
													formatter={(value) => [Number(value), "Inconsistências"]}
												/>
												<Bar dataKey="count" fill={"var(--success)"} radius={[0, 4, 4, 0]} barSize={20} />
											</BarChart>
										</ResponsiveContainer>
									</div>
								</div>
							</div>

							<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
								<h3 className="text-heading text-foreground mb-6 flex items-center">
									<AlertTriangle className="w-5 h-5 mr-2 text-destructive" />
									Contas Contábeis com Maior Risco (Top 10)
								</h3>
								<div className="overflow-x-auto">
									<table className="min-w-full divide-y divide-border">
										<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
											<tr>
												{["Conta", "Descrição", "Ocorrências", "Volume Financeiro"].map((h) => (
													<th key={h} className="px-4 py-3 text-left">
														{h}
													</th>
												))}
											</tr>
										</thead>
										<tbody className="divide-y divide-border">
											{estrategicoData.topContas.map((c, i) => (
												<tr key={i} className="hover:bg-muted/50">
													<td className="px-3 py-2 whitespace-nowrap text-body font-mono text-foreground">{c.conta}</td>
													<td className="px-3 py-2 text-body text-muted-foreground">{c.descricao}</td>
													<td className="px-3 py-2 whitespace-nowrap text-subheading text-right text-foreground">{c.count}</td>
													<td className="px-3 py-2 whitespace-nowrap text-subheading text-right text-destructive">{formatCurrency(c.value)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>

							<ChatAssistant managerialData={managerialData ?? null} estrategicoData={estrategicoData} decisaoData={decisaoData} />
						</div>
					)}

					{/* ── APOIO À DECISÃO ── */}
					{activeView === "decisao" && decisaoData && (
						<div className="space-y-8">
							<div className="bg-card p-8 rounded-xl shadow-sm border border-border">
								<div className="flex items-start space-x-4">
									<div className="p-3 bg-warning/15 rounded-xl shrink-0">
										<Lightbulb className="w-6 h-6 text-warning" />
									</div>
									<div>
										<h2 className="text-heading text-foreground mb-2">Apoio à Tomada de Decisão e Mapa de Risco</h2>
										<p className="text-muted-foreground leading-relaxed">
											Análise estratégica para identificação de níveis de risco contábil, concentração de inconsistências e priorização de atuação no âmbito do
											COMAER.
										</p>
									</div>
								</div>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
								{[
									{ label: "ODS de Maior Risco", value: decisaoData.criticalLevels.ods },
									{ label: "Órgão Superior Crítico", value: decisaoData.criticalLevels.superior },
									{ label: "UG com mais Inconsistências", value: decisaoData.criticalLevels.ugCount },
									{ label: "UG com maior Saldo Irregular", value: decisaoData.criticalLevels.ugValue },
								].map(({ label, value }) => (
									<div key={label} className="bg-warning/10 p-6 rounded-xl border border-warning/30">
										<p className="text-label text-warning mb-1">{label}</p>
										<p className="text-heading text-foreground">{value}</p>
									</div>
								))}
							</div>

							<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
								<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
									<h3 className="text-heading text-foreground mb-6 flex items-center">
										<ShieldAlert className="w-5 h-5 mr-2 text-destructive" />
										Mapa de Risco Contábil (ODS)
									</h3>
									<div className="overflow-x-auto">
										<table className="w-full text-body text-left">
											<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
												<tr>
													<th className="px-4 py-3">ODS</th>
													<th className="px-4 py-3 text-center">Inconsistências</th>
													<th className="px-4 py-3 text-right">Saldo Associado</th>
													<th className="px-4 py-3 text-right">% Total</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-border">
												{estrategicoData?.topOds.map((ods) => (
													<tr key={ods.name} className="hover:bg-muted/50">
														<td className="px-4 py-3 font-medium text-foreground">{ods.name}</td>
														<td className="px-4 py-3 text-center">{ods.count}</td>
														<td className="px-4 py-3 text-right text-destructive font-medium">{formatCurrency(ods.value)}</td>
														<td className="px-4 py-3 text-right">{ods.percent.toFixed(1)}%</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>

								<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
									<h3 className="text-heading text-foreground mb-6 flex items-center">
										<Target className="w-5 h-5 mr-2 text-action" />
										Análise de Concentração (Pareto)
									</h3>
									<div className="flex flex-col items-center justify-center h-full pb-6">
										<div className="text-center mb-8">
											<p className="text-display text-action mb-2">{decisaoData.pareto.paretoPercent.toFixed(1)}%</p>
											<p className="text-body text-muted-foreground">
												das inconsistências estão concentradas em apenas <span className="font-bold text-foreground">20% das UGs</span> (
												{decisaoData.pareto.twentyPercentCount} UGs).
											</p>
										</div>
										<div className="w-full space-y-3">
											<p className="text-label text-muted-foreground">UGs que compõem a concentração:</p>
											{decisaoData.pareto.topTwentyUgs.map((ug, i) => (
												<div key={ug.ug} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border border-border">
													<div className="flex items-center gap-2">
														<span className="text-hint bg-action/15 text-action w-5 h-5 flex items-center justify-center rounded-full">{i + 1}</span>
														<span className="text-subheading text-foreground">
															{ug.ug} ({ug.nome})
														</span>
													</div>
													<span className="text-caption text-muted-foreground">{ug.count} itens</span>
												</div>
											))}
										</div>
									</div>
								</div>
							</div>

							<div className="bg-card p-6 rounded-xl shadow-sm border border-border">
								<h3 className="text-heading text-foreground mb-6 flex items-center">
									<TrendingUp className="w-5 h-5 mr-2 text-success" />
									Priorização de Atuação (Top 15 UGs Prioritárias)
								</h3>
								<div className="overflow-x-auto">
									<table className="w-full text-body text-left">
										<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
											<tr>
												<th className="px-4 py-3">Prioridade</th>
												<th className="px-4 py-3">UG / Nome</th>
												<th className="px-4 py-3">Órgão Superior / ODS</th>
												<th className="px-4 py-3 text-center">Inconsistências</th>
												<th className="px-4 py-3 text-right">Impacto Financeiro</th>
												<th className="px-4 py-3 text-center">Score de Risco</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-border">
											{decisaoData.priorities.map((ug, i) => (
												<tr key={ug.ug} className="hover:bg-muted/50">
													<td className="px-4 py-3">
														<span
															className={cn(
																"inline-flex items-center justify-center w-6 h-6 rounded-full text-hint",
																i < 3 ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground"
															)}
														>
															{i + 1}º
														</span>
													</td>
													<td className="px-4 py-3">
														<p className="font-bold text-foreground">{ug.ug}</p>
														<p className="text-caption text-muted-foreground">{ug.nome}</p>
													</td>
													<td className="px-4 py-3">
														<p className="text-foreground">{ug.superior}</p>
														<p className="text-caption text-muted-foreground">{ug.ods}</p>
													</td>
													<td className="px-4 py-3 text-center font-medium">{ug.count}</td>
													<td className="px-4 py-3 text-right text-destructive font-medium">{formatCurrency(ug.value)}</td>
													<td className="px-4 py-3 text-center">
														<div className="w-full bg-muted rounded-full h-1.5 max-w-[100px] mx-auto">
															<div
																className={cn("h-1.5 rounded-full", ug.score > 0.7 ? "bg-destructive" : ug.score > 0.4 ? "bg-warning" : "bg-success")}
																style={{ width: `${ug.score * 100}%` }}
															/>
														</div>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>

							<ChatAssistant managerialData={managerialData ?? null} estrategicoData={estrategicoData ?? null} decisaoData={decisaoData} />
						</div>
					)}

					{/* ── VISÃO OPERACIONAL ── */}
					{activeView === "operacional" && dashboardData && (
						<div className="space-y-6 mb-8">
							<SectionHeader icon={<BarChart3 />} title="Visão geral" />
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
								<StatTile icon={<FileText />} label="Registros analisados" value={dashboardData.totalRegistros} />
								<StatTile icon={<AlertTriangle />} label="Ocorrências de cobrança" value={dashboardData.totalCobrancas} status="destructive" />
								<StatTile icon={<Building2 />} label="UGs com inconsistências" value={dashboardData.ugsComInconsistencia} status="action" />
								<StatTile icon={<CheckCircle2 />} label="Exceções identificadas" value={dashboardData.totalExcecoes} status="success" />
								<StatTile icon={<AlertCircle />} label="Ocorrências fora do escopo" value={dashboardData.totalForaEscopo} status="warning" />
								<StatTile icon={<DollarSign />} label="Valor total das inconsistências" value={formatCurrency(dashboardData.volumeFinanceiro)} />
							</div>
						</div>
					)}

					{activeView === "operacional" && data.length > 0 && (
						<div className="mb-8">
							<span className="text-label text-muted-foreground block mb-2">Filtrar visão</span>
							<SegmentedControl
								label="Filtrar visão"
								value={activeTab}
								onValueChange={setActiveTab}
								options={[
									{ value: "ALL", label: "Todas as ocorrências" },
									{ value: "COBRANCAS", label: "Cobranças (RAC)" },
									{ value: "EXCECOES", label: "Exceções (RAC)" },
									{ value: "FORA_ESCOPO", label: "Fora do escopo" },
								]}
							/>
						</div>
					)}

					{activeView === "operacional" && (activeTab === "ALL" || activeTab === "COBRANCAS") && dashboardData && dashboardData.totalCobrancas > 0 && (
						<div className="space-y-6 mb-8">
							{activeRacFilter !== "TODOS" && <ConsolidatedMessageCard rows={filteredData} activeRacFilter={activeRacFilter} />}
							<SectionHeader icon={<AlertTriangle />} title="Inconsistências por UG" className="mt-12" />
							{Object.values(groupedData).map((group) => (
								<UGCard key={`${group.ug}-${group.mes}`} group={group} type="INCONSISTENCIA" activeRacFilter={activeRacFilter} />
							))}
						</div>
					)}

					{activeView === "operacional" && (activeTab === "ALL" || activeTab === "EXCECOES") && excecoesData.length > 0 && (
						<div className="space-y-6 mb-8">
							<SectionHeader icon={<CheckCircle2 />} title="Exceções do RAC" className="mt-12" />
							<div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
								<div className="p-6">
									<p className="text-body text-muted-foreground mb-4">
										As ocorrências abaixo foram detectadas, mas estão previstas nas exceções do RAC. Nenhuma cobrança será gerada.
									</p>
									<div className="overflow-x-auto">
										<table className="min-w-full divide-y divide-border">
											<thead className="bg-muted/50 border-b border-border text-label text-muted-foreground">
												<tr>
													{["UG", "Conta", "Descrição", "Saldo", "Fundamento da exceção"].map((h) => (
														<th key={h} className="px-4 py-3 text-left">
															{h}
														</th>
													))}
												</tr>
											</thead>
											<tbody className="divide-y divide-border">
												{excecoesData.map((c, i) => (
													<tr key={i} className="hover:bg-muted/50">
														<td className="px-3 py-2 whitespace-nowrap text-subheading text-foreground">{c.ug}</td>
														<td className="px-3 py-2 whitespace-nowrap text-body font-mono text-foreground">{c.conta}</td>
														<td className="px-3 py-2 text-body text-muted-foreground">{c.descricao}</td>
														<td className="px-3 py-2 whitespace-nowrap text-subheading text-right text-foreground">{formatCurrency(c.saldo)}</td>
														<td className="px-3 py-2 text-body text-muted-foreground italic">{c.observacao || "Exceção expressamente prevista no RAC"}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							</div>
						</div>
					)}

					{activeView === "operacional" && (activeTab === "ALL" || activeTab === "FORA_ESCOPO") && outOfScopeData.length > 0 && (
						<div className="space-y-6 mb-8">
							<SectionHeader icon={<AlertCircle />} title="Contas fora do escopo do RAC" className="mt-12" />
							<Alert variant="warning">
								<AlertTriangle />
								<AlertTitle>Possível inconsistência contábil — conta não parametrizada no RAC</AlertTitle>
								<AlertDescription>
									As contas abaixo não foram encontradas na matriz normativa e requerem revisão manual pela equipe da SUCONT-3.
								</AlertDescription>
							</Alert>
							{Object.values(groupedData).map((group) => (
								<UGCard key={`fora-${group.ug}-${group.mes}`} group={group} type="FORA_ESCOPO" activeRacFilter={activeRacFilter} />
							))}
						</div>
					)}

					{activeView === "operacional" && data.length > 0 && dashboardData?.totalCobrancas === 0 && outOfScopeData.length === 0 && (
						<Alert variant="success">
							<CheckCircle2 />
							<AlertTitle>Nenhuma cobrança necessária</AlertTitle>
							<AlertDescription>Todas as ocorrências processadas são exceções previstas na matriz normativa.</AlertDescription>
						</Alert>
					)}
				</div>
			)}
		</HubLayout>
	)
}
