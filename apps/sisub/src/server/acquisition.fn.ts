/**
 * @module acquisition.fn
 * Contratação de origem (change `sisub-flexible-expense-execution`, D1 e D7): de onde vem o
 * direito de gastar — ata, contrato, dispensa, inexigibilidade, Contrata+Brasil, suprimento de
 * fundos. Nasce incompleta; o que falta é pendência. Dispensa por valor mostra o somatório do
 * exercício no ramo de atividade (Lei 14.133/2021, art. 75, § 1º; IN SEGES/ME 67/2021, art. 4º)
 * contra o limite vigente da tabela, e passar do limite pede justificativa, nunca recusa.
 * CLIENT: getServerClient (service role, schemas procurement/finance/compras_gov_integration).
 * AUTH: `unit` escopado — 1 leitura, 2 escrita; a unidade de uma linha sai da linha.
 * TABLES: procurement.acquisition, procurement.direct_contract_limit, procurement.arp,
 *   finance.empenho, finance.empenho_item, finance.v_empenho_vigente.
 * @domain core
 * @migration 20260926214000_acquisition_origin
 */

import type { TableRow } from "@iefa/database"
import {
	ACQUISITION_INSTRUMENTS,
	ACQUISITION_KIND_LABEL,
	ACQUISITION_KINDS,
	type AcquisitionFacts,
	type AcquisitionGap,
	type AcquisitionKind,
	acquisitionGaps,
	computeDispensaSum,
	type DirectContractLimitRow,
	type DispensaEntry,
	type DispensaSum,
	describeAcquisitionGaps,
	describeDispensaSum,
	isEmpenhoWithoutOrigin,
	resolveDirectContractLimit,
	SRP_ROLES,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { loadUnitExecution } from "@/lib/acquisition-execution"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth } from "@/lib/auth.server"
import { publicDbMessage } from "@/lib/db-error-message"
import { currentFiscalYear } from "@/lib/expense-execution"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

const procurement = () => getServerClient("procurement")
const finance = () => getServerClient("finance")
const comprasGov = () => getServerClient("compras_gov_integration")

const ACQUISITION_COLUMNS = [
	"id",
	"unit_id",
	"kind",
	"srp_role",
	"instrument",
	"legal_basis",
	"direct_contract_clause",
	"nd",
	"activity_line",
	"fiscal_year",
	"process_nup",
	"object",
	"supplier_cnpj",
	"supplier_name",
	"valid_from",
	"valid_to",
	"estimated_value",
	"pncp_control_number",
	"over_limit_justification",
	"notes",
	"created_at",
	"deleted_at",
] as const

/**
 * Linha de `procurement.acquisition` como `ACQUISITION_COLUMNS` a lê. O tipo gerado tem `kind`,
 * `srp_role` e `instrument` como `string`; os CHECKs do banco restringem aos valores do domínio.
 */
type AcquisitionRow = Omit<Pick<TableRow<"procurement", "acquisition">, (typeof ACQUISITION_COLUMNS)[number]>, "kind" | "srp_role" | "instrument"> & {
	kind: AcquisitionKind
	srp_role: (typeof SRP_ROLES)[number] | null
	instrument: (typeof ACQUISITION_INSTRUMENTS)[number] | null
}

export interface AcquisitionEmpenhoRef {
	id: string
	numeroEmpenho: string
	dataEmpenho: string
	valorVigente: number
	status: string
}

export interface AcquisitionArpRef {
	id: string
	numeroAta: string
	uasgGerenciadora: string
	nomeUasgGerenciadora: string | null
	source: "compras_gov" | "manual"
	lastSyncedAt: string | null
	quantityEstimateId: string | null
	vigenciaFim: string | null
	itemCount: number
}

