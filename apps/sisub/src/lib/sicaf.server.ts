/**
 * @module sicaf.server
 * Consulta de situação do fornecedor (SICAF) no dadosabertos.compras.gov.br —
 * fonte única, usada tanto pelo check interativo (replenishment.fn) quanto
 * pela validação SERVER-SIDE na emissão de OF (review: evidência SICAF vinda
 * do cliente podia ser de outro fornecedor ou estar defasada).
 * Falha da API não bloqueia: retorna `indeterminado` e o gestor decide com
 * registro (`sicaf_ack_by`).
 */

export interface SicafResult {
	status: "regular" | "irregular" | "nao_encontrado" | "indeterminado"
	detail: string
}

export async function checkSupplierSicaf(cnpj: string): Promise<SicafResult> {
	try {
		const res = await fetch(`https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor?cnpj=${cnpj}`, {
			signal: AbortSignal.timeout(15_000),
			headers: { accept: "application/json" },
		})
		if (!res.ok) return { status: "indeterminado", detail: `API respondeu ${res.status}` }
		const body = (await res.json()) as { resultado?: { situacaoFornecedor?: string; statusFornecedor?: string }[] }
		const supplier = body.resultado?.[0]
		if (!supplier) return { status: "nao_encontrado", detail: "Fornecedor não localizado no SICAF" }
		const situation = supplier.situacaoFornecedor ?? supplier.statusFornecedor ?? "desconhecida"
		const regular = /ativ|credenciad|regular/i.test(situation)
		return { status: regular ? "regular" : "irregular", detail: situation }
	} catch {
		return { status: "indeterminado", detail: "API SICAF indisponível — decisão manual com registro" }
	}
}
