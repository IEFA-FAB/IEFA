/**
 * Designação de gestor, fiscal e comissão (change `sisub-flexible-expense-execution`, D6).
 *
 * O recebimento de compras tem dois atos (Lei 14.133/2021, art. 140, II): o PROVISÓRIO, de
 * forma sumária, "pelo responsável por seu acompanhamento e fiscalização" (alínea a), e o
 * DEFINITIVO, "por servidor ou comissão designada pela autoridade competente" (alínea b). A
 * designação é da autoridade (arts. 7º e 117); o sisub registra o ato — número do boletim ou
 * da portaria — e confere a vigência no recebimento (`inventory.find_designation`).
 *
 * A nota de empenho não designa ninguém: ela reserva a dotação (Lei 4.320/1964, art. 58).
 * Designação VINCULADA a uma contratação, ARP ou empenho é escopo, não fonte.
 *
 * Quem cadastra é a Gestão Unidade (`unit:2`), a mesma que o recebimento manda procurar quando
 * falta designação. O registro é auditado (`withSensitiveAudit`) porque é a competência que
 * sustenta o termo de recebimento — e, por ele, a liquidação.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { sql } from "drizzle-orm"
import { requireUnit } from "../guards/require-permission.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"
import { brasiliaToday } from "./stock-math.ts"

export const DESIGNATION_ROLES = ["manager", "technical_inspector", "administrative_inspector", "sectoral_inspector", "committee_member"] as const
export type DesignationRole = (typeof DESIGNATION_ROLES)[number]

export const DESIGNATION_ROLE_LABELS: Record<DesignationRole, string> = {
	manager: "Gestor do contrato",
	technical_inspector: "Fiscal técnico",
	administrative_inspector: "Fiscal administrativo",
	sectoral_inspector: "Fiscal setorial",
	committee_member: "Membro de comissão de recebimento",
}

/** Quem recebe provisoriamente: quem acompanha e fiscaliza (art. 140, II, a). */
export const PROVISIONAL_RECEIPT_ROLES: readonly DesignationRole[] = DESIGNATION_ROLES
/** Quem recebe definitivamente: servidor ou comissão designada (art. 140, II, b). */
export const DEFINITIVE_RECEIPT_ROLES: readonly DesignationRole[] = ["manager", "committee_member"]

export const DESIGNATION_SOURCES = ["ato", "permanente"] as const
export type DesignationSource = (typeof DESIGNATION_SOURCES)[number]

export const DESIGNATION_SOURCE_LABELS: Record<DesignationSource, string> = {
	ato: "Ato do contrato (boletim ou portaria)",
	permanente: "Ato permanente da OM para recebimento de gêneros",
}

export type ReceiptStage = "provisional" | "definitive"

/** Onde se designa: é o que toda recusa por falta de designação diz. */
export const DESIGNATION_SCREEN_LABEL = "Gestão Unidade → Designações"

/**
 * A mensagem quando falta designação vigente. Os dois atos exigem designação (art. 140, II, a
 * e b); o que não trava é a conferência física, que fica registrada e é confirmada depois,
 * sem redigitar. A frase diz quem designa e onde; para quem pode designar, que dá para fazer
 * ali mesmo.
 */
export function designationMissingMessage(stage: ReceiptStage, canDesignate: boolean): string {
	const act =
		stage === "provisional"
			? "O recebimento provisório é do fiscal designado (Lei 14.133/2021, art. 140, II, a), e você não tem designação vigente de fiscal para esta entrega."
			: "O recebimento definitivo é de servidor ou comissão designada (Lei 14.133/2021, art. 140, II, b), e você não tem designação vigente de gestor ou de comissão para esta entrega."
	const kept = "A conferência já registrada fica como está."
	return canDesignate
		? `${act} Designe agora, aqui mesmo, e confirme. ${kept}`
		: `${act} Peça a designação ao chefe do rancho (${DESIGNATION_SCREEN_LABEL}). ${kept}`
}

export interface DesignationInput {
	unitId: number
	personId: string
	role: DesignationRole
	source: DesignationSource
	sourceReference: string | null
	validFrom: string
	validTo: string | null
	isSubstitute: boolean
	empenhoId: string | null
	arpId: string | null
	acquisitionId: string | null
}

