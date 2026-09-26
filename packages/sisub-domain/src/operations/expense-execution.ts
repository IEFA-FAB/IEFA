/**
 * Pendências da execução da despesa (change `sisub-flexible-expense-execution`, D9).
 *
 * O rancho registra o fato — a carne que chegou sem nota, a NE que ninguém importou — e o
 * sistema aponta o que falta para quem corrige depois. Nada aqui é marcado à mão: cada
 * pendência sai dos dados a cada leitura e some quando o dado aparece. O app transforma o
 * status em etapas e pendências com ação (`src/lib/flows/expense-execution.ts` e
 * `receiving-pending.ts`).
 *
 * - Gestão Unidade → fluxo "Executar despesa" (`fetchExpenseExecutionStatus`, `unit:1`).
 * - Estoque → painel "a caminho" (`fetchReceivingPendingStatus`, `storage:1` na cozinha ou
 *   `unit:1` na OM dela).
 *
 * Dependência: lê `procurement.acquisition`, `finance.empenho.acquisition_id` e
 * `finance.empenho_item` (20260926214000, do mesmo change), que a migration deste recurso
 * (20260926215000) já exige aplicadas. As colunas de COMPLETUDE da contratação e a tabela de
 * limites da dispensa são lidas de forma tolerante (`presentColumns`): o nome exato é do outro
 * PR, e coluna ausente vira "sem pendência" em vez de erro.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { hasPermission } from "@iefa/pbac"
import { type SQL, sql } from "drizzle-orm"
import { kitchenUnitIds, loadKitchenUnitRef } from "../guards/kitchen-unit.ts"
import { requireUnit } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"
import { DEFINITIVE_RECEIPT_ROLES, PROVISIONAL_RECEIPT_ROLES } from "./designations.ts"
import type { ReceiptSource } from "./receiving-links.ts"
import { brasiliaToday } from "./stock-math.ts"

// ────────────────────────────────────────────────────────────────────────────
// Recebimento: regras puras
// ────────────────────────────────────────────────────────────────────────────

export const RECEIPT_PENDING_KINDS = [
	"nfe_cancelled",
	"conference_without_inspector",
	"provisional_without_manager",
	"without_invoice",
	"without_empenho",
	"without_supply_order",
	"invoice_check_pending",
	"lines_without_cost",
	"lines_without_invoice_item",
] as const
export type ReceiptPendingKind = (typeof RECEIPT_PENDING_KINDS)[number]
export type PendingSeverity = "blocking" | "warning" | "info"

/** Gravidade de cada pendência. "Bloqueio" é da ETAPA do fluxo, nunca do recebimento. */
export const RECEIPT_PENDING_SEVERITY: Record<ReceiptPendingKind, PendingSeverity> = {
	nfe_cancelled: "blocking",
	conference_without_inspector: "warning",
	provisional_without_manager: "warning",
	without_invoice: "warning",
	without_empenho: "warning",
	without_supply_order: "warning",
	invoice_check_pending: "warning",
	lines_without_cost: "warning",
	lines_without_invoice_item: "info",
}

export interface ReceiptPendingRow {
	receiptId: string
	kitchenId: number
	source: ReceiptSource
	status: string
	createdAt: string
	provisionalAt: string | null
	definitiveAt: string | null
	/** "Guia 1234", "NF-e 000123456", "Entrega sem documento". */
	reference: string
	supplierName: string | null
	/** A entrega terá NF-e? Falso na remessa de depósito e no apoio de outra OM. */
	invoiceExpected: boolean
	nfeDocumentId: string | null
	supplyOrderId: string | null
	empenhoId: string | null
	nfeSituationResult: string | null
	nfeSituationCheckedAt: string | null
	invoiceCheckDeferredAt: string | null
	lines: number
	linesWithoutCost: number
	linesWithoutInvoiceItem: number
	liquidated: boolean
	/** Alguém tem designação vigente de fiscal (ou gestor, ou comissão) que cobre esta entrega. */
	hasProvisionalDesignation: boolean
	/** Alguém tem designação vigente de gestor ou comissão que cobre esta entrega. */
	hasDefinitiveDesignation: boolean
}

/** Entrega atestada: efetivada. O recusado não tem `definitive_at` (CHECK de 20260926205000). */
const isAttested = (row: Pick<ReceiptPendingRow, "definitiveAt">) => row.definitiveAt != null

