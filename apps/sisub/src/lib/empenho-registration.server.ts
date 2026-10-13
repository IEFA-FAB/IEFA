/**
 * @module empenho-registration.server
 * Núcleo único do registro da nota de empenho com itens (change `sisub-flexible-expense-execution`,
 * D3/D4). Chamado pela NE a partir da contratação/ARP (`createEmpenhoWithItemsFn`) e pela NE de um
 * item só do painel da ARP (`createEmpenhoFn`), para os dois caminhos não divergirem. Em três
 * passos, para cada server fn manter o PRÓPRIO `withSensitiveAudit("<fn>", …)` em volta da escrita
 * (`audit-wiring.contract.test.ts`):
 *
 * ```ts
 * const prepared = await prepareEmpenhoRegistration(data)
 * const empenhoId = await withSensitiveAudit("createEmpenhoFn", ctx, () => insertPreparedEmpenho("createEmpenhoFn", ctx, prepared), (id) => empenhoAuditTarget(prepared, id))
 * return completeEmpenhoRegistration(ctx, prepared, empenhoId)
 * ```
 *
 *
 * - cabeçalho e itens numa transação (`finance.empenho` + `finance.empenho_item`), com o id
 *   devolvido pelo próprio `returning` — sem releitura depois do commit;
 * - itens de ARP da unidade, lidos numa consulta só; a contratação da ARP vira a da NE quando ela
 *   não veio, e o favorecido sai do informado, da contratação ou do fornecedor único da ARP;
 * - descrição e unidade do item da NE vêm do item da ARP quando não foram informadas;
 * - conferência NE × ARP (`checkEmpenhoAgainstArp`): avisos, nunca recusa;
 * - 23505 com o número NORMALIZADO; 23514 com a mensagem do trigger;
 * - toda NE nova religa as NS/OB estacionadas da unidade (`relink_waiting_rows`).
 *
 * CLIENT: getDb (transação) e getServerClient (leituras, religação).
 * TABLES: finance.empenho, finance.empenho_item, procurement.arp(_item), procurement.acquisition.
 * @domain core
 */

import {
	type ArpConformityWarning,
	type ArpItemFacts,
	checkEmpenhoAgainstArp,
	type EmpenhoItemDraft,
	type EmpenhoType,
	empenhoItemProblems,
	normalizeEmpenhoNumber,
	sumEmpenhoItems,
} from "@iefa/sisub-domain"
import type { UserContext } from "@iefa/sisub-domain/types"
import { describeDriverError, unwrapPgError } from "@iefa/sisub-domain/utils"
import { sql } from "drizzle-orm"
import { loadLocalCommitments } from "@/lib/arp-commitments.server"
import { getDb } from "@/lib/db.server"
import {
	type ArpItemsSummary,
	collectArpAcquisitions,
	collectArpItemIds,
	type EmpenhoArpItemRow,
	emptyArpItemsSummary,
	pickArpAcquisition,
	resolveEmpenhoHeaderFields,
	resolveEmpenhoItemFields,
	resolveFavorecido,
	summarizeArpItems,
} from "@/lib/empenho-arp-facts"
import { getServerClient } from "@/lib/supabase.server"
import { publicDbMessage } from "./db-error-message"

const procurement = () => getServerClient("procurement")
const siafi = () => getServerClient("siafi_integration")

export interface CreatedEmpenho {
	empenhoId: string
	numeroEmpenho: string
	valorTotal: number
	/** Avisos da conferência NE × ARP (preço, saldo, vigência): registrados, não recusados. */
	warnings: ArpConformityWarning[]
	/** NS/OB estacionadas que a NE nova religou. */
	relinked: number
}

export interface EmpenhoRegistration {
	unitId: number
	numeroEmpenho: string
	dataEmpenho: string
	tipo?: EmpenhoType | null
	acquisitionId?: string | null
	favorecidoCnpj?: string | null
	favorecidoNome?: string | null
	nd?: string | null
	ptres?: string | null
	fonte?: string | null
	issuerUg?: string | null
	notaLancamento?: string | null
	items: readonly EmpenhoItemDraft[]
}

/** Operações do registro de garantia que gravam a NE por este núcleo. */
export type EmpenhoRegistrationOperation = "createEmpenhoFn" | "createEmpenhoWithItemsFn"

/**
 * Religa as NS/OB estacionadas da unidade — a MESMA função que o import de lote chama. Falha
 * aqui não desfaz a NE: a linha continua estacionada e a próxima gravação tenta de novo.
 */
