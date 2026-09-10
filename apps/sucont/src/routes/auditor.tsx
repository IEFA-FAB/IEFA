import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Activity, AlertTriangle, Database, FileSpreadsheet, FileText, Layers, LayoutDashboard, Loader2, Presentation, UploadCloud } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { AnalyticNoteModal } from "#/auditor/components/AnalyticNoteModal"
import { ComparisonChart, EvolutionChart } from "#/auditor/components/Charts"
import { ChartWrapper } from "#/auditor/components/ChartWrapper"
import { FileUploadModal } from "#/auditor/components/FileUploadModal"
import { HealthScoreGauge } from "#/auditor/components/HealthScoreGauge"
import { PresentationMode } from "#/auditor/components/PresentationMode"
import { RankingList } from "#/auditor/components/RankingList"
import { SiafiMessageModal } from "#/auditor/components/SiafiMessageModal"
import { StatCard } from "#/auditor/components/StatCard"
import { TemporalHeatmap } from "#/auditor/components/TemporalHeatmap"
import {
	applyRiskClassification,
	formatCurrency,
	normalizeData,
	parseDateString,
	rawRowsFromStoredBalances,
	rawRowsToBalancePayload,
	recalculateDeltas,
	toShortDate,
} from "#/auditor/services/dataProcessor"
import { parseExcelFile } from "#/auditor/services/excelParser"
import { buildReportDataset } from "#/auditor/services/report"
import { iccColor, iccLabel } from "#/auditor/theme"
import type { FinancialRecord, RawInputRow, TimeFilter } from "#/auditor/types"
import { AccountGroup } from "#/auditor/types"
import { requireToolAccess, useSucontAccess } from "#/auth/pbac"
import { HubLayout } from "#/components/hub-layout"
import { Button } from "#/components/ui/button"
import { Combobox } from "#/components/ui/combobox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty"
import { SegmentedControl } from "#/components/ui/segmented-control"
import { toast } from "#/components/ui/toast"
import { auditorBalancesQueryOptions } from "#/lib/queries"
import { type BalanceConflict, finalizeAuditorRunFn, saveAuditorBalancesFn, startAuditorRunFn } from "#/server/auditor.fn"

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

/** Lote de gravação. Acima disso o corpo do POST fica grande demais para um request só. */
const UPLOAD_CHUNK = 2000

