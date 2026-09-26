import type { RowSpec } from "./diff.ts"

/**
 * Colunas que o sync grava em cada tabela de `compras_gov_integration`, com o tipo no banco
 * (migration `20260331_compras_sync.sql` + `20260414123000_compras_capacity_numeric.sql`).
 * `synced_at` fica de fora de propósito (ver `CONTROL_COLUMNS` em `diff.ts`).
 *
 * `keyColumns` repete o `onConflict` do upsert (ou a PK); `lookupColumn` é a coluna inteira usada
 * no `.in()` da leitura: a própria PK ou a chave-pai das tabelas filhas.
 */
export const ROW_SPECS = {
	materialGrupo: {
		table: "compras_material_grupo",
		keyColumns: ["codigo_grupo"],
		lookupColumn: "codigo_grupo",
		columns: { codigo_grupo: "integer", nome_grupo: "text", status_grupo: "boolean", data_hora_atualizacao: "timestamptz" },
	},
	materialClasse: {
		table: "compras_material_classe",
		keyColumns: ["codigo_classe"],
		lookupColumn: "codigo_classe",
		columns: {
			codigo_classe: "integer",
			codigo_grupo: "integer",
			nome_classe: "text",
			status_classe: "boolean",
			data_hora_atualizacao: "timestamptz",
		},
	},
	materialPdm: {
		table: "compras_material_pdm",
		keyColumns: ["codigo_pdm"],
		lookupColumn: "codigo_pdm",
		columns: { codigo_pdm: "integer", codigo_classe: "integer", nome_pdm: "text", status_pdm: "boolean", data_hora_atualizacao: "timestamptz" },
	},
	materialItem: {
		table: "compras_material_item",
		keyColumns: ["codigo_item"],
		lookupColumn: "codigo_item",
		columns: {
			codigo_item: "integer",
			codigo_pdm: "integer",
			descricao_item: "text",
			status_item: "boolean",
			item_sustentavel: "boolean",
			codigo_ncm: "text",
			descricao_ncm: "text",
			aplica_margem_preferencia: "boolean",
			data_hora_atualizacao: "timestamptz",
		},
	},
	materialNaturezaDespesa: {
		table: "compras_material_natureza_despesa",
		keyColumns: ["codigo_pdm", "codigo_natureza_despesa"],
		lookupColumn: "codigo_pdm",
		columns: {
			codigo_pdm: "integer",
			codigo_natureza_despesa: "text",
			nome_natureza_despesa: "text",
			status_natureza_despesa: "boolean",
		},
	},
	materialUnidadeFornecimento: {
		table: "compras_material_unidade_fornecimento",
		keyColumns: ["codigo_pdm", "numero_sequencial_unidade_fornecimento"],
		lookupColumn: "codigo_pdm",
		columns: {
			codigo_pdm: "integer",
			numero_sequencial_unidade_fornecimento: "integer",
			sigla_unidade_fornecimento: "text",
			nome_unidade_fornecimento: "text",
			descricao_unidade_fornecimento: "text",
			sigla_unidade_medida: "text",
			capacidade_unidade_fornecimento: "numeric",
			status_unidade_fornecimento_pdm: "boolean",
			data_hora_atualizacao: "timestamptz",
		},
	},
	materialCaracteristica: {
		table: "compras_material_caracteristica",
		keyColumns: ["codigo_item", "codigo_caracteristica", "codigo_valor_caracteristica"],
		lookupColumn: "codigo_item",
		// `id` desempata linhas com `codigo_valor_caracteristica` NULL (o unique não as considera iguais).
		orderColumns: ["codigo_item", "codigo_caracteristica", "codigo_valor_caracteristica", "id"],
		columns: {
			codigo_item: "integer",
			codigo_caracteristica: "text",
			nome_caracteristica: "text",
			status_caracteristica: "boolean",
			codigo_valor_caracteristica: "text",
			nome_valor_caracteristica: "text",
			status_valor_caracteristica: "boolean",
			numero_caracteristica: "integer",
			sigla_unidade_medida: "text",
			data_hora_atualizacao: "timestamptz",
		},
	},
	servicoSecao: {
		table: "compras_servico_secao",
		keyColumns: ["codigo_secao"],
		lookupColumn: "codigo_secao",
		columns: { codigo_secao: "integer", nome_secao: "text", status_secao: "boolean", data_hora_atualizacao: "timestamptz" },
	},
	servicoDivisao: {
		table: "compras_servico_divisao",
		keyColumns: ["codigo_divisao"],
		lookupColumn: "codigo_divisao",
		columns: {
			codigo_divisao: "integer",
			codigo_secao: "integer",
			nome_divisao: "text",
			status_divisao: "boolean",
			data_hora_atualizacao: "timestamptz",
		},
	},
	servicoGrupo: {
		table: "compras_servico_grupo",
		keyColumns: ["codigo_grupo"],
		lookupColumn: "codigo_grupo",
		columns: {
			codigo_grupo: "integer",
			codigo_divisao: "integer",
			nome_grupo: "text",
			status_grupo: "boolean",
			data_hora_atualizacao: "timestamptz",
		},
	},
	servicoClasse: {
		table: "compras_servico_classe",
		keyColumns: ["codigo_classe"],
		lookupColumn: "codigo_classe",
		columns: {
			codigo_classe: "integer",
			codigo_grupo: "integer",
			nome_classe: "text",
			status_grupo: "boolean",
			data_hora_atualizacao: "timestamptz",
		},
	},
	servicoSubclasse: {
		table: "compras_servico_subclasse",
		keyColumns: ["codigo_subclasse"],
		lookupColumn: "codigo_subclasse",
		columns: {
			codigo_subclasse: "integer",
			codigo_classe: "integer",
			nome_subclasse: "text",
			status_subclasse: "boolean",
			data_hora_atualizacao: "timestamptz",
		},
	},
	servicoItem: {
		table: "compras_servico_item",
		keyColumns: ["codigo_servico"],
		lookupColumn: "codigo_servico",
		columns: {
			codigo_servico: "integer",
			codigo_subclasse: "integer",
			nome_servico: "text",
			codigo_cpc: "integer",
			exclusivo_central_compras: "boolean",
			status_servico: "boolean",
			data_hora_atualizacao: "timestamptz",
		},
	},
	servicoUnidadeMedida: {
		table: "compras_servico_unidade_medida",
		keyColumns: ["codigo_servico", "sigla_unidade_medida"],
		lookupColumn: "codigo_servico",
		columns: { codigo_servico: "integer", sigla_unidade_medida: "text", nome_unidade_medida: "text", status_unidade_medida: "boolean" },
	},
	servicoNaturezaDespesa: {
		table: "compras_servico_natureza_despesa",
		keyColumns: ["codigo_servico", "codigo_natureza_despesa"],
		lookupColumn: "codigo_servico",
		columns: {
			codigo_servico: "integer",
			codigo_natureza_despesa: "text",
			nome_natureza_despesa: "text",
			status_natureza_despesa: "boolean",
		},
	},
} as const satisfies Record<string, RowSpec>
