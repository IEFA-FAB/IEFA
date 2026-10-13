/**
 * @module incoming.fn
 * "A caminho": o que está para chegar ou está pendente de documento.
 *
 * O requisito era *"preciso saber o que está prestes a chegar por integração
 * com a NF-e"*, e a palavra que engana ali é *integração*: a nota é só uma das
 * quatro formas de saber. O almoxarife precisa da lista ÚNICA, porque a
 * pergunta dele é "o que falta chegar hoje", e não "quais notas existem".
 *
 * As quatro origens:
 *  • **OF enviada** com saldo a receber — o pedido existe e o fornecedor sabe;
 *  • **NF-e sem recebimento** — a mercadoria pode já estar na porta;
 *  • **entrega sem nota** — o pão diário, que chega todo dia e é faturado na
 *    sexta. É entrega real sem documento fiscal ainda;
 *  • **reposição prometida** — linha recusada que o fornecedor vai repor.
 *
 * OF e nota do mesmo carregamento aparecem, por ora, como DUAS linhas — e o
 * total conta as duas. A nota não guarda a OF nem o empenho a que se refere
 * (`nfe_document` não tem essas colunas; o vínculo é a sugestão de
 * `suggestNfeLinksFn`, que um humano confirma), e casar só pelo fornecedor
 * juntaria entregas diferentes do mesmo contrato numa linha só, que é erro
 * pior: esconde uma entrega. A linha da nota diz o que fazer com ELA, a da OF
 * diz o que ainda falta do pedido.
 *
 * CLIENT: getServerClient (service role, schemas inventory/procurement/finance).
 * AUTH: `storage` nível 1.
 * TABLES: procurement.supply_order(_item), inventory.nfe_document, goods_receipt.
 * @domain kitchen
 * @migration 20260917200000_receiving_designation_and_scan
 */

import { getBrasiliaToday } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { publicDbMessage } from "@/lib/db-error-message"
import {
	buildIncomingNoteScope,
	buildNfeRows,
	buildSupplyOrderRows,
	buildUnbilledRows,
	countPendingByNote,
	INCOMING_KINDS,
	indexNoteReceipts,
	indexOrderReceipts,
	paginateIncoming,
} from "@/lib/incoming-rows"
import { purchaseUnitIdOfKitchen } from "@/lib/kitchen-purchase-unit.server"
import { readAllPages, readAllPagesIn } from "@/lib/read-all-pages"
import { requireStorageForKitchen } from "@/lib/storage-auth.server"
import { getServerClient } from "@/lib/supabase.server"

const inventory = () => getServerClient("inventory")
const procurement = () => getServerClient("procurement")
const finance = () => getServerClient("finance")

export type { IncomingKind, IncomingRow } from "@/lib/incoming-rows"
export { INCOMING_KINDS }

/** Entrega sem nota mais velha que isto sai do painel e da sugestão de vínculo. */
const UNBILLED_HORIZON_DAYS = 45

