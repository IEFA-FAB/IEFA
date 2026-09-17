/**
 * Parser de NF-e (layout 4.0) para ingestão de estoque.
 *
 * Extrai do XML autorizado o cabeçalho (chave de acesso, emitente,
 * destinatário, emissão, total) e cada <det> (cProd, xProd, cEAN/cEANTrib,
 * NCM/CEST/CFOP, uCom/qCom/vUnCom, componentes de valor e o grupo <rastro>).
 *
 * Regras:
 *  - **Autenticidade é verificada, não presumida.** O comentário antigo dizia
 *    "XML autorizado" e nada checava: `protNFe` era usado apenas como fonte
 *    alternativa da chave. Um `<cStat>100</cStat>` digitado à mão passava, e
 *    esse XML virava base de valor de lote e de liquidação. Agora conferimos
 *    modelo, ambiente, situação, correspondência de chave e o digest do
 *    protocolo contra a assinatura.
 *  - `cStat` aceito é 100 (autorizada) **e 150** (autorizada fora de prazo, que
 *    é válida — recusá-la recusaria nota boa).
 *  - Chave e CNPJ podem ser **alfanuméricos** (NT 2025.001); o emitente pode
 *    ser CPF (produtor rural).
 *  - cEAN/cEANTrib normalizados a GTIN-14 com check digit validado; o literal
 *    "SEM GTIN" e valores inválidos → null.
 *  - uCom é texto livre do emissor — coluna informativa, nunca base de
 *    conversão.
 *  - Aceita raiz <nfeProc> (nota processada) ou <NFe> direta; sem `protNFe`, a
 *    nota entra marcada como NÃO autorizada e quem decide o que fazer é a
 *    camada de ingestão.
 */

import { parseNfeAccessKey } from "@iefa/sisub-domain"
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
	/** Unidade e quantidade TRIBUTÁVEIS — caixa × unidade dá erro de 12× sem elas. */
	taxableUnit: string | null
	taxableQty: number | null
	/** Componentes do custo de aquisição (MCASP): frete, seguro, tributos, desconto. */
	productValue: number | null
	discount: number | null
	freight: number | null
	insurance: number | null
	otherExpenses: number | null
	ipi: number | null
	icmsSt: number | null
	fcpSt: number | null
	lotCode: string | null
	lotQty: number | null
	mfgDate: string | null
	expiryDate: string | null
}

/**
 * Resultado da verificação de autenticidade. Cada campo é uma checagem
 * independente, gravada na nota: o operador precisa saber O QUE foi conferido.
 *
 * `signatureDigestMatches` compara o `digVal` do protocolo com o
 * `DigestValue` da assinatura da nota. É a checagem que pega `cStat` editado à
 * mão e protocolo colado de outra nota. A validação criptográfica completa da
 * assinatura (canonicalização C14N + cadeia ICP-Brasil) NÃO é feita aqui: sem
 * C14N o resultado seria "verificado" mentiroso, e isso é pior que a ausência.
 */
export interface NfeAuthenticity {
	hasProtocol: boolean
	statusCode: string | null
	/** 100 = autorizada; 150 = autorizada fora de prazo, também válida. */
	authorized: boolean
	/** `tpAmb = 1`. Nota de homologação também vem com cStat 100. */
	production: boolean
	/** `mod = 55` (NF-e). NFC-e (65) não é documento de entrada de almoxarifado. */
	modelOk: boolean
	/** Chave do protocolo igual à do `infNFe@Id`. */
	protocolKeyMatches: boolean
	signaturePresent: boolean
	signatureDigestMatches: boolean
	/** Número do protocolo de autorização, para rastreio. */
	protocolNumber: string | null
	/** Problemas encontrados, em português, para a mensagem ao operador. */
	problems: string[]
}

export interface ParsedNfe {
	accessKey: string
	supplierCnpj: string | null
	supplierCpf: string | null
	supplierName: string | null
	destCnpj: string | null
	destCpf: string | null
	issuedAt: string | null
	totalValue: number | null
	/** `finNFe`: 1 normal, 2 complementar, 3 ajuste, 4 devolução. */
	purpose: string | null
	/** Chaves referenciadas (`refNFe`) — é assim que devolução e complementar se ligam à original. */
	referencedKeys: string[]
	authenticity: NfeAuthenticity
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

	const anyDoc = doc as any
	const nfe = anyDoc.nfeProc?.NFe ?? anyDoc.NFe
	const infNfe = nfe?.infNFe
	if (!infNfe) throw new NfeParseError("XML não contém NFe/infNFe — isto é uma NF-e (layout 4.0)?")

	const rawId: string | undefined = infNfe["@_Id"]
	const accessKey = (rawId?.replace(/^NFe/i, "") ?? text(anyDoc.nfeProc?.protNFe?.infProt?.chNFe) ?? "").toUpperCase()
	// 44 CARACTERES: desde a NT 2025.001 o CNPJ dentro da chave pode ter letras,
	// e validar com `\d{44}` recusaria nota de fornecedor com CNPJ novo
	if (!parseNfeAccessKey(accessKey)) {
		throw new NfeParseError("Chave de acesso ausente ou inválida (44 caracteres com dígito verificador)")
	}