/**
 * O que impede gravar a designação. O banco confere o ato com referência e o período; aqui a
 * regra é a mesma, com a frase que o usuário lê. O ato permanente também é um ato publicado:
 * sem o número, o termo sai sem rastro até quem designou.
 */
export function designationInputProblems(
	input: Pick<DesignationInput, "source" | "sourceReference" | "validFrom" | "validTo" | "empenhoId" | "arpId" | "acquisitionId">
): string[] {
	const problems: string[] = []
	if (!input.sourceReference?.trim()) problems.push("Informe o número do boletim interno ou da portaria que designou")
	if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validFrom)) problems.push("Informe o início da vigência")
	if (input.validTo && input.validTo < input.validFrom) problems.push("O fim da vigência não pode ser anterior ao início")
	if ([input.empenhoId, input.arpId, input.acquisitionId].filter(Boolean).length > 1) {
		problems.push("Vincule a designação a UMA contratação, ARP ou empenho — ou deixe para a unidade toda")
	}
	return problems
}

export interface DesignationRow {
	id: string
	unitId: number
	personId: string
	personLabel: string
	role: DesignationRole
	isSubstitute: boolean
	source: string
	sourceReference: string | null
	validFrom: string
	validTo: string | null
	empenhoId: string | null
	empenhoNumber: string | null
	arpId: string | null
	arpNumber: string | null
	acquisitionId: string | null
	/** Vigente hoje (data civil de Brasília). */
	active: boolean
	createdAt: string
}

/** Vigente na data: começou e não terminou. */
export function isDesignationActive(row: { validFrom: string; validTo: string | null }, today: string): boolean {
	return row.validFrom <= today && (row.validTo == null || row.validTo >= today)
}

type Row = Record<string, unknown>
const str = (value: unknown): string | null => (value == null ? null : String(value))
const isoDate = (value: unknown): string => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10))

/** Rótulo de pessoa: posto + nome de guerra; sem cadastro militar, o e-mail. */
const PERSON_LABEL = sql`coalesce(nullif(btrim(concat_ws(' ', m."sgPosto", m."nmGuerra")), ''), u.email, 'Usuário sem cadastro')`

export async function listDesignations(db: SisubDb, ctx: UserContext, input: { unitId: number }): Promise<DesignationRow[]> {
	requireUnit(ctx, 1, input.unitId)
	const today = brasiliaToday()
	const rows = (await runQuery(
		"QUERY_FAILED",
		() =>
			db.execute(sql`
				select d.id, d.unit_id, d.person_id, ${PERSON_LABEL} as person_label, d.role, d.is_substitute, d.source, d.source_reference,
					d.valid_from, d.valid_to, d.empenho_id, e.numero_empenho, d.arp_id, a.numero_ata, d.acquisition_id, d.created_at
				from procurement.contract_designation d
				left join core.user_data u on u.id = d.person_id
				left join core.user_military_data m on m."nrOrdem" = u."nrOrdem"
				left join finance.empenho e on e.id = d.empenho_id
				left join procurement.procurement_arp a on a.id = d.arp_id
				where d.unit_id = ${input.unitId}
				order by (d.valid_to is null or d.valid_to >= ${today}::date) desc, d.valid_from desc, d.created_at desc
				limit 500
			`),
		{ prefix: "Erro ao ler as designações" }
	)) as unknown as Row[]
	return rows.map((r) => {
		const validFrom = isoDate(r.valid_from)
		const validTo = r.valid_to == null ? null : isoDate(r.valid_to)
		return {
			id: String(r.id),
			unitId: Number(r.unit_id),
			personId: String(r.person_id),
			personLabel: String(r.person_label),
			role: String(r.role) as DesignationRole,
			isSubstitute: Boolean(r.is_substitute),
			source: String(r.source),
			sourceReference: str(r.source_reference),
			validFrom,
			validTo,
			empenhoId: str(r.empenho_id),
			empenhoNumber: str(r.numero_empenho),
			arpId: str(r.arp_id),
			arpNumber: str(r.numero_ata),
			acquisitionId: str(r.acquisition_id),
			active: isDesignationActive({ validFrom, validTo }, today),
			createdAt: String(r.created_at),
		}
	})
}

export interface DesignationCandidate {
	personId: string
	label: string
}

