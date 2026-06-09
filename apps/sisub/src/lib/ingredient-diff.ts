/**
 * Diff entre dois snapshots de insumo (histórico de versões).
 * Cobre: campos de identificação, nutrientes, itens de produto e vínculos de compra.
 */
import type { IngredientSnapshot } from "@/types/domain/ingredient-versions"

export interface FieldChange {
	key: string
	label: string
	from: string
	to: string
}

export type ChangeKind = "added" | "removed" | "changed"

export interface RowChange {
	id: string
	kind: ChangeKind
	label: string
	/** Para "changed": pares antes→depois legíveis. */
	details: { label: string; from: string; to: string }[]
}

export interface IngredientDiff {
	fields: FieldChange[]
	nutrients: RowChange[]
	productItems: RowChange[]
	purchaseLinks: RowChange[]
	isEmpty: boolean
}

function fmt(v: unknown): string {
	if (v === null || v === undefined || v === "") return "—"
	if (typeof v === "boolean") return v ? "Sim" : "Não"
	return String(v)
}

function numEq(a: number | null | undefined, b: number | null | undefined): boolean {
	const na = a == null ? null : Number(a)
	const nb = b == null ? null : Number(b)
	if (na == null && nb == null) return true
	return na === nb
}

function diffFields(prev: IngredientSnapshot, curr: IngredientSnapshot): FieldChange[] {
	const a = prev.ingredient
	const b = curr.ingredient
	const out: FieldChange[] = []
	if ((a.description ?? "") !== (b.description ?? "")) out.push({ key: "description", label: "Nome", from: fmt(a.description), to: fmt(b.description) })
	if (a.folder_id !== b.folder_id) out.push({ key: "folder", label: "Pasta", from: fmt(a.folder_description), to: fmt(b.folder_description) })
	if ((a.measure_unit ?? "") !== (b.measure_unit ?? "")) out.push({ key: "measure_unit", label: "Unidade", from: fmt(a.measure_unit), to: fmt(b.measure_unit) })
	if (!numEq(a.correction_factor, b.correction_factor))
		out.push({ key: "correction_factor", label: "Fator de Correção", from: fmt(a.correction_factor), to: fmt(b.correction_factor) })
	if (a.ceafa_id !== b.ceafa_id) out.push({ key: "ceafa", label: "Correlação CEAFA", from: fmt(a.ceafa_description), to: fmt(b.ceafa_description) })
	return out
}

function diffNutrients(prev: IngredientSnapshot, curr: IngredientSnapshot): RowChange[] {
	const pm = new Map(prev.nutrients.map((n) => [n.nutrient_id, n]))
	const cm = new Map(curr.nutrients.map((n) => [n.nutrient_id, n]))
	const out: RowChange[] = []
	for (const [id, n] of cm) {
		const before = pm.get(id)
		if (!before) out.push({ id, kind: "added", label: n.name ?? id, details: [{ label: "Valor", from: "—", to: fmt(n.value) }] })
		else if (!numEq(before.value, n.value))
			out.push({ id, kind: "changed", label: n.name ?? id, details: [{ label: "Valor", from: fmt(before.value), to: fmt(n.value) }] })
	}
	for (const [id, n] of pm) {
		if (!cm.has(id)) out.push({ id, kind: "removed", label: n.name ?? id, details: [{ label: "Valor", from: fmt(n.value), to: "—" }] })
	}
	return out
}

function diffProductItems(prev: IngredientSnapshot, curr: IngredientSnapshot): RowChange[] {
	const pm = new Map(prev.product_items.map((i) => [i.id, i]))
	const cm = new Map(curr.product_items.map((i) => [i.id, i]))
	const out: RowChange[] = []
	for (const [id, item] of cm) {
		const before = pm.get(id)
		const label = item.description ?? item.barcode ?? id
		if (!before) {
			out.push({ id, kind: "added", label, details: [] })
			continue
		}
		const details: RowChange["details"] = []
		if ((before.description ?? "") !== (item.description ?? "")) details.push({ label: "Descrição", from: fmt(before.description), to: fmt(item.description) })
		if ((before.barcode ?? "") !== (item.barcode ?? "")) details.push({ label: "Código de barras", from: fmt(before.barcode), to: fmt(item.barcode) })
		if ((before.purchase_measure_unit ?? "") !== (item.purchase_measure_unit ?? ""))
			details.push({ label: "Unidade", from: fmt(before.purchase_measure_unit), to: fmt(item.purchase_measure_unit) })
		if (!numEq(before.unit_content_quantity, item.unit_content_quantity))
			details.push({ label: "Conteúdo", from: fmt(before.unit_content_quantity), to: fmt(item.unit_content_quantity) })
		if (!numEq(before.correction_factor, item.correction_factor))
			details.push({ label: "Fator correção", from: fmt(before.correction_factor), to: fmt(item.correction_factor) })
		if (before.purchase_item_id !== item.purchase_item_id)
			details.push({ label: "Item de compra", from: fmt(before.purchase_item_id), to: fmt(item.purchase_item_id) })
		if (details.length > 0) out.push({ id, kind: "changed", label, details })
	}
	for (const [id, item] of pm) {
		if (!cm.has(id)) out.push({ id, kind: "removed", label: item.description ?? item.barcode ?? id, details: [] })
	}
	return out
}