/**
 * O que falta num recebimento. Recusado não tem pendência: a entrega não foi aceita.
 *
 * - Conferência física registrada sem fiscal designado para a entrega: o provisório (art. 140,
 *   II, a) espera a designação; nada da conferência se perde.
 * - Provisório feito sem gestor nem comissão designada: o definitivo (art. 140, II, b) espera.
 * - Entrega de compra sem NF-e, sem empenho (Lei 4.320, art. 60) ou sem OF.
 * - Efetivada com a SEFAZ fora do ar, e sem consulta autorizada DEPOIS: a liquidação ainda
 *   vai exigir a consulta recente; a pendência avisa antes.
 * - NF-e cancelada depois da efetivação: não se liquida; é caso de nota substituta.
 */
export function receiptPendingKinds(row: ReceiptPendingRow): ReceiptPendingKind[] {
	if (row.status === "rejected") return []
	const kinds: ReceiptPendingKind[] = []
	const attested = isAttested(row)
	if (row.nfeDocumentId && row.nfeSituationResult === "cancelled") kinds.push("nfe_cancelled")
	if (row.status === "draft" && row.lines > 0 && !row.hasProvisionalDesignation) kinds.push("conference_without_inspector")
	if (row.status === "provisional" && !attested && !row.hasDefinitiveDesignation) kinds.push("provisional_without_manager")
	if (row.invoiceExpected) {
		if (!row.nfeDocumentId) kinds.push("without_invoice")
		if (!row.empenhoId) kinds.push("without_empenho")
		if (!row.supplyOrderId) kinds.push("without_supply_order")
	}
	if (attested && row.nfeDocumentId && row.invoiceCheckDeferredAt && row.nfeSituationResult !== "cancelled") {
		const checkedAfter =
			row.nfeSituationResult === "authorized" &&
			row.nfeSituationCheckedAt != null &&
			new Date(row.nfeSituationCheckedAt).getTime() > new Date(row.invoiceCheckDeferredAt).getTime()
		if (!checkedAfter) kinds.push("invoice_check_pending")
	}
	if (attested && row.linesWithoutCost > 0) kinds.push("lines_without_cost")
	if (row.nfeDocumentId && row.linesWithoutInvoiceItem > 0) kinds.push("lines_without_invoice_item")
	return kinds
}

export type ReceiptPendingCounts = Record<ReceiptPendingKind, number>

export function emptyReceiptPendingCounts(): ReceiptPendingCounts {
	return Object.fromEntries(RECEIPT_PENDING_KINDS.map((kind) => [kind, 0])) as ReceiptPendingCounts
}

/** Quantos recebimentos têm cada pendência. */
export function countReceiptPending(rows: readonly ReceiptPendingRow[]): ReceiptPendingCounts {
	const counts = emptyReceiptPendingCounts()
	for (const row of rows) for (const kind of receiptPendingKinds(row)) counts[kind]++
	return counts
}

// ────────────────────────────────────────────────────────────────────────────
// Leitura
// ────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
const num = (value: unknown): number => (value == null ? 0 : Number(value))
const str = (value: unknown): string | null => (value == null ? null : String(value))
const iso = (value: unknown): string | null => (value == null ? null : value instanceof Date ? value.toISOString() : String(value))
const textArray = (roles: readonly string[]) =>
	sql`array[${sql.join(
		roles.map((role) => sql`${role}`),
		sql`, `
	)}]::text[]`

/**
 * Quais das colunas `schema.tabela.coluna` existem. Lê o catálogo, não `information_schema`
 * (que esconde o que o papel não alcança).
 */
async function presentColumns(db: SisubDb, keys: readonly string[]): Promise<Set<string>> {
	if (keys.length === 0) return new Set()
	const rows = (await runQuery(
		"QUERY_FAILED",
		() =>
			db.execute(sql`
				select c.key
				from (values ${sql.join(
					keys.map((key) => sql`(${key})`),
					sql`, `
				)}) as c(key)
				where exists (
					select 1 from pg_attribute a
					where a.attrelid = to_regclass(split_part(c.key, '.', 1) || '.' || split_part(c.key, '.', 2))
						and a.attname = split_part(c.key, '.', 3) and a.attnum > 0 and not a.attisdropped
				)
			`),
		{ prefix: "Erro ao ler o catálogo do banco" }
	)) as unknown as Row[]
	return new Set(rows.map((r) => String(r.key)))
}

