import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Database, Layers, LayoutDashboard, Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { AnalyticNoteModal } from "#/auditor/components/AnalyticNoteModal"
import { AuditorControlsBar } from "#/auditor/components/AuditorControlsBar"
import { AuditorEmptyState } from "#/auditor/components/AuditorEmptyState"
import { AuditorHeaderActions } from "#/auditor/components/AuditorHeaderActions"
import { AuditorKpiCards } from "#/auditor/components/AuditorKpiCards"
import { ComparisonChart, EvolutionChart } from "#/auditor/components/Charts"
import { ChartWrapper } from "#/auditor/components/ChartWrapper"
import { FileUploadModal } from "#/auditor/components/FileUploadModal"
import { PersistOutcomeBanner } from "#/auditor/components/PersistOutcomeBanner"
import { PresentationMode } from "#/auditor/components/PresentationMode"
import { RankingList } from "#/auditor/components/RankingList"
import { SiafiMessageModal } from "#/auditor/components/SiafiMessageModal"
import { TemporalHeatmap } from "#/auditor/components/TemporalHeatmap"
import {
	buildComparisonLabel,
	buildHierarchyLabel,
	buildHierarchyOptions,
	computeKpiStats,
	computeTrendSeries,
	filterBaseData,
	selectPreviousKpiData,
} from "#/auditor/services/dashboard"
import {
	applyRiskClassification,
	normalizeData,
	parseDateString,
	rawRowsFromStoredBalances,
	rawRowsToBalancePayload,
	recalculateDeltas,
	toShortDate,
} from "#/auditor/services/dataProcessor"
import { parseExcelFile } from "#/auditor/services/excelParser"
import { buildReportDataset } from "#/auditor/services/report"
import { buildRunStartData, createPersistOutcome, type PersistOutcome, saveInChunks } from "#/auditor/services/upload"
import type { FinancialRecord, RawInputRow, TimeFilter } from "#/auditor/types"
import { requireToolAccess, useSucontAccess } from "#/auth/pbac"
import { HubLayout } from "#/components/hub-layout"
import { Combobox } from "#/components/ui/combobox"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { toast } from "#/components/ui/toast"
import { auditorBalancesQueryOptions } from "#/lib/queries"
import { finalizeAuditorRunFn, saveAuditorBalancesFn, startAuditorRunFn } from "#/server/auditor.fn"

export const Route = createFileRoute("/auditor")({
	// A divisão exigida sai do catálogo (`sucontTools`), pelo `internalPath`.
	beforeLoad: (opts) => requireToolAccess(opts, "/auditor"),
	// Sem prime no loader de propósito: o hub renderiza <Link to="/auditor"> na
	// barra lateral de todas as telas, e com `defaultPreload: "intent"` +
	// `defaultPreloadStaleTime: 0` cada passada de mouse rodaria o loader — ou
	// seja, a série de saldos inteira, que pagina em laço até MAX_ROWS_READ.
	// A tela busca no mount, como antes.
	component: AuditorPage,
})