export interface AcquisitionView {
	id: string
	unitId: number
	kind: AcquisitionKind
	kindLabel: string
	srpRole: AcquisitionRow["srp_role"]
	instrument: AcquisitionRow["instrument"]
	legalBasis: string | null
	directContractClause: string | null
	nd: string | null
	activityLine: string | null
	activityLineName: string | null
	fiscalYear: number
	processNup: string | null
	object: string | null
	supplierCnpj: string | null
	supplierName: string | null
	validFrom: string | null
	validTo: string | null
	estimatedValue: number | null
	pncpControlNumber: string | null
	overLimitJustification: string | null
	notes: string | null
	committedValue: number
	empenhos: AcquisitionEmpenhoRef[]
	arps: AcquisitionArpRef[]
	gaps: AcquisitionGap[]
	/** "Dispensa sem fundamento legal e sem vigência" — null quando completa. */
	gapsSummary: string | null
	dispensaSum: DispensaSum | null
	dispensaWarning: string | null
}

export interface EmpenhoWithoutOrigin {
	id: string
	numeroEmpenho: string
	dataEmpenho: string
	valorVigente: number
	favorecidoNome: string | null
	origem: string
}

export interface AcquisitionsOverview {
	acquisitions: AcquisitionView[]
	limits: DirectContractLimitRow[]
	/** Limite do exercício corrente por inciso, com o aviso "cadastre o limite vigente". */
	currentLimits: Array<{ clause: "I" | "II"; value: number | null; sourceAct: string | null; isOutdated: boolean }>
	empenhosWithoutOrigin: EmpenhoWithoutOrigin[]
	/** ARPs da unidade sem contratação de origem (importadas antes, ou de anexo). */
	arpsWithoutAcquisition: AcquisitionArpRef[]
	fiscalYear: number
}

const toNumber = (value: number | string | null | undefined): number | null => (value == null ? null : Number(value))

function factsOf(row: AcquisitionRow): AcquisitionFacts {
	return {
		kind: row.kind,
		srpRole: row.srp_role,
		legalBasis: row.legal_basis,
		directContractClause: row.direct_contract_clause,
		nd: row.nd,
		activityLine: row.activity_line,
		object: row.object,
		supplierCnpj: row.supplier_cnpj,
		supplierName: row.supplier_name,
		validFrom: row.valid_from,
		validTo: row.valid_to,
		estimatedValue: toNumber(row.estimated_value),
		overLimitJustification: row.over_limit_justification,
	}
}

function labelOf(row: Pick<AcquisitionRow, "kind" | "object" | "process_nup" | "supplier_name">): string {
	const detail = row.object ?? row.supplier_name ?? row.process_nup
	return detail ? `${ACQUISITION_KIND_LABEL[row.kind]} — ${detail}` : ACQUISITION_KIND_LABEL[row.kind]
}

function dispensaEntryOf(row: AcquisitionRow, committedValue: number): DispensaEntry {
	return {
		id: row.id,
		label: labelOf(row),
		kind: row.kind,
		directContractClause: row.direct_contract_clause,
		fiscalYear: row.fiscal_year,
		activityLine: row.activity_line,
		nd: row.nd,
		estimatedValue: toNumber(row.estimated_value),
		committedValue,
		deleted: row.deleted_at != null,
	}
}

async function loadLimits(): Promise<DirectContractLimitRow[]> {
	const { data, error } = await procurement().from("direct_contract_limit").select("clause, valid_from, value, source_act").order("valid_from")
	if (error) throw new Error(`Erro ao ler os limites da dispensa: ${publicDbMessage(error)}`)
	return (data ?? []).map((row: { clause: string; valid_from: string; value: number | string; source_act: string }) => ({
		clause: row.clause,
		validFrom: row.valid_from,
		value: Number(row.value),
		sourceAct: row.source_act,
	}))
}

