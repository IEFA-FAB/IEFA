import { createHash } from "node:crypto"
import * as XLSX from "xlsx"
import { persistSourceImport } from "./persist.ts"
import type { ParsedComponent, ParsedFood, ParsedSource, ParsedValue, SupabaseAny } from "./types.ts"

/**
 * TACO 4ª edição (NEPA/UNICAMP, 2011). A single .xlsx with three sheets, all
 * per 100 g of edible portion:
 *   - "CMVCol taco3"     — proximates, minerals, vitamins   (597 foods, the master list)
 *   - "AGtaco3"          — fatty acids                        (subset of foods)
 *   - "Aminoácidos TACO3"— amino acids                        (subset of foods)
 * Foods are keyed by "Número do Alimento" (col 0). Group headers are string rows
 * with only col 0 filled. Each sheet repeats a "Número do Alimento" column mid-row
 * which we skip. Cell tokens: number → measured, "Tr" → trace, "NA"/"*" → not analyzed.
 */

const SOURCE_ID = "taco"
const VERSION_LABEL = "4a edicao 2011"
const UPSTREAM_URL = "https://nepa.unicamp.br/publicacoes/tabela-taco-excel/"

type ColDef = { code: string; name: string; unit: string; infoods?: string }

// Column index → nutrient, per sheet. Indices verified against the real file.
// `null` marks a skipped column (food number / description / the repeated number column).
const SHEET_CMV = "CMVCol taco3"
const SHEET_AG = "AGtaco3"
const SHEET_AA = "Aminoácidos TACO3"

const CMV_COLS: Record<number, ColDef> = {
	2: { code: "umidade", name: "Umidade", unit: "%", infoods: "WATER" },
	3: { code: "energia_kcal", name: "Energia", unit: "kcal", infoods: "ENERC_KCAL" },
	4: { code: "energia_kj", name: "Energia", unit: "kJ", infoods: "ENERC_KJ" },
	5: { code: "proteina", name: "Proteína", unit: "g", infoods: "PROCNT" },
	6: { code: "lipideos", name: "Lipídeos", unit: "g", infoods: "FAT" },
	7: { code: "colesterol", name: "Colesterol", unit: "mg", infoods: "CHOLE" },
	8: { code: "carboidrato", name: "Carboidrato", unit: "g", infoods: "CHOAVLDF" },
	9: { code: "fibra_alimentar", name: "Fibra Alimentar", unit: "g", infoods: "FIBTG" },
	10: { code: "cinzas", name: "Cinzas", unit: "g", infoods: "ASH" },
	11: { code: "calcio", name: "Cálcio", unit: "mg", infoods: "CA" },
	12: { code: "magnesio", name: "Magnésio", unit: "mg", infoods: "MG" },
	14: { code: "manganes", name: "Manganês", unit: "mg", infoods: "MN" },
	15: { code: "fosforo", name: "Fósforo", unit: "mg", infoods: "P" },
	16: { code: "ferro", name: "Ferro", unit: "mg", infoods: "FE" },
	17: { code: "sodio", name: "Sódio", unit: "mg", infoods: "NA" },
	18: { code: "potassio", name: "Potássio", unit: "mg", infoods: "K" },
	19: { code: "cobre", name: "Cobre", unit: "mg", infoods: "CU" },
	20: { code: "zinco", name: "Zinco", unit: "mg", infoods: "ZN" },
	21: { code: "retinol", name: "Retinol", unit: "mcg", infoods: "RETOL" },
	22: { code: "re", name: "RE", unit: "mcg", infoods: "VITA" },
	23: { code: "rae", name: "RAE", unit: "mcg", infoods: "VITA_RAE" },
	24: { code: "tiamina", name: "Tiamina", unit: "mg", infoods: "THIA" },
	25: { code: "riboflavina", name: "Riboflavina", unit: "mg", infoods: "RIBF" },
	26: { code: "piridoxina", name: "Piridoxina", unit: "mg", infoods: "VITB6A" },
	27: { code: "niacina", name: "Niacina", unit: "mg", infoods: "NIA" },
	28: { code: "vitamina_c", name: "Vitamina C", unit: "mg", infoods: "VITC" },
}

