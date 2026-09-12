/**
 * @module sicaf.server
 * Consulta de situação do fornecedor (SICAF) no dadosabertos.compras.gov.br —
 * fonte única, usada tanto pelo check interativo (replenishment.fn) quanto
 * pela validação SERVER-SIDE na emissão de OF (review: evidência SICAF vinda
 * do cliente podia ser de outro fornecedor ou estar defasada).
 * Falha da API não bloqueia: retorna `indeterminado` e o gestor decide com
 * registro (`sicaf_ack_by`).
 */

import { comprasApi } from "@/lib/compras.server"

export interface SicafResult {
	status: "regular" | "irregular" | "nao_encontrado" | "indeterminado"
	detail: string
}

/**
 * `ativo` é OBRIGATÓRIO em `1_consultarFornecedor` — sem ele a API responde 404
 * (`{"statusCode":404,"message":"Resource not found"}`), e não 200 com lista
 * vazia. Como o parâmetro também FILTRA, não dá para perguntar "qual a situação
 * deste CNPJ" numa chamada só: `ativo=true` que volta vazio pode ser fornecedor
 * inativo ou fornecedor inexistente. Por isso a segunda consulta com
 * `ativo=false`, que é o que separa "irregular" de "não encontrado".
 */
async function queryFornecedor(cnpj: string, ativo: boolean) {
	const result = await comprasApi.GET("/modulo-fornecedor/1_consultarFornecedor", {
		params: { query: { cnpj, ativo, pagina: 1 } },
	})
	if (!result.data) throw new Error(`API respondeu ${result.response.status}`)
	return result.data.resultado?.[0]
}

export async function checkSupplierSicaf(cnpj: string): Promise<SicafResult> {
	try {
		const active = await queryFornecedor(cnpj, true)
		if (active) {
			// `habilitadoLicitar` é o campo que responde a pergunta da emissão de OF:
			// estar cadastrado e ativo não implica estar habilitado a licitar.
			return active.habilitadoLicitar
				? { status: "regular", detail: "Ativo e habilitado a licitar no SICAF" }
				: { status: "irregular", detail: "Ativo no SICAF, porém NÃO habilitado a licitar" }
		}

		const inactive = await queryFornecedor(cnpj, false)
		if (inactive) return { status: "irregular", detail: "Cadastro inativo no SICAF" }

		return { status: "nao_encontrado", detail: "Fornecedor não localizado no SICAF" }
	} catch {
		return { status: "indeterminado", detail: "API SICAF indisponível — decisão manual com registro" }
	}
}