/** Dados de execução da unidade no exercício, paginados (ver `lib/acquisition-execution`). */
function loadExecution(unitId: number, fiscalYear: number) {
	return loadUnitExecution<AcquisitionRow & { [column: string]: unknown }>(
		{ procurement: procurement(), finance: finance() },
		// A consulta vai pela costura frouxa de `loadUnitExecution`, que não infere a linha do `select`:
		// quem mantém tipo e colunas juntos é o `Pick` de `AcquisitionRow` sobre a mesma lista.
		{ unitId, fiscalYear, acquisitionColumns: ACQUISITION_COLUMNS.join(", ") }
	)
}

function arpRefOf(
	arp: {
		id: string
		numero_ata: string
		uasg_gerenciadora: string
		nome_uasg_gerenciadora: string | null
		source: "compras_gov" | "manual"
		last_synced_at: string | null
		quantity_estimate_id: string | null
		data_vigencia_fim: string | null
	},
	itemCount: number
): AcquisitionArpRef {
	return {
		id: arp.id,
		numeroAta: arp.numero_ata,
		uasgGerenciadora: arp.uasg_gerenciadora,
		nomeUasgGerenciadora: arp.nome_uasg_gerenciadora,
		source: arp.source,
		lastSyncedAt: arp.last_synced_at,
		quantityEstimateId: arp.quantity_estimate_id,
		vigenciaFim: arp.data_vigencia_fim,
		itemCount,
	}
}

async function loadActivityLineNames(codes: readonly string[]): Promise<Map<string, string>> {
	const numeric = [...new Set(codes.filter((code) => /^\d{4}$/.test(code)).map(Number))]
	const names = new Map<string, string>()
	if (numeric.length === 0) return names
	const { data, error } = await comprasGov().from("compras_material_classe").select("codigo_classe, nome_classe").in("codigo_classe", numeric)
	if (error) throw new Error(`Erro ao ler as classes do CATMAT: ${publicDbMessage(error)}`)
	for (const row of data ?? []) names.set(String(row.codigo_classe), String(row.nome_classe))
	return names
}