/**
 * Quem pode ser designado: quem opera o recebimento numa cozinha da OM (`storage`) ou a própria
 * gestão da OM (`unit`), com permissão vigente. Designar quem não entra no sisub não daria a
 * ninguém como assinar o termo aqui — e aceitar qualquer UUID deixaria a tela designar
 * usuário de outra OM.
 */
export async function listDesignationCandidates(db: SisubDb, ctx: UserContext, input: { unitId: number }): Promise<DesignationCandidate[]> {
	requireUnit(ctx, 2, input.unitId)
	const rows = (await runQuery(
		"QUERY_FAILED",
		() =>
			db.execute(sql`
				select distinct p.user_id, ${PERSON_LABEL} as label
				from access_control.user_permissions p
				left join core.user_data u on u.id = p.user_id
				left join core.user_military_data m on m."nrOrdem" = u."nrOrdem"
				where (p.expires_at is null or p.expires_at > now())
					and p.level >= 1
					and (
						(p.module = 'unit' and p.unit_id = ${input.unitId})
						or (p.module = 'storage' and p.kitchen_id in (
							select k.id from kitchen.kitchen k where k.unit_id = ${input.unitId} or k.purchase_unit_id = ${input.unitId}
						))
					)
				order by label
				limit 500
			`),
		{ prefix: "Erro ao ler quem pode ser designado" }
	)) as unknown as Row[]
	return rows.map((r) => ({ personId: String(r.user_id), label: String(r.label) }))
}

export async function createDesignation(db: SisubDb, ctx: UserContext, input: DesignationInput): Promise<{ id: string }> {
	requireUnit(ctx, 2, input.unitId)
	const problems = designationInputProblems(input)
	if (problems.length > 0) throw new DomainError("DESIGNATION_INVALID", problems.join(". "))

	const candidates = await listDesignationCandidates(db, ctx, { unitId: input.unitId })
	if (!candidates.some((c) => c.personId === input.personId)) {
		throw new DomainError("DESIGNATION_PERSON_OUT_OF_UNIT", "Esta pessoa não opera o estoque nem a gestão desta OM — conceda o acesso antes de designá-la")
	}
	if (input.empenhoId) {
		const [row] = (await runQuery("QUERY_FAILED", () => db.execute(sql`select unit_id from finance.empenho where id = ${input.empenhoId}`))) as unknown as Row[]
		if (!row || Number(row.unit_id) !== input.unitId) throw new DomainError("DESIGNATION_SCOPE_OUT_OF_UNIT", "O empenho não é desta OM")
	}
	if (input.arpId) {
		const [row] = (await runQuery("QUERY_FAILED", () =>
			db.execute(sql`select unit_id from procurement.procurement_arp where id = ${input.arpId}`)
		)) as unknown as Row[]
		if (!row || Number(row.unit_id) !== input.unitId) throw new DomainError("DESIGNATION_SCOPE_OUT_OF_UNIT", "A ARP não é desta OM")
	}

	if (input.acquisitionId) {
		const [row] = (await runQuery("QUERY_FAILED", () =>
			db.execute(sql`select unit_id from procurement.acquisition where id = ${input.acquisitionId}`)
		)) as unknown as Row[]
		if (!row || Number(row.unit_id) !== input.unitId) throw new DomainError("DESIGNATION_SCOPE_OUT_OF_UNIT", "A contratação não é desta OM")
	}

	const [inserted] = (await runQuery(
		"INSERT_FAILED",
		() =>
			db.execute(sql`
				insert into procurement.contract_designation
					(unit_id, empenho_id, arp_id, acquisition_id, person_id, role, is_substitute, source, source_reference, valid_from, valid_to, created_by)
				values (${input.unitId}, ${input.empenhoId}, ${input.arpId}, ${input.acquisitionId}, ${input.personId}, ${input.role}, ${input.isSubstitute},
					${input.source}, ${input.sourceReference?.trim() ?? null}, ${input.validFrom}::date, ${input.validTo}::date, ${ctx.userId})
				returning id
			`),
		{ prefix: "Erro ao gravar a designação" }
	)) as unknown as Row[]
	if (!inserted) throw new DomainError("INSERT_FAILED", "Erro ao gravar a designação: nenhuma linha retornada")
	return { id: String(inserted.id) }
}

