/**
 * O seletor da impressão e o atributo da folha precisam ser a MESMA palavra.
 *
 * Eles moram em arquivos diferentes — o atributo no componente, o seletor num `<style>`
 * dentro da rota — e nada os liga em tempo de compilação. Quando a renomeação para inglês
 * passou, o atributo virou `data-sheet` e o CSS continuou em `[data-folha]`: a regra
 * `body * { visibility: hidden }` seguiu valendo e a impressão saiu EM BRANCO, sem erro
 * nenhum no build nem na tela.
 */
import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const APP_ROOT = resolve(import.meta.dir, "../../..")
const sheet = readFileSync(join(APP_ROOT, "src/components/comaer/A4Sheet.tsx"), "utf8")
const route = readFileSync(join(APP_ROOT, "src/routes/_public/_en/facilities/comunicacoes-oficiais.tsx"), "utf8")

describe("contrato da impressão", () => {
	const attribute = sheet.match(/\n\t+(data-[a-z-]+)\n/)?.[1]

	it("a folha marca a si mesma com um atributo de dado", () => {
		expect(attribute).toBeDefined()
	})

	it("o CSS de impressão aponta para o atributo que a folha renderiza", () => {
		expect(route).toContain(`[${attribute}], [${attribute}] * { visibility: visible; }`)
		expect(route).toContain(`[${attribute}] { position: absolute;`)
	})

	it("não sobrou seletor apontando para um atributo que ninguém renderiza", () => {
		const selectors = [...route.matchAll(/\[(data-[a-z-]+)\]/g)].map((m) => m[1])
		expect(selectors.length).toBeGreaterThan(0)
		for (const selector of new Set(selectors)) expect(sheet).toContain(selector)
	})
})