/** Contratações da unidade com pendências, somatório e vínculos; e as NEs sem contratação. */
export const listAcquisitionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive(), fiscalYear: z.number().int().min(2000).max(2100).optional() }))
	.handler(async ({ data }): Promise<AcquisitionsOverview> => {
		await requireUnitScope(1, data.unitId)
		// O somatório da dispensa é do exercício (art. 75, § 1º, I): a tela lê um exercício por vez.
		const fiscalYear = data.fiscalYear ?? currentFiscalYear()
		const [execution, limits] = await Promise.all([loadExecution(data.unitId, fiscalYear), loadLimits()])
		const { acquisitions, empenhos, vigenteById, arpItemIdsByEmpenho, arps, itemCountByArp } = execution

		const committedByAcquisition = new Map<string, number>()
		const empenhosByAcquisition = new Map<string, AcquisitionEmpenhoRef[]>()
		for (const empenho of empenhos) {
			if (!empenho.acquisition_id) continue
			const ref: AcquisitionEmpenhoRef = {
				id: empenho.id,
				numeroEmpenho: empenho.numero_empenho,
				dataEmpenho: empenho.data_empenho,
				valorVigente: vigenteById.get(empenho.id) ?? 0,
				status: empenho.status,
			}
			empenhosByAcquisition.set(empenho.acquisition_id, [...(empenhosByAcquisition.get(empenho.acquisition_id) ?? []), ref])
			if (empenho.status === "ativo")
				committedByAcquisition.set(empenho.acquisition_id, (committedByAcquisition.get(empenho.acquisition_id) ?? 0) + ref.valorVigente)
		}

		const entries = acquisitions.map((row) => dispensaEntryOf(row, committedByAcquisition.get(row.id) ?? 0))
		const lineNames = await loadActivityLineNames(acquisitions.map((a) => a.activity_line ?? ""))

		const views: AcquisitionView[] = acquisitions.map((row, index) => {
			const entry = entries[index] as DispensaEntry
			const sum = computeDispensaSum({
				candidate: entry,
				others: entries,
				limit: resolveDirectContractLimit(limits, row.direct_contract_clause ?? "", row.fiscal_year),
			})
			const gaps = acquisitionGaps(factsOf(row), { overLimit: sum?.exceeded ?? false })
			return {
				id: row.id,
				unitId: Number(row.unit_id),
				kind: row.kind,
				kindLabel: ACQUISITION_KIND_LABEL[row.kind],
				srpRole: row.srp_role,
				instrument: row.instrument,
				legalBasis: row.legal_basis,
				directContractClause: row.direct_contract_clause,
				nd: row.nd,
				activityLine: row.activity_line,
				activityLineName: row.activity_line ? (lineNames.get(row.activity_line) ?? null) : null,
				fiscalYear: row.fiscal_year,
				processNup: row.process_nup,
				object: row.object,
				supplierCnpj: row.supplier_cnpj,
				supplierName: row.supplier_name,
				validFrom: row.valid_from,
				validTo: row.valid_to,
				estimatedValue: toNumber(row.estimated_value),
				pncpControlNumber: row.pncp_control_number,
				overLimitJustification: row.over_limit_justification,
				notes: row.notes,
				committedValue: Math.round((committedByAcquisition.get(row.id) ?? 0) * 100) / 100,
				empenhos: empenhosByAcquisition.get(row.id) ?? [],
				arps: arps.filter((arp) => arp.acquisition_id === row.id).map((arp) => arpRefOf(arp, itemCountByArp.get(arp.id) ?? 0)),
				gaps,
				gapsSummary: describeAcquisitionGaps(row.kind, gaps),
				dispensaSum: sum,
				dispensaWarning: sum ? describeDispensaSum(sum) : null,
			}
		})

		const year = fiscalYear
		return {
			acquisitions: views,
			limits,
			currentLimits: (["I", "II"] as const).map((clause) => {
				const resolved = resolveDirectContractLimit(limits, clause, year)
				return { clause, value: resolved.value, sourceAct: resolved.sourceAct, isOutdated: resolved.isOutdated }
			}),
			empenhosWithoutOrigin: empenhos
				.filter((e) => e.status === "ativo" && isEmpenhoWithoutOrigin({ acquisitionId: e.acquisition_id, itemArpItemIds: arpItemIdsByEmpenho.get(e.id) ?? [] }))
				.map((e) => ({
					id: e.id,
					numeroEmpenho: e.numero_empenho,
					dataEmpenho: e.data_empenho,
					valorVigente: vigenteById.get(e.id) ?? 0,
					favorecidoNome: e.favorecido_nome,
					origem: e.origem,
				})),
			arpsWithoutAcquisition: arps.filter((arp) => arp.acquisition_id == null).map((arp) => arpRefOf(arp, itemCountByArp.get(arp.id) ?? 0)),
			fiscalYear: year,
		}
	})

/**
 * Prévia do somatório para o formulário de nova dispensa (ou para a edição do valor): mostra o
 * total, a composição e o limite ANTES de gravar. A gravação nunca é recusada por isso.
 */