/** Recebimentos das cozinhas: os abertos, e os efetivados nos últimos 90 dias. */
async function loadReceiptRows(db: SisubDb, kitchenIds: readonly number[]): Promise<ReceiptPendingRow[]> {
	if (kitchenIds.length === 0) return []
	const rows = (await runQuery(
		"QUERY_FAILED",
		() =>
			db.execute(sql`
				select gr.id, gr.kitchen_id, gr.source, gr.status, gr.created_at, gr.provisional_at, gr.definitive_at,
					gr.delivery_note_number, gr.supplier_name, gr.invoice_expected, gr.nfe_document_id, gr.supply_order_id, gr.empenho_id,
					gr.invoice_check_deferred_at, n.access_key, n.situation_result, n.situation_checked_at,
					(select count(*) from inventory.goods_receipt_item i where i.receipt_id = gr.id) as lines,
					(select count(*) from inventory.goods_receipt_item i
						where i.receipt_id = gr.id and i.received_qty_base > 0 and i.unit_cost is null) as lines_without_cost,
					(select count(*) from inventory.goods_receipt_item i
						where i.receipt_id = gr.id and gr.nfe_document_id is not null and i.nfe_item_id is null) as lines_without_invoice_item,
					exists (select 1 from finance.liquidacao l where l.goods_receipt_id = gr.id or l.id = gr.liquidacao_id) as liquidated,
					exists (select 1 from inventory.designations_covering(coalesce(k.purchase_unit_id, k.unit_id), gr.empenho_id,
						${textArray(PROVISIONAL_RECEIPT_ROLES)})) as has_provisional_designation,
					exists (select 1 from inventory.designations_covering(coalesce(k.purchase_unit_id, k.unit_id), gr.empenho_id,
						${textArray(DEFINITIVE_RECEIPT_ROLES)})) as has_definitive_designation
				from inventory.goods_receipt gr
				join kitchen.kitchen k on k.id = gr.kitchen_id
				left join inventory.nfe_document n on n.id = gr.nfe_document_id
				where gr.kitchen_id in (${sql.join(
					kitchenIds.map((id) => sql`${id}`),
					sql`, `
				)})
					and gr.status <> 'rejected'
					and (gr.definitive_at is null or gr.definitive_at > now() - interval '90 days')
				order by gr.created_at desc
				limit 500
			`),
		{ prefix: "Erro ao ler os recebimentos" }
	)) as unknown as Row[]
	return rows.map((r) => {
		const source = String(r.source) as ReceiptSource
		const reference =
			r.access_key != null
				? `NF-e ${String(r.access_key).slice(25, 34)}`
				: source === "delivery_note" && r.delivery_note_number
					? `Guia ${String(r.delivery_note_number)}`
					: source === "nfe"
						? "NF-e"
						: "Entrega sem documento"
		return {
			receiptId: String(r.id),
			kitchenId: num(r.kitchen_id),
			source,
			status: String(r.status),
			createdAt: iso(r.created_at) as string,
			provisionalAt: iso(r.provisional_at),
			definitiveAt: iso(r.definitive_at),
			reference,
			supplierName: str(r.supplier_name),
			invoiceExpected: r.invoice_expected == null ? true : Boolean(r.invoice_expected),
			nfeDocumentId: str(r.nfe_document_id),
			supplyOrderId: str(r.supply_order_id),
			empenhoId: str(r.empenho_id),
			nfeSituationResult: str(r.situation_result),
			nfeSituationCheckedAt: iso(r.situation_checked_at),
			invoiceCheckDeferredAt: iso(r.invoice_check_deferred_at),
			lines: num(r.lines),
			linesWithoutCost: num(r.lines_without_cost),
			linesWithoutInvoiceItem: num(r.lines_without_invoice_item),
			liquidated: Boolean(r.liquidated),
			hasProvisionalDesignation: Boolean(r.has_provisional_designation),
			hasDefinitiveDesignation: Boolean(r.has_definitive_designation),
		}
	})
}

export interface ReceivingPendingStatus {
	kitchenId: number
	today: string
	/** Só os recebimentos com alguma pendência, do mais recente ao mais antigo. */
	receipts: Array<ReceiptPendingRow & { pending: ReceiptPendingKind[] }>
	counts: ReceiptPendingCounts
	/** Quem lê pode designar ali mesmo (`unit:2` numa OM da cozinha). */
	canDesignate: boolean
}