interface PersistOutcome {
	/** "partial" = parte dos lotes entrou no banco antes da falha. */
	status: "complete" | "partial" | "failed"
	filename: string
	inserted: number
	unchanged: number
	changed: number
	duplicateGrains: number
	rowsWritten: number
	rowsTotal: number
	conflicts: BalanceConflict[]
	conflictsTruncated: boolean
	error?: string
}

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
	const baseFilteredData = useMemo(() => {
		return allData.filter((item) => {
			const matchSearch = item.ug.toLowerCase().includes(searchTerm.toLowerCase()) || item.cod.includes(searchTerm)
			const matchRisk = selectedRisk === "TODOS" || item.riskLevel === selectedRisk

			let matchHierarchy = true
			if (selectedHierarchyFilter.length > 0 && !selectedHierarchyFilter.includes("TODOS")) {
				if (selectedHierarchyLevel === "ODS") matchHierarchy = selectedHierarchyFilter.includes(item.ods)
				else if (selectedHierarchyLevel === "ORGAO") matchHierarchy = selectedHierarchyFilter.includes(item.orgaoSuperior)
				else matchHierarchy = selectedHierarchyFilter.includes(item.ug)
			}

			return matchSearch && matchHierarchy && matchRisk
		})
	}, [allData, searchTerm, selectedHierarchyLevel, selectedHierarchyFilter, selectedRisk])

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
	const previousKpiData = useMemo(() => {
		if (!selectedMonth || selectedMonth === "TODOS" || uniqueMonths.length === 0) return []

		let gap = 1
		if (timeFilter === "TRIMESTRAL") gap = 3
		if (timeFilter === "SEMESTRAL") gap = 6
		if (timeFilter === "ANUAL") gap = 12

		const [yearStr, monthStr] = selectedMonth.split("-")
		let year = parseInt(yearStr, 10)
		let month = parseInt(monthStr, 10)

		month -= gap
		while (month <= 0) {
			month += 12
			year -= 1
		}

		const prevMonthStr = `${year}-${month.toString().padStart(2, "0")}`

		return baseFilteredData.filter((item) => item.date === prevMonthStr && (selectedGroup === "ALL" || item.group === selectedGroup))
	}, [baseFilteredData, selectedMonth, uniqueMonths, selectedGroup, timeFilter])

	// 4. KPI calculations
	const stats = useMemo(() => {
		const totalDiff = kpiData.reduce((acc, curr) => acc + curr.difference, 0)
		const totalSiafi = kpiData.reduce((acc, curr) => acc + curr.siafiValue, 0)
		const totalSiloms = kpiData.reduce((acc, curr) => acc + curr.silomsValue, 0)

		const prevDiff = previousKpiData.reduce((acc, curr) => acc + curr.difference, 0)
		const prevSiafi = previousKpiData.reduce((acc, curr) => acc + curr.siafiValue, 0)
		const prevSiloms = previousKpiData.reduce((acc, curr) => acc + curr.silomsValue, 0)

		const calculateVar = (curr: number, prev: number) => {
			if (prev === 0) return curr > 0 ? 100 : 0
			return ((curr - prev) / prev) * 100
		}

		const diffVar = calculateVar(totalDiff, prevDiff)
		const siafiVar = calculateVar(totalSiafi, prevSiafi)
		const silomsVar = calculateVar(totalSiloms, prevSiloms)

		const topOffender =
			currentMonthVisuals.length > 0 ? currentMonthVisuals.reduce((prev, current) => (prev.difference > current.difference ? prev : current)) : null

		const topOffenderICC =
			topOffender && topOffender.siafiValue > 0
				? Math.max(0, (1 - topOffender.difference / topOffender.siafiValue) * 100)
				: topOffender?.difference === 0
					? 100
					: 0

		const totalUGsCount = new Set(currentMonthVisuals.map((d) => d.ug)).size

		const iccScore = totalSiafi > 0 ? Math.max(0, (1 - totalDiff / totalSiafi) * 100) : totalDiff === 0 ? 100 : 0

		return {
			totalDiff,
			totalSiafi,
			totalSiloms,
			topOffender,
			totalUGsCount,
			healthScore: iccScore,
			diffVar,
			siafiVar,
			silomsVar,
			topOffenderICC,
		}
	}, [kpiData, previousKpiData, currentMonthVisuals])

	// 3e. Trend series for mini charts
	const trendSeries = useMemo(() => {
		if (!selectedMonth || uniqueMonths.length === 0) return { diff: [], siafi: [], siloms: [] }
		const currentIndex = uniqueMonths.indexOf(selectedMonth)

		let gap = 1
		if (timeFilter === "TRIMESTRAL") gap = 3
		if (timeFilter === "SEMESTRAL") gap = 6
		if (timeFilter === "ANUAL") gap = 12

		const diffs: number[] = []
		const siafis: number[] = []
		const siloms: number[] = []

		for (let i = 5; i >= 0; i--) {
			const idx = currentIndex - i * gap
			if (idx >= 0) {
				const month = uniqueMonths[idx]
				const monthData = baseFilteredData.filter((item) => item.date === month && (selectedGroup === "ALL" || item.group === selectedGroup))
				diffs.push(monthData.reduce((acc, curr) => acc + curr.difference, 0))
				siafis.push(monthData.reduce((acc, curr) => acc + curr.siafiValue, 0))
				siloms.push(monthData.reduce((acc, curr) => acc + curr.silomsValue, 0))
			}
		}

		return { diff: diffs, siafi: siafis, siloms: siloms }
	}, [baseFilteredData, selectedMonth, uniqueMonths, selectedGroup, timeFilter])

	// Comparison label for ranking
	const comparisonLabel = useMemo(() => {
		if (!selectedMonth || kpiData.length === 0) return `Comparando ${timeFilter}`
		const sampleRecord = kpiData[0]

		const currShortYear = sampleRecord.year.toString().slice(-2)
		const currMonthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]
		const currShort = `${currMonthNames[sampleRecord.monthIndex]}/${currShortYear}`
		const prevDate = sampleRecord.previousDate || "N/A"

		return `Comparando ${currShort} contra ${prevDate}`
	}, [kpiData, selectedMonth, timeFilter])

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
	const hierarchyLabel = useMemo(
		() =>
			selectedHierarchyFilter.length === 0 || selectedHierarchyFilter.includes("TODOS")
				? "todas as UGs"
				: `${selectedHierarchyLevel === "ORGAO" ? "Órgão" : selectedHierarchyLevel} ${selectedHierarchyFilter.join(", ")}`,
		[selectedHierarchyFilter, selectedHierarchyLevel]
	)

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

			const outcome: PersistOutcome = {
				status: "failed",
				filename: file.name,
				inserted: 0,
				unchanged: 0,
				changed: 0,
				duplicateGrains: 0,
				rowsWritten: 0,
				rowsTotal: payload.length,
				conflicts: [],
				conflictsTruncated: false,
			}

			const periods = [...new Set(payload.map((r) => r.period))].sort()
			const { runId } = await startAuditorRunFn({
				data: {
					filename: file.name,
					recordsCount: payload.length,
					periodLabel: `${periods[0]} a ${periods[periods.length - 1]}`,
					summary: {
						periods: periods.length,
						ugs: new Set(payload.map((r) => r.ugCodigo)).size,
						sheetRows: parsed.length,
					},
				},
			})
			setLastRunId(runId)

			// A gravação é fatiada e o PostgREST não dá transação entre requests: uma
			// falha no lote 3 de 4 deixa os dois primeiros COMMITADOS. Anunciar "nada
			// foi gravado" nesse caso seria a mesma classe de mentira que este PR
			// existe para eliminar — então o erro é capturado e o que entrou é contado.
			try {
				for (let i = 0; i < payload.length; i += UPLOAD_CHUNK) {
					const slice = payload.slice(i, i + UPLOAD_CHUNK)
					const result = await saveAuditorBalancesFn({ data: { runId, rows: slice } })
					outcome.inserted += result.inserted
					outcome.unchanged += result.unchanged
					outcome.changed += result.changed
					outcome.duplicateGrains += result.duplicateGrains
					outcome.rowsWritten += slice.length
					outcome.conflictsTruncated = outcome.conflictsTruncated || result.conflictsTruncated
					for (const conflict of result.conflicts) {
						if (outcome.conflicts.length < 200) outcome.conflicts.push(conflict)
						else outcome.conflictsTruncated = true
					}
				}
				outcome.status = "complete"
			} catch (e) {
				outcome.error = e instanceof Error ? e.message : "Falha ao gravar"
				outcome.status = outcome.rowsWritten > 0 ? "partial" : "failed"
			}

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

	const hierarchyOptions = [
		{
			value: "TODOS",
			label: `Todas as ${selectedHierarchyLevel === "ODS" ? "ODSs" : selectedHierarchyLevel === "ORGAO" ? "Órgãos" : "UGs"}`,
		},
		...(selectedHierarchyLevel === "ODS" ? uniqueODS : selectedHierarchyLevel === "ORGAO" ? uniqueOrgaos : uniqueUGs).map((opt) => ({
			value: opt,
			label: opt,
		})),
	]

	return (
		<HubLayout
			actions={
				// `aria-label` fixo nos três: abaixo de `sm` o rótulo some e o botão fica
				// só com o ícone, sem nome acessível nenhum.
				<>
					{/* A nota é leitura da série: nível 1 basta, como o resto do painel. */}
					{allData.length > 0 && selectedMonth && (
						<>
							<Button variant="outline" size="sm" aria-label="Apresentar" onClick={() => setIsPresenting(true)}>
								<Presentation className="w-4 h-4" />
								<span className="hidden sm:inline">Apresentar</span>
							</Button>
							<Button variant="outline" size="sm" aria-label="Nota analítica" onClick={() => setIsNoteModalOpen(true)}>
								<FileText className="w-4 h-4" />
								<span className="hidden sm:inline">Nota analítica</span>
							</Button>
						</>
					)}
					{canEdit && (
						<Button size="sm" aria-label="Importar Excel" onClick={() => setIsUploadModalOpen(true)}>
							<UploadCloud className="w-4 h-4" />
							<span className="hidden sm:inline">Importar Excel</span>
						</Button>
					)}
				</>
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
				{persistOutcome && (
					<div
						className={`mt-6 rounded-lg border p-4 text-body ${
							persistOutcome.status === "complete"
								? "border-border bg-card text-foreground"
								: persistOutcome.status === "partial"
									? "border-destructive/30 bg-destructive/10 text-destructive"
									: "border-warning/30 bg-warning/10 text-warning"
						}`}
					>
						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<p className="font-bold">
									{persistOutcome.status === "complete"
										? "Série gravada"
										: persistOutcome.status === "partial"
											? "Gravação INCOMPLETA — a série no banco está pela metade"
											: "Análise não gravada"}
									<span className="font-normal text-muted-foreground"> · {persistOutcome.filename}</span>
								</p>

								{persistOutcome.status === "failed" ? (
									<p>{persistOutcome.error} — os números abaixo vêm do arquivo em memória e serão perdidos ao recarregar a página.</p>
								) : (
									<>
										{persistOutcome.status === "partial" && (
											<p className="font-medium">
												{persistOutcome.rowsWritten} de {persistOutcome.rowsTotal} saldos entraram antes da falha ({persistOutcome.error}). Suba o arquivo de
												novo — a gravação é idempotente e completa o que faltou.
											</p>
										)}
										<p>
											{persistOutcome.inserted} saldos novos · {persistOutcome.unchanged} sem alteração · {persistOutcome.changed} com valor diferente do que já
											estava no banco
										</p>
										{persistOutcome.duplicateGrains > 0 && (
											<p>{persistOutcome.duplicateGrains} linha(s) do arquivo repetiam a mesma competência/UG/grupo — valeu a última ocorrência.</p>
										)}
									</>
								)}
							</div>
							<Button
								variant="link"
								size="sm"
								onClick={() => setPersistOutcome(null)}
								className="text-label text-muted-foreground hover:text-foreground no-underline"
							>
								Fechar
							</Button>
						</div>

						{persistOutcome.conflicts.length > 0 && (
							<details className="mt-3">
								<summary className="cursor-pointer text-label text-muted-foreground">
									Competências que já existiam com outro valor ({persistOutcome.changed}
									{persistOutcome.conflictsTruncated ? ", listando as primeiras" : ""})
								</summary>
								<div className="mt-2 max-h-64 overflow-y-auto font-mono text-caption">
									{persistOutcome.conflicts.map((c) => (
										<div key={`${c.period}-${c.ugCodigo}-${c.accountGroup}`} className="py-0.5">
											{c.period} · {c.ugCodigo} · {c.accountGroup}: SIAFI {formatCurrency(c.previous.siafiValue)} → {formatCurrency(c.next.siafiValue)} · SILOMS{" "}
											{formatCurrency(c.previous.silomsValue)} → {formatCurrency(c.next.silomsValue)}
										</div>
									))}
								</div>
							</details>
						)}
					</div>
				)}

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
					<Empty className="mt-8">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FileSpreadsheet />
							</EmptyMedia>
							<EmptyTitle>Nenhuma competência na base</EmptyTitle>
							<EmptyDescription>
								{canEdit
									? "Importe uma planilha. A série fica gravada e reabre sozinha nos próximos acessos."
									: !loadingAccess &&
										"Ainda não há competência gravada, e seu acesso é somente leitura. Importar a planilha exige nível 2 no módulo sucont — peça a um gestor da SUCONT-4."}
							</EmptyDescription>
						</EmptyHeader>
						{canEdit && (
							<EmptyContent>
								<Button onClick={() => setIsUploadModalOpen(true)}>{uploadMutation.isPending ? "Gravando…" : "Carregar relatório"}</Button>
							</EmptyContent>
						)}
					</Empty>
				)}

				{allData.length > 0 && (
					<>
						{/* CONTROLS BAR */}
						{/*
						  `top-14` acompanha o cabeçalho do hub, que tem `h-14`. Com `top-16`
						  sobrava uma fresta de 8px entre as duas barras grudadas, e o conteúdo
						  rolava por dentro dela.

						  Flex, e não `grid-cols-12`: cada bloco aqui tem largura própria (as
						  quatro pílulas de período somam ~345px) e num slot de 4/12 colunas o
						  conteúdo transbordava a célula SEM recortar — de 768px a ~1400px os três
						  blocos se imprimiam uns por cima dos outros. Em flex o bloco que não cabe
						  desce de linha.
						*/}
						<div className={`sticky top-14 z-30 pt-4 pb-2 transition-colors bg-background/95 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6`}>
							<div className="flex flex-col gap-2 py-1 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between xl:gap-4">
								{/* Group Filters */}
								<div className="flex min-w-0 items-center gap-2 p-1 bg-transparent rounded-lg overflow-x-auto custom-scrollbar">
									{[
										{
											id: "ALL",
											label: "VISÃO GERAL",
											activeClass: "text-foreground border border-border",
										},
										{
											id: AccountGroup.BMP,
											label: "BMP",
											activeClass: "text-destructive border border-destructive shadow-[0_0_10px_rgba(220,38,38,0.2)]",
										},
										{
											id: AccountGroup.CONSUMO,
											label: "CONSUMO",
											activeClass: "text-action border border-action shadow-[0_0_10px_rgba(37,99,235,0.2)]",
										},
										{
											id: AccountGroup.INTANGIVEL,
											label: "INTANGÍVEL",
											activeClass: "text-success border border-success shadow-[0_0_10px_rgba(5,150,105,0.2)]",
										},
									].map((tab) => (
										<button
											key={tab.id}
											type="button"
											onClick={() => setSelectedGroup(tab.id)}
											className={`px-4 py-2 text-label rounded-lg transition-all whitespace-nowrap border border-transparent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 
                        ${selectedGroup === tab.id ? tab.activeClass : "text-muted-foreground hover:text-foreground hover:bg-muted"}
                      `}
										>
											{tab.label}
										</button>
									))}
								</div>

								{/* Time Filters + Toggles */}
								<div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:justify-end xl:gap-3">
									<div className={`flex max-w-full shrink-0 overflow-x-auto custom-scrollbar p-1 rounded-lg bg-muted`}>
										{(["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"] as TimeFilter[]).map((tf) => (
											<button
												key={tf}
												type="button"
												onClick={() => setTimeFilter(tf)}
												className={`px-3 py-2 text-label rounded-lg whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50
                          ${timeFilter === tf ? "bg-action text-action-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}
                        `}
											>
												{tf}
											</button>
										))}
									</div>

									<div className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-lg border bg-muted border-border">
										<span className="sr-only">Quantidade de UGs consideradas na visualização atual</span>
										<Database className="w-3.5 h-3.5 text-action" />
										{/* Abaixo de `sm` fica só a contagem: o rótulo custava uma linha inteira
										    da barra grudada, que já ocupa boa parte da tela pequena. O texto
										    completo continua no `sr-only` acima. */}
										<div className="flex flex-col leading-none">
											<span className="hidden sm:block text-label text-muted-foreground">Registros Totais</span>
											<span className={`text-caption text-foreground`}>{stats.totalUGsCount} UGs</span>
										</div>
									</div>

									<button
										type="button"
										onClick={() => setHideZeros(!hideZeros)}
										className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-lg text-label whitespace-nowrap border transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50
                      ${hideZeros ? "bg-warning/10 text-warning border-warning/50" : "text-muted-foreground border-border hover:text-foreground"}
                    `}
									>
										<AlertTriangle className="w-4 h-4" />
										{hideZeros ? "Ocultando Zerados" : "Mostrar Zerados"}
									</button>
								</div>
							</div>
						</div>

						{/* KPIS */}
						<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 pt-2">
							<StatCard
								title="Divergência Total"
								value={stats.totalDiff}
								subtitle="Diferença Absoluta"
								icon={AlertTriangle}
								bgClass="bg-destructive"
								trendData={trendSeries.diff}
								variation={`${Math.abs(stats.diffVar).toFixed(1)}% vs período anterior`}
								isPositive={stats.diffVar < 0}
							/>
							<StatCard
								title="Saldo SIAFI"
								value={stats.totalSiafi}
								subtitle="Contábil (Completo)"
								icon={LayoutDashboard}
								bgClass="bg-surface-inverted-border/50"
								trendData={trendSeries.siafi}
								variation={`${Math.abs(stats.siafiVar).toFixed(1)}% vs período anterior`}
								isPositive={stats.siafiVar >= 0}
							/>
							<StatCard
								title="Saldo SILOMS"
								value={stats.totalSiloms}
								subtitle="Físico (Completo)"
								icon={Layers}
								bgClass="bg-surface-inverted-border/50"
								trendData={trendSeries.siloms}
								variation={`${Math.abs(stats.silomsVar).toFixed(1)}% vs período anterior`}
								isPositive={stats.silomsVar >= 0}
							/>
							<StatCard
								title="Maior Divergência"
								value={stats.topOffender?.ug || "-"}
								subtitle={stats.topOffender ? formatCurrency(stats.topOffender.difference) : "-"}
								icon={AlertTriangle}
								bgClass=""
								iconColor={iccColor(stats.topOffenderICC)}
								variation={iccLabel(stats.topOffenderICC)}
								isPositive={stats.topOffenderICC >= 80}
							/>

							{/* ICC Card */}
							{/*
							  `min-h`, e não `h`: o cabeçalho quebra em três linhas na coluna estreita
							  do `lg:grid-cols-5` e o arco pede 100px logo abaixo — em altura fixa de
							  140px com `overflow-hidden` o medidor saía cortado, sem o rótulo da faixa.
							  Os `StatCard` ao lado usam o mesmo mínimo, e a linha do grid iguala a
							  altura pelo cartão mais alto.
							*/}
							<div
								className={`bg-card border-border hover:bg-muted/50 rounded-xl shadow-sm border p-4 flex flex-col justify-between transition-all group overflow-hidden relative min-h-[140px]`}
							>
								<div className="flex justify-between items-start relative z-10">
									<div className="flex-1">
										<p className="text-label text-muted-foreground mb-0.5">ICC</p>
										<h3 className="text-subheading text-foreground">Indicador de Conciliação Contábil</h3>
									</div>
									<div className="w-10 h-10 rounded-lg bg-action flex items-center justify-center flex-shrink-0 ml-2">
										<Activity className="w-5 h-5 text-action-foreground" />
									</div>
								</div>
								<div className="mt-1 flex-1 flex items-center justify-center">
									<HealthScoreGauge score={stats.healthScore} />
								</div>
							</div>
						</div>

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
