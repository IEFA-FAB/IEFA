/**
 * @module auditor/ugMapping
 * Compatibilidade: derivado de `lib/ug/registry`, a fonte única.
 *
 * A tabela literal que existia aqui estava desatualizada — não conhecia 120283
 * nem 121002 e trazia 120627 (GAP de Alcântara, inativa no SIAFI), que não
 * existia em nenhuma outra tabela do app.
 */

import { UNIDADES_GESTORAS } from "#/lib/ug/registry"

export const UG_MAPPING: Record<string, { orgaoSuperior: string; ods: string }> = Object.fromEntries(
	Object.entries(UNIDADES_GESTORAS).map(([codigo, ug]) => [codigo, { orgaoSuperior: ug.orgaoSuperior, ods: ug.ods }])
)
