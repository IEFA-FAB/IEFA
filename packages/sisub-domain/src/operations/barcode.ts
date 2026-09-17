/**
 * Interpretação de código lido (leitor USB, câmera ou digitação).
 *
 * Um único ponto decide o que um código É, porque as quatro telas de leitura
 * (conferência, saída, contagem, ajuste) precisam da mesma resposta:
 *
 *  • `gtin`            — EAN-8/12/13/14 válido, normalizado a 14 dígitos
 *  • `gs1`             — GS1-128 / DataMatrix com identificadores de aplicação:
 *                        traz GTIN, lote e validade na MESMA leitura, o que é o
 *                        que torna o FEFO viável sem digitar lote
 *  • `lot_label`       — etiqueta interna de lote do sisub (a única maneira de
 *                        identificar lote de produto de varejo, que só tem EAN,
 *                        e de hortifrúti, que não tem código nenhum)
 *  • `nfe_access_key`  — chave de acesso do DANFE (44 caracteres)
 *  • `unknown`         — com motivo, para a tela dizer o que está errado
 *
 * O separador GS (ASCII 29) é o detalhe que mais quebra na prática: leitor em
 * modo teclado costuma engoli-lo ou trocá-lo, e o layout ABNT2 troca
 * caracteres. Por isso o separador é configurável por estação e aceitamos os
 * substitutos mais comuns.
 */

import { parseGtin } from "./gtin.ts"

/** Separador de campo de comprimento variável do GS1 (FNC1 → ASCII 29). */
export const GS = ""

/** Substitutos que leitores configurados costumam enviar no lugar do GS. */
const DEFAULT_GS_SUBSTITUTES = ["|", "~", "^"] as const

/**
 * Prefixos de identificação de simbologia (AIM): o leitor pode enviá-los antes
 * do conteúdo. `]C1` = GS1-128, `]e0` = GS1 DataBar, `]d2` = GS1 DataMatrix,
 * `]Q3` = GS1 QR Code.
 */
const SYMBOLOGY_PREFIXES = ["]C1", "]e0", "]d2", "]Q3"] as const

/** Etiqueta interna de lote: `LOT` + 8 caracteres do alfabeto de Crockford. */
export const LOT_LABEL_PATTERN = /^LOT[0-9A-HJKMNP-TV-Z]{8}$/

export interface BarcodeConfig {
	/** Prefixo que o leitor acrescenta e deve ser descartado. */
	prefix?: string
	/** Sufixo que o leitor acrescenta e deve ser descartado. */
	suffix?: string
	/** Caractere que a estação usa no lugar do GS (além dos padrões). */
	gsSubstitute?: string
}

export interface Gs1Fields {
	/** AI 01 (GTIN) ou AI 02 (GTIN do contido em embalagem logística). */
	gtin: string | null
	/** AI 10 — lote. */
	lotCode: string | null
	/** AI 21 — número de série. */
	serial: string | null
	/** AI 17 — validade (ISO date). */
	expiryDate: string | null
	/** AI 15 — "consumir preferencialmente antes de" (ISO date). */
	bestBeforeDate: string | null
	/** AI 11 — fabricação (ISO date). */
	productionDate: string | null
	/** AI 30 / 37 — contagem de itens. */
	quantity: number | null
	/** AI 310n–316n / 320n–329n — peso ou volume líquido, já com a casa decimal. */
	netMeasure: { value: number; unit: "KG" | "LB" | "L" | "M3" } | null
	/** Todos os AIs lidos, para depuração na tela de teste do leitor. */
	raw: Record<string, string>
}

export interface NfeAccessKey {
	key: string
	/** Código da UF do emitente (IBGE). */
	uf: string
	/** Ano e mês de emissão (`AAMM`). */
	yearMonth: string
	/** CNPJ (ou CPF preenchido com zeros) do emitente — pode ser alfanumérico. */
	issuerTaxId: string
	model: string
	series: string
	number: string
	emissionType: string
	numericCode: string
	checkDigit: string
}

export type BarcodeReading =
	| { kind: "gtin"; gtin: string; raw: string }
	| { kind: "gs1"; fields: Gs1Fields; raw: string }
	| { kind: "lot_label"; lotShortCode: string; raw: string }
	| { kind: "nfe_access_key"; accessKey: NfeAccessKey; raw: string }
	| { kind: "unknown"; raw: string; reason: string }

/** AIs de tamanho fixo: comprimento TOTAL do valor (sem o identificador). */
const FIXED_LENGTH_AI: Record<string, number> = {
	"00": 18,
	"01": 14,
	"02": 14,
	"11": 6,
	"12": 6,
	"13": 6,
	"15": 6,
	"16": 6,
	"17": 6,
	"20": 2,
}

