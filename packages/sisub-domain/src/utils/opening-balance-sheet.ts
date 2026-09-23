/**
 * @module opening-balance-sheet
 * Planilha da carga de abertura do estoque (change sisub-inventory-operations, D14, tarefa 2.12).
 *
 * Funções puras — sem banco, sem rede. O servidor lê o catálogo e o ledger e passa para cá;
 * o teste exercita direto.
 *
 * Decisões que este arquivo materializa:
 *
 *  1. **Coluna por NOME, nunca por posição.** Quem preenche no Excel insere, apaga e reordena
 *     coluna. Coluna exigida ausente aborta o arquivo inteiro, ruidosamente; coluna a mais é
 *     ignorada.
 *  2. **Linha ruim não derruba o arquivo.** Cada linha inválida vira uma recusa com o motivo e
 *     o número da linha NA PLANILHA (a do Excel, com o cabeçalho sendo a 1), e as válidas
 *     seguem. É o que o spec pede: 300 linhas com 12 erradas entram 288.
 *  3. **Número ambíguo é recusado, não adivinhado.** `1.500` pode ser mil e quinhentos (milhar
 *     brasileiro) ou um e meio (decimal com ponto). Errar aqui multiplica o saldo por mil, e o
 *     saldo de abertura vira custo médio e balancete. A linha volta pedindo `1500` ou `1,5`.
 *  4. **Unidade tem de ser a do insumo.** A quantidade entra no estoque na unidade base do
 *     insumo. Converter caixa em quilo exigiria o fator da embalagem, que a planilha não traz;
 *     aceitar em silêncio lançaria 10 "CX" como 10 KG.
 *  5. **Zero não é quantidade nem custo.** Linha com quantidade zero é linha que não devia
 *     estar na carga; custo zero entraria a R$ 0 e diluiria a média.
 */

/** Tamanho máximo de lote e local — o mesmo CHECK de `inventory.stock_lot` / `opening_balance_item`. */
export const OPENING_TEXT_MAX = 60
/** Teto de linhas por arquivo. Uma cozinha tem centenas de itens; milhares é arquivo errado. */
export const OPENING_MAX_ROWS = 5000
/**
 * Teto da quantidade: o que cabe em `numeric(14,4)`. Acima disso o insert estoura dentro da
 * RPC com `numeric field overflow` e derruba a planilha INTEIRA — um código de barras colado
 * por engano na coluna de quantidade apagaria o trabalho das outras 300 linhas.
 */
export const OPENING_MAX_QUANTITY = 9_999_999_999

/** Cabeçalhos aceitos por campo, já normalizados (minúsculas, sem acento, `_` como separador). */
const HEADER_ALIASES = {
	ingredientId: ["insumo_id", "id_insumo", "id_do_insumo", "ingredient_id"],
	code: ["codigo", "cod", "codigo_insumo", "codigo_do_insumo"],
	description: ["descricao", "insumo", "descricao_do_insumo", "item"],
	quantity: ["quantidade", "qtd", "qtde", "saldo"],
	unit: ["unidade", "un", "und", "unidade_de_medida"],
	lotCode: ["lote", "codigo_do_lote"],
	expiryDate: ["validade", "vencimento", "data_de_validade"],
	location: ["local", "localizacao", "endereco", "posicao"],
} as const

type HeaderField = keyof typeof HEADER_ALIASES

/**
 * Códigos canônicos de `core.measure_unit` e as grafias que chegam de planilha.
 * A chave é a grafia normalizada (minúsculas, sem acento e sem ponto final).
 */
