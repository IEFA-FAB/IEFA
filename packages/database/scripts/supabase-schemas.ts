#!/usr/bin/env bun
/**
 * Os schemas que o repo lê do Supabase, numa lista só, e os comandos do CLI que a usam.
 *
 *   bun run scripts/supabase-schemas.ts types   # gen types → src/generated.ts
 *   bun run scripts/supabase-schemas.ts pull    # db pull
 *   bun run scripts/supabase-schemas.ts diff    # db diff
 *
 * A lista vivia copiada em `db:types`, `db:pull` e `db:diff` do package.json; schema novo
 * entrava em um e faltava nos outros, e o tipo gerado ficava sem o schema que o pull trazia.
 * O `schemaFilter` do `drizzle.config.ts` é outra lista de propósito: só os schemas que o
 * Drizzle consulta.
 */

import { writeFileSync } from "node:fs"
import { join } from "node:path"

export const PROJECT_ID = "jgigqdpdjgnnuwajtayh"

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

/** Argumentos do `supabase` para cada subcomando. */
export function supabaseArgs(command: "types" | "pull" | "diff"): string[] {
	const schema = ["--schema", SUPABASE_SCHEMAS.join(",")]
	if (command === "types") return ["gen", "types", "typescript", "--project-id", PROJECT_ID, ...schema]
	return ["db", command, ...schema]
}

if (import.meta.main) {
	const command = process.argv[2]
	if (command !== "types" && command !== "pull" && command !== "diff") {
		console.error("uso: bun run scripts/supabase-schemas.ts <types|pull|diff>")
		process.exit(64)
	}
	const proc = Bun.spawnSync(["bunx", "supabase", ...supabaseArgs(command)], {
		cwd: join(import.meta.dir, ".."),
		stdout: command === "types" ? "pipe" : "inherit",
		stderr: "inherit",
	})
	if (proc.exitCode !== 0) process.exit(proc.exitCode ?? 1)
	// Só grava o arquivo com o gen terminado: o `>` do shell truncava o generated.ts antes de
	// saber se o CLI ia falhar.
	if (command === "types") writeFileSync(join(import.meta.dir, "..", "src", "generated.ts"), proc.stdout)
}