function diffPurchaseLinks(prev: IngredientSnapshot, curr: IngredientSnapshot): RowChange[] {
	const pm = new Map(prev.purchase_links.map((l) => [l.purchase_item_id, l]))
	const cm = new Map(curr.purchase_links.map((l) => [l.purchase_item_id, l]))
	const out: RowChange[] = []
	for (const [id, link] of cm) {
		const before = pm.get(id)
		const label = link.description ?? link.catmat_item_descricao ?? id
		if (!before) {
			out.push({ id, kind: "added", label, details: [] })
			continue
		}
		const details: RowChange["details"] = []
		if ((before.description ?? "") !== (link.description ?? "")) details.push({ label: "Descrição", from: fmt(before.description), to: fmt(link.description) })
		if (!numEq(before.catmat_item_codigo, link.catmat_item_codigo))
			details.push({ label: "CATMAT", from: fmt(before.catmat_item_codigo), to: fmt(link.catmat_item_codigo) })
		if (!numEq(before.unit_price, link.unit_price)) details.push({ label: "Preço unitário", from: fmt(before.unit_price), to: fmt(link.unit_price) })
		if (!numEq(before.conversion_factor, link.conversion_factor))
			details.push({ label: "Fator de conversão", from: fmt(before.conversion_factor), to: fmt(link.conversion_factor) })
		if (before.is_default !== link.is_default) details.push({ label: "Padrão", from: fmt(before.is_default), to: fmt(link.is_default) })
		if (details.length > 0) out.push({ id, kind: "changed", label, details })
	}
	for (const [id, link] of pm) {
		if (!cm.has(id)) out.push({ id, kind: "removed", label: link.description ?? link.catmat_item_descricao ?? id, details: [] })
	}
	return out
}

export function computeIngredientDiff(prev: IngredientSnapshot | null, curr: IngredientSnapshot): IngredientDiff {
	if (!prev) {
		// Sem versão anterior → baseline (tudo é "estado inicial", sem destaques).
		return { fields: [], nutrients: [], productItems: [], purchaseLinks: [], isEmpty: true }
	}
	const fields = diffFields(prev, curr)
	const nutrients = diffNutrients(prev, curr)
	const productItems = diffProductItems(prev, curr)
	const purchaseLinks = diffPurchaseLinks(prev, curr)
	const isEmpty = fields.length === 0 && nutrients.length === 0 && productItems.length === 0 && purchaseLinks.length === 0
	return { fields, nutrients, productItems, purchaseLinks, isEmpty }
}

/** Resumo curto (chips) do que mudou nesta versão, para a lista do histórico. */
export function summarizeDiff(diff: IngredientDiff): string[] {
	const chips: string[] = []
	if (diff.fields.length > 0) chips.push(diff.fields.map((f) => f.label).join(", "))
	const countByKind = (rows: RowChange[]) => ({
		added: rows.filter((r) => r.kind === "added").length,
		removed: rows.filter((r) => r.kind === "removed").length,
		changed: rows.filter((r) => r.kind === "changed").length,
	})
	const section = (rows: RowChange[], noun: string) => {
		if (rows.length === 0) return
		const c = countByKind(rows)
		const parts: string[] = []
		if (c.added) parts.push(`+${c.added}`)
		if (c.removed) parts.push(`−${c.removed}`)
		if (c.changed) parts.push(`~${c.changed}`)
		chips.push(`${noun} ${parts.join(" ")}`)
	}
	section(diff.nutrients, "Nutrientes")
	section(diff.productItems, "Itens de produto")
	section(diff.purchaseLinks, "Itens de compra")
	return chips
}
