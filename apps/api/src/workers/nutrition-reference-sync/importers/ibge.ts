import { createHash } from "node:crypto"
import { unzipSync } from "fflate"
import * as XLSX from "xlsx"
import { persistSourceImport } from "./persist.ts"
import type { ParsedComponent, ParsedFood, ParsedSource, ParsedValue, SupabaseAny } from "./types.ts"

/**
 * IBGE POF 2008-2009 — Tabela de Composição Nutricional dos Alimentos Consumidos
 * no Brasil (IBGE, 2011). The data ships as `tabelas/tabelacompleta.xls` inside a
 * 70 MB CD-ROM zip: one flat sheet, 43 columns, per 100 g. Header is on row 3
 * (0-based); data rows have a 7-digit food code in col 0. Each row is a
 * food × preparation combination; missing values are the string "-".
 */

const SOURCE_ID = "ibge_pof_2008_2009"
const VERSION_LABEL = "POF 2008-2009"
const UPSTREAM_URL = "https://biblioteca.ibge.gov.br/index.php/biblioteca-catalogo?id=250002&view=detalhes"
const DOWNLOAD_URL = "https://biblioteca.ibge.gov.br/visualizacao/livros/liv50002_cd.zip"

type ColDef = { code: string; name: string; unit: string; infoods?: string }

// Nutrient columns (index → definition). Indices verified against tabelacompleta.xls.
const COLS: Record<number, ColDef> = {
	6: { code: "energia_kcal", name: "Energia", unit: "kcal", infoods: "ENERC_KCAL" },
	7: { code: "proteina", name: "Proteína", unit: "g", infoods: "PROCNT" },
	8: { code: "lipideos_totais", name: "Lipídeos totais", unit: "g", infoods: "FAT" },
	9: { code: "carboidrato", name: "Carboidrato", unit: "g", infoods: "CHOAVLDF" },
	10: { code: "fibra_alimentar", name: "Fibra alimentar total", unit: "g", infoods: "FIBTG" },
	11: { code: "calcio", name: "Cálcio", unit: "mg", infoods: "CA" },
	12: { code: "magnesio", name: "Magnésio", unit: "mg", infoods: "MG" },
	13: { code: "manganes", name: "Manganês", unit: "mg", infoods: "MN" },
	14: { code: "fosforo", name: "Fósforo", unit: "mg", infoods: "P" },
	15: { code: "ferro", name: "Ferro", unit: "mg", infoods: "FE" },
	16: { code: "sodio", name: "Sódio", unit: "mg", infoods: "NA" },
	17: { code: "sodio_adicao", name: "Sódio de adição", unit: "mg" },
	18: { code: "potassio", name: "Potássio", unit: "mg", infoods: "K" },
	19: { code: "cobre", name: "Cobre", unit: "mg", infoods: "CU" },
	20: { code: "zinco", name: "Zinco", unit: "mg", infoods: "ZN" },
	21: { code: "selenio", name: "Selênio", unit: "mcg", infoods: "SE" },
	22: { code: "retinol", name: "Retinol", unit: "mcg", infoods: "RETOL" },
	23: { code: "vitamina_a_rae", name: "Vitamina A (RAE)", unit: "mcg", infoods: "VITA_RAE" },
	24: { code: "tiamina", name: "Tiamina (B1)", unit: "mg", infoods: "THIA" },
	25: { code: "riboflavina", name: "Riboflavina (B2)", unit: "mg", infoods: "RIBF" },
	26: { code: "niacina", name: "Niacina (B3)", unit: "mg", infoods: "NIA" },
	27: { code: "equivalente_niacina", name: "Equivalente de niacina (B3)", unit: "mg", infoods: "NIAEQ" },
	28: { code: "piridoxina", name: "Piridoxina (B6)", unit: "mg", infoods: "VITB6A" },
	29: { code: "cobalamina", name: "Cobalamina (B12)", unit: "mcg", infoods: "VITB12" },
	30: { code: "folato_dfe", name: "Folato (DFE)", unit: "mcg", infoods: "FOLDFE" },
	31: { code: "vitamina_d", name: "Vitamina D", unit: "mcg", infoods: "VITD" },
	32: { code: "vitamina_e", name: "Vitamina E (alpha-tocoferol)", unit: "mg", infoods: "TOCPHA" },
	33: { code: "vitamina_c", name: "Vitamina C", unit: "mg", infoods: "VITC" },
	34: { code: "colesterol", name: "Colesterol", unit: "mg", infoods: "CHOLE" },
	35: { code: "ag_saturados", name: "Ácidos graxos saturados", unit: "g", infoods: "FASAT" },
	36: { code: "ag_monoinsaturados", name: "Ácidos graxos monoinsaturados", unit: "g", infoods: "FAMS" },
	37: { code: "ag_poliinsaturados", name: "Ácidos graxos poliinsaturados", unit: "g", infoods: "FAPU" },
	38: { code: "ag_18_2_linoleico", name: "AG 18:2 (linoléico)", unit: "g", infoods: "F18D2CN6" },
	39: { code: "ag_18_3_linolenico", name: "AG 18:3 (linolênico)", unit: "g", infoods: "F18D3CN3" },
	40: { code: "ag_trans", name: "Ácidos graxos trans total", unit: "g", infoods: "FATRN" },
	41: { code: "acucar_total", name: "Açúcar total", unit: "g", infoods: "SUGAR" },
	42: { code: "acucar_adicao", name: "Açúcar de adição", unit: "g" },
}