const AG_COLS: Record<number, ColDef> = {
	2: { code: "ag_saturados", name: "Ácidos graxos saturados", unit: "g", infoods: "FASAT" },
	3: { code: "ag_monoinsaturados", name: "Ácidos graxos monoinsaturados", unit: "g", infoods: "FAMS" },
	4: { code: "ag_poliinsaturados", name: "Ácidos graxos poliinsaturados", unit: "g", infoods: "FAPU" },
	5: { code: "fa_12_0", name: "12:0", unit: "g", infoods: "F12D0" },
	6: { code: "fa_14_0", name: "14:0", unit: "g", infoods: "F14D0" },
	7: { code: "fa_16_0", name: "16:0", unit: "g", infoods: "F16D0" },
	8: { code: "fa_18_0", name: "18:0", unit: "g", infoods: "F18D0" },
	9: { code: "fa_20_0", name: "20:0", unit: "g", infoods: "F20D0" },
	10: { code: "fa_22_0", name: "22:0", unit: "g", infoods: "F22D0" },
	11: { code: "fa_24_0", name: "24:0", unit: "g", infoods: "F24D0" },
	13: { code: "fa_14_1", name: "14:1", unit: "g", infoods: "F14D1" },
	14: { code: "fa_16_1", name: "16:1", unit: "g", infoods: "F16D1" },
	15: { code: "fa_18_1", name: "18:1", unit: "g", infoods: "F18D1" },
	16: { code: "fa_20_1", name: "20:1", unit: "g", infoods: "F20D1" },
	17: { code: "fa_18_2_n6", name: "18:2 n-6", unit: "g", infoods: "F18D2CN6" },
	18: { code: "fa_18_3_n3", name: "18:3 n-3", unit: "g", infoods: "F18D3CN3" },
	19: { code: "fa_20_4", name: "20:4", unit: "g", infoods: "F20D4" },
	20: { code: "fa_20_5", name: "20:5", unit: "g", infoods: "F20D5" },
	21: { code: "fa_22_5", name: "22:5", unit: "g", infoods: "F22D5" },
	22: { code: "fa_22_6", name: "22:6", unit: "g", infoods: "F22D6" },
	23: { code: "fa_18_1t", name: "18:1t", unit: "g", infoods: "F18D1T" },
	24: { code: "fa_18_2t", name: "18:2t", unit: "g", infoods: "F18D2T" },
}

const AA_COLS: Record<number, ColDef> = {
	2: { code: "aa_triptofano", name: "Triptofano", unit: "g", infoods: "TRP" },
	3: { code: "aa_treonina", name: "Treonina", unit: "g", infoods: "THR" },
	4: { code: "aa_isoleucina", name: "Isoleucina", unit: "g", infoods: "ILE" },
	5: { code: "aa_leucina", name: "Leucina", unit: "g", infoods: "LEU" },
	6: { code: "aa_lisina", name: "Lisina", unit: "g", infoods: "LYS" },
	7: { code: "aa_metionina", name: "Metionina", unit: "g", infoods: "MET" },
	8: { code: "aa_cistina", name: "Cistina", unit: "g", infoods: "CYS" },
	9: { code: "aa_fenilalanina", name: "Fenilalanina", unit: "g", infoods: "PHE" },
	10: { code: "aa_tirosina", name: "Tirosina", unit: "g", infoods: "TYR" },
	12: { code: "aa_valina", name: "Valina", unit: "g", infoods: "VAL" },
	13: { code: "aa_arginina", name: "Arginina", unit: "g", infoods: "ARG" },
	14: { code: "aa_histidina", name: "Histidina", unit: "g", infoods: "HIS" },
	15: { code: "aa_alanina", name: "Alanina", unit: "g", infoods: "ALA" },
	16: { code: "aa_acido_aspartico", name: "Ácido Aspártico", unit: "g", infoods: "ASP" },
	17: { code: "aa_acido_glutamico", name: "Ácido Glutâmico", unit: "g", infoods: "GLU" },
	18: { code: "aa_glicina", name: "Glicina", unit: "g", infoods: "GLY" },
	19: { code: "aa_prolina", name: "Prolina", unit: "g", infoods: "PRO" },
	20: { code: "aa_serina", name: "Serina", unit: "g", infoods: "SER" },
}

const ALL_COMPONENTS: ParsedComponent[] = [...Object.values(CMV_COLS), ...Object.values(AG_COLS), ...Object.values(AA_COLS)].map((c) => ({
	externalCode: c.code,
	name: c.name,
	unit: c.unit,
	infoodsTag: c.infoods ?? null,
}))

/** A group header is a row where col 0 is text and the numeric columns are empty. */
function isGroupHeader(row: unknown[]): boolean {
	return typeof row[0] === "string" && row[0].trim().length > 0 && row.slice(1, 12).every((c) => c == null)
}

