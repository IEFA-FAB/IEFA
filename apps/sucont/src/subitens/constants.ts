/**
 * @module subitens/constants
 * Compatibilidade: `UG_INFO` e `CONFERENTES_MAPPING` são derivados de
 * `lib/ug/registry`, a fonte única. Preferir o registro em código novo.
 */

import { UNIDADES_GESTORAS } from "#/lib/ug/registry"

export const UG_INFO: Record<string, { sigla: string; ods: string; orgaoSuperior: string }> = Object.fromEntries(
	Object.entries(UNIDADES_GESTORAS).map(([codigo, ug]) => [codigo, { sigla: ug.sigla, ods: ug.ods, orgaoSuperior: ug.orgaoSuperior }])
)

export const CONFERENTES_MAPPING: Record<string, string> = Object.fromEntries(
	Object.entries(UNIDADES_GESTORAS).flatMap(([codigo, ug]) => (ug.conferente ? [[codigo, ug.conferente] as const] : []))
)
