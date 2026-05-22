import { useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight, RefreshCw, TrendingUp } from "lucide-react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { usePriceResearch } from "@/hooks/data/usePriceResearch"

// ─── Constants ────────────────────────────────────────────────────────────────

const UF_OPTIONS = [
	{ value: "ALL", label: "Todos os estados" },
	"AC",
	"AL",
	"AM",
	"AP",
	"BA",
	"CE",
	"DF",
	"ES",
	"GO",
	"MA",
	"MG",
	"MS",
	"MT",
	"PA",
	"PB",
	"PE",
	"PI",
	"PR",
	"RJ",
	"RN",
	"RO",
	"RR",
	"RS",
	"SC",
	"SE",
	"SP",
	"TO",
].map((v) => (typeof v === "string" ? { value: v, label: v } : v))

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

function mediana(values: number[]): number | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PriceResearchModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	catmatCode: number
	catmatDescription?: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PriceResearchModal({ open, onOpenChange, catmatCode, catmatDescription }: PriceResearchModalProps) {
	const [pagina, setPagina] = useState(1)
	const [estado, setEstado] = useState<string | null>(null)
	const queryClient = useQueryClient()

	function handleRefresh() {
		queryClient.invalidateQueries({ queryKey: ["compras", "price-research", catmatCode] })
	}

	const { data, isLoading, isError } = usePriceResearch({
		catmatCode: open ? catmatCode : null,
		pagina,
		estado,
	})

	const results = data?.resultado ?? []
	const totalPaginas = data?.totalPaginas ?? 1
	const totalRegistros = data?.totalRegistros ?? 0

	const prices = results.map((r) => r.precoUnitario).filter((p): p is number => p !== null)
	const statsMin = prices.length > 0 ? Math.min(...prices) : null
	const statsMax = prices.length > 0 ? Math.max(...prices) : null
	const statsMediana = mediana(prices)

	function handleEstadoChange(value: string) {
		setEstado(value === "ALL" ? null : value)
		setPagina(1)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<TrendingUp className="size-4 text-primary" aria-hidden="true" />
						Pesquisa de Preço — CATMAT {catmatCode}
					</DialogTitle>
					{catmatDescription && <DialogDescription className="truncate">{catmatDescription}</DialogDescription>}
				</DialogHeader>

				{/* ── Filter ── */}
				<div className="flex items-center gap-3 flex-wrap">
					<div className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground whitespace-nowrap">Filtrar por UF:</span>
						<Select value={estado ?? "ALL"} onValueChange={handleEstadoChange}>
							<SelectTrigger className="w-44">
								<SelectValue placeholder="Todos os estados">
									{estado ? (UF_OPTIONS.find((o) => o.value === estado)?.label ?? estado) : "Todos os estados"}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{UF_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{totalRegistros > 0 && <span className="text-xs text-muted-foreground">{totalRegistros.toLocaleString("pt-BR")} registros encontrados</span>}
					<Button size="sm" variant="outline" onClick={handleRefresh} disabled={isLoading} className="ml-auto gap-1.5">
						<RefreshCw className={isLoading ? "animate-spin" : ""} />
						Atualizar
					</Button>
				</div>

				{/* ── Stats ── */}
				{statsMin !== null && (
					<div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 px-4 py-3">
						<div className="text-center">
							<p className="text-xs text-muted-foreground">Mínimo (página)</p>
							<p className="text-sm font-semibold tabular-nums">{BRL.format(statsMin)}</p>
						</div>
						<div className="text-center border-x">
							<p className="text-xs text-muted-foreground">Mediana (página)</p>
							<p className="text-sm font-semibold tabular-nums">{statsMediana !== null ? BRL.format(statsMediana) : "—"}</p>
						</div>
						<div className="text-center">
							<p className="text-xs text-muted-foreground">Máximo (página)</p>
							<p className="text-sm font-semibold tabular-nums">{BRL.format(statsMax as number)}</p>
						</div>
					</div>
				)}

				{/* ── Table ── */}
				<div className="flex-1 overflow-y-auto min-h-0 rounded-md border">
					{isLoading ? (
						<div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
							<Spinner className="size-4" />
							Consultando Compras.gov.br...
						</div>
					) : isError ? (
						<div className="py-12 text-center">
							<p className="text-sm text-destructive">Erro ao consultar a API. Verifique a conexão e tente novamente.</p>
						</div>
					) : results.length === 0 ? (
						<div className="py-12 text-center">
							<p className="text-sm text-muted-foreground">Nenhum resultado encontrado para este item{estado ? ` em ${estado}` : ""}.</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-24">Data</TableHead>
									<TableHead>UASG</TableHead>
									<TableHead className="w-12">UF</TableHead>
									<TableHead className="text-right w-24">Qtd</TableHead>
									<TableHead className="text-right w-28">Preço Un.</TableHead>
									<TableHead>Fornecedor</TableHead>
									<TableHead>Marca</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{results.map((row, idx) => (
									<TableRow
										// biome-ignore lint/suspicious/noArrayIndexKey: API doesn't provide stable IDs
										key={`${row.idCompra}-${row.idItemCompra}-${idx}`}
									>
										<TableCell className="text-xs tabular-nums text-muted-foreground">{formatDate(row.dataResultado ?? row.dataCompra)}</TableCell>
										<TableCell className="text-xs">
											<div className="truncate max-w-48" title={row.nomeUasg ?? undefined}>
												{row.nomeUasg ?? row.codigoUasg ?? "—"}
											</div>
											{row.codigoUasg && <div className="text-xs text-muted-foreground font-mono">{row.codigoUasg}</div>}
										</TableCell>
										<TableCell>
											{row.estado ? (
												<Badge variant="secondary" className="text-xs font-normal">
													{row.estado}
												</Badge>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell className="text-right tabular-nums text-xs">
											{row.quantidade !== null ? (
												<span>
													{NUM.format(row.quantidade)}{" "}
													<span className="text-muted-foreground">{row.siglaUnidadeFornecimento ?? row.siglaUnidadeMedida ?? ""}</span>
												</span>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell className="text-right tabular-nums font-medium">
											{row.precoUnitario !== null ? BRL.format(row.precoUnitario) : <span className="text-muted-foreground">—</span>}
										</TableCell>
										<TableCell className="text-xs">
											<div className="truncate max-w-40" title={row.nomeFornecedor ?? undefined}>
												{row.nomeFornecedor ?? "—"}
											</div>
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											<div className="truncate max-w-32">{row.marca || "—"}</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</div>

				{/* ── Pagination ── */}
				{!isLoading && totalPaginas > 1 && (
					<div className="flex items-center justify-between pt-1">
						<Button size="sm" variant="outline" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="gap-1">
							<ChevronLeft className="size-4" aria-hidden="true" />
							Anterior
						</Button>
						<span className="text-sm text-muted-foreground tabular-nums">
							Página {pagina} de {totalPaginas}
						</span>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
							disabled={pagina >= totalPaginas}
							className="gap-1"
						>
							Próxima
							<ChevronRight className="size-4" aria-hidden="true" />
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
