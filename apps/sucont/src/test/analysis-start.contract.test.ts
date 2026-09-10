/**
 * A tela inicial de análise tem UMA forma e UMA ordem.
 *
 * O app nasceu de nove ferramentas separadas e cada uma trouxe a sua: sete zonas
 * de envio com sete alturas, sete realces de arraste e três alvos de clique
 * diferentes; e sete ordens de página, com a zona de envio ora no topo, ora
 * abaixo de três cartões explicativos, ora depois de dois acordeões. Nada disso
 * falha em typecheck, lint ou teste — só na cara de quem usa, ao trocar de
 * ferramenta dentro do mesmo hub.
 *
 * Estas varreduras são o gate: ferramenta nova que desenhe a própria zona de
 * envio, ou que escreva à mão o caminho do Tesouro Gerencial, cai aqui.
 */
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { extname, join, relative, resolve } from "node:path"

const SRC = resolve(import.meta.dir, "..")

/** Os donos da forma. São eles que podem conter o que as varreduras proíbem. */
const PRIMITIVE_FILES = new Set([
	join(SRC, "components/ui/file-dropzone.tsx"),
	join(SRC, "components/tesouro-gerencial-path.tsx"),
	// O zero state genérico usa borda tracejada de 1px, que não é zona de envio.
	join(SRC, "components/ui/empty.tsx"),
])

function sourceFiles(): string[] {
	const out: string[] = []
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name)
			if (entry.isDirectory()) {
				if (entry.name === "test") continue
				walk(full)
				continue
			}
			if (![".ts", ".tsx"].includes(extname(entry.name))) continue
			if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue
			if (PRIMITIVE_FILES.has(full)) continue
			if (statSync(full).isFile()) out.push(full)
		}
	}
	walk(SRC)
	return out
}

const FILES = sourceFiles().map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }))

describe("zona de envio", () => {
	it("só existe uma, e é o primitivo", () => {
		// `border-2 border-dashed` (em qualquer ordem) é a assinatura de uma zona de
		// envio desenhada à mão.
		const offenders = FILES.filter((f) => /border-dashed/.test(f.text) && /border-2/.test(f.text)).map((f) => f.path)
		expect(offenders).toEqual([])
	})

	it('nenhuma tela monta o próprio `<input type="file">`', () => {
		// O campo nativo é a exceção registrada no STYLE_CONTRACT §8, e vale só
		// dentro do primitivo: é ele que garante o alvo de clique, o anel de foco e
		// a limpeza do valor entre duas escolhas do mesmo arquivo.
		const offenders = FILES.filter((f) => /type="file"/.test(f.text)).map((f) => f.path)
		expect(offenders).toEqual([])
	})
})

describe("caminho do Tesouro Gerencial", () => {
	it("tem uma fonte só", () => {
		// A trilha inteira estava escrita à mão em quatro telas, e uma delas já
		// divergia (parava antes da última etapa).
		const offenders = FILES.filter((f) => f.text.includes("Relatórios de Bancada dos Órgãos Superiores")).map((f) => f.path)
		expect(offenders).toEqual([])
	})
})

describe("ordem da tela inicial", () => {
	const ANALYSIS_ROUTES = [
		"routes/cruzamento-contas.tsx",
		"routes/subitens-genericos.tsx",
		"routes/conta-generica.tsx",
		"routes/monitoramento.tsx",
		"routes/analista-compatibilidade.tsx",
		"routes/analistasaldoalongado.tsx",
		"routes/sac-dgc.tsx",
	]

	it.each(ANALYSIS_ROUTES)("%s monta o `AnalysisStart`", (route) => {
		const file = FILES.find((f) => f.path === route)
		expect(file).toBeDefined()
		expect(file?.text).toContain("<AnalysisStart")
	})
})