export const previewDispensaSumFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			acquisitionId: z.uuid().optional(),
			directContractClause: z.enum(["I", "II"]),
			fiscalYear: z.number().int().min(2000).max(2100),
			activityLine: z.string().nullable().optional(),
			nd: z.string().nullable().optional(),
			estimatedValue: z.number().nonnegative().nullable().optional(),
		})
	)
	.handler(async ({ data }): Promise<{ sum: DispensaSum | null; warning: string | null }> => {
		await requireUnitScope(1, data.unitId)
		const [execution, limits] = await Promise.all([loadExecution(data.unitId, data.fiscalYear), loadLimits()])
		const committed = new Map<string, number>()
		for (const empenho of execution.empenhos) {
			if (empenho.acquisition_id && empenho.status === "ativo") {
				committed.set(empenho.acquisition_id, (committed.get(empenho.acquisition_id) ?? 0) + (execution.vigenteById.get(empenho.id) ?? 0))
			}
		}
		const others = execution.acquisitions.map((row) => dispensaEntryOf(row, committed.get(row.id) ?? 0))
		const candidateId = data.acquisitionId ?? "__nova__"
		const candidate: DispensaEntry = {
			id: candidateId,
			label: "Esta dispensa",
			kind: "dispensa",
			directContractClause: data.directContractClause,
			fiscalYear: data.fiscalYear,
			activityLine: data.activityLine ?? null,
			nd: data.nd ?? null,
			estimatedValue: data.estimatedValue ?? null,
			committedValue: committed.get(candidateId) ?? 0,
		}
		const sum = computeDispensaSum({ candidate, others, limit: resolveDirectContractLimit(limits, data.directContractClause, data.fiscalYear) })
		return { sum, warning: sum ? describeDispensaSum(sum) : null }
	})

/** Classes de material do CATMAT (ramo de atividade de bens, IN SEGES/ME 67/2021, art. 4º, § 2º). */
export const listActivityLinesFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive() }))
	.handler(async ({ data }): Promise<Array<{ code: string; name: string }>> => {
		await requireUnitScope(1, data.unitId)
		const { data: rows, error } = await comprasGov()
			.from("compras_material_classe")
			.select("codigo_classe, nome_classe")
			.eq("status_classe", true)
			.order("codigo_classe")
			.limit(2000)
		if (error) throw new Error(`Erro ao listar as classes de material: ${publicDbMessage(error)}`)
		return (rows ?? []).map((row: { codigo_classe: number; nome_classe: string }) => ({ code: String(row.codigo_classe), name: row.nome_classe }))
	})

// ─── Escrita ─────────────────────────────────────────────────────────────────

const nullableText = z
	.string()
	.nullable()
	.optional()
	.transform((value) => (value == null ? value : value.trim() === "" ? null : value.trim()))
const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)")
	.nullable()
	.optional()

const AcquisitionFieldsSchema = z.object({
	srpRole: z.enum(SRP_ROLES).nullable().optional(),
	instrument: z.enum(ACQUISITION_INSTRUMENTS).nullable().optional(),
	legalBasis: nullableText,
	directContractClause: z
		.string()
		.regex(/^[IVX]{1,5}$/, "Inciso em algarismos romanos (ex.: II)")
		.nullable()
		.optional(),
	nd: z
		.string()
		.regex(/^\d{6,8}$/, "ND com 6 a 8 dígitos (ex.: 33903007)")
		.nullable()
		.optional(),
	activityLine: nullableText,
	fiscalYear: z.number().int().min(2000).max(2100).optional(),
	processNup: nullableText,
	object: nullableText,
	supplierCnpj: z
		.string()
		.regex(/^(\d{11}|\d{14})$/, "CNPJ com 14 dígitos (ou CPF com 11)")
		.nullable()
		.optional(),
	supplierName: nullableText,
	validFrom: isoDate,
	validTo: isoDate,
	estimatedValue: z.number().nonnegative().nullable().optional(),
	pncpControlNumber: nullableText,
	overLimitJustification: nullableText,
	notes: nullableText,
})

type AcquisitionFields = z.infer<typeof AcquisitionFieldsSchema>

/** Campo ausente não entra no update (autosave grava um campo por vez). */
function toColumns(fields: AcquisitionFields): Record<string, unknown> {
	const map: Record<keyof AcquisitionFields, string> = {
		srpRole: "srp_role",
		instrument: "instrument",
		legalBasis: "legal_basis",
		directContractClause: "direct_contract_clause",
		nd: "nd",
		activityLine: "activity_line",
		fiscalYear: "fiscal_year",
		processNup: "process_nup",
		object: "object",
		supplierCnpj: "supplier_cnpj",
		supplierName: "supplier_name",
		validFrom: "valid_from",
		validTo: "valid_to",
		estimatedValue: "estimated_value",
		pncpControlNumber: "pncp_control_number",
		overLimitJustification: "over_limit_justification",
		notes: "notes",
	}
	const columns: Record<string, unknown> = {}
	for (const [key, column] of Object.entries(map) as Array<[keyof AcquisitionFields, string]>) {
		if (fields[key] !== undefined) columns[column] = fields[key]
	}
	return columns
}

