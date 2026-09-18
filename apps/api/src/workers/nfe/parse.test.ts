import { describe, expect, test } from "bun:test"
import { NfeParseError, parseNfeXml } from "./parse.ts"

// Chave com dígito verificador VÁLIDO: o parser passou a conferir o DV, e a
// chave antiga do fixture não fechava. Chave inválida vinda da SEFAZ não
// existe — DV errado é corrupção do arquivo ou digitação.
const KEY = "35260707891000315507550010000012341000012344"
/** A mesma nota com CNPJ ALFANUMÉRICO do emitente (NT 2025.001). */
const KEY_ALFANUMERICA = "35260712ABC678000199550010000012341000012348"

interface FixtureOptions {
	key?: string
	wrapProc?: boolean
	/** cStat do protocolo: 100 autorizada, 150 fora de prazo, 110 denegada. */
	status?: string
	/** tpAmb: 1 produção, 2 homologação. */
	ambient?: string
	/** mod: 55 NF-e, 65 NFC-e. */
	model?: string
	purpose?: string
	digest?: string
	/** digVal do protocolo — diferente do digest simula protocolo de outra nota. */
	protocolDigest?: string
	/** chNFe do protocolo — diferente da chave simula protocolo colado. */
	protocolKey?: string
}

function nfeXml(dets: string, opts: FixtureOptions = {}): string {
	const key = opts.key ?? KEY
	const digest = opts.digest ?? "DIGEST-DA-NOTA"
	const nfe = `
		<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
			<infNFe Id="NFe${key}" versao="4.00">
				<ide><dhEmi>2026-07-20T10:30:00-03:00</dhEmi><mod>${opts.model ?? "55"}</mod><tpAmb>${opts.ambient ?? "1"}</tpAmb><finNFe>${opts.purpose ?? "1"}</finNFe></ide>
				<emit><CNPJ>12345678000199</CNPJ><xNome>Fornecedor Alfa LTDA</xNome></emit>
				<dest><CNPJ>98765432000188</CNPJ></dest>
				${dets}
				<total><ICMSTot><vNF>1234.56</vNF></ICMSTot></total>
			</infNFe>
			<Signature><SignedInfo><Reference><DigestValue>${digest}</DigestValue></Reference></SignedInfo></Signature>
		</NFe>`
	if (opts.wrapProc === false) return `<?xml version="1.0" encoding="UTF-8"?>${nfe}`
	return `<?xml version="1.0" encoding="UTF-8"?>
		<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
			${nfe}
			<protNFe><infProt><chNFe>${opts.protocolKey ?? key}</chNFe><cStat>${opts.status ?? "100"}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo><nProt>135260000012345</nProt><digVal>${opts.protocolDigest ?? digest}</digVal><tpAmb>${opts.ambient ?? "1"}</tpAmb></infProt></protNFe>
		</nfeProc>`
}

const DET_COM_GTIN = `
	<det nItem="1">
		<prod>
			<cProd>ARZ-001</cProd>
			<cEAN>7891000315507</cEAN>
			<xProd>ARROZ TIPO 1 5KG</xProd>
			<NCM>10063021</NCM>
			<CFOP>5102</CFOP>
			<uCom>FD</uCom>
			<qCom>10.0000</qCom>
			<vUnCom>89.9000</vUnCom>
			<cEANTrib>7891000315507</cEANTrib>
		</prod>
	</det>`

const DET_SEM_GTIN = `
	<det nItem="2">
		<prod>
			<cProd>FEIJ-77</cProd>
			<cEAN>SEM GTIN</cEAN>
			<xProd>FEIJAO CARIOCA GRANEL</xProd>
			<NCM>07133399</NCM>
			<CFOP>5102</CFOP>
			<uCom>KG</uCom>
			<qCom>250.0000</qCom>
			<vUnCom>7.5000</vUnCom>
			<cEANTrib>SEM GTIN</cEANTrib>
		</prod>
	</det>`

const DET_COM_RASTRO = `
	<det nItem="3">
		<prod>
			<cProd>LT-9</cProd>
			<cEAN>SEM GTIN</cEAN>
			<xProd>LEITE UHT INTEGRAL</xProd>
			<uCom>CX</uCom>
			<qCom>5</qCom>
			<vUnCom>60</vUnCom>
			<cEANTrib>SEM GTIN</cEANTrib>
			<rastro>
				<nLote>L2026-07</nLote>
				<qLote>60.0000</qLote>
				<dFab>2026-07-01</dFab>
				<dVal>2026-10-01</dVal>
			</rastro>
		</prod>
	</det>`

