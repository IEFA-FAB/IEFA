/**
 * Escrita de FIXTURE nas tabelas de acesso (`access_control.user_permissions`, `policy`,
 * `policy_statement`, `user_policy_attachment`) — pela conexão Postgres direta, numa transação
 * com o bypass de manutenção explícito.
 *
 * ## Por que não pelo PostgREST, como o resto do seeder
 *
 * Desde 20260921120100 o banco recusa (42501 `ACCESS_CHANGE_UNAUDITED`) escrita nessas tabelas
 * fora das funções auditadas, que gravam o log de operações sensíveis na mesma transação. Semear
 * uma fixture não é conceder acesso a ninguém — e registrar no log de PRODUÇÃO cada grant de
 * teste exigiria um ator real que, por `on delete restrict`, nunca mais poderia ser apagado.
 *
 * O caminho de manutenção é `set_config('iefa.audit_bypass', '<motivo>', true)`: LOCAL à
 * transação (seguro no transaction pooler — um SET de sessão vazaria para o próximo cliente da
 * conexão), e só alcançável por quem tem a URL do banco. Uma requisição PostgREST não consegue
 * abri-lo, então o seeder precisa desta conexão própria.
 *
 * É um dos poucos lugares autorizados a escrever `iefa.audit_bypass` — a regra opengrep
 * `access-audit-bypass-outside-allowlist` lista os outros.
 */

import postgres from "postgres"
import { getSisubDatabaseUrl } from "./supabase"

/** Tabelas de acesso que o seeder escreve (todas em `access_control`). */
export const ACCESS_FIXTURE_TABLES = new Set(["user_permissions", "policy", "policy_statement", "user_policy_attachment"])

const BYPASS_REASON = "sisub integration fixture"

export interface AccessFixtureWriter {
	insertReturningId(table: string, row: Record<string, unknown>): Promise<string>
	deleteWhere(table: string, column: string, value: string | number): Promise<void>
	close(): Promise<void>
}

/** Conexão preguiçosa: só abre quando um teste semeia de fato uma tabela de acesso. */
export function createAccessFixtureWriter(): AccessFixtureWriter {
	let client: postgres.Sql | null = null

	const sql = () => {
		if (client) return client
		const url = getSisubDatabaseUrl()
		if (!url) throw new Error("SISUB_DATABASE_URL ausente — as fixtures de acesso precisam da conexão direta (o PostgREST não abre o bypass de manutenção).")
		// `prepare: false`: transaction pooler (6543). Uma conexão basta para fixture.
		client = postgres(url, { prepare: false, max: 1 })
		return client
	}

	const assertAccessTable = (table: string) => {
		if (!ACCESS_FIXTURE_TABLES.has(table)) throw new Error(`${table} não é tabela de acesso — use o seeder normal`)
	}

	return {
		async insertReturningId(table, row) {
			assertAccessTable(table)
			const [inserted] = await sql().begin(async (tx) => {
				await tx`select set_config('iefa.audit_bypass', ${BYPASS_REASON}, true)`
				return tx<{ id: string }[]>`insert into ${tx(`access_control.${table}`)} ${tx(row)} returning id`
			})
			if (!inserted) throw new Error(`seed ${table} failed: no row`)
			return inserted.id
		},
		async deleteWhere(table, column, value) {
			assertAccessTable(table)
			await sql().begin(async (tx) => {
				await tx`select set_config('iefa.audit_bypass', ${BYPASS_REASON}, true)`
				await tx`delete from ${tx(`access_control.${table}`)} where ${tx(column)} = ${value}`
			})
		},
		async close() {
			const current = client
			client = null
			await current?.end()
		},
	}
}