	const emit = infNfe.emit ?? {}
	const dest = infNfe.dest ?? {}
	const dets = asArray(infNfe.det)
	if (dets.length === 0) throw new NfeParseError("NF-e sem itens (<det>)")

	const items: ParsedNfeItem[] = dets.map((det: any, index: number) => {
		const prod = det.prod ?? {}
		const rastro = asArray(prod.rastro)[0] ?? {}
		const imposto = det.imposto ?? {}
		// ICMS-ST vem dentro do grupo de ICMS, cujo nome varia por CST/CSOSN
		const icmsGroup = Object.values(imposto.ICMS ?? {})[0] as Record<string, unknown> | undefined
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
			taxableUnit: text(prod.uTrib),
			taxableQty: num(prod.qTrib),
			productValue: num(prod.vProd),
			discount: num(prod.vDesc),
			freight: num(prod.vFrete),
			insurance: num(prod.vSeg),
			otherExpenses: num(prod.vOutro),
			ipi: num(imposto.IPI?.IPITrib?.vIPI),
			icmsSt: num(icmsGroup?.vICMSST),
			fcpSt: num(icmsGroup?.vFCPST),
			lotCode: text(rastro.nLote),
			lotQty: num(rastro.qLote),
			mfgDate: dateOnly(rastro.dFab),
			expiryDate: dateOnly(rastro.dVal),
		}
	})

	const referencedKeys = asArray(infNfe.ide?.NFref)
		.map((ref: any) => text(ref?.refNFe))
		.filter((key): key is string => key != null)

	return {
		accessKey,
		supplierCnpj: text(emit.CNPJ),
		supplierCpf: text(emit.CPF),
		supplierName: text(emit.xNome),
		destCnpj: text(dest.CNPJ),
		destCpf: text(dest.CPF),
		issuedAt: text(infNfe.ide?.dhEmi),
		totalValue: num(infNfe.total?.ICMSTot?.vNF),
		purpose: text(infNfe.ide?.finNFe),
		referencedKeys,
		authenticity: checkAuthenticity(anyDoc, infNfe, nfe, accessKey),
		items,
	}
}

/** cStat de autorização: 100 normal, 150 fora de prazo (igualmente válida). */
const AUTHORIZED_STATUS = new Set(["100", "150"])

/**
 * Confere o que dá para conferir sem rede e sem biblioteca de assinatura.
 *
 * O que NÃO é feito aqui, e por quê: validação criptográfica completa da
 * assinatura exige canonicalização C14N e a cadeia ICP-Brasil. Sem C14N o
 * resultado seria um "verificado" mentiroso — pior que a ausência. A checagem
 * de digest já derruba o caso realista (protocolo colado de outra nota, ou
 * `cStat` editado no arquivo), e o resto fica declarado como não verificado.
 */
function checkAuthenticity(anyDoc: any, infNfe: any, nfe: any, accessKey: string): NfeAuthenticity {
	const protocol = anyDoc.nfeProc?.protNFe?.infProt
	const problems: string[] = []

	const statusCode = text(protocol?.cStat)
	const hasProtocol = protocol != null
	if (!hasProtocol) problems.push("XML sem protocolo de autorização (protNFe) — não é uma nota autorizada")

	const authorized = statusCode != null && AUTHORIZED_STATUS.has(statusCode)
	if (hasProtocol && !authorized) {
		problems.push(`Situação da nota no protocolo: cStat ${statusCode ?? "ausente"} (${text(protocol?.xMotivo) ?? "sem motivo"})`)
	}

	const ambient = text(infNfe.ide?.tpAmb) ?? text(protocol?.tpAmb)
	const production = ambient === "1"
	if (!production) problems.push("Nota de ambiente de HOMOLOGAÇÃO (tpAmb ≠ 1) — sem valor fiscal")

	const model = text(infNfe.ide?.mod)
	const modelOk = model === "55"
	if (!modelOk) problems.push(`Modelo ${model ?? "ausente"} — entrada de almoxarifado é NF-e (modelo 55)`)

	const protocolKey = text(protocol?.chNFe)?.toUpperCase() ?? null
	const protocolKeyMatches = protocolKey == null ? false : protocolKey === accessKey
	if (hasProtocol && !protocolKeyMatches) problems.push("A chave do protocolo não é a desta nota")

	const digest = text(protocol?.digVal)
	const signatureDigest = text(nfe?.Signature?.SignedInfo?.Reference?.DigestValue)
	const signaturePresent = signatureDigest != null
	if (!signaturePresent) problems.push("XML sem assinatura digital")
	const signatureDigestMatches = digest != null && signatureDigest != null && digest === signatureDigest
	if (hasProtocol && signaturePresent && !signatureDigestMatches) {
		problems.push("O digest do protocolo não corresponde à assinatura da nota — protocolo de outra nota ou XML adulterado")
	}

	return {
		hasProtocol,
		statusCode,
		authorized,
		production,
		modelOk,
		protocolKeyMatches,
		signaturePresent,
		signatureDigestMatches,
		protocolNumber: text(protocol?.nProt),
		problems,
	}
}