export interface DesignationScopes {
	acquisitions: Array<{ id: string; label: string }>
	arps: Array<{ id: string; label: string }>
	empenhos: Array<{ id: string; label: string }>
}

/**
 * Onde a designação pode valer: contratação, ARP ou empenho da OM. A contratação é lida por
 * `to_jsonb` para não depender do nome das colunas descritivas do outro PR do change
 * (`object`, `process_nup`): só `id`, `unit_id` e `kind` são garantidos.
 */
export async function listDesignationScopes(db: SisubDb, ctx: UserContext, input: { unitId: number }): Promise<DesignationScopes> {
	requireUnit(ctx, 2, input.unitId)
	const [acquisitions, arps, empenhos] = (await Promise.all([
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select a.id, a.kind, to_jsonb(a) ->> 'object' as title, to_jsonb(a) ->> 'process_nup' as nup
					from procurement.acquisition a
					where a.unit_id = ${input.unitId}
					order by to_jsonb(a) ->> 'created_at' desc nulls last
					limit 200
				`),
			{ prefix: "Erro ao ler as contratações" }
		),
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select a.id, a.numero_ata, a.ano_ata, a.nome_uasg_gerenciadora
					from procurement.procurement_arp a
					where a.unit_id = ${input.unitId}
					order by a.data_vigencia_fim desc nulls last
					limit 200
				`),
			{ prefix: "Erro ao ler as ARPs" }
		),
		runQuery(
			"QUERY_FAILED",
			() =>
				db.execute(sql`
					select e.id, e.numero_empenho, e.favorecido_nome
					from finance.empenho e
					where e.unit_id = ${input.unitId} and e.status <> 'anulado'
					order by e.data_empenho desc
					limit 300
				`),
			{ prefix: "Erro ao ler os empenhos" }
		),
	])) as unknown as [Row[], Row[], Row[]]
	return {
		acquisitions: acquisitions.map((r) => ({
			id: String(r.id),
			label: [str(r.title) ?? `Contratação (${String(r.kind)})`, str(r.nup) ? `NUP ${str(r.nup)}` : null].filter(Boolean).join(" · "),
		})),
		arps: arps.map((r) => ({
			id: String(r.id),
			label: [`ARP ${String(r.numero_ata)}${r.ano_ata ? `/${String(r.ano_ata)}` : ""}`, str(r.nome_uasg_gerenciadora)].filter(Boolean).join(" · "),
		})),
		empenhos: empenhos.map((r) => ({ id: String(r.id), label: [String(r.numero_empenho), str(r.favorecido_nome)].filter(Boolean).join(" · ") })),
	}
}

/**
 * Encerra a designação hoje. A designação não se apaga depois de valer: o termo de
 * recebimento aponta para ela. A que ainda não começou é removida — nenhum termo a usou.
 */
export async function endDesignation(db: SisubDb, ctx: UserContext, input: { designationId: string }): Promise<{ unitId: number; ended: "removed" | "ended" }> {
	const [row] = (await runQuery("QUERY_FAILED", () =>
		db.execute(sql`select unit_id, valid_from, valid_to from procurement.contract_designation where id = ${input.designationId}`)
	)) as unknown as Row[]
	if (!row) throw new DomainError("NOT_FOUND", "Designação não encontrada")
	const unitId = Number(row.unit_id)
	requireUnit(ctx, 2, unitId)
	const today = brasiliaToday()
	const validFrom = isoDate(row.valid_from)
	if (validFrom > today) {
		await runQuery("QUERY_FAILED", () => db.execute(sql`delete from procurement.contract_designation where id = ${input.designationId}`), {
			prefix: "Erro ao remover a designação",
		})
		return { unitId, ended: "removed" }
	}
	const validTo = row.valid_to == null ? null : isoDate(row.valid_to)
	if (validTo != null && validTo < today) throw new DomainError("DESIGNATION_ALREADY_ENDED", "Esta designação já terminou")
	await runQuery(
		"QUERY_FAILED",
		() => db.execute(sql`update procurement.contract_designation set valid_to = ${today}::date where id = ${input.designationId}`),
		{ prefix: "Erro ao encerrar a designação" }
	)
	return { unitId, ended: "ended" }
}
