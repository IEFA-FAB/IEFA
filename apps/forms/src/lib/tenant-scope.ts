/**
 * @module tenant-scope
 * O tenant do deploy decidido NO SERVIDOR.
 *
 * O mesmo build serve dois deploys: `forms` (Formulários IEFA, todos os questionários) e `5s`
 * (Programa 5S, só os marcados com a tag `5s`). Antes, o recorte vinha do cliente: o navegador
 * mandava `tags` (de `VITE_APP_TENANT`, embutido no bundle) e o servidor só aplicava o que
 * recebia — tirar o parâmetro listava tudo. Agora o servidor lê o tenant do próprio processo e
 * SOMA as tags dele às que o cliente pedir: o cliente pode estreitar, nunca alargar.
 *
 * O critério é o mesmo que a tela já usava: a coluna `forms.questionnaire.tags` (`text[]`),
 * sem coluna nova. O questionário criado no deploy `5s` nasce com a tag (ver
 * `createQuestionnaireFn`).
 */

import { TENANTS, type Tenant } from "./tenant"

const TENANT_IDS = Object.keys(TENANTS) as Tenant[]

function parseTenant(value: string | undefined): Tenant | null {
	return value && (TENANT_IDS as string[]).includes(value) ? (value as Tenant) : null
}

/**
 * Tenant do processo. Primeiro a variável de runtime do deploy (`VITE_APP_TENANT` está em
 * `environment_variables` da task do `5s`, infra/5s/terraform.tfvars.example); na falta dela,
 * o valor do build, embutido no bundle do servidor pelo mesmo `--build-arg` do manifesto. Nenhum
 * dos dois vem da requisição.
 */
export function resolveServerTenant(runtimeValue: string | undefined, buildValue: string | undefined): Tenant {
	return parseTenant(runtimeValue) ?? parseTenant(buildValue) ?? "forms"
}

/** Tags obrigatórias do tenant somadas às pedidas pelo cliente (sem repetição). */
export function scopeTags(tenant: Tenant, requested?: readonly string[] | null): string[] {
	const required = TENANTS[tenant].tagFilter ?? []
	return Array.from(new Set([...required, ...(requested ?? [])]))
}

/** O questionário tem todas as tags que o tenant exige? (`forms` não exige nenhuma.) */
export function hasTenantTags(tenant: Tenant, tags: readonly string[] | null | undefined): boolean {
	const required = TENANTS[tenant].tagFilter ?? []
	return required.every((tag) => tags?.includes(tag) ?? false)
}
