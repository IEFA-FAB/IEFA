/**
 * Invariantes do NOME dos arquivos de migration — o que o `supabase` CLI usa como chave.
 *
 * A versão (o timestamp antes do primeiro `_`) é a chave primária de
 * `supabase_migrations.schema_migrations`. Dois arquivos com a mesma versão não têm como estar os
 * dois no histórico: `db push`/`db reset` quebram, e o histórico remoto passa a nomear um só dos
 * dois. Foi o caso de 20260917120000 (portal apps no #348, inventory hardening no #355).
 *
 * O `_remote_stamp` é o marcador de carimbo do `apply_migration` (MCP), que grava o próprio
 * timestamp em vez do nome do arquivo: ele existe só para o histórico remoto ter arquivo local, e
 * por isso não pode ter efeito — a DDL mora no arquivo versionado da mudança.
 */

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS = join(import.meta.dir, "..", "supabase", "migrations")
const FILES = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"))

/** SQL sem comentários, espaços e `;` — o que sobra é o que executa. */
function executable(sql: string): string {
	return sql
		.replace(/--[^\n]*/g, "")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/[\s;]+/g, " ")
		.trim()
		.toLowerCase()
}

describe("histórico de migrations", () => {
	test("todo arquivo é <versão>_<nome>.sql, com versão de 14 dígitos", () => {
		// As 29 de 8 dígitos (até 2026-05-30) são legado e estão assim no histórico remoto:
		// renomear mudaria a versão delas. Arquivo novo sempre com hora (`supabase migration new`).
		const legacy = (name: string) => /^\d{8}_/.test(name) && name.slice(0, 8) <= "20260530"
		expect(FILES.filter((name) => !legacy(name) && !/^\d{14}_[a-z0-9_]+\.sql$/.test(name))).toEqual([])
	})

	test("nenhuma versão se repete", () => {
		const byVersion = Map.groupBy(FILES, (name) => name.slice(0, name.indexOf("_")))
		const duplicated = [...byVersion.values()].filter((names) => names.length > 1)
		expect(duplicated).toEqual([])
	})

	test("marcador de carimbo remoto não executa nada", () => {
		const stamps = FILES.filter((name) => name.endsWith("_remote_stamp.sql"))
		expect(stamps.length).toBeGreaterThan(0)
		for (const name of stamps) expect(executable(readFileSync(join(MIGRATIONS, name), "utf8")), name).toBe("select 1 where false")
	})
})
