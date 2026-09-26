/**
 * Contrato: toda server function que ESCREVE no agregado do insumo grava versão.
 *
 * O insumo é versionado (`kitchen.ingredient_version`). Até este contrato, só o save da
 * tela de detalhe versionava no servidor; o dialog da árvore, as ações em lote, o
 * localizar/substituir e os itens de compra/produto alteravam o insumo sem entrar no
 * histórico (ou dependiam de uma chamada do cliente, depois, que podia não acontecer).
 *
 * Aqui cada POST de `ingredients.fn.ts` e `purchase_item.fn.ts` precisa passar por
 * `withIngredientVersions(` — escrita e versão na mesma transação — ou estar em `EXEMPT`
 * com o motivo. POST novo sem classificação reprova a suíte: é o único momento em que
 * alguém ainda lembra se ele mexe no que a versão guarda.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const serverDir = dirname(fileURLToPath(import.meta.url))
const FILES = ["ingredients.fn.ts", "purchase_item.fn.ts"]

/** Mesmo corte por `export const` dos contratos vizinhos (`audit-wiring.contract.test.ts`). */
function postBlocks(file: string): { name: string; body: string }[] {
	const source = readFileSync(join(serverDir, file), "utf8")
	const out: { name: string; body: string }[] = []
	const exportRe = /export const (\w+) = /g
	let match = exportRe.exec(source)
	while (match !== null) {
		const start = match.index
		const next = exportRe.exec(source)
		const body = source.slice(start, next ? next.index : undefined)
		if (/createServerFn\(\{\s*method:\s*"POST"/.test(body)) out.push({ name: match[1] as string, body })
		match = next
	}
	return out
}

/**
 * Escritas que NÃO passam pelo versionamento, e por quê. O snapshot da versão guarda:
 * campos do insumo (nome, pasta, unidade, FC, CEAFA), vínculo nutricional e nutrientes,
 * itens de produto e vínculos de compra com os campos do item de compra.
 */
const EXEMPT: Record<string, string> = {
	createFolderFn: "pasta nova não tem insumo dentro",
	updateFolderFn:
		"renomear/mover pasta não é mudança do insumo (decisão de 2026-09-26): a versão guarda o nome da época, e o próximo save do insumo leva o novo",
	deleteFolderFn: "apagar pasta não cascateia para os insumos",
	restoreFolderFn: "idem deleteFolderFn",
	deleteIngredientFn: "ciclo de vida, não conteúdo: o snapshot não guarda deleted_at, e restaurar devolve o insumo idêntico ao histórico",
	restoreIngredientFn: "idem deleteIngredientFn",
	updateIngredientDeliveryCycleFn:
		"sugestão de compra fora do snapshot: cada item de ATA grava o próprio ciclo, que é o que vale na compra (docs/SAVE_BEHAVIOR.md)",
	updateIngredientAllergensFn: "fora do snapshot; grava sozinho na tela, com AutoSaveStatus (docs/SAVE_BEHAVIOR.md)",
	restoreIngredientVersionFn: "a própria restauração grava a versão, na mesma transação (restoreIngredientVersion)",
	recordIngredientReviewFn: "conferência pelos nutricionistas é evento de revisão, não alteração",
	recordFolderReviewFn: "idem recordIngredientReviewFn, para a pasta inteira",
	createPurchaseItemFn: "item de compra recém-criado ainda não tem insumo vinculado; a versão sai no vínculo (upsertPurchaseItemIngredientFn)",
}

const blocks = FILES.flatMap(postBlocks)

describe("versionamento do insumo nas escritas", () => {
	test("a varredura encontra as escritas (proteção contra teste que passa vazio)", () => {
		expect(blocks.map((b) => b.name)).toEqual(expect.arrayContaining(["updateIngredientFn", "updatePurchaseItemFn", "saveIngredientDetailsFn"]))
	})

	test("toda escrita do agregado grava versão, ou está isenta com motivo", () => {
		const missing = blocks.filter((b) => !(b.name in EXEMPT) && !b.body.includes("withIngredientVersions(")).map((b) => b.name)
		expect(missing, "escrita no agregado do insumo sem versão. Envolva em withIngredientVersions ou registre em EXEMPT com o motivo.").toEqual([])
	})

	test("isenção que não é mais escrita, ou que passou a versionar, sai da lista", () => {
		const byName = new Map(blocks.map((b) => [b.name, b]))
		const stale = Object.keys(EXEMPT).filter((name) => !byName.has(name) || byName.get(name)?.body.includes("withIngredientVersions("))
		expect(stale).toEqual([])
	})

	test("o cliente não registra versão por conta própria", () => {
		// A versão pedida pelo cliente, depois da escrita, era o buraco: fora da transação e
		// esquecível. Se voltar a existir uma server fn para isso, este teste acusa.
		const all = FILES.map((f) => readFileSync(join(serverDir, f), "utf8")).join("\n")
		expect(all).not.toMatch(/export const recordIngredientVersionFn/)
	})
})
