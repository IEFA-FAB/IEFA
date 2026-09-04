/**
 * @module lib/cruzamento/ugData
 * Compatibilidade: derivado de `lib/ug/registry`, a fonte única.
 *
 * A tabela literal que existia aqui divergia do resto do app — chamava a UG
 * 120283 de "SDNB" (o registro oficial do SIAFI diz Grupamento de Engenharia de
 * Campanha da Aeronáutica) e não conhecia 121002.
 */

import { UNIDADES_GESTORAS } from "#/lib/ug/registry"

export interface UGInfo {
	codigo: string
	nome: string
	orgaoSuperior: string
	ods: string
}

export const UG_DATA: Record<string, UGInfo> = Object.fromEntries(
	Object.entries(UNIDADES_GESTORAS).map(([codigo, ug]) => [codigo, { codigo, nome: ug.sigla, orgaoSuperior: ug.orgaoSuperior, ods: ug.ods }])
)