/** Mensagem do CHECK do banco traduzida para o que o usuário faz. */
function writeError(error: { message: string; code?: string }): Error {
	if (error.message.includes("acquisition_srp_role_ck")) return new Error("O papel na ata só vale para registro de preços")
	if (error.message.includes("acquisition_direct_contract_clause_ck")) return new Error("O inciso do art. 75 só vale para dispensa")
	if (error.message.includes("acquisition_validity_ck")) return new Error("O fim da vigência não pode ser antes do início")
	return new Error(`Erro ao gravar a contratação: ${publicDbMessage(error)}`)
}

async function resolveAcquisitionUnit(acquisitionId: string): Promise<number> {
	const { data, error } = await procurement().from("acquisition").select("unit_id").eq("id", acquisitionId).is("deleted_at", null).maybeSingle()
	if (error) throw new Error(`Erro ao buscar a contratação: ${publicDbMessage(error)}`)
	if (!data) throw new Error("Contratação não encontrada")
	return Number(data.unit_id)
}

/** Registra a contratação com o mínimo: só a unidade e o tipo são obrigatórios. */
export const createAcquisitionFn = createServerFn({ method: "POST" })
	.validator(AcquisitionFieldsSchema.extend({ unitId: z.number().int().positive(), kind: z.enum(ACQUISITION_KINDS) }))
	.handler(async ({ data }): Promise<{ id: string }> => {
		const { userId } = await requireUnitScope(2, data.unitId)
		const { unitId, kind, ...fields } = data
		const { data: row, error } = await procurement()
			.from("acquisition")
			.insert({ unit_id: unitId, kind, fiscal_year: currentFiscalYear(), ...toColumns(fields), created_by: userId })
			.select("id")
			.single()
		if (error || !row) throw writeError(error ?? { message: "sem retorno" })
		return { id: row.id as string }
	})

/** Completa a contratação (autosave, um campo por vez). O tipo não muda: é outra contratação. */
export const updateAcquisitionFn = createServerFn({ method: "POST" })
	.validator(AcquisitionFieldsSchema.extend({ acquisitionId: z.uuid() }))
	.handler(async ({ data }): Promise<void> => {
		// Sessão antes de ler a linha; o escopo de unidade sai da linha, nunca do corpo.
		await requireAuth()
		await requireUnitScope(2, await resolveAcquisitionUnit(data.acquisitionId))
		const { acquisitionId, ...fields } = data
		const columns = toColumns(fields)
		if (Object.keys(columns).length === 0) return
		const { error } = await procurement()
			.from("acquisition")
			.update({ ...columns, updated_at: new Date().toISOString() })
			.eq("id", acquisitionId)
		if (error) throw writeError(error)
	})

/**
 * Remove (soft delete) a contratação SEM vínculos. Com NE ou ARP apontando para ela, a remoção
 * é recusada com o caminho: desvincular primeiro, porque apagar a origem de uma despesa já
 * empenhada esconderia de onde veio o direito de gastar.
 */
