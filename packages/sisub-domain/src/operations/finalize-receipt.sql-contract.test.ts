/**
 * Guardas de `inventory.finalize_goods_receipt` que não podem sumir.
 *
 * A função é substituída por `create or replace` a cada mudança do
 * recebimento, e quem escreve a migration tende a partir do corpo da migration
 * que a CRIOU — não da definição vigente. Foi assim que 20260901120200 apagou
 * em silêncio as duas guardas de 20260730120000, e só o gate de integração
 * pegou, depois do push.
 *
 * Este teste é o mesmo aviso, um passo antes: lê a ÚLTIMA definição da função
 * no diretório de migrations e exige que as invariantes continuem lá. Não
 * substitui o teste de integração — prova texto, não comportamento — mas custa
 * milissegundos e falha no lugar certo.
 */

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS = join(import.meta.dir, "..", "..", "..", "database", "supabase", "migrations")
const FUNCTION_HEAD = /create or replace function inventory\.finalize_goods_receipt/i

/** Corpo da definição mais recente da função, na ordem cronológica dos arquivos. */
function latestDefinition(): { file: string; body: string } {
	const files = readdirSync(MIGRATIONS)
		.filter((name) => name.endsWith(".sql"))
		.sort()

	let found: { file: string; body: string } | null = null
	for (const file of files) {
		const sql = readFileSync(join(MIGRATIONS, file), "utf8")
		const start = sql.search(FUNCTION_HEAD)
		if (start === -1) continue
		found = { file, body: sql.slice(start) }
	}
	if (!found) throw new Error("Nenhuma definição de finalize_goods_receipt encontrada")
	return found
}

describe("finalize_goods_receipt — invariantes da definição vigente", () => {
	const { body } = latestDefinition()

	test("efetivação é única: guarda por definitive_at", () => {
		// Sem ela, um recebimento que termina em `divergent` (quantidade a menor
		// com motivo — o caso comum) volta a satisfazer o gate de status e pode
		// ser efetivado de novo: lotes e movimentos EM DOBRO num ledger
		// append-only, que só se corrige com ajuste manual.
		expect(body).toMatch(/definitive_at is not null/)
		expect(body).toMatch(/efetivação é única/)
	})

	test("a OF tem de ser da cozinha do recebimento", () => {
		expect(body).toMatch(/OF pertence à cozinha/)
	})

	test("só provisório ou divergente efetiva", () => {
		expect(body).toMatch(/status not in \('provisional', 'divergent'\)/)
	})

	test("a soma dos lotes tem de fechar com a quantidade conferida", () => {
		expect(body).toMatch(/Soma dos lotes/)
	})

	test("o lote de estoque carrega a classe de conservação da compra", () => {
		expect(body).toMatch(/conservation_class/)
	})

	test("o movimento é criado por LOTE, não por linha de item", () => {
		// A prova textual possível: o loop interno percorre goods_receipt_item_lot.
		expect(body).toMatch(/from inventory\.goods_receipt_item_lot where receipt_item_id = v_item\.id/)
	})
})
