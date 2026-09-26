import { convertSamplePrice, resolveResearchUnit, SAMPLE_CONVERSION_REASON_LABELS } from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	type Column,
	type ColumnDef,
	type ColumnFiltersState,
	columnFacetingFeature,
	columnFilteringFeature,
	columnSizingFeature,
	columnVisibilityFeature,
	createFacetedRowModel,
	createFacetedUniqueValues,
	createFilteredRowModel,
	createSortedRowModel,
	type FilterFn,
	flexRender,
	type RowSelectionState,
	rowSelectionFeature,
	rowSortingFeature,
	type SortingState,
	sortFn_alphanumeric,
	sortFn_text,
	tableFeatures,
	useTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, Info, ListFilter, RefreshCw, TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/cn"
import {
	analyzeSamples,
	DEFAULT_PERIOD_MONTHS,
	fetchAllPagesForCatmat,
	filterByPeriod,
	isMethodAllowed,
	MAX_PAGES,
	type PriceStatsSummary,
} from "@/lib/price-research-utils"
import { savePrecoAuditFn } from "@/server/price-research.fn"
import type { ComprasMaterialPriceResult } from "@/types/domain/price-research"

// ─── Constants ────────────────────────────────────────────────────────────────

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
	if (!value) return "—"
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
		const [y, m, d] = value.substring(0, 10).split("-")
		return `${d}/${m}/${y}`
	}
	return value.substring(0, 10)
}

function getRecommendation(cv: number): { text: string; colorClass: string } {
	if (cv < 15) return { text: "Distribuição homogênea — média e mediana equivalentes.", colorClass: "text-success" }
	if (cv < 30) return { text: "Variabilidade moderada — prefira a mediana.", colorClass: "text-warning" }
	return { text: "Alta variabilidade — mediana recomendada (IN SEGES/ME 65/2021, art. 6º).", colorClass: "text-destructive" }
}

/** Recorte usado no cálculo do preço de referência (seleção manual ou todos os resultados exibidos). */
interface Analysis {
	stats: PriceStatsSummary
	/** Amostras com preço consideradas neste recorte (pós-janela e pós-filtros de coluna). */
	consideredCount: number
	validCount: number
	outlierCount: number
	validSamples: ComprasMaterialPriceResult[]
	outlierSamples: ComprasMaterialPriceResult[]
	inconsistentSamples: ComprasMaterialPriceResult[]
	fromSelection: boolean
}