export const deleteAcquisitionFn = createServerFn({ method: "POST" })
	.validator(z.object({ acquisitionId: z.uuid() }))
	.handler(async ({ data }): Promise<void> => {
		// Sessão antes de ler a linha; o escopo de unidade sai da linha, nunca do corpo.
		await requireAuth()
		await requireUnitScope(2, await resolveAcquisitionUnit(data.acquisitionId))
		const [{ count: empenhoCount, error: empError }, { count: arpCount, error: arpError }] = await Promise.all([
			finance().from("empenho").select("id", { count: "exact", head: true }).eq("acquisition_id", data.acquisitionId),
			procurement().from("arp").select("id", { count: "exact", head: true }).eq("acquisition_id", data.acquisitionId),
		])
		if (empError || arpError) throw new Error(`Erro ao conferir os vínculos da contratação: ${(empError ?? arpError)?.message}`)
		if ((empenhoCount ?? 0) > 0 || (arpCount ?? 0) > 0) {
			throw new Error(`A contratação sustenta ${empenhoCount ?? 0} empenho(s) e ${arpCount ?? 0} ARP(s). Vincule-os a outra contratação antes de remover esta.`)
		}
		const { error } = await procurement().from("acquisition").update({ deleted_at: new Date().toISOString() }).eq("id", data.acquisitionId)
		if (error) throw new Error(`Erro ao remover a contratação: ${publicDbMessage(error)}`)
	})

/** Liga (ou desliga) a ARP à contratação de registro de preços que a sustenta. */
export const linkArpAcquisitionFn = createServerFn({ method: "POST" })
	.validator(z.object({ arpId: z.uuid(), acquisitionId: z.uuid().nullable() }))
	.handler(async ({ data }): Promise<void> => {
		// Sessão antes de ler a linha; o escopo de unidade sai da linha, nunca do corpo.
		await requireAuth()
		const { data: arp, error: arpError } = await procurement().from("arp").select("unit_id").eq("id", data.arpId).maybeSingle()
		if (arpError) throw new Error(`Erro ao buscar a ARP: ${publicDbMessage(arpError)}`)
		if (!arp) throw new Error("ARP não encontrada")
		await requireUnitScope(2, Number(arp.unit_id))
		if (data.acquisitionId && (await resolveAcquisitionUnit(data.acquisitionId)) !== Number(arp.unit_id)) {
			throw new Error("A contratação é de outra unidade")
		}
		const { error } = await procurement().from("arp").update({ acquisition_id: data.acquisitionId }).eq("id", data.arpId)
		if (error) throw new Error(`Erro ao vincular a ARP: ${publicDbMessage(error)}`)
	})

/**
 * Vincula a NE à contratação de origem — a ação da pendência "NE sem contratação de origem".
 * A unidade sai da linha do empenho; a contratação tem de ser da mesma unidade (o trigger do
 * banco confere de novo).
 */
export const linkEmpenhoAcquisitionFn = createServerFn({ method: "POST" })
	.validator(z.object({ empenhoId: z.uuid(), acquisitionId: z.uuid().nullable() }))
	.handler(async ({ data }): Promise<void> => {
		// Sessão antes de ler a linha; o escopo de unidade sai da linha, nunca do corpo.
		await requireAuth()
		const { data: empenho, error: lookupError } = await finance().from("empenho").select("unit_id").eq("id", data.empenhoId).maybeSingle()
		if (lookupError) throw new Error(`Erro ao buscar o empenho: ${publicDbMessage(lookupError)}`)
		if (!empenho) throw new Error("Empenho não encontrado")
		const unitId = Number(empenho.unit_id)
		const ctx = await requireUnitScope(2, unitId)
		if (data.acquisitionId && (await resolveAcquisitionUnit(data.acquisitionId)) !== unitId) throw new Error("A contratação é de outra unidade")

		return withSensitiveAudit(
			"linkEmpenhoAcquisitionFn",
			ctx,
			async () => {
				const { error } = await finance().from("empenho").update({ acquisition_id: data.acquisitionId }).eq("id", data.empenhoId)
				if (error) throw new Error(`Erro ao vincular o empenho: ${publicDbMessage(error)}`)
			},
			() => ({ empenhoId: data.empenhoId, unitId, acquisitionId: data.acquisitionId })
		)
	})
