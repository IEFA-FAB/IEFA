import { describe, expect, test } from "bun:test"
import { NfeParseError, parseNfeXml } from "./parse.ts"

const KEY = "35260707891000315507550010000012341000012349"

function nfeXml(dets: string, opts: { key?: string; wrapProc?: boolean } = {}): string {
	const key = opts.key ?? KEY
	const nfe = `
		<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
			<infNFe Id="NFe${key}" versao="4.00">
				<ide><dhEmi>2026-07-20T10:30:00-03:00</dhEmi></ide>
				<emit><CNPJ>12345678000199</CNPJ><xNome>Fornecedor Alfa LTDA</xNome></emit>
				<dest><CNPJ>98765432000188</CNPJ></dest>
				${dets}
				<total><ICMSTot><vNF>1234.56</vNF></ICMSTot></total>
			</infNFe>
		</NFe>`
	if (opts.wrapProc === false) return `<?xml version="1.0" encoding="UTF-8"?>${nfe}`
	return `<?xml version="1.0" encoding="UTF-8"?>
		<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
			${nfe}
			<protNFe><infProt><chNFe>${key}</chNFe></infProt></protNFe>
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
