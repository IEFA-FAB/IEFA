/**
 * Pendências da execução da despesa (change `sisub-flexible-expense-execution`, D9).
 *
 * A unidade registra o fato — a carne que chegou sem nota, a NE que ninguém importou — e o
 * sistema aponta o que falta para quem corrige depois. Nada aqui é marcado à mão: cada
 * pendência sai dos dados a cada leitura e some quando o dado aparece. O app transforma o
 * status em etapas e pendências com ação (`src/lib/flows/expense-execution.ts` e
 * `receiving-pending.ts`).
 *
 * - Gestão Unidade → fluxo "Executar despesa" (`fetchExpenseExecutionStatus`, `unit:1`).
 * - Estoque → painel "a caminho" (`fetchReceivingPendingStatus`, `storage:1` na cozinha ou
 *   `unit:1` na OM dela).
 *
 * Lê `procurement.acquisition`, `procurement.direct_contract_limit`, `finance.empenho_item` e
 * as linhas estacionadas do SIAFI (20260926214000), com as regras puras do PR da contratação de
 * origem (`acquisition.ts`): a completude e o somatório da dispensa são os da tela de
 * contratações.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { hasPermission } from "@iefa/pbac"
import { type SQL, sql } from "drizzle-orm"
import { kitchenUnitIds, loadKitchenUnitRef } from "../guards/kitchen-unit.ts"
import { requireUnit } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"
import {
	ACQUISITION_KIND_LABEL,
	type AcquisitionFacts,
	type AcquisitionKind,
	acquisitionGaps,
	computeDispensaSum,
	DIRECT_CONTRACT_VALUE_CLAUSES,
	type DirectContractLimitRow,
	type DispensaEntry,
	describeAcquisitionGaps,
	dispensaValue,
	isValueDispensa,
	resolveDirectContractLimit,
} from "./acquisition.ts"
import { canDesignateInUnit, DEFINITIVE_RECEIPT_ROLES, type DesignationRole, PROVISIONAL_RECEIPT_ROLES } from "./designations.ts"
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
const textArray = (roles: readonly DesignationRole[]) =>
	sql`array[${sql.join(
		roles.map((role) => sql`${role}`),
		sql`, `
	)}]::text[]`

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
		canDesignate: canDesignateInUnit(ctx.permissions, kitchen.purchaseUnitId ?? kitchen.unitId),
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Unidade: fluxo "Executar despesa"
// ────────────────────────────────────────────────────────────────────────────

export interface IncompleteAcquisition {
	id: string
	kind: AcquisitionKind
	/** "Dispensa sem fundamento legal e sem vigência" (`describeAcquisitionGaps`). */
	summary: string
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

/** Contratação como a leitura do fluxo a traz: os fatos da completude, o empenhado e o rótulo. */
export interface AcquisitionForStatus extends AcquisitionFacts {
	id: string
	label: string
	fiscalYear: number
	/** Soma do valor vigente das NEs vinculadas. */
	committedValue: number
}

export interface AcquisitionsSummary {
	incomplete: { count: number; sample: IncompleteAcquisition[] }
	/** Dispensa por valor sem valor nenhum: o somatório do art. 75, § 1º, vira piso. */
	dispensasWithoutValue: number
	/** Dispensa cujo somatório passou do limite e ainda sem a justificativa gravada. */
	dispensasOverLimitWithoutJustification: number
	/** Algum inciso (I, II) sem limite com vigência iniciada no exercício. */
	dispensaLimitMissing: boolean
}

/**
 * As pendências das contratações da OM, com as regras do PR da contratação de origem
 * (`acquisitionGaps`, `computeDispensaSum`, `resolveDirectContractLimit`): a mesma conta que a
 * tela de contratações mostra, para o fluxo não dizer outra coisa.
 */
export function summarizeAcquisitions(
	acquisitions: readonly AcquisitionForStatus[],
	limits: readonly DirectContractLimitRow[],
	fiscalYear: number
): AcquisitionsSummary {
	const entries: DispensaEntry[] = acquisitions.map((a) => ({
		id: a.id,
		label: a.label,
		kind: a.kind,
		directContractClause: a.directContractClause,
		fiscalYear: a.fiscalYear,
		activityLine: a.activityLine,
		nd: a.nd,
		estimatedValue: a.estimatedValue,
		committedValue: a.committedValue,
	}))
	const incomplete: IncompleteAcquisition[] = []
	let withoutValue = 0
	let overLimit = 0
	acquisitions.forEach((acquisition, index) => {
		const entry = entries[index] as DispensaEntry
		const sum = isValueDispensa(acquisition)
			? computeDispensaSum({
					candidate: entry,
					others: entries,
					limit: resolveDirectContractLimit(limits, acquisition.directContractClause as string, acquisition.fiscalYear),
				})
			: null
		if (isValueDispensa(acquisition) && dispensaValue(entry) == null) withoutValue++
		const exceeded = sum?.exceeded ?? false
		if (exceeded && !acquisition.overLimitJustification?.trim()) overLimit++
		const summary = describeAcquisitionGaps(acquisition.kind, acquisitionGaps(acquisition, { overLimit: exceeded }))
		if (summary) incomplete.push({ id: acquisition.id, kind: acquisition.kind, summary })
	})
	const dispensaLimitMissing = DIRECT_CONTRACT_VALUE_CLAUSES.some((clause) => resolveDirectContractLimit(limits, clause, fiscalYear).isOutdated)
	return {
		incomplete: { count: incomplete.length, sample: incomplete.slice(0, 20) },
		dispensasWithoutValue: withoutValue,
		dispensasOverLimitWithoutJustification: overLimit,
		dispensaLimitMissing,
	}
}