/** AIs de tamanho variável com limite, terminados por GS quando há mais campos. */
const VARIABLE_LENGTH_AI: Record<string, number> = {
	"10": 20,
	"21": 20,
	"22": 20,
	"30": 8,
	"37": 8,
	"240": 30,
	"241": 30,
	"400": 30,
	"401": 30,
	"410": 13,
	"412": 13,
	"414": 13,
}

/** AIs de medida com casa decimal no último dígito do identificador. */
const MEASURE_AI: Record<string, { unit: "KG" | "LB" | "L" | "M3" }> = {
	"310": { unit: "KG" },
	"320": { unit: "LB" },
	"315": { unit: "L" },
	"316": { unit: "M3" },
}

function stripAffixes(raw: string, config: BarcodeConfig): string {
	let value = raw.trim()
	if (config.prefix && value.startsWith(config.prefix)) value = value.slice(config.prefix.length)
	if (config.suffix && value.endsWith(config.suffix)) value = value.slice(0, -config.suffix.length)
	for (const prefix of SYMBOLOGY_PREFIXES) {
		if (value.startsWith(prefix)) {
			value = value.slice(prefix.length)
			break
		}
	}
	return value.trim()
}

function normalizeSeparators(value: string, config: BarcodeConfig): string {
	const substitutes = new Set<string>(DEFAULT_GS_SUBSTITUTES)
	if (config.gsSubstitute) substitutes.add(config.gsSubstitute)
	let out = ""
	for (const char of value) {
		out += substitutes.has(char) ? GS : char
	}
	return out
}

/**
 * `AAMMDD` do GS1 → ISO date. Dia `00` significa "fim do mês" (GS1 General
 * Specifications): validade `260900` é 30/09/2026, não uma data inválida.
 * O século segue a regra GS1 das janelas de 50 anos, ancorada no ano corrente.
 */
