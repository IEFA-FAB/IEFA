import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { ArrowLeft, CheckCircle2, CircleHelp, RefreshCw, XCircle } from "lucide-react"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { fetchNfeDocumentFn, fetchNfeItemSuggestionsFn, type NfeItemRow, resolveNfeItemFn, runNfeMatchingFn } from "@/server/nfe.fn"

export const Route = createFileRoute("/_protected/_modules/storage/$kitchenId/nfe/$nfeId")({
	beforeLoad: (opts) => requirePermission(opts, "storage", 1),
	loader: ({ params }) => fetchNfeDocumentFn({ data: { nfeDocumentId: params.nfeId } }),
	component: NfeDetailPage,
	head: () => ({
		meta: [{ title: "NF-e — SISUB" }],
	}),
})

const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 })

const STATUS_META: Record<NfeItemRow["match_status"], { label: string; icon: typeof CheckCircle2; className: string }> = {
	matched: { label: "Casado", icon: CheckCircle2, className: "text-success" },
	review: { label: "Revisar", icon: CircleHelp, className: "text-warning" },
	no_match: { label: "Sem match", icon: XCircle, className: "text-destructive" },
	pending: { label: "Pendente", icon: CircleHelp, className: "text-muted-foreground" },
}

interface Suggestion {
	purchase_item_id: string
	description: string
	score: number
}

function NfeItemResolution({ item, onResolved }: { item: NfeItemRow; onResolved: () => void }) {
	const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
	const [loading, setLoading] = useState(false)

	async function loadSuggestions() {
		setLoading(true)
		try {
			setSuggestions(await fetchNfeItemSuggestionsFn({ data: { nfeItemId: item.id } }))
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao buscar sugestões")
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="ml-6 py-2 space-y-2">
			{suggestions == null ? (
				<Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadSuggestions} disabled={loading}>
					{loading ? <Spinner className="size-3" /> : "Ver candidatos"}
				</Button>
			) : suggestions.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					Nenhum candidato por similaridade. Vincule um GTIN ao item de insumo correspondente (Insumos → item) e rode o matching de novo.
				</p>
			) : (
				<div className="space-y-1">
					<p className="text-label text-muted-foreground">Candidatos (similaridade + GPC) — a resolução aprende o fornecedor:</p>
					{suggestions.map((s) => (
						<SuggestionRow key={s.purchase_item_id} nfeItemId={item.id} suggestion={s} onResolved={onResolved} />
					))}
				</div>
			)}
		</div>
	)
}

function SuggestionRow({ nfeItemId, suggestion, onResolved }: { nfeItemId: string; suggestion: Suggestion; onResolved: () => void }) {
	const [resolving, setResolving] = useState(false)

	// A resolução manual liga a um ingredient_item; a sugestão traz purchase_item —
	// o servidor resolve o ingredient_item default do purchase_item escolhido.
	async function resolve() {
		setResolving(true)
		try {
			const result = await resolveNfeItemFn({ data: { nfeItemId, purchaseItemId: suggestion.purchase_item_id } })
			toast.success(result.status === "matched" ? "Item resolvido e conversão calculada" : "Item vinculado — falta conversão de unidade (fica em revisão)")
			onResolved()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao resolver item")
		} finally {
			setResolving(false)
		}
	}

	return (
		<div className="flex items-center gap-2 text-xs">
			<Badge variant="outline" className="text-[10px] tabular-nums shrink-0">
				{(suggestion.score * 100).toFixed(0)}%
			</Badge>
			<span className="truncate">{suggestion.description}</span>
			<Button size="sm" variant="ghost" className="h-6 text-xs px-2 ml-auto shrink-0" onClick={resolve} disabled={resolving}>
				{resolving ? <Spinner className="size-3" /> : "Vincular"}
			</Button>
		</div>
	)
}

function NfeDetailPage() {
	const doc = Route.useLoaderData()
	const router = useRouter()
	const [rematching, setRematching] = useState(false)

	async function rematch() {
		setRematching(true)
		try {
			const result = await runNfeMatchingFn({ data: { nfeDocumentId: doc.id } })
			toast.success(`Matching: ${result.matched} casados, ${result.review} em revisão, ${result.noMatch} sem match`)
			router.invalidate()
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao rodar matching")
		} finally {
			setRematching(false)
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title={`NF-e ${doc.supplier_name ?? doc.access_key}`} description={`Chave ${doc.access_key}`}>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5"
					render={<Link to="/storage/$kitchenId/nfe" params={{ kitchenId: Route.useParams().kitchenId }} />}
					nativeButton={false}
				>
					<ArrowLeft className="size-4" />
					Voltar
				</Button>
				<Button variant="outline" size="sm" className="gap-1.5" onClick={rematch} disabled={rematching}>
					{rematching ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
					Rodar matching
				</Button>
			</PageHeader>

			<Card>
				<CardContent className="pt-4 px-0 pb-0">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b bg-muted/40 text-xs text-muted-foreground">
								<th className="py-2 px-3 text-left text-label w-10">#</th>
								<th className="py-2 px-2 text-left text-label">Produto (nota)</th>
								<th className="py-2 px-2 text-left text-label w-32">GTIN</th>
								<th className="py-2 px-2 text-right text-label w-28">Qtd (uCom)</th>
								<th className="py-2 px-2 text-right text-label w-32">Qtd base</th>
								<th className="py-2 px-2 text-center text-label w-28">Matching</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/60">
							{doc.items.map((item) => {
								const meta = STATUS_META[item.match_status]
								const Icon = meta.icon
								const needsResolution = item.match_status === "review" || item.match_status === "no_match"
								return (
									<>
										<tr key={item.id}>
											<td className="py-2.5 px-3 text-xs font-mono text-muted-foreground">{item.n_item}</td>
											<td className="py-2.5 px-2 text-xs">
												<span className="block">{item.description ?? "—"}</span>
												<span className="text-muted-foreground text-[10px] font-mono">
													{item.supplier_code ?? ""}
													{item.lot_code ? ` · lote ${item.lot_code}` : ""}
													{item.expiry_date ? ` · val ${item.expiry_date}` : ""}
												</span>
											</td>
											<td className="py-2.5 px-2 text-xs font-mono">{item.gtin ?? item.gtin_trib ?? "SEM GTIN"}</td>
											<td className="py-2.5 px-2 text-xs text-right tabular-nums">
												{item.commercial_qty != null ? NUM.format(item.commercial_qty) : "—"}
												{item.commercial_unit && <span className="ml-1 text-muted-foreground">{item.commercial_unit}</span>}
											</td>
											<td className="py-2.5 px-2 text-xs text-right tabular-nums">{item.matched_qty_base != null ? NUM.format(item.matched_qty_base) : "—"}</td>
											<td className="py-2.5 px-2 text-center">
												<span className={`inline-flex items-center gap-1 text-xs ${meta.className}`}>
													<Icon className="size-3.5" />
													{meta.label}
												</span>
											</td>
										</tr>
										{needsResolution && (
											<tr key={`${item.id}-resolution`}>
												<td colSpan={6} className="bg-muted/20 px-3">
													<NfeItemResolution item={item} onResolved={() => router.invalidate()} />
												</td>
											</tr>
										)}
									</>
								)
							})}
						</tbody>
					</table>
				</CardContent>
			</Card>
		</div>
	)
}
