import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { cn } from "./utils"

// Toda classe própria do CSS com prefixo do Tailwind precisa estar registrada no `cn`: sem isso o
// tailwind-merge a lê como cor e descarta ela ou a cor que vem junto.
const SRC = join(import.meta.dirname, "..")
const css = readdirSync(SRC, { recursive: true, encoding: "utf8" })
	.filter((file) => file.endsWith(".css"))
	.map((file) => readFileSync(join(SRC, file), "utf8"))
	.join("\n")
// Classe que abre o seletor (`.text-label {`, `.shadow-hard-sm:hover {`, `@utility text-body {`). Seletor
// que só reestiliza classe do Tailwind num contexto (`html[data-tenant] .bg-card`) não é classe própria.
const ownClasses = [...new Set([...css.matchAll(/^\s*(?:@utility\s+|\.)((?:text|shadow|bg|border)-[a-z0-9-]+)(?=[\s,:{])/gm)].map((m) => m[1]))]
const COLOR_OF_PREFIX: Record<string, string> = {
	text: "text-muted-foreground",
	shadow: "shadow-primary/20",
	bg: "bg-card",
	border: "border-primary",
}

// Classe tipográfica: o que ela declara decide o que o `cn` pode tirar antes dela. `@utility`
// sai no CSS antes do utilitário de uma propriedade só, então precisa tirá-lo; CSS solto em
// `@layer utilities` já vence no CSS e não tira nada.
const SAMPLE_OF_PROPERTY: Record<string, string> = {
	"font-size": "text-sm",
	"font-weight": "font-medium",
	"letter-spacing": "tracking-wide",
	"line-height": "leading-snug",
}
function typography(own: string) {
	const block = css.match(new RegExp(`^\\s*(@utility\\s+|\\.)${own}\\s*\\{([^}]*)\\}`, "m"))
	if (!block) throw new Error(`bloco de ${own} não achado`)
	const declared = Object.keys(SAMPLE_OF_PROPERTY).filter((property) => new RegExp(`(^|[;{\\s])${property}\\s*:`).test(block[2]))
	return { isUtility: block[1].startsWith("@utility"), declared }
}

describe("cn", () => {
	it("acha as classes próprias do CSS", () => {
		expect(ownClasses).toContain("text-label")
	})

	it.each(ownClasses)("mantém %s junto de uma cor", (own) => {
		const color = COLOR_OF_PREFIX[own.split("-")[0]]
		expect(cn(own, color).split(" ")).toEqual([own, color])
		expect(cn(color, own).split(" ")).toEqual([color, own])
	})

	it.each(ownClasses.filter((own) => own.startsWith("text-")))("%s tira antes de si só o que declara", (own) => {
		const { isUtility, declared } = typography(own)
		const samples = Object.entries(SAMPLE_OF_PROPERTY)
		const kept = samples.filter(([property]) => !isUtility || !declared.includes(property)).map(([, sample]) => sample)
		expect(cn(...samples.map(([, sample]) => sample), own).split(" ")).toEqual([...kept, own])
	})
})
