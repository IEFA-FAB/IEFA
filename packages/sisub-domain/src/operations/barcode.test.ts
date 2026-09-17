/**
 * Contrato da leitura de código de barras.
 *
 * Os casos aqui são os que quebram na prática, não os felizes: separador GS
 * perdido pelo leitor em modo teclado, dia `00` do GS1 (que significa fim do
 * mês, não data inválida), peso variável com casa decimal embutida no
 * identificador, e chave de acesso com CNPJ ALFANUMÉRICO — que é o formato
 * novo da Receita e recusava fornecedor novo se validado com `\d{44}`.
 */

import { describe, expect, test } from "bun:test"
import { GS, interpretBarcode, nfeKeyCheckDigit, parseGs1, parseGs1Date, parseNfeAccessKey } from "./barcode.ts"

// GTIN-13 com dígito verificador válido (7891234567895) → 14 dígitos
const GTIN13 = "7891234567895"
const GTIN14 = "07891234567895"
const KEY_NUMERIC = "35260712345678000199550010000098761000098769"
const KEY_ALPHANUMERIC = "35260712ABC678000199550010000098761000098764"
const TODAY = new Date("2026-09-17T12:00:00Z")

describe("interpretBarcode — GTIN", () => {
	test("EAN-13 válido vira GTIN-14", () => {
		const reading = interpretBarcode(GTIN13, {}, TODAY)
		expect(reading.kind).toBe("gtin")
		expect(reading.kind === "gtin" && reading.gtin).toBe(GTIN14)
	})

	test("dígito verificador errado não vira GTIN", () => {
		const reading = interpretBarcode("7891234567890", {}, TODAY)
		expect(reading.kind).toBe("unknown")
		expect(reading.kind === "unknown" && reading.reason).toContain("Dígito verificador")
	})

	test("prefixo e sufixo da estação são descartados", () => {
		const reading = interpretBarcode(`>>${GTIN13}<<`, { prefix: ">>", suffix: "<<" }, TODAY)
		expect(reading.kind === "gtin" && reading.gtin).toBe(GTIN14)
	})
})

describe("interpretBarcode — GS1", () => {
	test("GTIN + validade + lote na mesma leitura", () => {
		const reading = interpretBarcode(`]C101${GTIN14}17260331${GS}10L4521`, {}, TODAY)
		expect(reading.kind).toBe("gs1")
		if (reading.kind !== "gs1") return
		expect(reading.fields.gtin).toBe(GTIN14)
		expect(reading.fields.expiryDate).toBe("2026-03-31")
		expect(reading.fields.lotCode).toBe("L4521")
	})

	test("lote no fim da cadeia dispensa separador", () => {
		const reading = interpretBarcode(`01${GTIN14}10ABC-9`, {}, TODAY)
		expect(reading.kind === "gs1" && reading.fields.lotCode).toBe("ABC-9")
	})

	test("substituto do separador configurado na estação", () => {
		const reading = interpretBarcode(`01${GTIN14}10L45|17260331`, { gsSubstitute: "|" }, TODAY)
		expect(reading.kind).toBe("gs1")
		if (reading.kind !== "gs1") return
		expect(reading.fields.lotCode).toBe("L45")
		expect(reading.fields.expiryDate).toBe("2026-03-31")
	})

	test("peso variável (AI 3102) traz o peso com duas casas", () => {
		const reading = interpretBarcode(`01${GTIN14}3102001250`, {}, TODAY)
		expect(reading.kind).toBe("gs1")
		if (reading.kind !== "gs1") return
		expect(reading.fields.netMeasure).toEqual({ value: 12.5, unit: "KG" })
	})

	test("quantidade (AI 30) é lida", () => {
		const reading = interpretBarcode(`01${GTIN14}${GS}3000000012`, {}, TODAY)
		expect(reading.kind === "gs1" && reading.fields.quantity).toBe(12)
	})

	test("separador perdido engole a validade dentro do lote", () => {
		// sem o GS, o "17260331" entra no campo de lote (AI 10 aceita 20 chars) e a
		// validade simplesmente não existe. É o sintoma clássico de leitor mal
		// configurado, e é por isso que a tela "Testar leitor" mostra os AIs lidos:
		// aqui o dado não fica errado em silêncio, fica visivelmente estranho.
		const reading = interpretBarcode(`01${GTIN14}10L4521172603319999999`, {}, TODAY)
		expect(reading.kind).toBe("gs1")
		if (reading.kind !== "gs1") return
		expect(reading.fields.lotCode).toBe("L4521172603319999999") // AI 10 aceita até 20 caracteres
		expect(reading.fields.expiryDate).toBeNull()
	})
})