export interface ExpenseExecutionStatus extends AcquisitionsSummary {
	unitId: number
	today: string
	kitchens: Array<{ id: number; name: string; counts: ReceiptPendingCounts }>
	/** NE sem contratação de origem (`isEmpenhoWithoutOrigin`): sem `acquisition_id` e sem item de ARP. */
	empenhosWithoutOrigin: { count: number; sample: Array<{ id: string; number: string; value: number; supplier: string | null }> }
	supplyOrdersWithoutEmpenho: Array<{ id: string; number: string | null; kitchenName: string; sentAt: string | null }>
	designations: { provisional: number; definitive: number }
	siafiWaiting: SiafiWaitingGroup[]
	/** Recebimento atestado sem liquidação (conciliação físico × contábil). */
	unliquidated: { count: number; oldestDays: number | null; divergent: number }
}

const dateText = (value: unknown): string | null =>
	value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
const numOrNull = (value: unknown): number | null => (value == null ? null : Number(value))

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

	const [receipts, empenhoRows, acquisitionRows, limitRows, orderRows, designationRows, siafiRows, unliquidatedRows] = await Promise.all([
		loadReceiptRows(db, kitchenIds),
		runQuery(
			"QUERY_FAILED",
			() =>
				// A regra de `isEmpenhoWithoutOrigin` (empenho-conformity.ts), em SQL: sem contratação
				// e sem nenhum item da NE com item de ARP.
				db.execute(sql`
					select e.id, e.numero_empenho, e.valor_total, e.favorecido_nome, count(*) over () as total
					from finance.empenho e
					where e.unit_id = ${unitId} and e.status <> 'anulado'
						and e.acquisition_id is null
						and not exists (select 1 from finance.empenho_item ei where ei.empenho_id = e.id and ei.arp_item_id is not null)
					order by e.data_empenho desc, e.numero_empenho
					limit 20
				`),
			{ prefix: "Erro ao ler os empenhos sem contratação de origem" }
		) as unknown as Promise<Row[]>,
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select a.id, a.kind, a.srp_role, a.legal_basis, a.direct_contract_clause, a.nd, a.activity_line, a.object,
						a.supplier_cnpj, a.supplier_name, a.valid_from, a.valid_to, a.estimated_value, a.over_limit_justification,
						a.fiscal_year, a.process_nup,
						coalesce((select sum(v.valor_vigente) from finance.empenho e
							join finance.v_empenho_vigente v on v.empenho_id = e.id
							where e.acquisition_id = a.id and e.status <> 'anulado'), 0) as committed_value
					from procurement.acquisition a
					where a.unit_id = ${unitId} and a.deleted_at is null
					order by a.created_at desc
					limit 1000
				`),
			{ prefix: "Erro ao ler as contratações" }
		) as unknown as Promise<Row[]>,
		runQuery("QUERY_FAILED", () => db.execute(sql`select clause, valid_from, value, source_act from procurement.direct_contract_limit order by valid_from`), {
			prefix: "Erro ao ler os limites da dispensa",
		}) as unknown as Promise<Row[]>,
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
				// Mesma chave do documento pai que `siafi_integration.apply_document_row` usa para
				// estacionar (20260926214000): NS → `ne_origem`/`numero_ne`; OB → `ns_origem`/`numero_ns`.
				db.execute(sql`
					select b.report_type,
						case b.report_type
							when 'ns' then coalesce(r.parsed ->> 'ne_origem', r.parsed ->> 'numero_ne')
							else coalesce(r.parsed ->> 'ns_origem', r.parsed ->> 'numero_ns')
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

	const acquisitions: AcquisitionForStatus[] = acquisitionRows.map((r) => {
		const kind = String(r.kind) as AcquisitionKind
		const detail = str(r.object) ?? str(r.supplier_name) ?? str(r.process_nup)
		return {
			id: String(r.id),
			label: detail ? `${ACQUISITION_KIND_LABEL[kind]} — ${detail}` : ACQUISITION_KIND_LABEL[kind],
			kind,
			srpRole: (str(r.srp_role) as AcquisitionFacts["srpRole"]) ?? null,
			legalBasis: str(r.legal_basis),
			directContractClause: str(r.direct_contract_clause),
			nd: str(r.nd),
			activityLine: str(r.activity_line),
			object: str(r.object),
			supplierCnpj: str(r.supplier_cnpj),
			supplierName: str(r.supplier_name),
			validFrom: dateText(r.valid_from),
			validTo: dateText(r.valid_to),
			estimatedValue: numOrNull(r.estimated_value),
			overLimitJustification: str(r.over_limit_justification),
			fiscalYear: num(r.fiscal_year),
			committedValue: num(r.committed_value),
		}
	})
	const limits: DirectContractLimitRow[] = limitRows.map((r) => ({
		clause: String(r.clause),
		validFrom: dateText(r.valid_from) as string,
		value: num(r.value),
		sourceAct: String(r.source_act),
	}))

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
		...summarizeAcquisitions(acquisitions, limits, Number(today.slice(0, 4))),
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