function AuditorPage() {
	const queryClient = useQueryClient()

	// Fonte de verdade é o banco. `localRows` só existe como rede de segurança:
	// se a gravação falhar (sem nível 2, banco fora), o operador ainda enxerga o
	// arquivo que acabou de subir — com aviso de que aquilo não foi persistido.
	const [localRows, setLocalRows] = useState<RawInputRow[]>([])
	const [persistOutcome, setPersistOutcome] = useState<PersistOutcome | null>(null)
	/** Rodada da última importação — amarra a MSG gerada ao arquivo que a originou. */
	const [lastRunId, setLastRunId] = useState<string | null>(null)

	const {
		data: storedBalances = [],
		isLoading: loadingStored,
		// Sem `error` a tela cairia no estado vazio e AFIRMARIA que não há competência
		// na base quando na verdade a leitura falhou — a mentira mais cara possível
		// numa ferramenta de conciliação.
		error: storedError,
	} = useQuery(auditorBalancesQueryOptions())

	// UI State
	const [selectedGroup, setSelectedGroup] = useState<string>("ALL")
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("MENSAL")
	const [selectedMonth, setSelectedMonth] = useState<string>("")
	const [selectedHierarchyLevel, setSelectedHierarchyLevel] = useState<"ODS" | "ORGAO" | "UG">("UG")
	const [selectedHierarchyFilter, setSelectedHierarchyFilter] = useState<string[]>(["TODOS"])
	const [selectedRisk, _setSelectedRisk] = useState<string>("TODOS")
	const [searchTerm, _setSearchTerm] = useState("")

	// Importar grava: `startAuditorRunFn` e `saveAuditorBalancesFn` exigem nível 2.
	// Sem esta checagem o operador de nível 1 subia a planilha, esperava o parse da
	// série inteira e só então tomava 403 — perdendo o trabalho e sem saber por quê.
	// Consultar a série já gravada continua liberado no nível 1.
	// O auditor é da SUCONT-4: o botão de escrita segue a divisão DELA, não "alguma divisão".
	// Pintá-lo por acesso genérico prometeria uma gravação que o servidor recusa.
	const { canEdit, isLoading: loadingAccess } = useSucontAccess("sucont-4")
	const [hideZeros, setHideZeros] = useState(true)

	// Modals
	const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
	const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
	const [isPresenting, setIsPresenting] = useState(false)
	const [isMessageModalOpen, setIsMessageModalOpen] = useState(false)
	const [selectedRecordForMessage, setSelectedRecordForMessage] = useState<FinancialRecord | null>(null)
	const [selectedHistoryForMessage, setSelectedHistoryForMessage] = useState<FinancialRecord[]>([])
	const [messageContext, setMessageContext] = useState<"RANKING" | "HEATMAP">("HEATMAP")

	// 1. Process data — do banco quando há série persistida; do arquivo em memória
	// só enquanto a gravação não confirmou. Uma normalização só, nos dois casos.
	const sourceRows = useMemo(() => (localRows.length > 0 ? localRows : rawRowsFromStoredBalances(storedBalances)), [localRows, storedBalances])

	const allData = useMemo(() => {
		const normalized = normalizeData(sourceRows)
		const withDeltas = recalculateDeltas(normalized, timeFilter)
		return applyRiskClassification(withDeltas)
	}, [sourceRows, timeFilter])

	// 2. Extract dropdown lists
	const uniqueMonths = useMemo(() => {
		const dates = Array.from(new Set(allData.map((d) => d.date))) as string[]
		return dates.sort((a, b) => parseDateString(a).timestamp - parseDateString(b).timestamp)
	}, [allData])

	const uniqueUGs = useMemo(() => Array.from(new Set(allData.map((d) => d.ug))).sort(), [allData])
	const uniqueODS = useMemo(
		() =>
			Array.from(new Set(allData.map((d) => d.ods)))
				.filter(Boolean)
				.sort(),
		[allData]
	)
	const uniqueOrgaos = useMemo(
		() =>
			Array.from(new Set(allData.map((d) => d.orgaoSuperior)))
				.filter(Boolean)
				.sort(),
		[allData]
	)

	// Auto-select latest month when data loads
	useEffect(() => {
		if (uniqueMonths.length > 0 && !selectedMonth) {
			setSelectedMonth(uniqueMonths[uniqueMonths.length - 1])
		} else if (uniqueMonths.length > 0 && !uniqueMonths.includes(selectedMonth)) {
			setSelectedMonth(uniqueMonths[uniqueMonths.length - 1])
		}
	}, [uniqueMonths, selectedMonth])

	// 3a. Base filter
	const baseFilteredData = useMemo(
		() => filterBaseData(allData, { searchTerm, selectedRisk, selectedHierarchyLevel, selectedHierarchyFilter }),
		[allData, searchTerm, selectedHierarchyLevel, selectedHierarchyFilter, selectedRisk]
	)

	// 3b. Visualization filter
	const filteredDataForVisuals = useMemo(() => {
		return baseFilteredData.filter((item) => {
			const matchZero = hideZeros ? item.difference !== 0 : true
			return matchZero
		})
	}, [baseFilteredData, hideZeros])

	// 3c. KPI data (current month)
	const kpiData = useMemo(() => {
		return baseFilteredData.filter((item) => item.date === selectedMonth && (selectedGroup === "ALL" || item.group === selectedGroup))
	}, [baseFilteredData, selectedMonth, selectedGroup])

	const currentMonthVisuals = useMemo(() => {
		return filteredDataForVisuals.filter((item) => item.date === selectedMonth && (selectedGroup === "ALL" || item.group === selectedGroup))
	}, [filteredDataForVisuals, selectedMonth, selectedGroup])

	// 3d. Previous period KPI data
	const previousKpiData = useMemo(
		() => selectPreviousKpiData(baseFilteredData, selectedMonth, uniqueMonths, selectedGroup, timeFilter),
		[baseFilteredData, selectedMonth, uniqueMonths, selectedGroup, timeFilter]
	)

	// 4. KPI calculations
	const stats = useMemo(() => computeKpiStats(kpiData, previousKpiData, currentMonthVisuals), [kpiData, previousKpiData, currentMonthVisuals])

	// 3e. Trend series for mini charts
	const trendSeries = useMemo(
		() => computeTrendSeries(baseFilteredData, selectedMonth, uniqueMonths, selectedGroup, timeFilter),
		[baseFilteredData, selectedMonth, uniqueMonths, selectedGroup, timeFilter]
	)

	// Comparison label for ranking
	const comparisonLabel = useMemo(() => buildComparisonLabel(kpiData, selectedMonth, timeFilter), [kpiData, selectedMonth, timeFilter])

	/**
	 * Recorte que a Nota Analítica Estratégica descreve.
	 *
	 * Sai de `baseFilteredData`: o filtro de hierarquia e o de grupo de contas
	 * entram, o de zerados NÃO. Ocultar zerados é ajuste de leitura do gráfico; numa
	 * nota que declara "N Unidades Gestoras analisadas", esconder as conciliadas
	 * transformaria o universo em amostra sem dizer que transformou.
	 *
	 * Só é montado com o modal aberto. `buildReportDataset` refaz os deltas em
	 * quatro escopos, e a tela recalcularia isso a cada troca de filtro para um
	 * documento que ninguém pediu.
	 */
	/** Só o recorte de hierarquia. É o que o telão respeita — ele tem lâmina por natureza. */
	const hierarchyLabel = useMemo(() => buildHierarchyLabel(selectedHierarchyFilter, selectedHierarchyLevel), [selectedHierarchyFilter, selectedHierarchyLevel])

	/**
	 * O recorte da NOTA, que inclui a aba de grupo de contas.
	 *
	 * Separado do rótulo do telão de propósito: a apresentação percorre as três
	 * naturezas em lâminas próprias e ignora a aba, então carimbar "· grupo
	 * CONSUMO" no rodapé dela descreveria um recorte que a lâmina não aplicou.
	 */
	const scopeLabel = useMemo(() => (selectedGroup === "ALL" ? hierarchyLabel : `${hierarchyLabel} · grupo ${selectedGroup}`), [hierarchyLabel, selectedGroup])

	const noteDataset = useMemo(() => {
		if (!isNoteModalOpen || !selectedMonth || baseFilteredData.length === 0) return null

		const scoped = selectedGroup === "ALL" ? baseFilteredData : baseFilteredData.filter((item) => item.group === selectedGroup)
		if (scoped.length === 0) return null

		return buildReportDataset({ data: scoped, competence: selectedMonth, timeFilter, scopeLabel })
	}, [isNoteModalOpen, baseFilteredData, selectedGroup, scopeLabel, selectedMonth, timeFilter])

	// Handlers
	const uploadMutation = useMutation({
		mutationFn: async (file: File): Promise<PersistOutcome> => {
			const parsed = await parseExcelFile(file)
			if (parsed.length === 0) throw new Error("Arquivo vazio ou formato não reconhecido.")

			// Mostra o arquivo imediatamente; se a gravação passar, o banco assume.
			setLocalRows(parsed)

			const payload = rawRowsToBalancePayload(parsed)
			if (payload.length === 0) throw new Error("Nenhuma competência reconhecida no arquivo.")

			const outcome = createPersistOutcome(file.name, payload.length)

			const { runId } = await startAuditorRunFn({
				data: buildRunStartData(file.name, payload, parsed.length),
			})
			setLastRunId(runId)

			// Lotes em sequência; falha no meio vira "partial" (ver `saveInChunks`).
			await saveInChunks(payload, outcome, (slice) => saveAuditorBalancesFn({ data: { runId, rows: slice } }))

			// A rodada passa a valer o que aterrissou, não o que o arquivo prometia.
			try {
				await finalizeAuditorRunFn({
					data: { runId, rowsWritten: outcome.rowsWritten, status: outcome.status, error: outcome.error ?? null },
				})
			} catch {
				// Fechar a rodada é registro, não o dado: falhar aqui não invalida a gravação.
			}

			return outcome
		},
		onSuccess: async (outcome) => {
			setPersistOutcome(outcome)

			if (outcome.rowsWritten > 0) {
				// Algo entrou no banco — ele vira a fonte, mesmo que a série esteja
				// incompleta. Ver dado parcial verdadeiro é melhor que ver arquivo
				// inteiro que o banco não tem.
				await queryClient.invalidateQueries({ queryKey: auditorBalancesQueryOptions().queryKey })
				setLocalRows([])
			}

			if (outcome.status === "complete") {
				toast.success(`${outcome.inserted} saldos novos, ${outcome.unchanged} sem mudança, ${outcome.changed} alterados`)
			} else if (outcome.status === "partial") {
				toast.error(`Gravação incompleta: ${outcome.rowsWritten} de ${outcome.rowsTotal} saldos`)
			} else {
				toast.error(`Não gravado: ${outcome.error}`)
			}
		},
		onError: (e, file) => {
			// Só chega aqui o que falhou ANTES de qualquer escrita (parse, criação da
			// rodada). `localRows` fica de propósito: a análise continua na tela.
			const error = e instanceof Error ? e.message : "Falha ao gravar"
			setPersistOutcome({
				status: "failed",
				filename: file.name,
				inserted: 0,
				unchanged: 0,
				changed: 0,
				duplicateGrains: 0,
				rowsWritten: 0,
				rowsTotal: 0,
				conflicts: [],
				conflictsTruncated: false,
				error,
			})
			toast.error(`Não gravado: ${error}`)
		},
	})

	const handleFileUpload = async (file: File) => {
		setPersistOutcome(null)
		uploadMutation.mutate(file)
	}

	const handleOpenMessage = (record: FinancialRecord, context: "RANKING" | "HEATMAP" = "HEATMAP") => {
		const history = allData.filter((item) => item.ug === record.ug && item.group === record.group && item.cod === record.cod)
		setSelectedHistoryForMessage(history)
		setSelectedRecordForMessage(record)
		setMessageContext(context)
		setIsMessageModalOpen(true)
	}

	const hierarchyOptions = buildHierarchyOptions(selectedHierarchyLevel, { uniqueODS, uniqueOrgaos, uniqueUGs })

	return (
		<HubLayout
			actions={
				<AuditorHeaderActions
					hasData={allData.length > 0}
					selectedMonth={selectedMonth}
					canEdit={canEdit}
					onPresent={() => setIsPresenting(true)}
					onOpenNote={() => setIsNoteModalOpen(true)}
					onImport={() => setIsUploadModalOpen(true)}
				/>
			}
		>
			{/* `canEdit` também aqui: fechar o gatilho não basta se o modal segue montável. */}
			<FileUploadModal isOpen={isUploadModalOpen && canEdit} onClose={() => setIsUploadModalOpen(false)} onUpload={handleFileUpload} />

			<AnalyticNoteModal isOpen={isNoteModalOpen} onClose={() => setIsNoteModalOpen(false)} dataset={noteDataset} />

			<PresentationMode
				isOpen={isPresenting}
				onClose={() => setIsPresenting(false)}
				data={baseFilteredData}
				selectedMonth={selectedMonth}
				availableMonths={uniqueMonths}
				timeFilter={timeFilter}
				scopeLabel={hierarchyLabel}
			/>

			<SiafiMessageModal
				isOpen={isMessageModalOpen}
				onClose={() => setIsMessageModalOpen(false)}
				record={selectedRecordForMessage}
				history={selectedHistoryForMessage}
				context={messageContext}
				timeFilter={timeFilter}
				analysisRunId={lastRunId}
			/>

			{/*
			 * Filtros da tela, no corpo — não no cabeçalho fixo, que é navegação e
			 * ação. Antes eles moravam numa barra de topo própria do auditor, a
			 * segunda do app: o usuário via duas barras empilhadas, e a de baixo
			 * repetia um botão de voltar que a trilha de cima já dava.
			 */}
			<div className="mb-6 flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-2">
					<span className="text-label text-muted-foreground">Agregar por</span>
					<SegmentedControl
						label="Agregar por"
						value={selectedHierarchyLevel}
						onValueChange={setSelectedHierarchyLevel}
						options={[
							{
								value: "ODS",
								label: (
									<>
										<Layers />
										ODS
									</>
								),
							},
							{
								value: "ORGAO",
								label: (
									<>
										<Database />
										Órgão
									</>
								),
							},
							{
								value: "UG",
								label: (
									<>
										<LayoutDashboard />
										UG
									</>
								),
							},
						]}
					/>
				</div>

				<div className="flex flex-col gap-2">
					<span className="text-label text-muted-foreground">{selectedHierarchyLevel === "ORGAO" ? "Órgão" : selectedHierarchyLevel}</span>
					<div className="w-48">
						<Combobox
							aria-label={`Filtrar por ${selectedHierarchyLevel}`}
							value={selectedHierarchyFilter[0]}
							onValueChange={(val) => setSelectedHierarchyFilter([val])}
							items={hierarchyOptions}
							placeholder={`Filtrar ${selectedHierarchyLevel}`}
						/>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<span className="text-label text-muted-foreground">Competência</span>
					<div className="w-48">
						<Combobox
							aria-label="Mês de referência"
							value={selectedMonth}
							onValueChange={setSelectedMonth}
							items={uniqueMonths.map((m) => ({ value: m, label: toShortDate(m) }))}
							placeholder="Mês de Ref."
						/>
					</div>
				</div>
			</div>

			<div className="space-y-6">
				{/* RESULTADO DA GRAVAÇÃO */}
				{persistOutcome && <PersistOutcomeBanner persistOutcome={persistOutcome} onClose={() => setPersistOutcome(null)} />}

				{/* FALHA DE LEITURA — distinta do estado vazio */}
				{storedError && localRows.length === 0 && (
					<div className={`mt-6 rounded-lg border p-4 text-body border-destructive/30 bg-destructive/10 text-destructive`}>
						<p className="font-bold">Não foi possível ler a série gravada</p>
						<p className="mt-1">{storedError instanceof Error ? storedError.message : "Erro desconhecido"} — a tela abaixo NÃO reflete o que está no banco.</p>
					</div>
				)}

				{/* EMPTY STATE */}
				{allData.length === 0 && loadingStored && (
					<div className="flex items-center justify-center gap-3 py-20 text-muted-foreground">
						<Loader2 className="w-5 h-5 animate-spin" />
						Carregando série persistida…
					</div>
				)}

				{allData.length === 0 && !loadingStored && !storedError && (
					<AuditorEmptyState canEdit={canEdit} loadingAccess={loadingAccess} isPending={uploadMutation.isPending} onUpload={() => setIsUploadModalOpen(true)} />
				)}

				{allData.length > 0 && (
					<>
						{/* CONTROLS BAR */}
						<AuditorControlsBar
							selectedGroup={selectedGroup}
							onSelectGroup={setSelectedGroup}
							timeFilter={timeFilter}
							onSelectTimeFilter={setTimeFilter}
							totalUGsCount={stats.totalUGsCount}
							hideZeros={hideZeros}
							onToggleHideZeros={() => setHideZeros(!hideZeros)}
						/>

						{/* KPIS */}
						<AuditorKpiCards stats={stats} trendSeries={trendSeries} />

						{/* EVOLUTION CHART */}
						<ChartWrapper
							title="Evolução Temporal"
							className="h-[550px]"
							allData={baseFilteredData}
							availableMonths={uniqueMonths}
							availableUGs={uniqueUGs}
							defaultGroup={selectedGroup}
							hideMonthFilter={true}
							hierarchyLevel={selectedHierarchyLevel}
							hierarchyFilter={selectedHierarchyFilter}
						>
							{(data, _isExpanded) => <EvolutionChart data={data} selectedMonth={selectedMonth} timeFilter={timeFilter} />}
						</ChartWrapper>

						{/* RANKING */}
						<ChartWrapper
							title={`Ranking de Evolução (${timeFilter === "ANUAL" ? "ANO" : timeFilter.substring(0, 3)})`}
							className="h-[500px]"
							allData={filteredDataForVisuals}
							availableMonths={uniqueMonths}
							availableUGs={uniqueUGs}
							defaultMonth={selectedMonth}
							defaultGroup={selectedGroup}
							hierarchyLevel={selectedHierarchyLevel}
							hierarchyFilter={selectedHierarchyFilter}
						>
							{(data) => <RankingList data={data} historicalData={baseFilteredData} comparisonLabel={comparisonLabel} onSendMessage={handleOpenMessage} />}
						</ChartWrapper>

						{/* COMPARISON CHART */}
						<div className="flex flex-col gap-6">
							<ChartWrapper
								title="Diferenças Atuais e Composição"
								className="h-[750px]"
								allData={filteredDataForVisuals}
								availableMonths={uniqueMonths}
								availableUGs={uniqueUGs}
								defaultMonth={selectedMonth}
								defaultGroup={selectedGroup}
								showRiskFilter={true}
								hierarchyLevel={selectedHierarchyLevel}
								hierarchyFilter={selectedHierarchyFilter}
							>
								{(data, isExpanded) => (
									<ComparisonChart
										data={data}
										isExpanded={isExpanded}
										setHierarchy={() => {}}
										hierarchyLevel={selectedHierarchyLevel}
										hierarchyFilter={selectedHierarchyFilter}
									/>
								)}
							</ChartWrapper>
						</div>

						{/* TEMPORAL HEATMAP */}
						<ChartWrapper
							title="Matriz de Calor Temporal"
							className="h-[85vh] w-full"
							allData={filteredDataForVisuals}
							availableMonths={uniqueMonths}
							availableUGs={uniqueUGs}
							defaultGroup="ALL"
							hierarchyLevel={selectedHierarchyLevel}
							hierarchyFilter={selectedHierarchyFilter}
						>
							{(data) => <TemporalHeatmap data={data} availableMonths={uniqueMonths} onSendMessage={handleOpenMessage} />}
						</ChartWrapper>
					</>
				)}
			</div>
		</HubLayout>
	)
}
