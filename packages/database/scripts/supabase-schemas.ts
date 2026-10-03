#!/usr/bin/env bun
/**
 * Os schemas que o repo lê do Supabase, numa lista só, e os comandos do CLI que a usam.
 *
 *   bun run scripts/supabase-schemas.ts types [flags]   # gen types → src/generated.ts
 *   bun run scripts/supabase-schemas.ts pull  [flags]   # db pull
 *   bun run scripts/supabase-schemas.ts diff  [flags]   # db diff (ex.: -f nome, --linked)
 *   bun run scripts/supabase-schemas.ts link            # link ao projeto
 *
 * A lista vivia copiada em `db:types`, `db:pull` e `db:diff` do package.json (e no fallback do
 * `audit-rls.ts`); schema novo entrava em um e faltava nos outros. O project id vem do
 * `supabase/config.toml`, que o CLI já lê. O `schemaFilter` do `drizzle.config.ts` é outra lista
 * de propósito: só os schemas que o Drizzle consulta.
 *
 * Flags depois do subcomando passam direto ao CLI. O terminal (stdin) também: o `db pull`
 * pergunta antes de reparar o histórico de migrations do banco compartilhado, e sem TTY o CLI
 * assume "sim".
 */

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const PACKAGE_DIR = join(import.meta.dir, "..")

export const SUPABASE_SCHEMAS = [
	"sisub",
	"iefa",
	"journal",
	"forms",
	"rumaer",
	"core",
	"access_control",
	"kitchen",
	"procurement",
	"finance",
	"compras_gov_integration",
	"nutrition_reference",
	"inventory",
	"siafi_integration",
	"gs1_integration",
	"assignment_selection",
	"sucont",
	"alpha",
	"documents",
] as const

export type SupabaseCommand = "types" | "pull" | "diff" | "link"

/** `project_id` do `supabase/config.toml`. */
export function readProjectId(configToml: string): string {
	const id = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(configToml)?.[1]
	if (!id) throw new Error("supabase/config.toml sem project_id")
	return id
}

/** Argumentos do `supabase` para cada subcomando, com as flags extras no fim. */
export function supabaseArgs(command: SupabaseCommand, projectId: string, extra: readonly string[] = []): string[] {
	const schema = ["--schema", SUPABASE_SCHEMAS.join(",")]
	if (command === "types") return ["gen", "types", "typescript", "--project-id", projectId, ...schema, ...extra]
	if (command === "link") return ["link", "--project-ref", projectId, ...extra]
	return ["db", command, ...schema, ...extra]
}

if (import.meta.main) {
	const [command, ...extra] = process.argv.slice(2)
	if (command !== "types" && command !== "pull" && command !== "diff" && command !== "link") {
		console.error("uso: bun run scripts/supabase-schemas.ts <types|pull|diff|link> [flags do supabase]")
		process.exit(64)
	}
	const projectId = readProjectId(readFileSync(join(PACKAGE_DIR, "supabase", "config.toml"), "utf8"))
	let proc: ReturnType<typeof Bun.spawnSync>
	try {
		proc = Bun.spawnSync(["bunx", "supabase", ...supabaseArgs(command, projectId, extra)], {
			cwd: PACKAGE_DIR,
			stdin: "inherit",
			stdout: command === "types" ? "pipe" : "inherit",
			stderr: "inherit",
		})
	} catch (error) {
		console.error(`não deu para rodar o CLI do Supabase (bunx no PATH?): ${error instanceof Error ? error.message : error}`)
		process.exit(127)
	}
	if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1)
	// Só grava o arquivo com o gen terminado: o `>` do shell truncava o generated.ts antes de
	// saber se o CLI ia falhar.
	if (command === "types") writeFileSync(join(PACKAGE_DIR, "src", "generated.ts"), proc.stdout as Uint8Array)
}