export async function fetchReceivingPendingStatus(db: SisubDb, ctx: UserContext, input: { kitchenId: number }): Promise<ReceivingPendingStatus> {
	const kitchen = await loadKitchenUnitRef(db, input.kitchenId)
	const unitIds = kitchenUnitIds(kitchen)
	const reachesByStorage = hasPermission(ctx.permissions, "storage", 1, { type: "kitchen", id: input.kitchenId })
	const reachesByUnit = unitIds.some((unitId) => hasPermission(ctx.permissions, "unit", 1, { type: "unit", id: unitId }))
	if (!reachesByStorage && !reachesByUnit) throw new PermissionDeniedError("storage | unit", 1, { type: "kitchen", id: input.kitchenId })

	const rows = await loadReceiptRows(db, [input.kitchenId])
	const receipts = rows.map((row) => ({ ...row, pending: receiptPendingKinds(row) })).filter((row) => row.pending.length > 0)
	return {
		kitchenId: input.kitchenId,
		today: brasiliaToday(),
		receipts,
		counts: countReceiptPending(rows),
		canDesignate: unitIds.some((unitId) => hasPermission(ctx.permissions, "unit", 2, { type: "unit", id: unitId })),
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Unidade: fluxo "Executar despesa"
// ────────────────────────────────────────────────────────────────────────────

/** O que falta numa contratação para ela ficar completa (D1). Nunca impede o uso. */
export const ACQUISITION_MISSING_LABELS = {
	legal_basis: "fundamento legal",
	supplier: "fornecedor",
	validity: "vigência",
} as const
export type AcquisitionMissing = keyof typeof ACQUISITION_MISSING_LABELS

export interface IncompleteAcquisition {
	id: string
	kind: string
	title: string
	missing: AcquisitionMissing[]
}

export interface SiafiWaitingGroup {
	reportType: "ns" | "ob"
	count: number
	/** Número do documento pai que falta (NE para a NS, NS para a OB), quando o lote o traz. */
	parents: string[]
}

/** Agrupa as linhas estacionadas do SIAFI pelo tipo e pelo documento pai que falta. */
export function groupSiafiWaiting(rows: ReadonlyArray<{ reportType: string; parent: string | null }>): SiafiWaitingGroup[] {
	const groups = new Map<"ns" | "ob", { count: number; parents: Set<string> }>()
	for (const row of rows) {
		if (row.reportType !== "ns" && row.reportType !== "ob") continue
		const group = groups.get(row.reportType) ?? { count: 0, parents: new Set<string>() }
		group.count++
		if (row.parent?.trim()) group.parents.add(row.parent.trim().toUpperCase())
		groups.set(row.reportType, group)
	}
	return (["ns", "ob"] as const)
		.filter((type) => groups.has(type))
		.map((type) => {
			const group = groups.get(type) as { count: number; parents: Set<string> }
			return { reportType: type, count: group.count, parents: [...group.parents].sort() }
		})
}

export interface ExpenseExecutionStatus {
	unitId: number
	today: string
	kitchens: Array<{ id: number; name: string; counts: ReceiptPendingCounts }>
	/** NE sem contratação de origem: sem `acquisition_id` e sem item de ARP. */
	empenhosWithoutOrigin: { count: number; sample: Array<{ id: string; number: string; value: number; supplier: string | null }> }
	/** `null` quando o banco ainda não tem as colunas de completude (leitura tolerante). */
	incompleteAcquisitions: { count: number; sample: IncompleteAcquisition[] } | null
	/** Dispensa sem valor nenhum (nem estimado, nem NE): o somatório do art. 75, § 1º, fica incompleto. */
	dispensasWithoutValue: number | null
	/**
	 * Dispensa acima do limite sem justificativa. `null` enquanto a regra pura do somatório
	 * (outro PR do change, D7) não estiver no domínio.
	 * TODO: ligar à regra do somatório da dispensa quando ela for exportada.
	 */
	dispensasOverLimitWithoutJustification: number | null
	/** Nenhum limite de dispensa com vigência no exercício (`null` = tabela ainda ausente). */
	dispensaLimitMissing: boolean | null
	supplyOrdersWithoutEmpenho: Array<{ id: string; number: string | null; kitchenName: string; sentAt: string | null }>
	designations: { provisional: number; definitive: number }
	siafiWaiting: SiafiWaitingGroup[]
	/** Recebimento atestado sem liquidação (conciliação físico × contábil). */
	unliquidated: { count: number; oldestDays: number | null; divergent: number }
}

const ACQUISITION_COMPLETENESS_COLUMNS = [
	"procurement.acquisition.kind",
	"procurement.acquisition.legal_basis",
	"procurement.acquisition.supplier_cnpj",
	"procurement.acquisition.supplier_name",
	"procurement.acquisition.valid_to",
	"procurement.acquisition.object",
	"procurement.acquisition.estimated_value",
	"procurement.direct_contract_limit.valid_from",
] as const

export async function fetchExpenseExecutionStatus(db: SisubDb, ctx: UserContext, input: { unitId: number }): Promise<ExpenseExecutionStatus> {
	requireUnit(ctx, 1, input.unitId)
	const unitId = input.unitId
	const today = brasiliaToday()

	const kitchens = (await runQuery(
		"QUERY_FAILED",
		() =>
			db.execute(sql`
				select k.id, coalesce(k.display_name, 'Cozinha ' || k.id) as name
				from kitchen.kitchen k
				where k.unit_id = ${unitId} or k.purchase_unit_id = ${unitId}
				order by name
			`),
		{ prefix: "Erro ao ler as cozinhas" }
	)) as unknown as Row[]
	const kitchenIds = kitchens.map((k) => num(k.id))
	const kitchenFilter: SQL = kitchenIds.length
		? sql`in (${sql.join(
				kitchenIds.map((id) => sql`${id}`),
				sql`, `
			)})`
		: sql`in (null)`

	const columns = await presentColumns(db, ACQUISITION_COMPLETENESS_COLUMNS)
	const has = (key: (typeof ACQUISITION_COMPLETENESS_COLUMNS)[number]) => columns.has(key)
	const completenessReadable =
		has("procurement.acquisition.kind") &&
		has("procurement.acquisition.legal_basis") &&
		has("procurement.acquisition.supplier_cnpj") &&
		has("procurement.acquisition.supplier_name") &&
		has("procurement.acquisition.valid_to")

	const [receipts, empenhoRows, acquisitionRows, dispensaRows, limitRows, orderRows, designationRows, siafiRows, unliquidatedRows] = await Promise.all([
		loadReceiptRows(db, kitchenIds),
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select e.id, e.numero_empenho, e.valor_total, e.favorecido_nome, count(*) over () as total
					from finance.empenho e
					where e.unit_id = ${unitId} and e.status <> 'anulado'
						and e.acquisition_id is null and e.arp_item_id is null
						and not exists (select 1 from finance.empenho_item ei where ei.empenho_id = e.id and ei.arp_item_id is not null)
					order by e.data_empenho desc, e.numero_empenho
					limit 20
				`),
			{ prefix: "Erro ao ler os empenhos sem contratação" }
		) as unknown as Promise<Row[]>,
		completenessReadable
			? (runQuery(
					"QUERY_FAILED",
					() =>
						db.execute(sql`
							select a.id, a.kind, ${has("procurement.acquisition.object") ? sql`a.object` : sql`null::text`} as title,
								a.legal_basis is null or btrim(a.legal_basis) = '' as without_legal_basis,
								a.supplier_cnpj is null and (a.supplier_name is null or btrim(a.supplier_name) = '') as without_supplier,
								a.valid_to is null as without_validity,
								count(*) over () as total
							from procurement.acquisition a
							where a.unit_id = ${unitId}
								and (a.legal_basis is null or btrim(a.legal_basis) = ''
									or (a.supplier_cnpj is null and (a.supplier_name is null or btrim(a.supplier_name) = ''))
									or a.valid_to is null)
							order by a.valid_to nulls first
							limit 20
						`),
					{ prefix: "Erro ao ler as contratações incompletas" }
				) as unknown as Promise<Row[]>)
			: Promise.resolve(null),
		has("procurement.acquisition.kind") && has("procurement.acquisition.estimated_value")
			? (runQuery(
					"QUERY_FAILED",
					() =>
						db.execute(sql`
							select count(*) as total
							from procurement.acquisition a
							where a.unit_id = ${unitId} and a.kind = 'dispensa' and a.estimated_value is null
								and not exists (select 1 from finance.empenho e where e.acquisition_id = a.id and e.status <> 'anulado')
						`),
					{ prefix: "Erro ao ler as dispensas" }
				) as unknown as Promise<Row[]>)
			: Promise.resolve(null),
		has("procurement.direct_contract_limit.valid_from")
			? (runQuery(
					"QUERY_FAILED",
					() =>
						db.execute(sql`
							select exists (
								select 1 from procurement.direct_contract_limit l
								where extract(year from l.valid_from) = ${Number(today.slice(0, 4))}
							) as present
						`),
					{ prefix: "Erro ao ler os limites da dispensa" }
				) as unknown as Promise<Row[]>)
			: Promise.resolve(null),
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select so.id, so.number, so.sent_at, coalesce(k.display_name, 'Cozinha ' || k.id) as kitchen_name
					from procurement.supply_order so
					join kitchen.kitchen k on k.id = so.kitchen_id
					where so.kitchen_id ${kitchenFilter} and so.empenho_id is null and so.status not in ('draft', 'cancelled')
					order by so.sent_at nulls last
					limit 50
				`),
			{ prefix: "Erro ao ler as ordens de fornecimento sem empenho" }
		) as unknown as Promise<Row[]>,
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select
						count(*) filter (where d.role = any(${textArray(PROVISIONAL_RECEIPT_ROLES)})) as provisional,
						count(*) filter (where d.role = any(${textArray(DEFINITIVE_RECEIPT_ROLES)})) as definitive
					from procurement.contract_designation d
					where d.unit_id = ${unitId}
						and d.valid_from <= ${today}::date and (d.valid_to is null or d.valid_to >= ${today}::date)
				`),
			{ prefix: "Erro ao ler as designações" }
		) as unknown as Promise<Row[]>,
		runQuery(
			"QUERY_FAILED",
			() =>
				// TODO: a chave do documento pai é do PR do SIAFI (D4); lidas as duas grafias.
				db.execute(sql`
					select b.report_type,
						case b.report_type
							when 'ns' then coalesce(r.parsed ->> 'numero_ne', r.parsed ->> 'numero_empenho')
							else r.parsed ->> 'numero_ns'
						end as parent
					from siafi_integration.import_row r
					join siafi_integration.import_batch b on b.id = r.batch_id
					where b.unit_id = ${unitId} and r.parse_status = 'waiting_parent'
					limit 500
				`),
			{ prefix: "Erro ao ler as linhas do SIAFI aguardando" }
		) as unknown as Promise<Row[]>,
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select count(*) filter (where v.situacao = 'sem_liquidacao') as unliquidated,
						max(v.dias_desde_recebimento) filter (where v.situacao = 'sem_liquidacao') as oldest,
						count(*) filter (where v.situacao = 'valor_divergente') as divergent
					from finance.v_physical_accounting_reconciliation v
					where v.kitchen_id ${kitchenFilter}
				`),
			{ prefix: "Erro ao ler a conciliação físico × contábil" }
		) as unknown as Promise<Row[]>,
	])

	const receiptsByKitchen = new Map<number, ReceiptPendingRow[]>()
	for (const row of receipts) receiptsByKitchen.set(row.kitchenId, [...(receiptsByKitchen.get(row.kitchenId) ?? []), row])

	const designations = designationRows[0] ?? {}
	const unliquidated = unliquidatedRows[0] ?? {}

	return {
		unitId,
		today,
		kitchens: kitchens.map((k) => ({ id: num(k.id), name: String(k.name), counts: countReceiptPending(receiptsByKitchen.get(num(k.id)) ?? []) })),
		empenhosWithoutOrigin: {
			count: num(empenhoRows[0]?.total),
			sample: empenhoRows.map((r) => ({ id: String(r.id), number: String(r.numero_empenho), value: num(r.valor_total), supplier: str(r.favorecido_nome) })),
		},
		incompleteAcquisitions: acquisitionRows
			? {
					count: num(acquisitionRows[0]?.total),
					sample: acquisitionRows.map((r) => ({
						id: String(r.id),
						kind: String(r.kind),
						title: str(r.title) ?? "Contratação sem objeto",
						missing: [
							...(r.without_legal_basis ? (["legal_basis"] as const) : []),
							...(r.without_supplier ? (["supplier"] as const) : []),
							...(r.without_validity ? (["validity"] as const) : []),
						],
					})),
				}
			: null,
		dispensasWithoutValue: dispensaRows ? num(dispensaRows[0]?.total) : null,
		dispensasOverLimitWithoutJustification: null,
		dispensaLimitMissing: limitRows ? !limitRows[0]?.present : null,
		supplyOrdersWithoutEmpenho: orderRows.map((r) => ({
			id: String(r.id),
			number: str(r.number),
			kitchenName: String(r.kitchen_name),
			sentAt: str(r.sent_at),
		})),
		designations: { provisional: num(designations.provisional), definitive: num(designations.definitive) },
		siafiWaiting: groupSiafiWaiting(siafiRows.map((r) => ({ reportType: String(r.report_type), parent: str(r.parent) }))),
		unliquidated: {
			count: num(unliquidated.unliquidated),
			oldestDays: unliquidated.oldest == null ? null : num(unliquidated.oldest),
			divergent: num(unliquidated.divergent),
		},
	}
}
