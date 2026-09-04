/**
 * @module analistasaldoalongado/utils/hierarchy
 * Compatibilidade: derivado de `lib/ug/registry`, a fonte única.
 */

import { UNIDADES_GESTORAS } from "#/lib/ug/registry"

export interface UgHierarchy {
	ug: string
	nome: string
	orgaoSuperior: string
	ods: string
}

export const UG_HIERARCHY: Record<string, UgHierarchy> = Object.fromEntries(
	Object.entries(UNIDADES_GESTORAS).map(([codigo, ug]) => [codigo, { ug: codigo, nome: ug.sigla, orgaoSuperior: ug.orgaoSuperior, ods: ug.ods }])
)

export const getUgHierarchy = (ug: string): UgHierarchy => {
	return (
		UG_HIERARCHY[ug] || {
			ug,
			nome: "Desconhecida",
			orgaoSuperior: "Desconhecido",
			ods: "Desconhecido",
		}
	)
}

export const getUniqueOds = (): string[] => {
	return Array.from(new Set(Object.values(UG_HIERARCHY).map((item) => item.ods))).sort()
}

export const getUniqueOrgaosSuperiores = (): string[] => {
	return Array.from(new Set(Object.values(UG_HIERARCHY).map((item) => item.orgaoSuperior))).sort()
}
