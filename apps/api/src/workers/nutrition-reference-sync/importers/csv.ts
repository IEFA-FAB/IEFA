/** Minimal quote-aware CSV reader. Handles quoted fields with embedded commas and
 * doubled quotes (""). Assumes records are newline-delimited (no newlines inside
 * quotes) — true for the USDA FDC and IBGE files we parse. */

export function parseCsv(text: string): string[][] {
	const rows: string[][] = []
	const lines = text.split(/\r?\n/)
	for (const line of lines) {
		if (line.length === 0) continue
		rows.push(splitCsvLine(line))
	}
	return rows
}

function splitCsvLine(line: string): string[] {
	const out: string[] = []
	let field = ""
	let inQuotes = false
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					field += '"'
					i++
				} else {
					inQuotes = false
				}
			} else {
				field += ch
			}
		} else if (ch === '"') {
			inQuotes = true
		} else if (ch === ",") {
			out.push(field)
			field = ""
		} else {
			field += ch
		}
	}
	out.push(field)
	return out
}

/** Parse CSV into objects keyed by header, streaming a callback per row to avoid
 * holding every object in memory for the large food_nutrient files.
 *
 * Pass `required` to surface upstream format drift: if a source (e.g. USDA FDC) ever
 * renames a column, `get()` would silently return "" for every row and the import would
 * write foods with zero nutrient values without any error. Missing required columns are
 * logged as a warning so the drift is visible in the worker logs. */
export function forEachCsvRow(text: string, onRow: (get: (col: string) => string) => void, required?: string[]): void {
	const lines = text.split(/\r?\n/)
	if (lines.length === 0) return
	const header = splitCsvLine(lines[0])
	const index = new Map<string, number>(header.map((h, i) => [h.trim(), i]))
	if (required) {
		const missing = required.filter((col) => !index.has(col))
		if (missing.length > 0) {
			console.warn(`[nutrition-sync] CSV faltando coluna(s) esperada(s): ${missing.join(", ")} — cabeçalho tem: ${header.map((h) => h.trim()).join(", ")}`)
		}
	}
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].length === 0) continue
		const cols = splitCsvLine(lines[i])
		onRow((col) => cols[index.get(col) ?? -1] ?? "")
	}
}
