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
const ownClasses = [...css.matchAll(/^\s*(?:@utility\s+|\.)((?:text|shadow)-[a-z0-9-]+)\s*\{/gm)].map((m) => m[1])

describe("cn", () => {
	it("acha as classes próprias do CSS", () => {
		expect(ownClasses).toContain("text-label")
	})

	it.each(ownClasses)("mantém %s junto de uma cor", (own) => {
		const color = own.startsWith("shadow-") ? "shadow-primary/20" : "text-muted-foreground"
		expect(cn(own, color).split(" ")).toEqual([own, color])
		expect(cn(color, own).split(" ")).toEqual([color, own])
	})
})
