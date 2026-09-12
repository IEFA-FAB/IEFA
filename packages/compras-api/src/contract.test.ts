import { describe, expect, test } from "bun:test"
import spec from "../openapi.json" with { type: "json" }

/**
 * Trava do contrato do Compras.gov.br.
 *
 * `openapi.json` é cópia do swagger vivo (`/v3/api-docs`) e `types.gen.ts` é
 * gerado dele — então uma regeneração muda silenciosamente o que os apps
 * conseguem chamar. Estes testes fixam o que o monorepo depende hoje: os
 * parâmetros OBRIGATÓRIOS e os nomes que já foram confundidos uma vez.
 *
 * Falha aqui não é bug do teste: é a API tendo mudado, e o consumidor
 * correspondente precisa ser revisto.
 */

type Spec = {
	paths: Record<string, Record<string, { parameters?: { name: string; required?: boolean }[] }>>
	components: { schemas: Record<string, { properties?: Record<string, unknown> }> }
}

const api = spec as unknown as Spec

function params(path: string): { name: string; required?: boolean }[] {
	const entry = api.paths[path]
	expect(entry, `endpoint ausente no swagger: ${path}`).toBeDefined()
	return entry.get?.parameters ?? []
}

function requiredParams(path: string): string[] {
	return params(path)
		.filter((p) => p.required)
		.map((p) => p.name)
		.sort()
}

function paramNames(path: string): string[] {
	return params(path).map((p) => p.name)
}

/** Endpoints consumidos pelo monorepo → parâmetros obrigatórios esperados. */
const REQUIRED_BY_ENDPOINT: Record<string, string[]> = {
	// apps/api — compras-sync (material + serviço): nenhum obrigatório.
	"/modulo-material/1_consultarGrupoMaterial": [],
	"/modulo-material/2_consultarClasseMaterial": [],
	"/modulo-material/3_consultarPdmMaterial": [],
	"/modulo-material/4_consultarItemMaterial": [],
	"/modulo-material/5_consultarMaterialNaturezaDespesa": [],
	"/modulo-material/6_consultarMaterialUnidadeFornecimento": [],
	"/modulo-material/7_consultarMaterialCaracteristicas": [],
	"/modulo-servico/1_consultarSecaoServico": [],
	"/modulo-servico/2_consultarDivisaoServico": [],
	"/modulo-servico/3_consultarGrupoServico": [],
	"/modulo-servico/4_consultarClasseServico": [],
	"/modulo-servico/5_consultarSubClasseServico": [],
	"/modulo-servico/6_consultarItemServico": [],
	"/modulo-servico/7_consultarUndMedidaServico": [],
	"/modulo-servico/8_consultarNaturezaDespesaServico": [],
	// apps/api + apps/sisub — pesquisa de preço.
	"/modulo-pesquisa-preco/1_consultarMaterial": ["codigo", "tipo"],
	// apps/sisub.
	"/modulo-uasg/1_consultarUasg": ["statusUasg"],
	"/modulo-fornecedor/1_consultarFornecedor": ["ativo"],
	"/modulo-arp/1_consultarARP": ["dataVigenciaInicialMax", "dataVigenciaInicialMin"],
	"/modulo-arp/2_consultarARPItem": ["dataVigenciaInicialMax", "dataVigenciaInicialMin"],
	"/modulo-arp/4_consultarEmpenhosSaldoItem": ["numeroAta", "unidadeGerenciadora"],
}

describe("parâmetros obrigatórios dos endpoints consumidos", () => {
	for (const [path, expected] of Object.entries(REQUIRED_BY_ENDPOINT)) {
		test(path, () => {
			expect(requiredParams(path)).toEqual(expected)
		})
	}
})

describe("nomes que já foram confundidos", () => {
	// O sisub chamava `1_consultarARP` com `uasgGerenciadora`/`numeroAta`/`anoAta`
	// — que são de `4_consultarEmpenhosSaldoItem` — e recebia 404 em toda chamada.
	test("1_consultarARP não tem os parâmetros do endpoint de saldo", () => {
		const names = paramNames("/modulo-arp/1_consultarARP")
		expect(names).toContain("codigoUnidadeGerenciadora")
		expect(names).toContain("numeroAtaRegistroPreco")
		expect(names).not.toContain("uasgGerenciadora")
		expect(names).not.toContain("numeroAta")
		expect(names).not.toContain("anoAta")
	})

	test("4_consultarEmpenhosSaldoItem é quem usa numeroAta/unidadeGerenciadora", () => {
		const names = paramNames("/modulo-arp/4_consultarEmpenhosSaldoItem")
		expect(names).toContain("numeroAta")
		expect(names).toContain("unidadeGerenciadora")
	})

	// `2_consultarARPItem` não filtra por número de ata: a seleção da ata é feita
	// sobre a resposta, e o teste existe para que ninguém "simplifique" isso.
	test("2_consultarARPItem não filtra por número de ata", () => {
		expect(paramNames("/modulo-arp/2_consultarARPItem")).not.toContain("numeroAtaRegistroPreco")
	})

	// O par `tipo`/`codigo` é o contrato atual; o antigo `codigoItemCatalogo`
	// responde 404 e continua listado no Postman documenter público.
	test("1_consultarMaterial usa tipo/codigo, não codigoItemCatalogo", () => {
		const names = paramNames("/modulo-pesquisa-preco/1_consultarMaterial")
		expect(names).toContain("tipo")
		expect(names).toContain("codigo")
		expect(names).not.toContain("codigoItemCatalogo")
	})
})

describe("campos de resposta usados pelo sisub", () => {
	const fields = (schema: string) => Object.keys(api.components.schemas[schema]?.properties ?? {})

	test("VwFtFornecedorDTO expõe ativo e habilitadoLicitar", () => {
		const f = fields("VwFtFornecedorDTO")
		expect(f).toContain("ativo")
		expect(f).toContain("habilitadoLicitar")
		// Os campos que o SICAF lia antes nunca existiram.
		expect(f).not.toContain("situacaoFornecedor")
		expect(f).not.toContain("statusFornecedor")
	})

	test("saldoEmpenho só existe no endpoint de saldo, não no item da ata", () => {
		expect(fields("VwArpEmpenhosItemDTO")).toContain("saldoEmpenho")
		expect(fields("VwFtArpItemDTO")).not.toContain("saldoEmpenho")
	})

	test("VwFtArpItemDTO usa niFornecedor e codigoItem", () => {
		const f = fields("VwFtArpItemDTO")
		expect(f).toContain("niFornecedor")
		expect(f).toContain("codigoItem")
		expect(f).toContain("quantidadeHomologadaItem")
		expect(f).not.toContain("niiFornecedor")
		expect(f).not.toContain("codigoMaterial")
	})
})
