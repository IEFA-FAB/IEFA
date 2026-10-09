import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { cn } from "./cn"

// Toda classe própria do CSS com prefixo do Tailwind precisa estar registrada no `cn`: sem isso o
// tailwind-merge a lê como cor e descarta ela ou a cor que vem junto.
const SRC = join(import.meta.dirname, "..")
const css = readdirSync(SRC, { recursive: true, encoding: "utf8" })
	.filter((file) => file.endsWith(".css"))
	.map((file) => readFileSync(join(SRC, file), "utf8"))
	.join("\n")
const ownClasses = [...css.matchAll(/^\s*(?:@utility\s+|\.)((?:text|shadow|bg|border)-[a-z0-9-]+)\s*[{,]/gm)].map((m) => m[1])
const COLOR_OF_PREFIX: Record<string, string> = {
	text: "text-muted-foreground",
	shadow: "shadow-primary/20",
	bg: "bg-card",
	border: "border-primary",
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

	it.each(ownClasses.filter((own) => own.startsWith("text-")))("%s substitui tamanho, peso, entrelinha e tracking anteriores", (own) => {
		expect(cn("text-sm font-medium leading-snug tracking-wide", own)).toBe(own)
	})
})
