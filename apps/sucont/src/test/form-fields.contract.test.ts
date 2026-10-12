/**
 * Campo do sucont não recebe aparência por `className` (change `sucont-form-fields`).
 *
 * As ferramentas portadas chegaram com ~520 restilos em `Input`, `SelectTrigger`, `Combobox` e
 * `Textarea`: foco invisível no campo embutido, três cores de foco, fundo que só existia no tema
 * claro, 14px no mobile, alturas desalinhadas na mesma faixa. A migração levou densidade, ícone e
 * somente leitura para os primitivos e zerou os restilos. Este teste segura o zero: ele roda o
 * mesmo lint de Tailwind do CI (`@shadcn/lint`, regra `no-restyle`) e reprova qualquer aviso num
 * campo. No baseline do app, um restilo novo em campo poderia se esconder atrás de outro que saiu
 * de um botão; aqui não.
 */
import { describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "../../../..")
const OXLINT = join(ROOT, "node_modules/.bin/oxlint")
const FIELD = /^"[^"]+" is not allowed on <(Input|SelectTrigger|Combobox|Textarea|InputGroup\w*)>/

type Diagnostic = { code: string; filename: string; message: string; labels: { span: { line: number } }[] }

describe("campos do sucont", () => {
	it("nenhum campo recebe aparência por className (só layout)", () => {
		expect(existsSync(OXLINT), "oxlint não instalado: rode `bun install` na raiz").toBe(true)
		const run = Bun.spawnSync([OXLINT, "-c", ".oxlintrc.tailwind.jsonc", "-f", "json", "apps/sucont/src"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" })
		const { diagnostics } = JSON.parse(run.stdout.toString()) as { diagnostics: Diagnostic[] }
		const restyles = diagnostics
			.filter((d) => d.code.includes("no-restyle") && FIELD.test(d.message))
			.map((d) => `${d.filename}:${d.labels[0]?.span.line ?? 0}  ${d.message.split(":")[0]}`)
		// Densidade é `size="sm"`; ícone ou botão no campo é `InputGroup`; somente leitura é `readOnly`;
		// erro é `aria-invalid`. Ver o §4.2 do STYLE_CONTRACT.
		expect(restyles).toEqual([])
	})
})
