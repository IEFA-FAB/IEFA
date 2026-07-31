/**
 * Parser de relatórios do Tesouro Gerencial (execução orçamentária).
 *
 * O Tesouro Gerencial não exporta um layout fixo: o usuário monta o relatório
 * e os cabeçalhos variam por unidade e por versão. Por isso o parser reconhece
 * colunas por MAPA DE SINÔNIMOS (normalizado sem acento/caixa/pontuação) em
 * vez de posição, e trata "nenhuma linha reconhecida" como erro de layout —
 * nunca como importação vazia (mesmo guard dos importadores TACO/IBGE/USDA).
 *
 * Valores vêm em pt-BR (`1.234,56`, às vezes com "R$" e sinal negativo entre
 * parênteses) e datas em `DD/MM/AAAA` — normalização explícita e testada, que
 * é a classe de bug mais provável aqui.
 *
 * ⚠️ Os sinônimos abaixo são a melhor hipótese até termos um export real de
 * cada relatório (questão aberta no design). Quando o arquivo real chegar,
 * basta estender os mapas: as linhas cruas ficam em siafi_integration.import_row
 * e podem ser reprocessadas sem novo upload.
 */

export type SiafiReportType = "credito" | "ne" | "ns" | "ob"

/** Normaliza cabeçalho: sem acento, sem pontuação, minúsculo, espaço único. */
export function normalizeHeader(raw: string): string {
	return raw
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

/** Valor monetário pt-BR → number. `(1.234,56)` = negativo. null se não numérico. */
export function parseBrMoney(raw: unknown): number | null {
	if (raw == null) return null
	if (typeof raw === "number") return Number.isFinite(raw) ? raw : null
	let text = String(raw).trim()
	if (text === "" || text === "-") return null
	const negative = /^\(.*\)$/.test(text) || text.startsWith("-")
	text = text
		.replace(/[()\s]/g, "")
		.replace(/^-/, "")
		.replace(/r\$/i, "")
	// pt-BR: ponto é milhar, vírgula é decimal
	text = text.replace(/\./g, "").replace(",", ".")
	if (!/^\d+(\.\d+)?$/.test(text)) return null
	const value = Number(text)
	if (!Number.isFinite(value)) return null
	return negative ? -value : value
}

/** Data `DD/MM/AAAA` (ou ISO) → `YYYY-MM-DD`. */
export function parseBrDate(raw: unknown): string | null {
	if (raw == null) return null
	const text = String(raw).trim()
	const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
	if (br) return `${br[3]}-${br[2]}-${br[1]}`
	const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
	if (iso) return iso[0]
	return null
}

/** Só dígitos (CNPJ, UG, PTRES, ND). null quando vazio. */
export function digitsOnly(raw: unknown): string | null {
	if (raw == null) return null
	const digits = String(raw).replace(/\D/g, "")
	return digits === "" ? null : digits
}

/** Sinônimos por campo lógico — a chave é o campo, os valores são cabeçalhos normalizados. */
const FIELD_SYNONYMS: Record<string, string[]> = {
	ug: ["ug", "ug executora", "unidade gestora", "ug emitente", "codigo ug"],
	nd: ["nd", "natureza despesa", "natureza da despesa", "nd detalhada", "elemento despesa"],
	ptres: ["ptres", "programa trabalho resumido", "programa de trabalho resumido"],
	fonte: ["fonte", "fonte recurso", "fonte de recurso", "fonte recursos"],
	dotacao: ["dotacao", "dotacao atualizada", "credito disponivel", "dotacao autorizada", "valor dotacao"],
	empenhado: ["empenhado", "despesas empenhadas", "valor empenhado", "empenhado a liquidar"],
	saldo: ["saldo", "saldo disponivel", "credito disponivel saldo", "saldo dotacao"],
	numero_ne: ["ne", "nota empenho", "nota de empenho", "documento", "numero ne", "empenho"],
	numero_ns: ["ns", "nota sistema", "nota de sistema", "documento", "numero ns", "nota lancamento"],
	numero_ob: ["ob", "ordem bancaria", "ordem bancaria numero", "documento", "numero ob"],
	data: ["data", "data emissao", "data documento", "data lancamento", "emissao"],
	valor: ["valor", "valor documento", "valor total", "vlr documento", "montante"],
	favorecido_cnpj: ["cnpj", "cpf cnpj", "favorecido", "codigo favorecido", "cnpj favorecido"],
	favorecido_nome: ["nome favorecido", "favorecido nome", "razao social", "credor"],
	tipo_empenho: ["tipo empenho", "especie empenho", "tipo"],
	ne_origem: ["ne origem", "nota empenho origem", "empenho origem", "documento origem"],
	ns_origem: ["ns origem", "nota sistema origem", "documento origem"],
	competencia: ["competencia", "mes referencia", "periodo"],
	valor_liquidado: ["liquidado", "valor liquidado", "despesas liquidadas"],
	valor_pago: ["pago", "valor pago", "despesas pagas"],
}

/** Campos obrigatórios por tipo de relatório — ausência = arquivo errado no slot. */
const REQUIRED_FIELDS: Record<SiafiReportType, string[]> = {
	credito: ["nd", "dotacao"],
	ne: ["numero_ne", "valor"],
	ns: ["numero_ns", "valor"],
	ob: ["numero_ob", "valor"],
}

export interface ParsedSiafiRow {
	rowNumber: number
	raw: Record<string, unknown>
	parsed: Record<string, unknown> | null
	status: "parsed" | "unrecognized" | "invalid"
	error?: string
}

export interface ParsedSiafiReport {
	reportType: SiafiReportType
	/** cabeçalho normalizado → campo lógico */
	columnMap: Record<string, string>
	rows: ParsedSiafiRow[]
	totalRows: number
	recognizedRows: number
}

export class SiafiParseError extends Error {}

/** Resolve cada cabeçalho do arquivo para um campo lógico (ou descarta). */
export function mapColumns(headers: readonly string[], reportType: SiafiReportType): Record<string, string> {
	const map: Record<string, string> = {}
	// "documento" é ambíguo entre relatórios — resolve pelo tipo declarado
	const documentField = reportType === "ne" ? "numero_ne" : reportType === "ns" ? "numero_ns" : reportType === "ob" ? "numero_ob" : null

	for (const header of headers) {
		const normalized = normalizeHeader(header)
		if (normalized === "") continue
		if (normalized === "documento" && documentField) {
			map[header] = documentField
			continue
		}
		for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
			// "documento" já tratado acima; evita mapear para o campo de outro tipo
			if (synonyms.includes(normalized) && normalized !== "documento") {
				if (map[header] == null) map[header] = field
				break
			}
		}
	}
	return map
}