const ALL_COMPONENTS: ParsedComponent[] = Object.values(COLS).map((c) => ({
	externalCode: c.code,
	name: c.name,
	unit: c.unit,
	infoodsTag: c.infoods ?? null,
}))

function cellToValue(cell: unknown): { value: number | null; valueKind: ParsedValue["valueKind"]; rawValue: string | null } | null {
	if (cell == null || cell === "") return null
	if (typeof cell === "number") return { value: cell, valueKind: "measured", rawValue: null }
	const token = String(cell).trim()
	if (token === "" || token === "-") return null // IBGE encodes missing as "-"
	const num = Number(token.replace(",", "."))
	if (Number.isFinite(num)) return { value: num, valueKind: "measured", rawValue: null }
	return { value: null, valueKind: "not_analyzed", rawValue: token }
}

function findTabelaCompleta(files: Record<string, Uint8Array>): Uint8Array {
	const key = Object.keys(files).find((k) => k.toLowerCase().endsWith("tabelacompleta.xls"))
	if (!key) throw new Error("IBGE: tabelacompleta.xls não encontrado no zip")
	return files[key]
}

export function parseIbgeWorkbook(xlsBytes: Uint8Array): ParsedFood[] {
	const wb = XLSX.read(xlsBytes, { type: "array" })
	const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true }) as unknown[][]

	const foods: ParsedFood[] = []
	for (let i = 4; i < rows.length; i++) {
		const row = rows[i]
		if (!row || typeof row[0] !== "number" || row[0] < 1_000_000) continue // skip titles/section rows
		const foodCode = row[0]
		const prepCode = typeof row[2] === "number" ? row[2] : Number(row[2])
		const foodName = typeof row[1] === "string" ? row[1].trim() : ""
		const prepName = typeof row[3] === "string" ? row[3].trim() : ""
		if (!foodName) continue
		const appliesPrep = prepName && !/^nao se aplica$/i.test(prepName.normalize("NFD").replace(/[̀-ͯ]/g, ""))
		const displayName = appliesPrep ? `${foodName} (${prepName.toLowerCase()})` : foodName

		const values: ParsedValue[] = []
		for (const [idxStr, def] of Object.entries(COLS)) {
			const parsed = cellToValue(row[Number(idxStr)])
			if (!parsed) continue
			values.push({ componentCode: def.code, value: parsed.value, valueKind: parsed.valueKind, rawValue: parsed.rawValue })
		}

		foods.push({
			externalCode: `${foodCode}-${Number.isFinite(prepCode) ? prepCode : 0}`,
			displayName,
			originalName: foodName,
			baseQuantity: 100,
			baseUnit: "g",
			values,
			raw: {
				food_code: foodCode,
				preparation_code: Number.isFinite(prepCode) ? prepCode : null,
				preparation: prepName || null,
				reference_code: row[4] ?? null,
			},
		})
	}
	return foods
}

export async function importIbge(supabase: SupabaseAny): Promise<number> {
	const res = await fetch(DOWNLOAD_URL, { redirect: "follow" })
	if (!res.ok) throw new Error(`Download IBGE falhou: HTTP ${res.status}`)
	const zipBytes = new Uint8Array(await res.arrayBuffer())
	const checksum = createHash("sha256").update(zipBytes).digest("hex")
	const files = unzipSync(zipBytes)
	const xls = findTabelaCompleta(files)

	const foods = parseIbgeWorkbook(xls)
	if (foods.length === 0) throw new Error("IBGE: nenhum alimento parseado — layout mudou?")

	const parsed: ParsedSource = {
		versionLabel: VERSION_LABEL,
		upstreamUrl: UPSTREAM_URL,
		downloadUrl: DOWNLOAD_URL,
		checksumSha256: checksum,
		components: ALL_COMPONENTS,
		foods,
	}
	return persistSourceImport(supabase, SOURCE_ID, parsed)
}
