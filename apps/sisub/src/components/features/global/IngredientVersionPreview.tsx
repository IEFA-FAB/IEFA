import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/cn"
import type { IngredientDiff, RowChange } from "@/lib/ingredient-diff"
import type { IngredientSnapshot } from "@/types/domain/ingredient-versions"

function fmt(v: unknown): string {
	if (v === null || v === undefined || v === "") return "—"
	if (typeof v === "boolean") return v ? "Sim" : "Não"
	return String(v)
}

/** Valor com destaque verde quando foi alterado/adicionado nesta versão, exibindo o valor anterior riscado. */
function ValueCell({ value, from, changed }: { value: string; from?: string; changed: boolean }) {
	if (!changed) return <span className="text-foreground">{value}</span>
	return (
		<span className="inline-flex flex-wrap items-center gap-1.5">
			{from !== undefined && from !== value && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive line-through">{from}</span>}
			<span className="rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">{value}</span>
		</span>
	)
}

const FIELD_ROWS = [
	{ key: "description", label: "Nome", get: (s: IngredientSnapshot) => fmt(s.ingredient.description) },
	{ key: "folder", label: "Pasta (Categoria)", get: (s: IngredientSnapshot) => fmt(s.ingredient.folder_description) },
	{ key: "measure_unit", label: "Unidade de Medida", get: (s: IngredientSnapshot) => fmt(s.ingredient.measure_unit) },
	{ key: "correction_factor", label: "Fator de Correção", get: (s: IngredientSnapshot) => fmt(s.ingredient.correction_factor) },
	{ key: "ceafa", label: "Correlação CEAFA", get: (s: IngredientSnapshot) => fmt(s.ingredient.ceafa_description) },
] as const

/** Linha "removida" (existia na versão anterior, não nesta). */
function RemovedRow({ label, sub }: { label: string; sub?: string }) {
	return (
		<div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs">
			<span className="w-4 shrink-0 text-center font-mono text-destructive">−</span>
			<span className="text-destructive line-through">{label}</span>
			{sub && <span className="ml-auto font-mono text-destructive/70">{sub}</span>}
		</div>
	)
}

interface IngredientVersionPreviewProps {
	snapshot: IngredientSnapshot
	diff: IngredientDiff
	isBaseline: boolean
}

/**
 * Preview read-only do estado do insumo numa versão histórica, com o diff
 * (em relação à versão anterior) pintado: verde = novo, vermelho riscado = anterior.
 */
export function IngredientVersionPreview({ snapshot, diff, isBaseline }: IngredientVersionPreviewProps) {
	const fieldChange = new Map(diff.fields.map((f) => [f.key, f]))
	const nutrientChange = new Map(diff.nutrients.map((n) => [n.id, n]))
	const productChange = new Map(diff.productItems.map((i) => [i.id, i]))
	const linkChange = new Map(diff.purchaseLinks.map((l) => [l.id, l]))

	const removedNutrients = diff.nutrients.filter((n) => n.kind === "removed")
	const removedProducts = diff.productItems.filter((i) => i.kind === "removed")
	const removedLinks = diff.purchaseLinks.filter((l) => l.kind === "removed")

	const detailLine = (row?: RowChange) =>
		row && row.kind === "changed" && row.details.length > 0 ? (
			<div className="mt-1 flex flex-col gap-0.5">
				{row.details.map((d) => (
					<span key={d.label} className="text-[11px] text-muted-foreground">
						{d.label}: <span className="text-destructive line-through">{d.from}</span> → <span className="text-success">{d.to}</span>
					</span>
				))}
			</div>
		) : null

	return (
		<div className="max-w-5xl mx-auto space-y-6 pb-24">
			{/* Identificação */}
			<Card>
				<CardHeader>
					<CardTitle>Classificação e medida</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="divide-y divide-border/60">
						{FIELD_ROWS.map((f) => {
							const change = fieldChange.get(f.key)
							return (
								<div key={f.key} className="grid grid-cols-[180px_1fr] gap-3 py-2.5 text-sm">
									<dt className="text-muted-foreground">{f.label}</dt>
									<dd>
										<ValueCell value={f.get(snapshot)} from={change?.from} changed={Boolean(change)} />
									</dd>
								</div>
							)
						})}
					</dl>
				</CardContent>
			</Card>

			{/* Nutrientes */}
			<Card>
				<CardHeader>
					<CardTitle>Informação Nutricional</CardTitle>
				</CardHeader>
				<CardContent className="space-y-1.5">
					{snapshot.nutrients.length === 0 && removedNutrients.length === 0 && <p className="text-sm text-muted-foreground">Nenhum nutriente informado.</p>}
					{snapshot.nutrients.map((n) => {
						const change = nutrientChange.get(n.nutrient_id)
						const kind = change?.kind
						return (
							<div
								key={n.nutrient_id}
								className={cn(
									"flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
									kind === "added" && "bg-success/10",
									kind === "changed" && "bg-warning/10"
								)}
							>
								<span className="text-foreground">{n.name ?? n.nutrient_id}</span>
								<span className="font-mono">
									{kind === "changed" && change?.details[0] ? (
										<span>
											<span className="text-destructive line-through">{change.details[0].from}</span>
											<span className="mx-1 text-muted-foreground">→</span>
											<span className="text-success">{change.details[0].to}</span>
										</span>
									) : (
										<span className={cn(kind === "added" ? "text-success" : "text-foreground")}>{fmt(n.value)}</span>
									)}
								</span>
							</div>
						)
					})}
					{removedNutrients.map((n) => (
						<RemovedRow key={n.id} label={n.label} sub={n.details[0]?.from} />
					))}
				</CardContent>
			</Card>

			{/* Itens de produto */}
			<Card>
				<CardHeader>
					<CardTitle>Itens de Produto</CardTitle>
				</CardHeader>
				<CardContent className="space-y-1.5">
					{snapshot.product_items.length === 0 && removedProducts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item de produto.</p>}
					{snapshot.product_items.map((item) => {
						const change = productChange.get(item.id)
						const kind = change?.kind
						return (
							<div key={item.id} className={cn("rounded-md px-3 py-2 text-sm", kind === "added" && "bg-success/10", kind === "changed" && "bg-warning/10")}>
								<div className="flex items-center justify-between gap-3">
									<span className={cn(kind === "added" ? "text-success" : "text-foreground")}>{item.description ?? item.barcode ?? item.id}</span>
									{item.purchase_measure_unit && <span className="font-mono text-xs text-muted-foreground">{item.purchase_measure_unit}</span>}
								</div>
								{detailLine(change)}
							</div>
						)
					})}
					{removedProducts.map((i) => (
						<RemovedRow key={i.id} label={i.label} />
					))}
				</CardContent>
			</Card>

			{/* Itens de compra */}
			<Card>
				<CardHeader>
					<CardTitle>Itens de Compra</CardTitle>
				</CardHeader>
				<CardContent className="space-y-1.5">
					{snapshot.purchase_links.length === 0 && removedLinks.length === 0 && (
						<p className="text-sm text-muted-foreground">Nenhum item de compra vinculado.</p>
					)}
					{snapshot.purchase_links.map((link) => {
						const change = linkChange.get(link.purchase_item_id)
						const kind = change?.kind
						return (
							<div
								key={link.purchase_item_id}
								className={cn("rounded-md px-3 py-2 text-sm", kind === "added" && "bg-success/10", kind === "changed" && "bg-warning/10")}
							>
								<div className="flex items-center justify-between gap-3">
									<span className={cn(kind === "added" ? "text-success" : "text-foreground")}>
										{link.description ?? link.catmat_item_descricao ?? link.purchase_item_id}
									</span>
									{link.unit_price != null && <span className="font-mono text-xs text-muted-foreground">R$ {fmt(link.unit_price)}</span>}
								</div>
								{detailLine(change)}
							</div>
						)
					})}
					{removedLinks.map((l) => (
						<RemovedRow key={l.id} label={l.label} />
					))}
				</CardContent>
			</Card>

			{isBaseline && <p className="text-center text-xs text-muted-foreground/70 italic">Versão inicial — sem alterações anteriores para comparar.</p>}
		</div>
	)
}