function cellToValue(
	cell: unknown
): ParsedValue["value"] extends never ? never : { value: number | null; valueKind: ParsedValue["valueKind"]; rawValue: string | null } | null {
	if (cell == null || cell === "") return null
	if (typeof cell === "number") return { value: cell, valueKind: "measured", rawValue: null }
	const token = String(cell).trim()
	if (token === "") return null
	if (/^tr$/i.test(token)) return { value: null, valueKind: "trace", rawValue: token }
	if (/^na$/i.test(token) || token === "*") return { value: null, valueKind: "not_analyzed", rawValue: token }
	const num = Number(token.replace(",", "."))
	if (Number.isFinite(num)) return { value: num, valueKind: "measured", rawValue: null }
	return { value: null, valueKind: "not_analyzed", rawValue: token }
}

type SheetFood = { code: number; name: string; group: string | null; values: ParsedValue[] }

function parseSheet(rows: unknown[][], cols: Record<number, ColDef>, useGroups: boolean): Map<number, SheetFood> {
	const out = new Map<number, SheetFood>()
	let currentGroup: string | null = null
	// Skip the 3 header rows (0..2); data starts at row 3.
	for (let i = 3; i < rows.length; i++) {
		const row = rows[i]
		if (!row) continue
		if (isGroupHeader(row)) {
			const label = String(row[0]).trim()
			if (/^legenda$/i.test(label)) break // legend block at the bottom — stop
			if (useGroups) currentGroup = label
			continue
		}
		if (typeof row[0] !== "number") continue
		const code = row[0]
		const name = typeof row[1] === "string" ? row[1].trim() : ""
		if (!name) continue
		const values: ParsedValue[] = []
		for (const [idxStr, def] of Object.entries(cols)) {
			const parsed = cellToValue(row[Number(idxStr)])
			if (!parsed) continue
			values.push({ componentCode: def.code, value: parsed.value, valueKind: parsed.valueKind, rawValue: parsed.rawValue })
		}
		out.set(code, { code, name, group: currentGroup, values })
	}
	return out
}

/** Slug from a group label so revisions carry a stable group_code. */
function groupCode(label: string | null): string | null {
	if (!label) return null
	return label
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
}

export function parseTacoWorkbook(buffer: ArrayBuffer): ParsedFood[] {
	const wb = XLSX.read(buffer, { type: "array" })
	const toRows = (sheet: string) =>
		wb.Sheets[sheet] ? (XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null, raw: true }) as unknown[][]) : []

	const cmv = parseSheet(toRows(SHEET_CMV), CMV_COLS, true)
	const ag = parseSheet(toRows(SHEET_AG), AG_COLS, false)
	const aa = parseSheet(toRows(SHEET_AA), AA_COLS, false)

	const foods: ParsedFood[] = []
	for (const [code, master] of cmv) {
		const values = [...master.values]
		const agFood = ag.get(code)
		if (agFood) values.push(...agFood.values)
		const aaFood = aa.get(code)
		if (aaFood) values.push(...aaFood.values)
		foods.push({
			externalCode: String(code),
			displayName: master.name,
			originalName: master.name,
			groupCode: groupCode(master.group),
			groupName: master.group,
			baseQuantity: 100,
			baseUnit: "g",
			values,
			raw: { taco_number: code },
		})
	}
	return foods
}

/** xlsx is a zip container — it must start with the "PK" local-file-header signature.
 * NEPA currently serves the binary straight from UPSTREAM_URL; if that ever becomes an
 * HTML page (CMS migration), XLSX.read would return an empty workbook and the failure
 * would masquerade as "layout mudou?". Detecting the signature makes it unambiguous. */
function assertXlsx(buffer: ArrayBuffer, url: string): void {
	const head = new Uint8Array(buffer.slice(0, 2))
	if (head[0] !== 0x50 || head[1] !== 0x4b) {
		throw new Error(`TACO: ${url} não retornou um .xlsx (assinatura zip "PK" ausente) — a página serviu HTML? URL de download mudou?`)
	}
}

export async function importTaco(supabase: SupabaseAny): Promise<number> {
	const res = await fetch(UPSTREAM_URL, { redirect: "follow" })
	if (!res.ok) throw new Error(`Download TACO falhou: HTTP ${res.status}`)
	const buffer = await res.arrayBuffer()
	const downloadUrl = res.url || UPSTREAM_URL
	assertXlsx(buffer, downloadUrl)
	const checksum = createHash("sha256").update(Buffer.from(buffer)).digest("hex")

	const foods = parseTacoWorkbook(buffer)
	if (foods.length === 0) throw new Error("TACO: nenhum alimento parseado — layout da planilha mudou?")

	const parsed: ParsedSource = {
		versionLabel: VERSION_LABEL,
		upstreamUrl: UPSTREAM_URL,
		downloadUrl,
		checksumSha256: checksum,
		components: ALL_COMPONENTS,
		foods,
	}
	return persistSourceImport(supabase, SOURCE_ID, parsed)
}