describe("parseNfeXml", () => {
	test("nota completa: cabeçalho + item com GTIN normalizado a 14 dígitos", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN))
		expect(parsed.accessKey).toBe(KEY)
		expect(parsed.supplierCnpj).toBe("12345678000199")
		expect(parsed.supplierName).toBe("Fornecedor Alfa LTDA")
		expect(parsed.destCnpj).toBe("98765432000188")
		expect(parsed.totalValue).toBe(1234.56)
		expect(parsed.items).toHaveLength(1)
		const item = parsed.items[0]
		expect(item?.gtin).toBe("07891000315507")
		expect(item?.gtinTrib).toBe("07891000315507")
		expect(item?.supplierCode).toBe("ARZ-001")
		expect(item?.commercialUnit).toBe("FD")
		expect(item?.commercialQty).toBe(10)
		expect(item?.unitPrice).toBe(89.9)
	})

	test('"SEM GTIN" vira null', () => {
		const parsed = parseNfeXml(nfeXml(DET_SEM_GTIN))
		expect(parsed.items[0]?.gtin).toBeNull()
		expect(parsed.items[0]?.gtinTrib).toBeNull()
		expect(parsed.items[0]?.supplierCode).toBe("FEIJ-77")
	})

	test("grupo rastro extraído (lote, quantidade, fabricação, validade)", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_RASTRO))
		const item = parsed.items[0]
		expect(item?.lotCode).toBe("L2026-07")
		expect(item?.lotQty).toBe(60)
		expect(item?.mfgDate).toBe("2026-07-01")
		expect(item?.expiryDate).toBe("2026-10-01")
	})

	test("múltiplos det viram múltiplos itens na ordem do nItem", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN + DET_SEM_GTIN + DET_COM_RASTRO))
		expect(parsed.items.map((item) => item.nItem)).toEqual([1, 2, 3])
	})

	test("aceita NFe sem envelope nfeProc", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { wrapProc: false }))
		expect(parsed.accessKey).toBe(KEY)
	})

	test("chave de acesso inválida → NfeParseError", () => {
		expect(() => parseNfeXml(nfeXml(DET_COM_GTIN, { key: "123" }))).toThrow(NfeParseError)
	})

	test("XML sem infNFe → NfeParseError", () => {
		expect(() => parseNfeXml("<xml><foo/></xml>")).toThrow(NfeParseError)
	})

	test("XML sem itens → NfeParseError", () => {
		expect(() => parseNfeXml(nfeXml(""))).toThrow(NfeParseError)
	})

	test("lixo não-XML → NfeParseError", () => {
		expect(() => parseNfeXml("isto não é xml <<<")).toThrow(NfeParseError)
	})
})

/**
 * Autenticidade. Estes casos existem porque a nota importada vira custo de
 * lote e lastro de liquidação: aceitar XML não conferido é aceitar valor
 * inventado no ledger e pagamento apoiado em documento que não existe.
 */