/** Unidade COMPRADORA da cozinha — quem empenha e a quem a nota é enviada. */
export const fetchIncomingFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			kitchenId: z.number().int().positive(),
			kinds: z.array(z.enum(INCOMING_KINDS)).optional(),
			limit: z.number().int().min(1).max(200).default(50),
		})
	)
	.handler(async ({ data }) => {
		await requireStorageForKitchen(1, data.kitchenId)
		const inv = inventory()
		const proc = procurement()
		const today = getBrasiliaToday()

		// ── (a) OF enviada com saldo a receber ───────────────────────────────────
		// Toda leitura deste arquivo passa por `readAllPages`/`readAllPagesIn`: o
		// PostgREST corta em 1000 linhas sem erro, e `.in()` com centenas de ids
		// estoura a URL. Consertar só a leitura apontada deixava as irmãs cortando.
		const orderRows = await readAllPages("as ordens de fornecimento", (from, to) =>
			proc
				.from("supply_order")
				.select("id, empenho_id, number, sent_at, expected_delivery, status, notes")
				.eq("kitchen_id", data.kitchenId)
				.in("status", ["sent", "partially_received"])
				.order("id")
				.range(from, to)
		)

		// o fornecedor da OF vem do empenho, que é quem tem o favorecido
		const empenhoIds = orderRows.map((order) => order.empenho_id).filter((id) => id != null)
		const empenhoById = new Map<string, { numero_empenho: string | null; favorecido_nome: string | null; favorecido_cnpj: string | null }>()
		const empenhos = await readAllPagesIn("os empenhos", empenhoIds, (chunk, from, to) =>
			finance().from("empenho").select("id, numero_empenho, favorecido_nome, favorecido_cnpj").in("id", chunk).order("id").range(from, to)
		)
		for (const row of empenhos) empenhoById.set(row.id, row)

		// Recebimentos já efetivados das OFs listadas, para saber o que ainda falta.
		// Erro aqui NÃO pode virar lista vazia: sem os recebimentos some o filtro
		// que esconde o que já chegou, e o painel passa a mostrar como "a caminho"
		// o que já está na prateleira. E a leitura é pelas OFs, não por "todo
		// recebimento da cozinha": essa cresce todo dia (o pão) e passa do teto de
		// 1000 linhas do PostgREST, que corta calado.
		// Efetivado é `definitive_at`, e não `status = definitive`: recebimento com
		// item divergente fica em `divergent` e é entrega atestada do mesmo jeito.
		// Pelo status, ele continuaria "a caminho" para sempre.
		// E o recebimento EM ANDAMENTO (rascunho, provisório) também muda a linha:
		// a mercadoria já está na porta. Sem isto a OF seguia "enviada", atrasada,
		// com "Cobrar o fornecedor" no topo — enquanto a linha da nota da mesma
		// entrega dizia "Concluir o recebimento".
		const orderReceipts = await readAllPagesIn(
			"os recebimentos das ordens",
			orderRows.map((order) => order.id),
			(chunk, from, to) =>
				inv
					.from("goods_receipt")
					.select("id, supply_order_id, definitive_at")
					.eq("kitchen_id", data.kitchenId)
					.in("supply_order_id", chunk)
					.neq("status", "rejected")
					.order("id")
					.range(from, to)
		)
		const rows = buildSupplyOrderRows(orderRows, empenhoById, indexOrderReceipts(orderReceipts), today)

		// ── (b) NF-e sem recebimento efetivado ───────────────────────────────────
		// Nota da cozinha E nota enviada à UNIDADE compradora que nenhuma cozinha
		// reivindicou ainda (`kitchen_id` nulo). Estas são justamente as "prestes a
		// chegar via NF-e": só `kitchen_id` fazia o painel dizer que não há nada
		// pendente quando há.
		const purchaseUnit = await purchaseUnitIdOfKitchen(data.kitchenId)
		const scope = buildIncomingNoteScope(data.kitchenId, purchaseUnit)
		const noteRows = await readAllPages("as notas", (from, to) =>
			inv
				.from("nfe_document")
				.select("id, access_key, supplier_name, supplier_cnpj, supplier_cpf, issued_at, total_value, status, situation_result, kitchen_id")
				.or(scope)
				// Os estados em que a nota ainda representa algo a chegar ou a resolver.
				// `received` já virou recebimento; `cancelled` e `refused` não vêm. Não
				// existe `review` nesta coluna — o CHECK do banco é a lista de valores,
				// e inventar um a mais devolveria sempre lista vazia.
				.in("status", ["announced", "imported", "available", "matched", "divergent"])
				.order("id")
				.range(from, to)
		)
		const noteIds = noteRows.map((note) => note.id)
		// Recebimentos das notas, de QUALQUER cozinha. A nota enviada à unidade
		// pode ser recebida pela cozinha irmã sem ser reivindicada antes; lida só
		// nesta cozinha, ela ficaria pendente aqui para sempre. E o recebimento em
		// andamento (rascunho ou provisório) muda a ação: mandar "registrar o
		// recebimento" de novo esbarra em "já tem um recebimento em andamento".
		const noteReceipts = await readAllPagesIn("os recebimentos das notas", noteIds, (chunk, from, to) =>
			inv
				.from("goods_receipt")
				.select("id, nfe_document_id, kitchen_id, definitive_at")
				.in("nfe_document_id", chunk)
				.neq("status", "rejected")
				.order("id")
				.range(from, to)
		)
		// Itens ainda não casados, para dizer QUANTOS faltam em vez de "resolver".
		// Só os pendentes vêm do banco; cortar esta lista mostrava "Registrar o
		// recebimento" em nota com item sem insumo, que a criação do recebimento recusa.
		const pendingItems = await readAllPagesIn("os itens das notas", noteIds, (chunk, from, to) =>
			inv.from("nfe_item").select("id, nfe_document_id").in("nfe_document_id", chunk).is("ingredient_item_id", null).order("id").range(from, to)
		)
		rows.push(...buildNfeRows(noteRows, indexNoteReceipts(noteReceipts, data.kitchenId), countPendingByNote(pendingItems)))

		// ── (c) entrega sem nota ─────────────────────────────────────────────────
		// O pão chega todo dia e é faturado na sexta. Cada entrega é real e não
		// tem documento fiscal ainda — some do painel se a lista for só de notas.
		//
		// Três cortes, e cada um fecha uma forma de a lista crescer para sempre:
		//  • só entrega que ESPERA nota (`invoice_expected`, 20260926215000). A mesma
		//    origem `delivery_note` cobre a remessa de depósito e o apoio de outra
		//    OM, que nunca terão NF-e de fornecedor — e ficavam "aguardando a nota"
		//    eternamente. Antes da coluna, o corte era "tem OF", e a entrega de pão
		//    sem OF sumia do painel;
		//  • rascunho não entra: ainda não é entrega, e aparecia como "Entregue";
		//  • só os últimos 45 dias: a nota semanal do pão chega em dias; entrega de
		//    mês e meio atrás sem nota é pendência para a revisão fiscal, não algo
		//    "a caminho".
		const horizon = new Date(Date.now() - UNBILLED_HORIZON_DAYS * 86_400_000).toISOString()
		const unbilled = await readAllPages("as entregas sem nota", (from, to) =>
			inv
				.from("goods_receipt")
				.select("id, supply_order_id, status, delivery_note_number, supplier_name, supplier_document, created_at")
				.eq("kitchen_id", data.kitchenId)
				.is("nfe_document_id", null)
				.neq("source", "nfe")
				.eq("invoice_expected", true)
				// `goods_receipt.status` não tem `cancelled`: os valores são draft,
				// provisional, definitive, divergent e rejected
				.not("status", "in", "(rejected,draft)")
				.gte("created_at", horizon)
				.order("id")
				.range(from, to)
		)
		rows.push(...buildUnbilledRows(unbilled))

		// ── (d) reposição prometida — AINDA NÃO ─────────────────────────────────
		// A spec prevê a linha recusada com reposição prometida como quarta origem
		// deste painel. Ela não entra ainda porque a recusa de linha não existe:
		// `goods_receipt_item` não tem coluna de recusa nenhuma (tarefa 3.24, em
		// aberto). Montar a origem agora seria consultar campo inexistente e
		// devolver lista vazia para sempre — o recurso nasceria morto, calado, que
		// é exatamente o defeito que este change já corrigiu uma vez na sugestão da
		// saída do dia. `promised_replacement` fica declarado no tipo e sem
		// produtor até a recusa existir.

		// O atrasado vem primeiro, e o mais atrasado antes — é a ordem em que o
		// almoxarife precisa cobrar. Depois, o mais antigo.
		return paginateIncoming(rows, data.kinds, data.limit)
	})