describe("parseGs1Date", () => {
	test("dia 00 é o último dia do mês", () => {
		expect(parseGs1Date("260900", TODAY)).toBe("2026-09-30")
		expect(parseGs1Date("260200", TODAY)).toBe("2026-02-28")
	})

	test("data impossível é recusada", () => {
		expect(parseGs1Date("260231", TODAY)).toBeNull()
		expect(parseGs1Date("261301", TODAY)).toBeNull()
		expect(parseGs1Date("abc", TODAY)).toBeNull()
	})

	test("janela de século do GS1", () => {
		// regra GS1: 51 a 99 anos "à frente" são passado. Em 2026, `77` é 1977 —
		// validade de 50 anos não existe em gênero alimentício, mas data de
		// fabricação antiga existe.
		expect(parseGs1Date("770101", TODAY)?.slice(0, 4)).toBe("1977")
		expect(parseGs1Date("990101", TODAY)?.slice(0, 4)).toBe("1999")
		expect(parseGs1Date("270101", TODAY)?.slice(0, 4)).toBe("2027")
		expect(parseGs1Date("000101", TODAY)?.slice(0, 4)).toBe("2000")
	})
})

describe("chave de acesso da NF-e", () => {
	test("chave numérica é decomposta", () => {
		const parsed = parseNfeAccessKey(KEY_NUMERIC)
		expect(parsed).not.toBeNull()
		expect(parsed?.uf).toBe("35")
		expect(parsed?.yearMonth).toBe("2607")
		expect(parsed?.issuerTaxId).toBe("12345678000199")
		expect(parsed?.model).toBe("55")
		expect(parsed?.number).toBe("000009876")
	})

	test("CNPJ alfanumérico (NT 2025.001) é aceito", () => {
		const parsed = parseNfeAccessKey(KEY_ALPHANUMERIC)
		expect(parsed?.issuerTaxId).toBe("12ABC678000199")
	})

	test("dígito verificador errado é recusado", () => {
		const broken = `${KEY_NUMERIC.slice(0, 43)}${(Number(KEY_NUMERIC.slice(43)) + 1) % 10}`
		expect(parseNfeAccessKey(broken)).toBeNull()
	})

	test("letra fora do trecho do CNPJ é recusada", () => {
		const broken = `A${KEY_NUMERIC.slice(1)}`
		expect(parseNfeAccessKey(broken)).toBeNull()
	})

	test("máscara e espaços não impedem a leitura", () => {
		const masked = `${KEY_NUMERIC.slice(0, 4)} ${KEY_NUMERIC.slice(4, 8)}-${KEY_NUMERIC.slice(8)}`
		expect(parseNfeAccessKey(masked)?.key).toBe(KEY_NUMERIC)
	})

	test("interpretBarcode reconhece a chave lida do DANFE", () => {
		const reading = interpretBarcode(KEY_NUMERIC, {}, TODAY)
		expect(reading.kind).toBe("nfe_access_key")
	})

	test("44 caracteres com DV inválido informam o motivo", () => {
		const reading = interpretBarcode(`${KEY_NUMERIC.slice(0, 43)}0`, {}, TODAY)
		expect(reading.kind).toBe("unknown")
		expect(reading.kind === "unknown" && reading.reason).toContain("Chave de acesso")
	})

	test("módulo 11 com resto 0 ou 1 devolve zero", () => {
		expect(nfeKeyCheckDigit("0".repeat(43))).toBe(0)
	})
})

describe("etiqueta interna de lote", () => {
	test("etiqueta do sisub identifica o lote", () => {
		const reading = interpretBarcode("LOT7Q2M9X4B", {}, TODAY)
		expect(reading.kind).toBe("lot_label")
		expect(reading.kind === "lot_label" && reading.lotShortCode).toBe("LOT7Q2M9X4B")
	})

	test("minúscula é normalizada", () => {
		const reading = interpretBarcode("lot7q2m9x4b", {}, TODAY)
		expect(reading.kind).toBe("lot_label")
	})

	test("código com letra ambígua não é etiqueta", () => {
		// I, L, O e U ficam fora do alfabeto justamente para não confundir com 1/0
		expect(interpretBarcode("LOTI12345678", {}, TODAY).kind).toBe("unknown")
	})
})

describe("leituras inúteis", () => {
	test("vazio", () => {
		expect(interpretBarcode("   ", {}, TODAY).kind).toBe("unknown")
	})

	test("texto qualquer", () => {
		const reading = interpretBarcode("ARROZ TIPO 1", {}, TODAY)
		expect(reading.kind).toBe("unknown")
		expect(reading.kind === "unknown" && reading.reason).toBe("Formato não reconhecido")
	})

	test("parseGs1 sem nenhum AI conhecido devolve null", () => {
		expect(parseGs1("999999", TODAY)).toBeNull()
	})
})
