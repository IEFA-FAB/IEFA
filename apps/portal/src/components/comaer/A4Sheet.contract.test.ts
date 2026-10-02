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
// O `<style>` de impressão mora no editor, ao lado da folha que ele governa.
const route = readFileSync(join(APP_ROOT, "src/components/comaer/DocumentEditor.tsx"), "utf8")

describe("contrato da impressão", () => {
	const attribute = sheet.match(/\n\t+(data-[a-z-]+)\n/)?.[1]

	it("a folha marca a si mesma com um atributo de dado", () => {
		expect(attribute).toBeDefined()
	})

	it("o CSS de impressão aponta para o atributo que a folha renderiza", () => {
		expect(route).toContain(`[${attribute}], [${attribute}] * { visibility: visible; }`)
		expect(route).toContain(`:not([${attribute}]):not([${attribute}] *) { display: none !important; }`)
		expect(route).toContain(`body :has([${attribute}]) {`)
	})

	// `visibility: hidden` esconde sem tirar do fluxo: o editor inteiro continuava ocupando
	// altura e a impressão saía com o ofício seguido de quatro folhas em branco. Ela fica só
	// como base para navegador sem `:has()`; onde há suporte, quem esconde é o `display`.
	it("esconde o resto da página com display onde o navegador tem :has()", () => {
		const supported = route.slice(route.indexOf("@supports selector(:has(*))"))
		expect(supported).toContain("display: none !important")
		expect(supported).toContain("overflow: visible !important")
	})

	it("todo bloco citado no CSS de impressão existe", () => {
		const types = readFileSync(join(APP_ROOT, "src/lib/comaer/types.ts"), "utf8")
		const blocks = [...route.matchAll(/\[data-block="([a-z-]+)"\]/g)].map((m) => m[1])
		expect(blocks.length).toBeGreaterThan(0)
		for (const block of blocks) expect(types).toContain(`| "${block}"`)
	})

	it("não sobrou seletor apontando para um atributo que ninguém renderiza", () => {
		const selectors = [...route.matchAll(/\[(data-[a-z-]+)\]/g)].map((m) => m[1])
		expect(selectors.length).toBeGreaterThan(0)
		for (const selector of new Set(selectors)) expect(sheet).toContain(selector)
	})
})

describe("preview ocultável", () => {
	// Ocultar o preview não pode desmontar a folha: a impressão É a folha, e o `<style>`
	// torna visível só o que está dentro dela. Desmontada, "Imprimir" sai em branco.
	it("esconde a folha por classe, e a reexibe na impressão", () => {
		expect(route).toContain("hidden print:block")
		expect(route).not.toMatch(/\{showPreview && \([\s\S]{0,80}<A4Sheet/)
	})
})