/**
 * Vínculos sugeridos para uma NF-e sem empenho.
 *
 * Ranqueia por documento do emitente: empenho vigente da unidade cujo
 * favorecido tem o MESMO CNPJ (ou CPF) e ainda tem saldo. Com um único
 * candidato, a tela pré-seleciona — mas a confirmação continua sendo humana,
 * porque vincular nota a empenho errado contamina a execução orçamentária de
 * um contrato que não é o dela.
 */
export const suggestNfeLinksFn = createServerFn({ method: "GET" })
	.validator(z.object({ kitchenId: z.number().int().positive(), nfeDocumentId: z.uuid() }))
	.handler(async ({ data }) => {
		await requireStorageForKitchen(2, data.kitchenId)
		const inv = inventory()
		const { data: note, error: noteError } = await inv
			.from("nfe_document")
			.select("id, kitchen_id, unit_id, supplier_cnpj, supplier_cpf, total_value")
			.eq("id", data.nfeDocumentId)
			.maybeSingle()
		if (noteError) throw new Error(`Erro ao carregar a nota: ${publicDbMessage(noteError)}`)
		if (!note) throw new Error("Nota não encontrada")
		// A nota tem de ser desta cozinha — OU da unidade compradora dela, ainda
		// não reivindicada. Recusar a não reivindicada lançava erro justamente na
		// nota que o painel manda "assumir". E o empenho é da unidade COMPRADORA
		// da cozinha, não do `unit_id` da nota, que é nulo nas notas importadas
		// antes de a coluna existir — e `.eq("unit_id", null)` nem é filtro válido.
		const purchaseUnit = await purchaseUnitIdOfKitchen(data.kitchenId)
		const ownKitchen = note.kitchen_id != null && Number(note.kitchen_id) === data.kitchenId
		const unclaimedForUnit = note.kitchen_id == null && note.unit_id != null && Number(note.unit_id) === purchaseUnit
		if (!ownKitchen && !unclaimedForUnit) throw new Error("Nota não pertence a esta cozinha")
		if (purchaseUnit == null) throw new Error("A cozinha não tem unidade compradora vinculada")

		// `finance.empenho` não guarda CPF de favorecido. Emitente pessoa física
		// não casa com empenho nenhum, e DIZER isso é melhor do que devolver lista
		// vazia, que o operador lê como "não há empenho com saldo".
		if (!note.supplier_cnpj) {
			return {
				empenhos: [],
				supplyOrders: [],
				deliveriesWithoutInvoice: [],
				note: "Emitente pessoa física: empenho é sempre de favorecido com CNPJ" as string | null,
			}
		}

		const fin = finance()
		const supplierCnpj = note.supplier_cnpj
		const candidates = await readAllPages("os empenhos do fornecedor", (from, to) =>
			fin
				.from("empenho")
				.select("id, numero_empenho, favorecido_nome, unit_id")
				.eq("favorecido_cnpj", supplierCnpj)
				.eq("unit_id", purchaseUnit)
				.order("id")
				.range(from, to)
		)
		const candidateIds = candidates.map((row) => row.id)

		// O saldo vem de `v_empenho_saldo`, que é onde ele é calculado. Recompor
		// "valor menos liquidado" à mão aqui criaria uma segunda conta do mesmo
		// número, e as duas divergiriam na primeira anulação. Sem saldo lido, todo
		// empenho sumiria da sugestão — e a tela diria que não há empenho com saldo.
		const balanceById = new Map<string, number>()
		const balances = await readAllPagesIn("o saldo dos empenhos", candidateIds, (chunk, from, to) =>
			fin.from("v_empenho_saldo").select("empenho_id, saldo_a_liquidar").in("empenho_id", chunk).order("empenho_id").range(from, to)
		)
		for (const row of balances) if (row.empenho_id) balanceById.set(row.empenho_id, Number(row.saldo_a_liquidar))
		const withBalance = candidates.filter((row) => (balanceById.get(row.id) ?? 0) > 0)
		const withBalanceIds = new Set(withBalance.map((row) => row.id))

		// Entregas sem nota DO MESMO FORNECEDOR — é a nota semanal fechando as
		// entregas diárias do pão. O fornecedor de uma entrega é o favorecido do
		// empenho da OF dela; entrega de OF de outro empenho não entra. Antes
		// voltava toda entrega sem nota da cozinha, e a tela convidava a ligar a
		// entrega de um fornecedor à nota de outro. A OF pode já estar recebida
		// por inteiro (a semana do pão fechou) e o empenho, sem saldo: por isso o
		// conjunto é toda OF da cozinha num empenho deste fornecedor; as ABERTAS,
		// com saldo, são a sugestão de OF.
		const supplierOrders = await readAllPagesIn("as ordens do fornecedor", candidateIds, (chunk, from, to) =>
			procurement()
				.from("supply_order")
				.select("id, empenho_id, number, expected_delivery, status")
				.eq("kitchen_id", data.kitchenId)
				.in("empenho_id", chunk)
				.order("id")
				.range(from, to)
		)
		const openOrders = supplierOrders.filter(
			(order) => (order.status === "sent" || order.status === "partially_received") && order.empenho_id != null && withBalanceIds.has(order.empenho_id)
		)

		// mesmo corte de 45 dias do painel: entrega mais velha sem nota é assunto
		// da revisão fiscal, não da sugestão de vínculo
		const horizon = new Date(Date.now() - UNBILLED_HORIZON_DAYS * 86_400_000).toISOString()
		const receipts = await readAllPagesIn(
			"as entregas sem nota",
			supplierOrders.map((order) => order.id),
			(chunk, from, to) =>
				inv
					.from("goods_receipt")
					.select("id, delivery_note_number, created_at, status, supply_order_id")
					.eq("kitchen_id", data.kitchenId)
					.in("supply_order_id", chunk)
					.is("nfe_document_id", null)
					.neq("source", "nfe")
					.not("status", "in", "(rejected,draft)")
					.gte("created_at", horizon)
					.order("id")
					.range(from, to)
		)

		return {
			empenhos: withBalance.map((row) => ({
				empenhoId: row.id,
				numero: row.numero_empenho,
				favorecido: row.favorecido_nome,
				balance: balanceById.get(row.id) ?? 0,
			})),
			supplyOrders: openOrders,
			deliveriesWithoutInvoice: receipts,
			note: null as string | null,
		}
	})