const UNIT_ALIASES: Record<string, string> = {
	kg: "KG",
	kgs: "KG",
	quilo: "KG",
	quilos: "KG",
	quilograma: "KG",
	quilogramas: "KG",
	g: "G",
	gr: "G",
	grs: "G",
	grama: "G",
	gramas: "G",
	l: "LT",
	lt: "LT",
	lts: "LT",
	litro: "LT",
	litros: "LT",
	ml: "ML",
	mililitro: "ML",
	mililitros: "ML",
	un: "UN",
	und: "UN",
	unid: "UN",
	unidade: "UN",
	unidades: "UN",
	dz: "DZ",
	duzia: "DZ",
	duzias: "DZ",
	cx: "CX",
	caixa: "CX",
	caixas: "CX",
	pct: "PCT",
	pc: "PCT",
	pacote: "PCT",
	pacotes: "PCT",
	sc: "SC",
	saco: "SC",
	sacos: "SC",
	lata: "LATA",
	latas: "LATA",
	gl: "GL",
	galao: "GL",
	galoes: "GL",
	fd: "FD",
	fardo: "FD",
	fardos: "FD",
	bdj: "BDJ",
	bandeja: "BDJ",
	bandejas: "BDJ",
}

export class OpeningSheetError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "OpeningSheetError"
	}
}

/** Uma linha da planilha que passou na leitura, ainda sem o insumo resolvido. */
export interface OpeningSheetRow {
	/** Linha na planilha: o cabeçalho é a 1, a primeira linha de dados é a 2. */
	lineNumber: number
	ingredientId: string | null
	code: string | null
	description: string | null
	quantity: number
	unitCode: string
	lotCode: string | null
	/** `aaaa-mm-dd` */
	expiryDate: string | null
	location: string | null
}

export interface OpeningSheetRejection {
	lineNumber: number
	reason: string
	/** O que a linha trazia para identificar o item — para a pessoa achar a linha sem abrir o arquivo. */
	label: string | null
}

export interface ParsedOpeningSheet {
	rows: OpeningSheetRow[]
	rejections: OpeningSheetRejection[]
}

/** minúsculas, sem acento, espaços e pontuação colapsados em `_`. */
function normalizeHeader(raw: string): string {
	return raw
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
}

/** Texto para casar descrição: minúsculas, sem acento, espaços colapsados. */
export function normalizeDescription(raw: string): string {
	return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

/** Grafia de unidade → código canônico de `core.measure_unit`, ou `null` se desconhecida. */
export function normalizeMeasureUnitCode(raw: string): string | null {
	const key = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\.$/, "")
	if (key === "") return null
	return UNIT_ALIASES[key] ?? null
}

type NumberParse = { ok: true; value: number } | { ok: false; reason: string }

/**
 * Número de planilha brasileira ou internacional.
 *
 * - com vírgula: formato brasileiro — `1.350,5` → 1350.5;
 * - sem vírgula e com ponto no padrão de milhar (`1.500`, `12.000`): AMBÍGUO, recusado;
 * - sem vírgula: ponto é decimal — `1.25` → 1.25.
 */
export function parseSheetNumber(raw: string): NumberParse {
	const v = raw.trim().replace(/\s/g, "")
	if (v === "") return { ok: false, reason: "vazio" }
	let normalized: string
	if (v.includes(",")) {
		if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(v)) return { ok: false, reason: `"${raw.trim()}" não é um número` }
		normalized = v.replace(/\./g, "").replace(",", ".")
	} else if (/^-?\d{1,3}(\.\d{3})+$/.test(v)) {
		return { ok: false, reason: `"${raw.trim()}" é ambíguo (milhar ou decimal?) — escreva ${v.replace(/\./g, "")} ou ${v.replace(".", ",")}` }
	} else {
		if (!/^-?\d+(\.\d+)?$/.test(v)) return { ok: false, reason: `"${raw.trim()}" não é um número` }
		normalized = v
	}
	const value = Number(normalized)
	if (!Number.isFinite(value)) return { ok: false, reason: `"${raw.trim()}" não é um número` }
	return { ok: true, value }
}

type DateParse = { ok: true; value: string | null } | { ok: false; reason: string }

