import type { QuantityEstimateAnnexRow } from "@/lib/quantity-estimate-annex"

/**
 * Tabela do anexo quantitativo para colar no editor do Termo de Referência (Compras.gov.br).
 *
 * O editor do TR é um editor de documento: colar CSV não vira tabela. Vai para a área de
 * transferência uma `<table>` simples (sem célula mesclada, sem estilo, borda por atributo) e, junto,
 * a versão em texto tabulado para quem colar numa planilha. A colagem de tabela nesse editor é
 * instável com muitas linhas, então a tabela também sai em partes.
 *
 * Com orçamento sigiloso (Lei 14.133/2021, art. 24; IN SEGES/ME 65/2021, art. 10) as colunas de
 * preço e valor não saem: o TR é público.
 */

export const TABLE_CHUNK_SIZE = 100

const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })
const INT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })
const MONEY = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PRICE = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const CYCLE: Record<string, string> = { weekly: "Semanal", monthly: "Mensal" }

export interface AnnexTable {
	headers: string[]
	body: string[][]
}

export function buildAnnexTable(rows: readonly QuantityEstimateAnnexRow[], options: { confidential: boolean }): AnnexTable {
	const headers = [
		"Item",
		"CATMAT",
		"Descrição",
		"Unidade",
		"Quantidade estimada",
		"Quantidade máxima",
		"Quantidade mínima a ser cotada",
		"Quantidade mínima por ordem de fornecimento",
		"Ciclo de entrega",
	]
	if (!options.confidential) headers.push("Preço unitário estimado (R$)", "Valor estimado (R$)")

	const body = rows.map((r, index) => {
		const description = [r.catmatDescription ?? r.description, r.itemDescription].filter(Boolean).join(". ")
		const line = [
			String(index + 1),
			r.catmat == null ? "" : String(r.catmat),
			description,
			r.unit,
			QTY.format(r.estimatedQuantity),
			r.maxQuantity == null ? "" : INT.format(r.maxQuantity),
			r.minQuoteQuantity == null ? "" : INT.format(r.minQuoteQuantity),
			r.minOrderQuantity == null ? "" : QTY.format(r.minOrderQuantity),
			r.deliveryCycle ? (CYCLE[r.deliveryCycle] ?? r.deliveryCycle) : "",
		]
		if (!options.confidential) {
			line.push(
				r.unitPrice == null ? "" : PRICE.format(r.unitPrice),
				r.unitPrice != null && r.maxQuantity != null ? MONEY.format(r.unitPrice * r.maxQuantity) : ""
			)
		}
		return line
	})
	return { headers, body }
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function toHtmlTable(table: AnnexTable): string {
	const head = `<tr>${table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`
	const rows = table.body.map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
	return `<table border="1" cellpadding="4" cellspacing="0"><thead>${head}</thead><tbody>${rows}</tbody></table>`
}

export function toTsv(table: AnnexTable): string {
	const clean = (cell: string) => cell.replace(/[\t\r\n]+/g, " ")
	return [table.headers, ...table.body].map((line) => line.map(clean).join("\t")).join("\n")
}

/** Partes de até `size` linhas, cada uma com o cabeçalho: cada parte cola sozinha. */
export function chunkTable(table: AnnexTable, size = TABLE_CHUNK_SIZE): AnnexTable[] {
	if (table.body.length <= size) return [table]
	const parts: AnnexTable[] = []
	for (let start = 0; start < table.body.length; start += size) parts.push({ headers: table.headers, body: table.body.slice(start, start + size) })
	return parts
}

/** Grava HTML e texto na área de transferência; sem `ClipboardItem`, só o texto. */
export async function copyTableToClipboard(table: AnnexTable): Promise<"html" | "text"> {
	const html = toHtmlTable(table)
	const text = toTsv(table)
	if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
		await navigator.clipboard.write([
			new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
		])
		return "html"
	}
	await navigator.clipboard.writeText(text)
	return "text"
}