const features = tableFeatures({
	columnFilteringFeature,
	columnFacetingFeature,
	columnSizingFeature,
	columnVisibilityFeature,
	rowSortingFeature,
	rowSelectionFeature,
	filteredRowModel: createFilteredRowModel(),
	sortedRowModel: createSortedRowModel(),
	facetedRowModel: createFacetedRowModel(),
	facetedUniqueValues: createFacetedUniqueValues(),
	// `text` é o que a auto-resolução escolhe para coluna de string pura
	// (nomeUasg, estado, nomeFornecedor, marca); sem ele a ordenação cai no
	// `basic`, que compara ASCII e não é total sobre `null`.
	sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

type Features = typeof features

const multiSelectFilter: FilterFn<Features, ComprasMaterialPriceResult> = (row, columnId, filterValue: string[]) => {
	if (filterValue.length === 0) return false
	const cellValue = String(row.getValue(columnId) ?? "")
	return filterValue.includes(cellValue)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailItem({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className="text-xs font-medium leading-snug">{value}</p>
		</div>
	)
}

function ContractHoverCard({ row }: { row: ComprasMaterialPriceResult }) {
	return (
		<HoverCard>
			<HoverCardTrigger className="inline-flex items-center text-muted-foreground/60 transition-colors hover:text-foreground">
				<Info className="size-3.5" aria-hidden="true" />
				<span className="sr-only">Detalhes da contratação</span>
			</HoverCardTrigger>
			<HoverCardContent className="w-96" side="left" align="start">
				<div className="space-y-3">
					{row.descricaoItem && (
						<div>
							<p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Descrição</p>
							<p className="text-xs leading-snug">{row.descricaoItem}</p>
						</div>
					)}
					<div className="grid grid-cols-2 gap-x-4 gap-y-2">
						{row.forma && <DetailItem label="Forma" value={row.forma} />}
						{row.criterioJulgamento && <DetailItem label="Critério" value={row.criterioJulgamento} />}
						{row.nomeOrgao && <DetailItem label="Órgão" value={row.nomeOrgao} />}
						{row.municipio && <DetailItem label="Município" value={`${row.municipio}${row.estado ? ` — ${row.estado}` : ""}`} />}
						{row.niFornecedor && <DetailItem label="CNPJ/CPF" value={row.niFornecedor} />}
						{row.percentualMaiorDesconto != null && <DetailItem label="Desconto máx." value={`${NUM.format(row.percentualMaiorDesconto)}%`} />}
						{row.capacidadeUnidadeFornecimento != null && (
							<DetailItem label="Capacidade" value={`${NUM.format(row.capacidadeUnidadeFornecimento)} ${row.nomeUnidadeFornecimento ?? ""}`} />
						)}
						{row.numeroItemCompra != null && <DetailItem label="Nº item" value={String(row.numeroItemCompra)} />}
					</div>
					{row.idCompra && <p className="border-t pt-1.5 font-mono text-[10px] text-muted-foreground">{row.idCompra}</p>}
				</div>
			</HoverCardContent>
		</HoverCard>
	)
}

function ColumnFilterPopover({ column }: { column: Column<Features, ComprasMaterialPriceResult, unknown> }) {
	const [search, setSearch] = useState("")
	const facetedValues = column.getFacetedUniqueValues()

	const sortedUniqueValues = useMemo(
		() =>
			Array.from(facetedValues.keys())
				.filter((v) => v != null)
				.map(String)
				.sort(),
		[facetedValues]
	)

	const filtered = search ? sortedUniqueValues.filter((v) => v.toLowerCase().includes(search.toLowerCase())) : sortedUniqueValues

	const filterValue = column.getFilterValue() as string[] | undefined
	const isActive = filterValue !== undefined

	function isChecked(value: string) {
		return !isActive || filterValue.includes(value)
	}

	function toggle(value: string) {
		if (!isActive) {
			column.setFilterValue(sortedUniqueValues.filter((v) => v !== value))
		} else if (filterValue.includes(value)) {
			column.setFilterValue(filterValue.filter((v) => v !== value))
		} else {
			const next = [...filterValue, value]
			column.setFilterValue(next.length >= sortedUniqueValues.length ? undefined : next)
		}
	}

	return (
		<Popover>
			<PopoverTrigger
				className={cn("inline-flex items-center rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground", isActive && "text-primary")}
			>
				<ListFilter className="size-3" aria-hidden="true" />
				<span className="sr-only">Filtrar coluna</span>
			</PopoverTrigger>
			<PopoverContent align="start" side="bottom" className="w-56 p-2">
				<Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs" />
				<div className="flex items-center gap-2 text-[11px]">
					<button type="button" className="text-muted-foreground transition-colors hover:text-foreground" onClick={() => column.setFilterValue(undefined)}>
						Selecionar todos
					</button>
					<span className="text-muted-foreground/40">·</span>
					<button type="button" className="text-muted-foreground transition-colors hover:text-foreground" onClick={() => column.setFilterValue([])}>
						Limpar
					</button>
				</div>
				<div className="-mx-1 max-h-48 space-y-0.5 overflow-y-auto px-1">
					{filtered.map((value) => (
						<div
							key={value}
							className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted"
							onClick={() => toggle(value)}
							onKeyDown={(e) => e.key === "Enter" && toggle(value)}
							role="option"
							aria-selected={isChecked(value)}
							tabIndex={0}
						>
							<Checkbox checked={isChecked(value)} onCheckedChange={() => toggle(value)} className="size-3.5" tabIndex={-1} />
							<span className="flex-1 truncate">{value || "—"}</span>
							<span className="tabular-nums text-muted-foreground text-[10px]">{facetedValues.get(value) ?? 0}</span>
						</div>
					))}
					{filtered.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">Nenhum valor</p>}
				</div>
			</PopoverContent>
		</Popover>
	)
}

function SortableHeader({ column, title, align }: { column: Column<Features, ComprasMaterialPriceResult, unknown>; title: string; align?: "left" | "right" }) {
	const sorted = column.getIsSorted()
	const canFilter = column.getCanFilter()

	return (
		<div className={cn("flex items-center gap-1", align === "right" && "justify-end")}>
			<button type="button" className="flex items-center gap-0.5 transition-colors hover:text-foreground" onClick={() => column.toggleSorting()}>
				{title}
				{sorted === "asc" ? (
					<ArrowUp className="size-3" />
				) : sorted === "desc" ? (
					<ArrowDown className="size-3" />
				) : (
					<ArrowUpDown className="size-3 opacity-30" />
				)}
			</button>
			{canFilter && <ColumnFilterPopover column={column} />}
		</div>
	)
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PriceResearchAuditIds {
	researchId: string
	researchItemId: string
}

interface PriceResearchModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	catmatCode: number
	catmatDescription?: string | null
	/** UUID da ATA já existente (opcional — permite link imediato do audit record) */
	ataId?: string
	/** UUID do item da ATA já existente (opcional — permite link imediato) */
	ataItemId?: string
	/** Unidade de compra do item: todo preço é convertido para ela antes da estatística. */
	targetUnit?: string | null
	/** Só chamado com a memória de cálculo gravada: preço sem registro não entra no anexo. */
	onApplyPrice?: (price: number, auditIds: PriceResearchAuditIds) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

/** Referência estável para o estado vazio — evita recriar o array a cada render. */
const EMPTY_RESULTS: ComprasMaterialPriceResult[] = []

export function PriceResearchModal({ open, onOpenChange, catmatCode, catmatDescription, ataId, ataItemId, targetUnit, onApplyPrice }: PriceResearchModalProps) {
	const [sorting, setSorting] = useState<SortingState>([])
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
	const [tableContainer, setTableContainer] = useState<HTMLDivElement | null>(null)
	// Janela de recência (IN SEGES 65/2021 Art. 5º) aplicada antes da tabela — o
	// que o usuário vê é exatamente o que entra no cálculo e na memória de auditoria.
	const [periodMonths, setPeriodMonths] = useState<number | null>(DEFAULT_PERIOD_MONTHS)
	const queryClient = useQueryClient()

	// Reseta o estado da tabela quando o item muda — ajustado durante o render
	// (com comparação do valor anterior) para não exibir a seleção/filtro antigos por um frame.
	const [prevCatmatCode, setPrevCatmatCode] = useState(catmatCode)
	if (catmatCode !== prevCatmatCode) {
		setPrevCatmatCode(catmatCode)
		setRowSelection({})
		setColumnFilters([])
		setSorting([])
		setPeriodMonths(DEFAULT_PERIOD_MONTHS)
	}

	// ── Data fetching (all pages) ─────────────────────────────────────────────

	const { data, isLoading, isError } = useQuery({
		queryKey: ["compras", "price-research", "all", catmatCode],
		queryFn: () => fetchAllPagesForCatmat(catmatCode),
		enabled: open,
		staleTime: 5 * 60 * 1000,
	})
	const allResults = data?.results ?? EMPTY_RESULTS

	const scopedResults = useMemo(() => (periodMonths ? filterByPeriod(allResults, periodMonths) : allResults), [allResults, periodMonths])
	const outOfPeriodCount = allResults.length - scopedResults.length
	const researchUnit = useMemo(() => resolveResearchUnit(targetUnit, scopedResults), [targetUnit, scopedResults])
	const unit = researchUnit?.unit ?? null

	// ── Columns ───────────────────────────────────────────────────────────────

	const baseColumns = useMemo<ColumnDef<Features, ComprasMaterialPriceResult>[]>(
		() => [
			{
				id: "select",
				header: ({ table }) => (
					<Checkbox
						checked={table.getIsAllRowsSelected()}
						indeterminate={table.getIsSomeRowsSelected()}
						onCheckedChange={(checked) => table.toggleAllRowsSelected(!!checked)}
						aria-label="Selecionar todos"
					/>
				),
				cell: ({ row }) => (
					<Checkbox checked={row.getIsSelected()} onCheckedChange={(checked) => row.toggleSelected(!!checked)} aria-label="Selecionar linha" />
				),
				enableSorting: false,
				enableColumnFilter: false,
				size: 32,
			},
			{
				id: "data",
				accessorFn: (row) => formatDate(row.dataResultado ?? row.dataCompra),
				header: ({ column }) => <SortableHeader column={column} title="Data" />,
				cell: ({ getValue }) => <span className="tabular-nums text-xs text-muted-foreground">{getValue() as string}</span>,
				filterFn: multiSelectFilter,
				size: 96,
			},
			{
				accessorKey: "nomeUasg",
				header: ({ column }) => <SortableHeader column={column} title="UASG" />,
				cell: ({ row }) => (
					<div className="text-xs">
						<div className="max-w-56 truncate" title={row.original.nomeUasg ?? undefined}>
							{row.original.nomeUasg ?? row.original.codigoUasg ?? "—"}
						</div>
						{row.original.codigoUasg && <div className="font-mono text-xs text-muted-foreground">{row.original.codigoUasg}</div>}
					</div>
				),
				filterFn: multiSelectFilter,
			},
			{
				accessorKey: "estado",
				header: ({ column }) => <SortableHeader column={column} title="UF" />,
				cell: ({ row }) =>
					row.original.estado ? (
						<Badge variant="secondary" className="text-xs font-normal">
							{row.original.estado}
						</Badge>
					) : (
						<span className="text-muted-foreground">—</span>
					),
				filterFn: multiSelectFilter,
				size: 64,
			},
			{
				accessorKey: "quantidade",
				header: ({ column }) => <SortableHeader column={column} title="Qtd" align="right" />,
				cell: ({ row }) =>
					row.original.quantidade !== null ? (
						<span className="tabular-nums text-xs">
							{NUM.format(row.original.quantidade)}{" "}
							<span className="text-muted-foreground">{row.original.siglaUnidadeFornecimento ?? row.original.siglaUnidadeMedida ?? ""}</span>
						</span>
					) : (
						<span className="text-muted-foreground">—</span>
					),
				enableColumnFilter: false,
				size: 96,
			},
			{
				accessorKey: "precoUnitario",
				header: ({ column }) => <SortableHeader column={column} title="Preço (embalagem)" align="right" />,
				cell: ({ row }) =>
					row.original.precoUnitario !== null ? (
						<span className="tabular-nums text-xs text-muted-foreground">{BRL.format(row.original.precoUnitario)}</span>
					) : (
						<span className="text-muted-foreground">—</span>
					),
				enableColumnFilter: false,
				size: 112,
			},
			{
				id: "convertedPrice",
				accessorFn: (row) => {
					if (!unit) return null
					const conversion = convertSamplePrice(row, unit)
					return conversion.ok ? conversion.price : null
				},
				header: ({ column }) => <SortableHeader column={column} title={unit ? `Preço / ${unit}` : "Preço convertido"} align="right" />,
				cell: ({ row }) => {
					if (!unit || row.original.precoUnitario === null) return <span className="text-muted-foreground">—</span>
					const conversion = convertSamplePrice(row.original, unit)
					if (!conversion.ok) {
						return (
							<Badge variant="outline" className="text-xs font-normal" title={SAMPLE_CONVERSION_REASON_LABELS[conversion.reason]}>
								incomparável
							</Badge>
						)
					}
					return (
						<span className="tabular-nums font-medium" title={conversion.explanation}>
							{BRL.format(conversion.price)}
						</span>
					)
				},
				enableColumnFilter: false,
				size: 112,
			},
			{
				accessorKey: "nomeFornecedor",
				header: ({ column }) => <SortableHeader column={column} title="Fornecedor" />,
				cell: ({ row }) => (
					<div className="max-w-44 truncate text-xs" title={row.original.nomeFornecedor ?? undefined}>
						{row.original.nomeFornecedor ?? "—"}
					</div>
				),
				filterFn: multiSelectFilter,
			},
			{
				accessorKey: "marca",
				header: ({ column }) => <SortableHeader column={column} title="Marca" />,
				cell: ({ row }) => <div className="max-w-32 truncate text-xs text-muted-foreground">{row.original.marca || "—"}</div>,
				filterFn: multiSelectFilter,
			},
		],
		[unit]
	)

	const columns = useMemo<ColumnDef<Features, ComprasMaterialPriceResult>[]>(() => {
		const detailsCol: ColumnDef<Features, ComprasMaterialPriceResult> = {
			id: "details",
			cell: ({ row }) => <ContractHoverCard row={row.original} />,
			enableSorting: false,
			enableColumnFilter: false,
			size: 32,
		}
		return [...baseColumns, detailsCol]
	}, [baseColumns])

	// ── Table instance ────────────────────────────────────────────────────────

	const table = useTable({
		features,
		data: scopedResults,
		columns,
		state: { sorting, columnFilters, rowSelection },
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onRowSelectionChange: setRowSelection,
		enableRowSelection: true,
		enableSortingRemoval: true,
		getRowId: (row, index) => `${row.idCompra}-${row.idItemCompra}-${index}`,
	})

	// ── Virtualizer ───────────────────────────────────────────────────────────

	const { rows } = table.getRowModel()

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => tableContainer,
		estimateSize: () => 44,
		overscan: 15,
	})

	const virtualRows = virtualizer.getVirtualItems()
	const totalSize = virtualizer.getTotalSize()
	const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
	const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0

	// ── Stats ─────────────────────────────────────────────────────────────────

	const selectedRows = table.getSelectedRowModel().rows
	const filteredRows = table.getFilteredRowModel().rows

	// Full analysis: IQR sobre as linhas exibidas — mesma função usada na pesquisa
	// em lote, para que manual e automático não divirjam. As linhas já vêm
	// recortadas pela janela de recência, daí periodMonths: null aqui.
	const fullAnalysis = useMemo<Analysis | null>(() => {
		if (!unit) return null
		const analysis = analyzeSamples(
			filteredRows.map((r) => r.original),
			unit,
			{ removeOutliers: true }
		)
		if (!analysis) return null
		return {
			stats: analysis.stats,
			consideredCount: filteredRows.filter((r) => r.original.precoUnitario !== null).length,
			validCount: analysis.validSamples.length,
			outlierCount: analysis.outlierSamples.length,
			validSamples: analysis.validSamples,
			outlierSamples: analysis.outlierSamples,
			inconsistentSamples: analysis.inconsistentSamples,
			fromSelection: false,
		}
	}, [filteredRows, unit])

	// Seleção manual: sem IQR (o usuário escolheu as linhas), mas com a mesma conversão de
	// unidade — linha incomparável selecionada sai como inconsistente, não entra na conta.
	const activeAnalysis = useMemo<Analysis | null>(() => {
		if (selectedRows.length === 0 || !unit) return fullAnalysis
		const samples = selectedRows.map((r) => r.original)
		const analysis = analyzeSamples(samples, unit, { removeOutliers: false })
		if (!analysis) return fullAnalysis
		return {
			stats: analysis.stats,
			consideredCount: samples.filter((s) => s.precoUnitario !== null).length,
			validCount: analysis.validSamples.length,
			outlierCount: 0,
			validSamples: analysis.validSamples,
			outlierSamples: [],
			inconsistentSamples: analysis.inconsistentSamples,
			fromSelection: true,
		}
	}, [selectedRows, fullAnalysis, unit])

	// ── Audit save ────────────────────────────────────────────────────────────

	const [isSavingMethod, setIsSavingMethod] = useState<"mean" | "median" | null>(null)

	const { mutateAsync: saveAudit } = useMutation({
		mutationFn: savePrecoAuditFn,
	})

	async function handleUsePrice(price: number, method: "mean" | "median") {
		if (!onApplyPrice || !activeAnalysis || !researchUnit) return
		setIsSavingMethod(method)
		try {
			const auditIds = await saveAudit({
				data: {
					catmatCodigo: catmatCode,
					catmatDescricao: catmatDescription ?? null,
					method,
					referencePrice: price,
					stats: activeAnalysis.stats,
					// Funil auditável: bruto da API → recorte considerado → comparáveis → válidas pós-IQR.
					rawCount: allResults.filter((r) => r.precoUnitario !== null).length,
					dateFilteredCount: activeAnalysis.consideredCount,
					periodMonths,
					validCount: activeAnalysis.validCount,
					outlierCount: activeAnalysis.outlierCount,
					validSamples: activeAnalysis.validSamples,
					outlierSamples: activeAnalysis.outlierSamples,
					inconsistentSamples: activeAnalysis.inconsistentSamples,
					measureUnit: researchUnit.unit,
					unitInferred: researchUnit.inferred,
					ataId: ataId ?? undefined,
					ataItemId: ataItemId ?? undefined,
				},
			})
			onApplyPrice(price, auditIds)
			onOpenChange(false)
		} catch (err) {
			// Sem memória de cálculo o preço não é aplicado: preço sem registro não se audita.
			toast.error(err instanceof Error ? `Preço não aplicado: ${err.message}` : "Preço não aplicado: a memória de cálculo não foi gravada.")
		} finally {
			setIsSavingMethod(null)
		}
	}

	// ── Handlers ──────────────────────────────────────────────────────────────

	function handleRefresh() {
		queryClient.invalidateQueries({ queryKey: ["compras", "price-research", "all", catmatCode] })
		setRowSelection({})
		setColumnFilters([])
		setSorting([])
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[95vw] sm:max-w-[90vw] max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<TrendingUp className="size-4 text-primary" aria-hidden="true" />
						Pesquisa de Preço — CATMAT {catmatCode}
					</DialogTitle>
					{catmatDescription && <DialogDescription className="truncate">{catmatDescription}</DialogDescription>}
				</DialogHeader>

				{/* ── Toolbar ── */}
				<div className="flex items-center gap-3 flex-wrap">
					{!isLoading && allResults.length > 0 && (
						<span className="text-xs text-muted-foreground">{allResults.length.toLocaleString("pt-BR")} registros totais</span>
					)}
					{!isLoading && allResults.length > 0 && (
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setPeriodMonths((prev) => (prev ? null : DEFAULT_PERIOD_MONTHS))}
							className="h-7 px-2 text-xs gap-1.5"
						>
							<CalendarClock className="size-3.5" aria-hidden="true" />
							{periodMonths ? `Últimos ${periodMonths} meses${outOfPeriodCount > 0 ? ` (${outOfPeriodCount} fora)` : ""}` : "Todo o histórico"}
						</Button>
					)}
					{data?.truncated && (
						<span className="text-xs text-warning">
							Amostra parcial: {allResults.length.toLocaleString("pt-BR")} de {data.totalRegistros.toLocaleString("pt-BR")} registros (teto de {MAX_PAGES}{" "}
							páginas)
						</span>
					)}
					{columnFilters.length > 0 && (
						<Button size="sm" variant="ghost" onClick={() => setColumnFilters([])} className="h-7 px-2 text-xs">
							Limpar filtros
						</Button>
					)}
					{selectedRows.length > 0 && (
						<Button size="sm" variant="ghost" onClick={() => setRowSelection({})} className="h-7 px-2 text-xs">
							Limpar seleção ({selectedRows.length})
						</Button>
					)}
					<Button size="sm" variant="outline" onClick={handleRefresh} disabled={isLoading} className="ml-auto gap-1.5">
						<RefreshCw className={isLoading ? "animate-spin" : ""} />
						Atualizar
					</Button>
				</div>

				{/* ── Stats ── */}
				{activeAnalysis && (
					<div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
						{/* Sample info header */}
						<p className="text-[11px] text-muted-foreground">
							{activeAnalysis.fromSelection ? "Seleção manual" : periodMonths ? `Resultados dos últimos ${periodMonths} meses` : "Todo o histórico"}
							{" · "}
							<span className="font-medium text-foreground">{activeAnalysis.validCount}</span> amostras válidas
							{activeAnalysis.outlierCount > 0 && (
								<>
									{" "}
									· <span className="text-warning">{activeAnalysis.outlierCount} outlier(s) removido(s) (IQR)</span>
								</>
							)}
							{activeAnalysis.inconsistentSamples.length > 0 && (
								<>
									{" "}
									·{" "}
									<span className="text-warning">
										{activeAnalysis.inconsistentSamples.length} incomparáve{activeAnalysis.inconsistentSamples.length !== 1 ? "is" : "l"} com {unit}
									</span>
								</>
							)}
							{" · "}
							{activeAnalysis.stats.uniqueSources} UASG(s)
							{" · "}
							preços por <span className="font-medium text-foreground">{unit}</span>
						</p>
						{researchUnit?.inferred && (
							<p className="text-hint text-warning">
								O item de compra não declara unidade. Os preços foram convertidos para {unit}, a unidade predominante nas amostras: confira se a quantidade do
								anexo está na mesma unidade.
							</p>
						)}

						{/* 4-column grid: Média | Mediana | Mínimo | Máximo */}
						<div className="grid grid-cols-4 gap-3">
							<div className="text-center">
								<p className="text-xs text-muted-foreground">Média</p>
								<p className="text-sm font-semibold tabular-nums">{BRL.format(activeAnalysis.stats.mean)}</p>
								{onApplyPrice && (
									<button
										type="button"
										disabled={isSavingMethod !== null || !isMethodAllowed("mean", activeAnalysis.stats)}
										title={
											isMethodAllowed("mean", activeAnalysis.stats)
												? undefined
												: "A média passa da mediana: o preço estimado não pode superá-la (IN SEGES/ME 65/2021, art. 6º, § 6º)."
										}
										className="mt-0.5 text-[11px] text-primary hover:underline disabled:opacity-50"
										onClick={() => handleUsePrice(activeAnalysis.stats.mean, "mean")}
									>
										{isSavingMethod === "mean" ? "Salvando…" : "Usar"}
									</button>
								)}
							</div>
							<div className="border-l text-center">
								<p className="text-xs text-muted-foreground">Mediana</p>
								<p className="text-sm font-semibold tabular-nums">{BRL.format(activeAnalysis.stats.median)}</p>
								{onApplyPrice && (
									<button
										type="button"
										disabled={isSavingMethod !== null}
										className="mt-0.5 text-[11px] text-primary hover:underline disabled:opacity-50"
										onClick={() => handleUsePrice(activeAnalysis.stats.median, "median")}
									>
										{isSavingMethod === "median" ? "Salvando…" : "Usar"}
									</button>
								)}
							</div>
							<div className="border-l text-center">
								<p className="text-xs text-muted-foreground">Mínimo</p>
								<p className="text-sm font-semibold tabular-nums">{BRL.format(activeAnalysis.stats.min)}</p>
							</div>
							<div className="border-l text-center">
								<p className="text-xs text-muted-foreground">Máximo</p>
								<p className="text-sm font-semibold tabular-nums">{BRL.format(activeAnalysis.stats.max)}</p>
							</div>
						</div>

						{/* Recommendation footer */}
						<div className="flex items-center gap-2 text-[11px] text-muted-foreground border-t pt-2">
							<span>
								σ {BRL.format(activeAnalysis.stats.stdDev)} · CV {activeAnalysis.stats.cv.toFixed(1)}%
							</span>
							<span className={`ml-1 ${getRecommendation(activeAnalysis.stats.cv).colorClass}`}>{getRecommendation(activeAnalysis.stats.cv).text}</span>
						</div>
					</div>
				)}

				{/* ── Table ── */}
				<div ref={setTableContainer} className="flex-1 overflow-y-auto min-h-0 rounded-md border">
					{isLoading ? (
						<div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
							<Spinner className="size-4" />
							Consultando Compras.gov.br...
						</div>
					) : isError ? (
						<div className="py-12 text-center">
							<p className="text-sm text-destructive">Erro ao consultar a API. Verifique a conexão e tente novamente.</p>
						</div>
					) : allResults.length === 0 ? (
						<div className="py-12 text-center">
							<p className="text-sm text-muted-foreground">Nenhum resultado encontrado para este item.</p>
						</div>
					) : (
						<Table>
							<TableHeader className="sticky top-0 z-10 bg-background">
								{table.getHeaderGroups().map((headerGroup) => (
									<TableRow key={headerGroup.id}>
										{headerGroup.headers.map((header) => (
											<TableHead key={header.id} style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined}>
												{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
											</TableHead>
										))}
									</TableRow>
								))}
							</TableHeader>
							<TableBody>
								{paddingTop > 0 && (
									<tr>
										<td colSpan={columns.length} style={{ height: paddingTop, padding: 0, border: "none" }} />
									</tr>
								)}
								{virtualRows.map((virtualRow) => {
									const row = rows[virtualRow.index]
									return (
										<TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
											{row.getVisibleCells().map((cell) => (
												<TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
											))}
										</TableRow>
									)
								})}
								{paddingBottom > 0 && (
									<tr>
										<td colSpan={columns.length} style={{ height: paddingBottom, padding: 0, border: "none" }} />
									</tr>
								)}
								{rows.length === 0 && !isLoading && (
									<TableRow>
										<TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
											Nenhum resultado com os filtros aplicados.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					)}
				</div>

				{/* ── Footer ── */}
				{!isLoading && allResults.length > 0 && (
					<div className="flex items-center text-xs text-muted-foreground pt-1">
						<span>
							{filteredRows.length === allResults.length
								? `${allResults.length.toLocaleString("pt-BR")} resultados`
								: `${filteredRows.length.toLocaleString("pt-BR")} de ${allResults.length.toLocaleString("pt-BR")} resultados`}
							{periodMonths && outOfPeriodCount > 0 && <span> · {outOfPeriodCount.toLocaleString("pt-BR")} fora da janela</span>}
							{selectedRows.length > 0 && <span className="font-medium text-foreground"> · {selectedRows.length} selecionados</span>}
						</span>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
