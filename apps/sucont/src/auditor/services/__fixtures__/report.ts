/**
 * Gerador da planilha-fixture do auditor SIAFI x SILOMS.
 *
 * Reproduz as PATOLOGIAS observadas no relatório real de importação sem carregar
 * dado financeiro institucional para o repositório:
 *
 *  - cabeçalho na primeira linha, com "MÊS" na coluna 0;
 *  - competências no mesmo arquivo em três formatos — "JANEIRO/2024" em caixa alta,
 *    "março/2025" em caixa baixa e célula de data de verdade;
 *  - coluna DIF com o sinal invertido linha a linha (parte SILOMS-SIAFI, parte
 *    SIAFI-SILOMS, misturadas dentro da mesma competência);
 *  - célula com DIF zerado sobre saldos que divergem de fato;
 *  - UG ausente em uma das competências (buraco na série).
 */

import { utils, write } from "xlsx"

export const HEADER = [
	"MÊS",
	"COD",
	"UG",
	"GRUPO DE CONTAS CONSUMO",
	"SIAFI",
	"SILOMS",
	"DIF",
	"GRUPO DE CONTAS BMP",
	"SIAFI",
	"SILOMS",
	"DIF",
	"GRUPO DE CONTAS INTANG",
	"SIAFI",
	"SILOMS",
	"DIF",
]

type Cell = string | number | Date | null

interface RowSpec {
	period: string | Date
	cod: number
	ug: string
	consumo: [number, number, number]
	bmp: [number, number, number]
	intang: [number, number, number]
}

const toSheetRow = (r: RowSpec): Cell[] => [r.period, r.cod, r.ug, "CONSUMO", ...r.consumo, "BMP", ...r.bmp, "INTANGÍVEL", ...r.intang]

/**
 * Três competências consecutivas com duas UGs, exceto FEV/2024 onde a UG 120002
 * não aparece — o mesmo buraco que o relatório real tem em set/2024 e dez/2024.
 */
export const FIXTURE_ROWS: RowSpec[] = [
	{
		period: "JANEIRO/2024",
		cod: 120001,
		ug: "ALFA",
		// DIF no sentido SILOMS - SIAFI (negativo).
		consumo: [1000, 900, -100],
		bmp: [500, 500, 0],
		intang: [10, 10, 0],
	},
	{
		period: "JANEIRO/2024",
		cod: 120002,
		ug: "BRAVO",
		// DIF no sentido oposto, SIAFI - SILOMS, na MESMA competência.
		consumo: [2000, 1500, 500],
		// DIF zerado sobre saldos que divergem: o número do arquivo mente.
		bmp: [800, 600, 0],
		intang: [0, 0, 0],
	},
	{
		period: "março/2025",
		cod: 120001,
		ug: "ALFA",
		consumo: [1200, 1000, -200],
		bmp: [500, 400, -100],
		intang: [10, 10, 0],
	},
	// 120002 ausente em março/2025 — buraco deliberado na série.
	{
		period: new Date(2025, 3, 1),
		cod: 120001,
		ug: "ALFA",
		consumo: [1300, 1000, 300],
		bmp: [500, 400, 100],
		intang: [10, 10, 0],
	},
	{
		period: new Date(2025, 3, 1),
		cod: 120002,
		ug: "BRAVO",
		consumo: [2100, 2100, 0],
		bmp: [900, 300, -600],
		intang: [0, 0, 0],
	},
]

/** Monta o .xlsx em memória e devolve um File — a entrada real do parseExcelFile. */
export function buildFixtureFile(rows: RowSpec[] = FIXTURE_ROWS, filename = "fixture.xlsx"): File {
	const sheet = utils.aoa_to_sheet([HEADER, ...rows.map(toSheetRow)], { cellDates: true })
	const book = utils.book_new()
	utils.book_append_sheet(book, sheet, "relatório")
	const buffer = write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer
	return new File([buffer], filename, {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	})
}

/**
 * `parseExcelFile` usa FileReader (API de browser). Sob Node o objeto não existe;
 * este polyfill mínimo cobre exatamente o que o parser chama.
 */
export function installFileReaderPolyfill(): void {
	if (typeof globalThis.FileReader !== "undefined") return
	class NodeFileReader {
		onload: ((event: { target: { result: unknown } }) => void) | null = null
		onerror: ((error: unknown) => void) | null = null
		result: unknown = null
		readAsArrayBuffer(blob: Blob) {
			blob
				.arrayBuffer()
				.then((ab) => {
					this.result = new Uint8Array(ab)
					this.onload?.({ target: { result: this.result } })
				})
				.catch((e) => this.onerror?.(e))
		}
	}
	;(globalThis as { FileReader?: unknown }).FileReader = NodeFileReader
}
