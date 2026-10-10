import { describe, expect, test } from "bun:test"
import { escapeTemplateLiteral } from "./template-literal.ts"

/** Avalia o texto escapado como template literal, do jeito que o arquivo gerado o lerá. */
function roundTrip(text: string): string {
	return new Function(`return \`${escapeTemplateLiteral(text)}\``)() as string
}

describe("escapeTemplateLiteral", () => {
	test("o texto volta idêntico depois de lido como template literal", () => {
		for (const text of [
			"((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date",
			"regexp_replace(x, '\\d+', '')",
			"'a`b'",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: o caso é justamente o `${` literal
			"'${nao_interpola}'",
			"\\`${",
			"fim com barra \\",
		]) {
			expect(roundTrip(text)).toBe(text)
		}
	})
})