/** `dd/mm/aaaa`, `dd/mm/aa` ou `aaaa-mm-dd` → `aaaa-mm-dd`. Vazio é "sem validade". Data impossível é recusada. */
export function parseSheetDate(raw: string): DateParse {
	const v = raw.trim()
	if (v === "" || v === "-") return { ok: true, value: null }
	let y: number
	let m: number
	let d: number
	const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
	const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
	if (br) {
		d = Number(br[1])
		m = Number(br[2])
		y = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3])
	} else if (iso) {
		y = Number(iso[1])
		m = Number(iso[2])
		d = Number(iso[3])
	} else {
		return { ok: false, reason: `validade "${v}" fora do formato dd/mm/aaaa` }
	}
	const date = new Date(Date.UTC(y, m - 1, d))
	if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
		return { ok: false, reason: `validade "${v}" não é uma data que existe` }
	}
	return { ok: true, value: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` }
}

/** Separador mais frequente FORA de aspas na linha de cabeçalho. Excel pt-BR salva CSV com `;`. */
function detectDelimiter(headerLine: string): string {
	const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 }
	let quoted = false
	for (const ch of headerLine) {
		if (ch === '"') quoted = !quoted
		else if (!quoted && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1
	}
	const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
	return best && best[1] > 0 ? best[0] : ";"
}

/**
 * Registros do CSV com a linha FÍSICA em que cada um começa.
 *
 * O número da linha é o que a pessoa procura no Excel para corrigir, então linha em branco
 * no meio da planilha conta — pulá-la sem contar faria toda recusa seguinte apontar uma linha
 * acima da certa. Quebra de linha dentro de campo entre aspas não abre registro novo.
 */
function splitRecordsWithLine(content: string): Array<{ text: string; line: number }> {
	const records: Array<{ text: string; line: number }> = []
	let current = ""
	let quoted = false
	let line = 1
	let startLine = 1
	for (let i = 0; i < content.length; i++) {
		const ch = content[i] as string
		if (ch === '"') {
			if (quoted && content[i + 1] === '"') {
				current += '""'
				i++
				continue
			}
			quoted = !quoted
			current += ch
			continue
		}
		if (!quoted && (ch === "\n" || ch === "\r")) {
			if (ch === "\r" && content[i + 1] === "\n") i++
			if (current.trim() !== "") records.push({ text: current, line: startLine })
			current = ""
			line++
			startLine = line
			continue
		}
		if (ch === "\n") line++
		current += ch
	}
	if (current.trim() !== "") records.push({ text: current, line: startLine })
	return records
}

/** Divide um registro pelo separador, respeitando aspas e o escape `""`. */
function splitFields(record: string, sep: string): string[] {
	const out: string[] = []
	let field = ""
	let quoted = false
	let atFieldStart = true
	for (let i = 0; i < record.length; i++) {
		const ch = record[i] as string
		if (ch === '"') {
			if (quoted) {
				if (record[i + 1] === '"') {
					field += '"'
					i++
				} else {
					quoted = false
				}
			} else if (atFieldStart) {
				quoted = true
			} else {
				field += ch
			}
			atFieldStart = false
			continue
		}
		if (!quoted && ch === sep) {
			out.push(field)
			field = ""
			atFieldStart = true
			continue
		}
		field += ch
		atFieldStart = false
	}
	out.push(field)
	return out
}

function emptyToNull(raw: string | undefined): string | null {
	const v = (raw ?? "").trim()
	return v === "" || v === "-" ? null : v
}

/**
 * Lê a planilha (CSV com `;`, `,` ou tabulação; com ou sem BOM).
 *
 * Aborta com `OpeningSheetError` só quando o ARQUIVO não serve: vazio, sem as colunas exigidas
 * ou acima do teto de linhas. Problema de LINHA vira recusa.
 */
export function parseOpeningSheet(content: string): ParsedOpeningSheet {
	const text = content.replace(/^﻿/, "")
	const records = splitRecordsWithLine(text)
	const header = records[0]
	if (!header) throw new OpeningSheetError("Planilha vazia")
	if (records.length - 1 > OPENING_MAX_ROWS) {
		throw new OpeningSheetError(`Planilha com ${records.length - 1} linhas — o limite é ${OPENING_MAX_ROWS}. Divida o arquivo`)
	}

	const sep = detectDelimiter(header.text)
	const headers = splitFields(header.text, sep).map(normalizeHeader)
	const column = {} as Record<HeaderField, number>
	for (const field of Object.keys(HEADER_ALIASES) as HeaderField[]) {
		const aliases = HEADER_ALIASES[field] as readonly string[]
		column[field] = headers.findIndex((h) => aliases.includes(h))
	}

	const missing: string[] = []
	if (column.quantity === -1) missing.push("quantidade")
	if (column.unit === -1) missing.push("unidade")
	if (missing.length > 0) throw new OpeningSheetError(`Coluna(s) obrigatória(s) ausente(s): ${missing.join(", ")}`)
	if (column.ingredientId === -1 && column.code === -1 && column.description === -1) {
		throw new OpeningSheetError("A planilha precisa identificar o item: coluna insumo_id, codigo ou descricao")
	}

	const rows: OpeningSheetRow[] = []
	const rejections: OpeningSheetRejection[] = []
	const cell = (fields: string[], field: HeaderField) => (column[field] === -1 ? undefined : fields[column[field]])

	for (const record of records.slice(1)) {
		const fields = splitFields(record.text, sep)
		const ingredientId = emptyToNull(cell(fields, "ingredientId"))
		const code = emptyToNull(cell(fields, "code"))
		const description = emptyToNull(cell(fields, "description"))
		const label = description ?? code ?? ingredientId
		const reject = (reason: string) => rejections.push({ lineNumber: record.line, reason, label })

		const rawQuantity = cell(fields, "quantity") ?? ""
		// Linha da folha do catálogo que a pessoa não preencheu: não é erro, é item
		// que a cozinha não tem. Recusar encheria a lista de 1.500 "quantidade vazia".
		//
		// Vem ANTES da identificação de propósito: o Excel fecha o arquivo com linhas só de
		// separadores (`;;;;;;;`), e cobrá-las por insumo enterraria as recusas de verdade no
		// meio de dezenas de "linha sem insumo_id".
		if (rawQuantity.trim() === "") continue

		if (!ingredientId && !code && !description) {
			reject("linha sem insumo_id, código nem descrição")
			continue
		}
		if (ingredientId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ingredientId)) {
			reject(`insumo_id "${ingredientId}" inválido`)
			continue
		}
		const quantity = parseSheetNumber(rawQuantity)
		if (!quantity.ok) {
			reject(`quantidade: ${quantity.reason}`)
			continue
		}
		if (quantity.value <= 0) {
			reject("quantidade precisa ser maior que zero")
			continue
		}
		if (quantity.value > OPENING_MAX_QUANTITY) {
			reject(`quantidade ${quantity.value} é grande demais — confira se não é um código lido na coluna errada`)
			continue
		}

		const rawUnit = (cell(fields, "unit") ?? "").trim()
		const unitCode = normalizeMeasureUnitCode(rawUnit)
		if (!unitCode) {
			reject(rawUnit === "" ? "unidade vazia" : `unidade "${rawUnit}" desconhecida`)
			continue
		}

		const expiry = parseSheetDate(cell(fields, "expiryDate") ?? "")
		if (!expiry.ok) {
			reject(expiry.reason)
			continue
		}

		const lotCode = emptyToNull(cell(fields, "lotCode"))
		const location = emptyToNull(cell(fields, "location"))
		if (lotCode && lotCode.length > OPENING_TEXT_MAX) {
			reject(`lote com mais de ${OPENING_TEXT_MAX} caracteres`)
			continue
		}
		if (location && location.length > OPENING_TEXT_MAX) {
			reject(`local com mais de ${OPENING_TEXT_MAX} caracteres`)
			continue
		}

		rows.push({
			lineNumber: record.line,
			ingredientId: ingredientId?.toLowerCase() ?? null,
			code,
			description,
			quantity: quantity.value,
			unitCode,
			lotCode,
			expiryDate: expiry.value,
			location,
		})
	}

	return { rows, rejections }
}

// ─── Resolução contra o catálogo ────────────────────────────────────────────

/** Insumo do catálogo como o servidor o entrega para a resolução. */
export interface OpeningCatalogIngredient {
	id: string
	/** `kitchen.ingredient.legacy_id` — o código que a cozinha conhece do SISUBWEB. */
	code: string | null
	description: string
	/** `kitchen.ingredient.measure_unit` como está no cadastro. */
	measureUnit: string | null
}

export interface OpeningIngredientIndex {
	byId: Map<string, OpeningCatalogIngredient>
	byCode: Map<string, OpeningCatalogIngredient[]>
	byDescription: Map<string, OpeningCatalogIngredient[]>
}

export function buildIngredientIndex(ingredients: readonly OpeningCatalogIngredient[]): OpeningIngredientIndex {
	const index: OpeningIngredientIndex = { byId: new Map(), byCode: new Map(), byDescription: new Map() }
	for (const ingredient of ingredients) {
		index.byId.set(ingredient.id.toLowerCase(), ingredient)
		if (ingredient.code) {
			const list = index.byCode.get(ingredient.code) ?? []
			list.push(ingredient)
			index.byCode.set(ingredient.code, list)
		}
		const key = normalizeDescription(ingredient.description)
		const list = index.byDescription.get(key) ?? []
		list.push(ingredient)
		index.byDescription.set(key, list)
	}
	return index
}

/** Linha aceita, pronta para o rascunho. */
export interface OpeningResolvedLine {
	lineNumber: number
	ingredientId: string
	description: string
	unitCode: string
	quantity: number
	lotCode: string | null
	expiryDate: string | null
	location: string | null
}

export interface ResolveOpeningOptions {
	/** Códigos de `core.measure_unit`. Insumo com unidade fora daqui não movimenta estoque. */
	canonicalUnits: ReadonlySet<string>
	/** Insumos que já têm movimento NESTA cozinha — não entram na carga. */
	movedIngredientIds: ReadonlySet<string>
}

export interface ResolvedOpeningSheet {
	lines: OpeningResolvedLine[]
	rejections: OpeningSheetRejection[]
}

/**
 * Casa cada linha com um insumo e aplica as regras que dependem do cadastro.
 *
 * Precedência de identificação: `insumo_id` > `codigo` > `descricao`. Identificador mais forte
 * que não casa RECUSA a linha em vez de cair para o mais fraco: `insumo_id` errado com uma
 * descrição que casa por acaso lançaria o saldo no item errado.
 */
export function resolveOpeningSheet(parsed: ParsedOpeningSheet, index: OpeningIngredientIndex, options: ResolveOpeningOptions): ResolvedOpeningSheet {
	const lines: OpeningResolvedLine[] = []
	const rejections: OpeningSheetRejection[] = [...parsed.rejections]
	const seen = new Map<string, number>()

	for (const row of parsed.rows) {
		const label = row.description ?? row.code ?? row.ingredientId
		const reject = (reason: string) => rejections.push({ lineNumber: row.lineNumber, reason, label })

		let ingredient: OpeningCatalogIngredient | undefined
		if (row.ingredientId) {
			ingredient = index.byId.get(row.ingredientId)
			if (!ingredient) {
				reject(`insumo_id ${row.ingredientId} não existe no catálogo (ou é preparação, não insumo)`)
				continue
			}
		} else if (row.code) {
			const matches = index.byCode.get(row.code) ?? []
			if (matches.length === 0) {
				reject(`código ${row.code} não existe no catálogo`)
				continue
			}
			if (matches.length > 1) {
				reject(`código ${row.code} corresponde a ${matches.length} insumos — use o insumo_id da folha do catálogo`)
				continue
			}
			ingredient = matches[0]
		} else if (row.description) {
			const matches = index.byDescription.get(normalizeDescription(row.description)) ?? []
			if (matches.length === 0) {
				reject("descrição não encontrada no catálogo — use o código ou a folha gerada pelo sistema")
				continue
			}
			if (matches.length > 1) {
				reject(`descrição corresponde a ${matches.length} insumos — use o código`)
				continue
			}
			ingredient = matches[0]
		}
		if (!ingredient) continue

		const ingredientUnit = (ingredient.measureUnit ?? "").trim().toUpperCase()
		if (!ingredientUnit || !options.canonicalUnits.has(ingredientUnit)) {
			reject(`insumo "${ingredient.description}" sem unidade de medida canônica — corrija na fila de revisão antes da carga`)
			continue
		}
		if (row.unitCode !== ingredientUnit) {
			reject(`unidade ${row.unitCode} diferente da unidade do insumo (${ingredientUnit}) — informe a quantidade em ${ingredientUnit}`)
			continue
		}
		if (options.movedIngredientIds.has(ingredient.id)) {
			reject(`"${ingredient.description}" já tem movimento nesta cozinha — o saldo dele se corrige por contagem, não por carga de abertura`)
			continue
		}

		const key = `${ingredient.id}|${row.lotCode ?? ""}|${row.expiryDate ?? ""}`
		const firstLine = seen.get(key)
		if (firstLine != null) {
			reject(`duplicada da linha ${firstLine} (mesmo item, lote e validade) — some as quantidades numa linha só`)
			continue
		}
		seen.set(key, row.lineNumber)

		lines.push({
			lineNumber: row.lineNumber,
			ingredientId: ingredient.id,
			description: ingredient.description,
			unitCode: ingredientUnit,
			quantity: row.quantity,
			lotCode: row.lotCode,
			expiryDate: row.expiryDate,
			location: row.location,
		})
	}

	rejections.sort((a, b) => a.lineNumber - b.lineNumber)
	return { lines, rejections }
}

// ─── Folha do catálogo ──────────────────────────────────────────────────────

/** Colunas da folha gerada, na ordem. As três primeiras vêm preenchidas. */
export const OPENING_SHEET_HEADER = ["insumo_id", "codigo", "descricao", "unidade", "quantidade", "lote", "validade", "local"] as const

function csvField(value: string): string {
	return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Folha para preencher, a partir do catálogo: uma linha por insumo, com identificação e
 * unidade preenchidas e quantidade/lote/validade/local em branco.
 *
 * `;` como separador e BOM no início: é o que o Excel em português abre direto, com acento
 * certo e uma coluna por campo. Linha deixada em branco na quantidade é ignorada na volta.
 */
export function buildOpeningCatalogSheet(ingredients: readonly OpeningCatalogIngredient[]): string {
	const lines = [OPENING_SHEET_HEADER.join(";")]
	for (const ingredient of ingredients) {
		lines.push(
			[ingredient.id, ingredient.code ?? "", ingredient.description, (ingredient.measureUnit ?? "").toUpperCase(), "", "", "", ""].map(csvField).join(";")
		)
	}
	return `﻿${lines.join("\r\n")}\r\n`
}

// ─── Sugestão de custo ──────────────────────────────────────────────────────

/** Preço candidato para um insumo, já convertido para a unidade base. */
export interface OpeningCostCandidate {
	source: "ata" | "price_research"
	/** R$ por unidade base do insumo. */
	unitCost: number
	/** Texto para quem audita: "ATA 12/2026 item 5", "Pesquisa da ATA …". */
	reference: string
	/** A ATA/lista é da unidade dona da cozinha? */
	sameUnit: boolean
	/** Data de referência (`aaaa-mm-dd`) — vigência da ATA ou cálculo da lista. */
	date: string | null
}

/**
 * Preço de compra → preço por unidade base.
 *
 * `conversion_factor` é "unidades base por unidade de compra" (é assim que `ata.ts` calcula
 * `purchase_quantity = total_quantity / conversion_factor`). Sem fator conhecido NÃO há
 * sugestão: dividir por 1 por omissão transformaria o preço da caixa em preço do quilo.
 */
export function pricePerBaseUnit(unitPrice: number | null, conversionFactor: number | null): number | null {
	if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) return null
	if (conversionFactor == null || !Number.isFinite(conversionFactor) || conversionFactor <= 0) return null
	return Math.round((unitPrice / conversionFactor) * 10_000) / 10_000
}

/**
 * Escolhe a sugestão de custo de um insumo: preço homologado de ATA antes de pesquisa de preço;
 * dentro de cada fonte, a da própria unidade antes da de outra; depois a mais recente.
 */
export function pickOpeningCost(candidates: readonly OpeningCostCandidate[]): OpeningCostCandidate | null {
	const valid = candidates.filter((c) => Number.isFinite(c.unitCost) && c.unitCost > 0)
	if (valid.length === 0) return null
	const rank = (c: OpeningCostCandidate) => (c.source === "ata" ? 0 : 2) + (c.sameUnit ? 0 : 1)
	return [...valid].sort((a, b) => rank(a) - rank(b) || (b.date ?? "").localeCompare(a.date ?? ""))[0] ?? null
}
