/**
 * Escrita de FIXTURE em `assignment_selection.access_grant` — pela conexão Postgres direta, numa
 * transação com o bypass de manutenção explícito.
 *
 * Desde 20261001150000 o banco recusa (42501 `ACCESS_CHANGE_UNAUDITED`) escrita nessa tabela fora
 * das funções auditadas, que gravam o log de operações sensíveis na mesma transação. Uma
 * concessão de teste não é concessão a ninguém, e registrá-la no log de PRODUÇÃO exigiria um ator
 * real que, por `on delete restrict`, nunca mais sairia dali. Mesmo desenho de
 * `apps/sisub/src/test/access-fixture-writer.ts`: o bypass é local à transação e só alcançável por
 * quem tem a URL do banco (o PostgREST não o abre).
 *
 * Um dos poucos lugares autorizados a escrever `iefa.audit_bypass` — ver a regra opengrep
 * `access-audit-bypass-outside-allowlist`.
 */

import postgres from "postgres"

const BYPASS_REASON = "assignment-selection integration fixture"

export interface GrantFixtureWriter {
	insertGrant(row: { email: string; role: "admin" | "operator"; active: boolean }): Promise<void>
	deleteGrantsLike(pattern: string): Promise<void>
	close(): Promise<void>
}

export function createGrantFixtureWriter(databaseUrl: string): GrantFixtureWriter {
	// `prepare: false`: transaction pooler (6543). Uma conexão basta para fixture.
	const sql = postgres(databaseUrl, { prepare: false, max: 1 })

	return {
		async insertGrant(row) {
			await sql.begin(async (tx) => {
				await tx`select set_config('iefa.audit_bypass', ${BYPASS_REASON}, true)`
				await tx`insert into assignment_selection.access_grant (email, role, active) values (${row.email}, ${row.role}, ${row.active})`
			})
		},
		async deleteGrantsLike(pattern) {
			await sql.begin(async (tx) => {
				await tx`select set_config('iefa.audit_bypass', ${BYPASS_REASON}, true)`
				await tx`delete from assignment_selection.access_grant where email like ${pattern}`
			})
		},
		async close() {
			await sql.end()
		},
	}
}