export function parseGs1Date(value: string, today: Date = new Date()): string | null {
	if (!/^[0-9]{6}$/.test(value)) return null
	const yy = Number(value.slice(0, 2))
	const mm = Number(value.slice(2, 4))
	const dd = Number(value.slice(4, 6))
	if (mm < 1 || mm > 12 || dd > 31) return null

	const currentYear = today.getUTCFullYear()
	const currentCentury = Math.floor(currentYear / 100) * 100
	let year = currentCentury + yy
	const diff = year - currentYear
	if (diff > 50) year -= 100
	else if (diff < -49) year += 100

	const day = dd === 0 ? new Date(Date.UTC(year, mm, 0)).getUTCDate() : dd
	const date = new Date(Date.UTC(year, mm - 1, day))
	if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== day) return null
	return `${String(year).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function emptyFields(): Gs1Fields {
	return {
		gtin: null,
		lotCode: null,
		serial: null,
		expiryDate: null,
		bestBeforeDate: null,
		productionDate: null,
		quantity: null,
		netMeasure: null,
		raw: {},
	}
}

/** Lê os identificadores de aplicação. `null` = não parece um GS1 com AIs. */
export function parseGs1(value: string, today: Date = new Date()): Gs1Fields | null {
	const fields = emptyFields()
	let rest = value
	let matched = 0

	while (rest.length > 0) {
		if (rest.startsWith(GS)) {
			rest = rest.slice(1)
			continue
		}
		const two = rest.slice(0, 2)
		const three = rest.slice(0, 3)
		const four = rest.slice(0, 4)

		let ai: string | null = null
		let length: number | null = null
		let decimals: number | null = null

		if (FIXED_LENGTH_AI[two] != null) {
			ai = two
			length = FIXED_LENGTH_AI[two]
		} else if (VARIABLE_LENGTH_AI[two] != null) {
			ai = two
			length = null
		} else if (VARIABLE_LENGTH_AI[three] != null) {
			ai = three
			length = null
		} else if (MEASURE_AI[three] != null && /^[0-9]$/.test(four.slice(3, 4))) {
			ai = four
			length = 6
			decimals = Number(four.slice(3, 4))
		} else {
			break
		}

		const valueStart = ai.length
		let rawValue: string
		if (length != null) {
			rawValue = rest.slice(valueStart, valueStart + length)
			if (rawValue.length < length) break
			rest = rest.slice(valueStart + length)
		} else {
			const limit = VARIABLE_LENGTH_AI[ai] ?? 30
			const tail = rest.slice(valueStart)
			const separator = tail.indexOf(GS)
			rawValue = separator >= 0 ? tail.slice(0, separator) : tail.slice(0, limit)
			rest = separator >= 0 ? tail.slice(separator + 1) : tail.slice(rawValue.length)
		}

		if (rawValue === "") break
		fields.raw[ai] = rawValue
		matched += 1

		switch (ai) {
			case "01":
			case "02": {
				fields.gtin = parseGtin(rawValue)
				break
			}
			case "10":
				fields.lotCode = rawValue
				break
			case "21":
				fields.serial = rawValue
				break
			case "17":
				fields.expiryDate = parseGs1Date(rawValue, today)
				break
			case "15":
				fields.bestBeforeDate = parseGs1Date(rawValue, today)
				break
			case "11":
				fields.productionDate = parseGs1Date(rawValue, today)
				break
			case "30":
			case "37": {
				const quantity = Number(rawValue)
				fields.quantity = Number.isFinite(quantity) ? quantity : null
				break
			}
			default: {
				if (decimals != null) {
					const measure = MEASURE_AI[ai.slice(0, 3)]
					const numeric = Number(rawValue)
					if (measure && Number.isFinite(numeric)) {
						fields.netMeasure = { value: numeric / 10 ** decimals, unit: measure.unit }
					}
				}
				break
			}
		}
	}

	// só é GS1 se casou pelo menos um AI e reconhecemos a cadeia inteira
	if (matched === 0 || rest.replace(new RegExp(GS, "g"), "").length > 0) return null
	return fields
}

/**
 * Dígito verificador da chave de acesso (módulo 11, pesos 2..9 da direita).
 * O CNPJ dentro da chave pode ser ALFANUMÉRICO desde a NT 2025.001: o valor de
 * cada caractere é `código ASCII − 48`, o que mantém 0-9 iguais e dá 17..42
 * para A-Z.
 */
export function nfeKeyCheckDigit(first43: string): number | null {
	if (!/^[0-9A-Z]{43}$/.test(first43)) return null
	let sum = 0
	let weight = 2
	for (let i = first43.length - 1; i >= 0; i--) {
		sum += (first43.charCodeAt(i) - 48) * weight
		weight = weight === 9 ? 2 : weight + 1
	}
	const remainder = sum % 11
	return remainder === 0 || remainder === 1 ? 0 : 11 - remainder
}

/** Decompõe a chave de acesso; null quando o formato ou o DV não fecham. */
export function parseNfeAccessKey(raw: string): NfeAccessKey | null {
	const value = raw.replace(/[\s.-]/g, "").toUpperCase()
	if (!/^[0-9A-Z]{44}$/.test(value)) return null
	// só o CNPJ do emitente (posições 7-20) pode ter letra; o resto é numérico
	if (!/^[0-9]{6}$/.test(value.slice(0, 6))) return null
	if (!/^[0-9]{24}$/.test(value.slice(20))) return null
	const expected = nfeKeyCheckDigit(value.slice(0, 43))
	if (expected == null || String(expected) !== value.slice(43)) return null

	return {
		key: value,
		uf: value.slice(0, 2),
		yearMonth: value.slice(2, 6),
		issuerTaxId: value.slice(6, 20),
		model: value.slice(20, 22),
		series: value.slice(22, 25),
		number: value.slice(25, 34),
		emissionType: value.slice(34, 35),
		numericCode: value.slice(35, 43),
		checkDigit: value.slice(43),
	}
}

/**
 * Decide o que a leitura é. A ordem importa: chave de acesso (44) e etiqueta
 * interna são inequívocas pelo formato; GS1 vem antes de GTIN puro porque um
 * GS1-128 começando em `01` também é uma sequência de dígitos.
 */
export function interpretBarcode(raw: string, config: BarcodeConfig = {}, today: Date = new Date()): BarcodeReading {
	const stripped = stripAffixes(raw, config)
	if (stripped === "") return { kind: "unknown", raw, reason: "Leitura vazia" }

	const label = stripped.toUpperCase()
	if (LOT_LABEL_PATTERN.test(label)) {
		return { kind: "lot_label", lotShortCode: label, raw }
	}

	const digitsOnly = stripped.replace(/[\s.-]/g, "")
	if (digitsOnly.length === 44) {
		const accessKey = parseNfeAccessKey(digitsOnly)
		if (accessKey) return { kind: "nfe_access_key", accessKey, raw }
		return { kind: "unknown", raw, reason: "Chave de acesso com dígito verificador inválido" }
	}

	const normalized = normalizeSeparators(stripped, config)
	const gs1 = parseGs1(normalized, today)
	if (gs1 && (gs1.gtin != null || gs1.lotCode != null || gs1.netMeasure != null)) {
		return { kind: "gs1", fields: gs1, raw }
	}

	if (/^[0-9]{8}$|^[0-9]{12,14}$/.test(digitsOnly)) {
		const gtin = parseGtin(digitsOnly)
		if (gtin) return { kind: "gtin", gtin, raw }
		return { kind: "unknown", raw, reason: "Dígito verificador inválido para GTIN" }
	}

	// GS1 cuja cadeia foi lida mas sem nada útil: separador GS provavelmente perdido
	if (gs1) return { kind: "unknown", raw, reason: "Código GS1 sem GTIN, lote ou peso — confira o separador do leitor" }

	return { kind: "unknown", raw, reason: "Formato não reconhecido" }
}
