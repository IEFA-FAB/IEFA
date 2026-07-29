/**
 * Parser de NF-e (layout 4.0) para ingestão de estoque.
 *
 * Extrai do XML autorizado o cabeçalho (chave de acesso, emitente,
 * destinatário, emissão, total) e cada <det> (cProd, xProd, cEAN/cEANTrib,
 * NCM/CEST/CFOP, uCom/qCom/vUnCom e o grupo <rastro> quando presente).
 *
 * Regras:
 *  - cEAN/cEANTrib normalizados a GTIN-14 com check digit validado
 *    (utils do sisub-domain); o literal "SEM GTIN" e valores inválidos → null.
 *  - uCom é texto livre do emissor — vai para a coluna informativa, nunca é
 *    base de conversão.
 *  - Aceita raiz <nfeProc> (nota processada) ou <NFe> direta.
 */

import { parseGtin } from "@iefa/sisub-domain/gtin"
import { XMLParser } from "fast-xml-parser"

export interface ParsedNfeItem {
	nItem: number
	supplierCode: string | null
	description: string | null
	gtin: string | null
	gtinTrib: string | null
	ncm: string | null
	cest: string | null
	cfop: string | null
	commercialUnit: string | null
	commercialQty: number | null
	unitPrice: number | null
	lotCode: string | null
	lotQty: number | null
	mfgDate: string | null
	expiryDate: string | null
}

export interface ParsedNfe {
	accessKey: string
	supplierCnpj: string | null
	supplierName: string | null
	destCnpj: string | null
	issuedAt: string | null
	totalValue: number | null
	items: ParsedNfeItem[]
}

export class NfeParseError extends Error {}

function asArray<T>(value: T | T[] | undefined | null): T[] {
	if (value == null) return []
	return Array.isArray(value) ? value : [value]
}

function text(value: unknown): string | null {
	if (value == null) return null
	const str = String(value).trim()
	return str === "" ? null : str
}

function num(value: unknown): number | null {
	const str = text(value)
	if (str == null) return null
	const parsed = Number(str)
	return Number.isFinite(parsed) ? parsed : null
}

function dateOnly(value: unknown): string | null {
	const str = text(value)
	if (str == null) return null
	const match = str.match(/^\d{4}-\d{2}-\d{2}/)
	return match ? match[0] : null
}

/**
 * @throws {NfeParseError} XML malformado, sem infNFe, chave inválida ou sem itens.
 */
export function parseNfeXml(xml: string): ParsedNfe {
	let doc: Record<string, unknown>
	try {
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: "@_",
			parseTagValue: false, // tudo string — números convertidos explicitamente
			parseAttributeValue: false,
		})
		doc = parser.parse(xml) as Record<string, unknown>
	} catch {
		throw new NfeParseError("XML malformado — não foi possível interpretar o arquivo")
	}

	// biome-ignore lint/suspicious/noExplicitAny: navegação em XML externo sem contrato TS
	const anyDoc = doc as any
	const nfe = anyDoc.nfeProc?.NFe ?? anyDoc.NFe
	const infNfe = nfe?.infNFe
	if (!infNfe) throw new NfeParseError("XML não contém NFe/infNFe — isto é uma NF-e (layout 4.0)?")

	const rawId: string | undefined = infNfe["@_Id"]
	const accessKey = rawId?.replace(/^NFe/i, "") ?? text(anyDoc.nfeProc?.protNFe?.infProt?.chNFe) ?? undefined
	if (!accessKey || !/^[0-9]{44}$/.test(accessKey)) {
		throw new NfeParseError("Chave de acesso ausente ou inválida (esperados 44 dígitos)")
	}

	const emit = infNfe.emit ?? {}
	const dest = infNfe.dest ?? {}
	const dets = asArray(infNfe.det)
	if (dets.length === 0) throw new NfeParseError("NF-e sem itens (<det>)")

	// biome-ignore lint/suspicious/noExplicitAny: navegação em XML externo sem contrato TS
	const items: ParsedNfeItem[] = dets.map((det: any, index: number) => {
		const prod = det.prod ?? {}
		const rastro = asArray(prod.rastro)[0] ?? {}
		return {
			nItem: num(det["@_nItem"]) ?? index + 1,
			supplierCode: text(prod.cProd),
			description: text(prod.xProd),
			gtin: parseGtin(text(prod.cEAN)),
			gtinTrib: parseGtin(text(prod.cEANTrib)),
			ncm: text(prod.NCM),
			cest: text(prod.CEST),
			cfop: text(prod.CFOP),
			commercialUnit: text(prod.uCom),
			commercialQty: num(prod.qCom),
			unitPrice: num(prod.vUnCom),
			lotCode: text(rastro.nLote),
			lotQty: num(rastro.qLote),
			mfgDate: dateOnly(rastro.dFab),
			expiryDate: dateOnly(rastro.dVal),
		}
	})

	return {
		accessKey,
		supplierCnpj: text(emit.CNPJ),
		supplierName: text(emit.xNome),
		destCnpj: text(dest.CNPJ),
		issuedAt: text(infNfe.ide?.dhEmi),
		totalValue: num(infNfe.total?.ICMSTot?.vNF),
		items,
	}
}