export async function relinkWaitingRows(unitId: number, actorId: string): Promise<number> {
	try {
		const { data, error } = await siafi().rpc("relink_waiting_rows", { p_unit_id: unitId, p_actor: actorId })
		// Fica no servidor: o catch abaixo só loga.
		// nosemgrep: sisub-raw-db-error-message
		if (error) throw new Error(error.message)
		const row = Array.isArray(data) ? data[0] : data
		return Number(row?.relinked ?? 0)
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: server-side — a religação é best-effort e fica no log
		console.error("[relinkWaitingRows]", error instanceof Error ? error.message : error)
		return 0
	}
}

function toEmpenhoWriteError(operation: EmpenhoRegistrationOperation, error: unknown, numero: string): Error {
	const pg = unwrapPgError(error)
	if (pg.code === "23505") return new Error(`O empenho ${numero} já está no sistema: abra-o em Empenhos para completar`)
	if (pg.code === "23514" && pg.message) return new Error(pg.message)
	// biome-ignore lint/suspicious/noConsole: server-side — o detalhe do driver só vai para o log
	console.error(`[${operation}]`, describeDriverError(error))
	return new Error("Erro ao registrar a nota de empenho. Tente novamente.")
}

/** NE conferida e pronta para gravar: o que o insert, o alvo da auditoria e a resposta usam. */
export interface PreparedEmpenho {
	data: EmpenhoRegistration
	numero: string
	valorTotal: number
	acquisitionId: string | null
	favorecidoCnpj14: string | null
	favorecidoNome: string | null
	arpItems: ReadonlyMap<string, ArpItemFacts>
	arpUnitByItem: ReadonlyMap<string, string | null>
	arpItemIds: string[]
	warnings: ArpConformityWarning[]
}

/**
 * Contratação de origem: a unidade sai da LINHA, não do corpo.
 *
 * @returns o fornecedor da contratação (para o favorecido).
 */
async function loadAcquisitionSupplier(
	proc: ReturnType<typeof procurement>,
	acquisitionId: string,
	unitId: number
): Promise<{ cnpj: string | null; name: string | null }> {
	const { data: acq, error } = await proc
		.from("acquisition")
		.select("unit_id, supplier_cnpj, supplier_name, nd")
		.eq("id", acquisitionId)
		.is("deleted_at", null)
		.maybeSingle()
	if (error) throw new Error(`Erro ao conferir a contratação: ${publicDbMessage(error)}`)
	if (!acq || Number(acq.unit_id) !== unitId) throw new Error("A contratação de origem não pertence a esta unidade")
	return { cnpj: acq.supplier_cnpj, name: acq.supplier_name }
}

/** Itens de ARP da NE, todos da unidade, resumidos para a conferência; e as contratações das ARPs. */
async function loadArpItemsSummary(
	proc: ReturnType<typeof procurement>,
	arpItemIds: string[],
	unitId: number
): Promise<ArpItemsSummary & { arpAcquisitions: string[] }> {
	if (arpItemIds.length === 0) return { ...emptyArpItemsSummary(), arpAcquisitions: [] }
	const { data: itemRows, error: itemError } = await proc
		.from("arp_item")
		.select(
			"id, arp_id, numero_item, descricao_item, ni_fornecedor, nome_fornecedor, valor_unitario, quantidade_homologada, quantidade_empenhada, saldo_empenho, medida_catmat"
		)
		.in("id", arpItemIds)
	if (itemError) throw new Error(`Erro ao conferir os itens da ARP: ${publicDbMessage(itemError)}`)
	const rows = (itemRows ?? []) as EmpenhoArpItemRow[]
	if (rows.length !== arpItemIds.length) throw new Error("Item da ARP não encontrado")
	const arpIds = [...new Set(rows.map((row) => row.arp_id))]
	const { data: arpRows, error: arpError } = await proc
		.from("arp")
		.select("id, unit_id, acquisition_id, data_vigencia_inicio, data_vigencia_fim, last_synced_at, source")
		.in("id", arpIds)
	if (arpError) throw new Error(`Erro ao conferir as ARPs: ${publicDbMessage(arpError)}`)
	const arpById = new Map((arpRows ?? []).map((arp) => [arp.id, arp]))
	// Já empenhado AQUI em NEs ativas: numa ARP cadastrada à mão o saldo oficial é o
	// homologado cheio até a primeira sincronização, e sem o local duas NEs passariam do total.
	const committed = await loadLocalCommitments(arpItemIds)
	const summary = summarizeArpItems(rows, arpById, committed, unitId)
	return { ...summary, arpAcquisitions: collectArpAcquisitions(arpById.values()) }
}

/**
 * Passo 1: confere e resolve a NE, sem gravar. Quem chama já passou pelo guard da unidade (`unit`
 * nível 2 em `data.unitId`); a unidade da contratação e dos itens de ARP é conferida aqui, pela LINHA.
 */
