/**
 * @module lib/analista/organizacao
 * Compatibilidade: derivado de `lib/ug/registry`, a fonte única.
 *
 * A tabela literal que existia aqui divergia do resto do app na UG 120999 —
 * chamava-a de "CECOMSAER", subordinada ao GABAER, quando o cadastro do SIAFI
 * responde "MAER - DIFERENCA CAMBIAL" (uso exclusivo da STN).
 */

import { getUg } from "#/lib/ug/registry"

export interface OrganizacaoInfo {
	ods: string
	orgaoSuperior: string
	nome: string
	isSetorial: boolean
	isSTN: boolean
}

/** Setoriais contábeis do COMAER — peso normativo superior na leitura das análises. */
const SETORIAIS = ["120002", "120701", "120702"]

/** UG de uso exclusivo da Secretaria do Tesouro Nacional. */
const STN = ["120999"]

export const getOrganizacao = (ug: string): OrganizacaoInfo => {
	const data = getUg(ug)

	if (data) {
		return {
			ods: data.ods,
			orgaoSuperior: data.orgaoSuperior,
			nome: data.sigla,
			isSetorial: SETORIAIS.includes(ug),
			isSTN: STN.includes(ug),
		}
	}

	return {
		ods: "OUTROS",
		orgaoSuperior: "OUTROS",
		nome: `UG ${ug}`,
		isSetorial: false,
		isSTN: false,
	}
}