describe("parseNfeXml — autenticidade", () => {
	test("nota autorizada passa em todas as checagens", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN))
		expect(parsed.authenticity.problems).toEqual([])
		expect(parsed.authenticity.authorized).toBe(true)
		expect(parsed.authenticity.signatureDigestMatches).toBe(true)
		expect(parsed.authenticity.protocolNumber).toBe("135260000012345")
	})

	test("cStat 150 (autorizada fora de prazo) é válida", () => {
		// recusá-la recusaria nota boa: a NT 2025.001 passou a devolver 150 para
		// autorização depois de 7 dias da emissão
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { status: "150" }))
		expect(parsed.authenticity.authorized).toBe(true)
		expect(parsed.authenticity.problems).toEqual([])
	})

	test("cStat de denegada é reportado com o motivo", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { status: "110" }))
		expect(parsed.authenticity.authorized).toBe(false)
		expect(parsed.authenticity.problems.join(" ")).toContain("cStat 110")
	})

	test("XML sem protocolo não é nota autorizada", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { wrapProc: false }))
		expect(parsed.authenticity.hasProtocol).toBe(false)
		expect(parsed.authenticity.problems.join(" ")).toContain("sem protocolo")
	})

	test("ambiente de homologação é recusado", () => {
		// nota de homologação também vem com cStat 100 — só o tpAmb a distingue
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { ambient: "2" }))
		expect(parsed.authenticity.production).toBe(false)
		expect(parsed.authenticity.problems.join(" ")).toContain("HOMOLOGAÇÃO")
	})

	test("NFC-e (modelo 65) não é documento de entrada de almoxarifado", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { model: "65" }))
		expect(parsed.authenticity.modelOk).toBe(false)
	})

	test("protocolo de outra nota é detectado pelo digest", () => {
		// o protocolo vem de uma nota real, mas o digest não fecha com a
		// assinatura DESTA nota
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { protocolDigest: "DIGEST-DE-OUTRA-NOTA" }))
		expect(parsed.authenticity.signatureDigestMatches).toBe(false)
		expect(parsed.authenticity.problems.join(" ")).toContain("não é desta nota")
	})

	test("LIMITAÇÃO CONHECIDA: `cStat` editado à mão PASSA — isto não é autenticidade", () => {
		// Este teste fixa uma fraqueza de propósito, para que ela não possa ser
		// esquecida nem "consertada" por comentário. Uma nota DENEGADA (110)
		// editada para 100 mantém os dois digests iguais — `infProt` fica fora do
		// que a assinatura da nota cobre — e passa em todas as checagens.
		//
		// Quando a validação XMLDSig com C14N existir (tarefa 3.3), este teste
		// TEM de ser invertido, deliberadamente. Até lá, a única defesa é a
		// consulta de situação na SEFAZ que o recebimento exige antes de efetivar.
		const denegadaEditada = parseNfeXml(nfeXml(DET_COM_GTIN, { status: "100" }))
		expect(denegadaEditada.authenticity.authorized).toBe(true)
		expect(denegadaEditada.authenticity.signatureDigestMatches).toBe(true)
		expect(denegadaEditada.authenticity.problems).toEqual([])
	})

	test("chave do protocolo diferente da chave da nota", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { protocolKey: KEY_ALFANUMERICA }))
		expect(parsed.authenticity.protocolKeyMatches).toBe(false)
	})

	test("chave com CNPJ alfanumérico é aceita", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { key: KEY_ALFANUMERICA }))
		expect(parsed.accessKey).toBe(KEY_ALFANUMERICA)
		expect(parsed.authenticity.problems).toEqual([])
	})

	test("chave com dígito verificador errado é recusada", () => {
		const broken = `${KEY.slice(0, 43)}${(Number(KEY.slice(43)) + 1) % 10}`
		expect(() => parseNfeXml(nfeXml(DET_COM_GTIN, { key: broken }))).toThrow(NfeParseError)
	})
})

describe("parseNfeXml — custo e finalidade", () => {
	test("componentes de valor e unidade tributável são extraídos", () => {
		const det = `
			<det nItem="1">
				<prod>
					<cProd>ARZ-001</cProd><cEAN>SEM GTIN</cEAN><xProd>ARROZ</xProd>
					<uCom>CX</uCom><qCom>10</qCom><vUnCom>100</vUnCom>
					<uTrib>UN</uTrib><qTrib>120</qTrib>
					<vProd>1000.00</vProd><vDesc>50.00</vDesc><vFrete>30.00</vFrete><vSeg>5.00</vSeg><vOutro>2.00</vOutro>
					<cEANTrib>SEM GTIN</cEANTrib>
				</prod>
				<imposto>
					<ICMS><ICMS60><vICMSST>8.00</vICMSST><vFCPST>1.00</vFCPST></ICMS60></ICMS>
					<IPI><IPITrib><vIPI>4.00</vIPI></IPITrib></IPI>
				</imposto>
			</det>`
		const parsed = parseNfeXml(nfeXml(det))
		const item = parsed.items[0]
		expect(item?.taxableUnit).toBe("UN")
		expect(item?.taxableQty).toBe(120)
		expect(item?.freight).toBe(30)
		expect(item?.discount).toBe(50)
		expect(item?.ipi).toBe(4)
		expect(item?.icmsSt).toBe(8)
		expect(item?.fcpSt).toBe(1)
	})

	test("finalidade e notas referenciadas (devolução aponta a original)", () => {
		const parsed = parseNfeXml(nfeXml(DET_COM_GTIN, { purpose: "4" }).replace("<mod>55</mod>", `<mod>55</mod><NFref><refNFe>${KEY}</refNFe></NFref>`))
		expect(parsed.purpose).toBe("4")
		expect(parsed.referencedKeys).toEqual([KEY])
	})
})