export async function prepareEmpenhoRegistration(data: EmpenhoRegistration): Promise<PreparedEmpenho> {
	const problems = empenhoItemProblems(data.items)
	if (problems.length > 0) throw new Error(problems.map((p) => p.message).join("; "))

	const numero = normalizeEmpenhoNumber(data.numeroEmpenho)
	const proc = procurement()

	// Contratação da mesma unidade — a unidade sai da LINHA, não do corpo.
	const requestedAcquisitionId = data.acquisitionId ?? null
	const acquisitionSupplier = requestedAcquisitionId ? await loadAcquisitionSupplier(proc, requestedAcquisitionId, data.unitId) : null

	// Itens de ARP: todos da unidade; a contratação da ARP vira a da NE quando ela não veio.
	const arpItemIds = collectArpItemIds(data.items)
	const { arpItems, arpUnitByItem, suppliers, supplierName, arpSynced, arpAcquisitions } = await loadArpItemsSummary(proc, arpItemIds, data.unitId)
	const acquisitionId = pickArpAcquisition(requestedAcquisitionId, arpAcquisitions)

	const warnings = checkEmpenhoAgainstArp({ empenhoDate: data.dataEmpenho, items: data.items, arpItems, arpSynced })

	// Favorecido: o informado; senão o da contratação; senão o fornecedor único dos itens da ARP.
	const { favorecidoCnpj14, favorecidoNome } = resolveFavorecido({
		informedCnpj: data.favorecidoCnpj,
		informedNome: data.favorecidoNome,
		acquisitionSupplier,
		suppliers,
		supplierName,
	})
	const valorTotal = sumEmpenhoItems(data.items)

	return { data, numero, valorTotal, acquisitionId, favorecidoCnpj14, favorecidoNome, arpItems, arpUnitByItem, arpItemIds, warnings }
}

/** Passo 2 (dentro do `withSensitiveAudit` da fn): cabeçalho e itens numa transação; devolve o id do `returning`. */
export async function insertPreparedEmpenho(operation: EmpenhoRegistrationOperation, ctx: UserContext, prepared: PreparedEmpenho): Promise<string> {
	const { data, numero, valorTotal, acquisitionId, favorecidoCnpj14, favorecidoNome, arpItems, arpUnitByItem } = prepared
	try {
		return await getDb().transaction(async (tx) => {
			const h = resolveEmpenhoHeaderFields(data)
			const [header] = await tx.execute<{ id: string }>(sql`
				insert into finance.empenho (
					unit_id, numero_empenho, data_empenho, valor_total, tipo, acquisition_id,
					favorecido_cnpj, favorecido_nome, nd, ptres, fonte, issuer_ug, exercicio,
					nota_lancamento, status, origem, created_by
				) values (
					${data.unitId}, ${numero}, ${data.dataEmpenho}::date, ${valorTotal}, ${h.tipo}, ${acquisitionId}::uuid,
					${favorecidoCnpj14}, ${favorecidoNome}, ${h.nd}, ${h.ptres}, ${h.fonte},
					${h.issuerUg}, ${h.exercicio},
					${h.notaLancamento}, 'ativo', 'manual', ${ctx.userId}::uuid
				)
				returning id
			`)
			if (!header) throw new Error("Empenho não retornado após inserção")
			let position = 1
			for (const item of data.items) {
				const v = resolveEmpenhoItemFields(item, arpItems, arpUnitByItem)
				await tx.execute(sql`
					insert into finance.empenho_item (empenho_id, arp_item_id, purchase_item_id, position, description, quantity, unit, unit_price, value)
					values (
						${header.id}::uuid, ${v.arpItemId}::uuid, ${v.purchaseItemId}::uuid, ${position},
						${v.description}, ${v.quantity}, ${v.unit},
						${v.unitPrice}, ${v.value}
					)
				`)
				position++
			}
			return header.id
		})
	} catch (error) {
		throw toEmpenhoWriteError(operation, error, numero)
	}
}

/** Alvo da linha de auditoria (o mesmo nos dois caminhos). */
export function empenhoAuditTarget(prepared: PreparedEmpenho, empenhoId: string) {
	return {
		empenhoId,
		unitId: prepared.data.unitId,
		numeroEmpenho: prepared.numero,
		valorTotal: prepared.valorTotal,
		itens: prepared.data.items.length,
		acquisitionId: prepared.acquisitionId,
		arpItemIds: prepared.arpItemIds,
	}
}

/** Passo 3: religa as NS/OB estacionadas e monta a resposta, sem reler a NE. */
export async function completeEmpenhoRegistration(ctx: UserContext, prepared: PreparedEmpenho, empenhoId: string): Promise<CreatedEmpenho> {
	const relinked = await relinkWaitingRows(prepared.data.unitId, ctx.userId)
	return { empenhoId, numeroEmpenho: prepared.numero, valorTotal: prepared.valorTotal, warnings: prepared.warnings, relinked }
}