function coerce(field: string, value: unknown): unknown {
	if (field.startsWith("valor") || ["dotacao", "empenhado", "saldo"].includes(field)) return parseBrMoney(value)
	if (field === "data" || field === "competencia") return parseBrDate(value)
	if (["ug", "nd", "ptres", "fonte", "favorecido_cnpj"].includes(field)) return digitsOnly(value)
	const text = value == null ? null : String(value).trim()
	return text === "" ? null : text
}

/**
 * Parseia linhas já lidas do arquivo (array de objetos cabeçalho→valor).
 * A leitura de CSV/XLSX fica no chamador — aqui é puro e testável.
 *
 * @throws {SiafiParseError} colunas obrigatórias ausentes ou nenhuma linha reconhecida
 */
export function parseSiafiRows(rows: readonly Record<string, unknown>[], reportType: SiafiReportType): ParsedSiafiReport {
	if (rows.length === 0) throw new SiafiParseError("Arquivo sem linhas de dados")

	const headers = Object.keys(rows[0] ?? {})
	const columnMap = mapColumns(headers, reportType)
	const mappedFields = new Set(Object.values(columnMap))

	const missing = REQUIRED_FIELDS[reportType].filter((field) => !mappedFields.has(field))
	if (missing.length > 0) {
		throw new SiafiParseError(
			`Colunas obrigatórias não encontradas para o relatório "${reportType}": ${missing.join(", ")}. Confira se o tipo declarado corresponde ao arquivo.`
		)
	}

	const parsedRows: ParsedSiafiRow[] = rows.map((raw, index) => {
		const parsed: Record<string, unknown> = {}
		let hasValue = false
		for (const [header, field] of Object.entries(columnMap)) {
			const value = coerce(field, raw[header])
			if (value != null) hasValue = true
			parsed[field] = value
		}

		const rowNumber = index + 1
		if (!hasValue) return { rowNumber, raw, parsed: null, status: "unrecognized" }

		for (const required of REQUIRED_FIELDS[reportType]) {
			if (parsed[required] == null) {
				return { rowNumber, raw, parsed, status: "invalid", error: `Campo obrigatório ausente na linha: ${required}` }
			}
		}
		return { rowNumber, raw, parsed, status: "parsed" }
	})

	const recognizedRows = parsedRows.filter((row) => row.status === "parsed").length
	if (recognizedRows === 0) {
		throw new SiafiParseError("Nenhuma linha reconhecida — o layout do relatório provavelmente mudou (as linhas cruas ficam salvas para reprocessamento)")
	}

	return { reportType, columnMap, rows: parsedRows, totalRows: rows.length, recognizedRows }
}
