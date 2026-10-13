/**
 * Contagem cega alcança TODA leitura de saldo, e não só a folha.
 *
 * Esconder o número na folha e deixá-lo no painel, no balancete, na ficha do
 * item ou na reposição não é contagem cega: é um clique a mais. O operador
 * abre a outra tela, lê o esperado e volta para "confirmar" — e contagem que
 * confirma o sistema não acha erro nenhum.
 *
 * Quem revisa e aprova (nível 3) continua vendo. A ocultação vale enquanto a
 * contagem está ABERTA — inclusive em revisão, porque dali sai a recontagem, e
 * recontagem de quem viu o esperado não é cega.
 *
 * Falha FECHADA: erro ao ler as contagens ou o escopo lança, em vez de devolver
 * "nada escondido". Na única proteção da cegueira, a leitura que falha não
 * pode mostrar tudo.
 */

import type { UserContext } from "@iefa/pbac"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import { allowsOnStockLocation, resolveKitchenLocation, resolveStockLocation } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

const OPEN_STATUSES = ["draft", "counting", "review", "recount"]

/**
 * Itens (`item_id`: o id do insumo ou da preparação) que uma contagem cega aberta no local de
 * estoque da cozinha esconde deste usuário. Quem já resolveu o local passa `locationId` e poupa
 * a leitura.
 */
export async function hiddenByBlindCount(kitchenId: number, ctx: UserContext, locationId?: number): Promise<Set<string>> {
	const target = locationId === undefined ? await resolveKitchenLocation(kitchenId) : await resolveStockLocation(locationId)
	// O nível 3 do local vê, pela mesma regra do guard: cozinha, OM que cobre a do local ou global.
	if (await allowsOnStockLocation(ctx.permissions, 3, target)) return new Set()

	const inv = getServerClient("inventory")
	const location = target.id
	const counts = await readAllPages<{ id: string }>("as contagens cegas abertas", (from, to) =>
		inv.from("inventory_count").select("id").eq("location_id", location).eq("blind", true).in("status", OPEN_STATUSES).order("id").range(from, to)
	)
	const scope = await readAllPagesIn<{ item_id: string }>(
		"o escopo das contagens cegas",
		counts.map((row) => row.id),
		(chunk, from, to) => inv.from("count_scope_item").select("id, item_id").in("count_id", chunk).order("id").range(from, to)
	)
	return new Set(scope.map((row) => row.item_id).filter(Boolean))
}

/**
 * Para relatório da cozinha INTEIRA (balancete, exportação, reposição): recusa
 * enquanto houver item escondido. Tirar linhas de um balancete — ou de uma
 * exportação que vai para o SIAFI — seria entregar um documento incompleto que
 * parece completo.
 */
export async function assertNoBlindCountHides(kitchenId: number, ctx: UserContext, what: string, locationId?: number): Promise<void> {
	const hidden = await hiddenByBlindCount(kitchenId, ctx, locationId)
	if (hidden.size > 0) {
		throw new Error(
			`${what} fica indisponível enquanto houver contagem cega aberta nesta cozinha (${hidden.size} item(ns) em contagem). O nível 3 vê; os demais, ao fim da contagem`
		)
	}
}
