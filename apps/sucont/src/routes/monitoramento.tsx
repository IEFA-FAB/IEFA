import { createFileRoute } from "@tanstack/react-router"
import { AlertTriangle, BookOpen, MessageSquare, Search, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { requireToolAccess } from "#/auth/pbac"
import { MonitoramentoDecisaoView } from "#/components/analista/monitoramento-decisao-view"
import { MonitoramentoEstrategicoView } from "#/components/analista/monitoramento-estrategico-view"
import { MonitoramentoFilters } from "#/components/analista/monitoramento-filters"
import { MonitoramentoOperacionalView, type OperacionalTab, type UgMesGroup } from "#/components/analista/monitoramento-operacional-view"
import { MonitoramentoTaticoView } from "#/components/analista/monitoramento-tatico-view"
import { AnalysisGuide } from "#/components/analysis-guide"
import { AnalysisStart } from "#/components/analysis-start"
import { HubLayout } from "#/components/hub-layout"
import { RacReference } from "#/components/rac-reference"
import { TesouroGerencialPath } from "#/components/tesouro-gerencial-path"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { EXCEL_ACCEPT, FileDropzone } from "#/components/ui/file-dropzone"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { computeDashboardData, computeDecisaoData, computeEstrategicoData, computeManagerialData } from "#/lib/analista/monitoramento-panels"
import { parseWorkbook } from "#/lib/analista/monitoramento-parser"
import { getRacDescription, type ProcessedRow } from "#/lib/analista/types"
import { getConferente } from "#/lib/ug/registry"

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
	// A divisão exigida sai do catálogo (`sucontTools`), pelo `internalPath`.
	beforeLoad: (opts) => requireToolAccess(opts, "/monitoramento"),
	component: MonitoramentoPage,
})

function MonitoramentoPage() {
	const [data, setData] = useState<ProcessedRow[]>([])
	const [fileName, setFileName] = useState<string | null>(null)
	const [isReading, setIsReading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<OperacionalTab>("ALL")
	const [activeView, setActiveView] = useState<ActiveView>("operacional")
	const [activeConferenteFilter, setActiveConferenteFilter] = useState("TODOS")
	const [activeRacFilter, setActiveRacFilter] = useState("TODOS")

	const processFile = (file: File) => {
		setError(null)
		setIsReading(true)
		const reader = new FileReader()
		reader.onload = (e) => {
			// `XLSX.read` lança em arquivo truncado, protegido por senha ou renomeado.
			// Sem o `try` a zona ficava travada em "Lendo…" para sempre: o `isReading`
			// só era desligado no caminho feliz.
			try {
				const { processed, isHeaderFound } = parseWorkbook(e.target?.result)
				// Cabeçalho não encontrado é FALHA de leitura (ver `parseWorkbook`): o
				// nome do arquivo não é gravado e a tela fica na zona de envio com o erro.
				if (!isHeaderFound) {
					setError("Não foi possível encontrar o cabeçalho da tabela com as colunas UG, Mês, Conta Contábil e Saldo. Verifique o formato do arquivo.")
					return
				}
				setFileName(file.name)
				setData(processed)
			} catch (err) {
				setError(err instanceof Error ? err.message : "Não foi possível ler a planilha. Confira se é um Excel válido.")
			} finally {
				setIsReading(false)
			}
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

	// As questões presentes na planilha carregada — passam de 25 numa carga completa.
	const racFilterItems = useMemo(
		() => [
			{ value: "TODOS", label: "Todas as questões" },
			...Array.from(new Set(data.map((r) => r.questaoRAC).filter((rac): rac is string => Boolean(rac))))
				.sort()
				.map((rac) => ({ value: rac, label: rac })),
		],
		[data]
	)

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
		{} as Record<string, UgMesGroup>
	)

	const excecoesData = filteredData.filter((r) => r.classificacao === "EXCEÇÃO PREVISTA")
	const outOfScopeData = filteredData.filter((r) => r.classificacao === "FORA DO ESCOPO PARAMETRIZADO")

	const dashboardData = useMemo(() => computeDashboardData(filteredData), [filteredData])

	const managerialData = useMemo(() => computeManagerialData(filteredData), [filteredData])

	const estrategicoData = useMemo(() => computeEstrategicoData(filteredData), [filteredData])

	const decisaoData = useMemo(() => computeDecisaoData(filteredData, estrategicoData), [filteredData, estrategicoData])

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
							accept={EXCEL_ACCEPT}
							onFiles={handleFiles}
							hint="Excel do Tesouro Gerencial (.xlsx, .xls)"
							columns={["UG", "Mês", "Conta Contábil", "Saldo"]}
							isLoading={isReading}
						/>
					}
					error={error}
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

					<MonitoramentoFilters
						data={data}
						racFilterItems={racFilterItems}
						activeRacFilter={activeRacFilter}
						setActiveRacFilter={setActiveRacFilter}
						activeConferenteFilter={activeConferenteFilter}
						setActiveConferenteFilter={setActiveConferenteFilter}
					/>

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
						<MonitoramentoTaticoView managerialData={managerialData} estrategicoData={estrategicoData} decisaoData={decisaoData} />
					)}

					{/* ── VISÃO ESTRATÉGICA ── */}
					{activeView === "estrategico" && estrategicoData && (
						<MonitoramentoEstrategicoView estrategicoData={estrategicoData} managerialData={managerialData} decisaoData={decisaoData} />
					)}

					{/* ── APOIO À DECISÃO ── */}
					{activeView === "decisao" && decisaoData && (
						<MonitoramentoDecisaoView decisaoData={decisaoData} managerialData={managerialData} estrategicoData={estrategicoData} />
					)}

					{/* ── VISÃO OPERACIONAL ── */}
					{activeView === "operacional" && (
						<MonitoramentoOperacionalView
							data={data}
							filteredData={filteredData}
							groupedData={groupedData}
							excecoesData={excecoesData}
							outOfScopeData={outOfScopeData}
							dashboardData={dashboardData}
							activeTab={activeTab}
							setActiveTab={setActiveTab}
							activeRacFilter={activeRacFilter}
						/>
					)}
				</div>
			)}
		</HubLayout>
	)
}
