/**
 * As pré-visualizações do cadastro militar (`SaramPreview`, `SaramAdminPreview`) são SÓ de
 * desenvolvimento: alimentam as telas com estados e filas inventados e uma API falsa. Elas não
 * podem chegar ao build de produção nem ser importadas por outro caminho.
 *
 * O Vite troca `import.meta.env.DEV` por `false` no build; com a condição na frente do `import()`,
 * o minificador descarta o ramo e o chunk não é emitido (conferido no PR com `vite build` + busca
 * do texto da pré-visualização no `.output`). Este contrato garante a forma: um import estático em
 * qualquer arquivo, ou o `import()` fora da condição, levaria os dados falsos para produção.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, "..", "..", "..")
const PREVIEWS = ["SaramPreview", "SaramAdminPreview"]

function collect(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) collect(full, out)
		else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") && entry.name !== "routeTree.gen.ts") out.push(full)
	}
	return out
}

const files = collect(srcDir).map((file) => ({ path: relative(srcDir, file), code: readFileSync(file, "utf8") }))

describe("pré-visualização do cadastro militar só existe em desenvolvimento", () => {
	test.each(PREVIEWS)("%p só é importado por import() atrás de import.meta.env.DEV", (name) => {
		const importers = files.filter((f) => !f.path.endsWith(`${name}.tsx`) && new RegExp(`features/military-record/${name}["']`).test(f.code))
		expect(importers.length).toBeGreaterThan(0)
		for (const f of importers) {
			expect(f.code, f.path).not.toMatch(new RegExp(`^import[^\\n]*features/military-record/${name}["']`, "m"))
			expect(f.code, f.path).toMatch(
				new RegExp(`import\\.meta\\.env\\.DEV \\? lazy\\(\\(\\) => import\\("@/components/features/military-record/${name}"\\)\\) : null`)
			)
		}
	})
})
