/**
 * Org-hierarchy + mess-hall operations. Drizzle query layer.
 *
 * Auth: leituras da hierarquia são apenas autenticadas (catálogo visível a qualquer sessão);
 * `addOtherPresence` escreve presença de terceiro e exige `messhall:2` no refeitório. Mutação da
 * hierarquia exige `global:2`; reparentar (mudar a OM de cozinha/refeitório) exige também
 * `admin:2` e é auditado (`applyPlacesDiff`).
 *
 * `units`/`mess_halls` têm PK bigserial, lida como `number`: o patcher do pull
 * (`patch-drizzle-pull.ts`, passo 10) uniformiza todo `bigserial` em mode "number".
 */

import {
	arranchamentoInKitchen,
	kitchenInKitchen,
	messHallsInKitchen,
	otherPresencesInKitchen,
	type SisubDb,
	unitsInCore,
	vUserIdentityInCore,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { hasPermission } from "@iefa/pbac"
import { and, asc, count, eq, inArray, or } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { requireMessHall, requirePermission } from "../guards/require-permission.ts"
import type {
	AddOtherPresence,
	ApplyPlacesDiff,
	FetchMessHallByCode,
	FetchOtherPresencesCount,
	FetchUserArranchamento,
	ListPlaces,
	PlacesDiffItem,
	ResolveDisplayName,
	UpdateEntityInput,
} from "../schemas/places.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, PermissionDeniedError } from "../types/errors.ts"
import { driverFailure, runQuery, toWire } from "../utils/index.ts"
import { type AccessAudit, defaultAccessAudit } from "./access-change.ts"
import { recordSensitiveOperation } from "./audit.ts"

type Unit = Tables<"units">
type Kitchen = Tables<"kitchen">
type MessHall = Tables<"mess_halls">

// ─── Reference reads ────────────────────────────────────────────────────────

/**
 * Unidades para seleção. Exclui o escopo de treino por padrão — ver `ListPlaces`.
 */
/**
 * Filtro de escopo de treino, ponto ÚNICO por entidade.
 *
 * As sentinelas de treino saem de toda listagem de produção por padrão; incluí-las é opt-in
 * explícito (`includeTraining`), usado só pelo painel da SDAB. Centralizar aqui é o que
 * impede o modo de falha real: um seletor novo esquecer o filtro e vazar a cozinha de treino
 * para todo mundo — ou pior, deixar dado de treino entrar num indicador.
 */
function trainingFilter(column: PgColumn, input?: ListPlaces) {
	return input?.includeTraining ? undefined : eq(column, false)
}

/**
 * Ids que a sessão alcança por grant ESCOPADO explícito (allow, nível > 0) numa das colunas.
 *
 * É a única exceção ao filtro de treino: quem tem o "Conjunto Treino" recebe `unit:2` NA
 * sentinela, e sem isto os seletores de Gestão Unidade, Análises da Unidade e Refeitório
 * voltavam "Nenhuma unidade disponível" — o aluno tinha a permissão e não tinha a tela. Grant
 * global (sem escopo) NÃO conta: é exatamente o caso em que o treino não pode vazar.
 */
function explicitScopeIds(ctx: UserContext, key: "unit_id" | "kitchen_id" | "mess_hall_id"): number[] {
	const ids = new Set<number>()
	for (const p of ctx.permissions) {
		const id = p[key]
		if (p.level > 0 && id != null) ids.add(Number(id))
	}
	return [...ids]
}

/**
 * Só as unidades COMPRADORAS (`type = 'purchase'`) — mais a sentinela de treino, quando
 * pedida.
 *
 * `core.units` deixou de ser só a lista das compradoras do sisub: o Projeto α cadastra as
 * OMs APOIADAS (IAE, DCTA, IEFA-SJ…) como `consumption`, sem cozinha, sem refeitório e sem
 * UASG, para escopar acesso por OM (20260918…_alpha_role_modules_unit_scope). Este é o
 * seletor de unidade do sisub inteiro (módulo Unidade, Análises da Unidade, escopo de
 * permissão) — sem o filtro, as apoiadas apareceriam ali como unidades vazias. A sentinela
 * de treino é `consumption` também, e entra pelo `or` quando o chamador a pede.
 */
function unitListFilter(ctx: UserContext, input?: ListPlaces) {
	const purchase = eq(unitsInCore.type, "purchase")
	if (input?.includeTraining) return or(purchase, eq(unitsInCore.isTraining, true))
	const production = and(purchase, eq(unitsInCore.isTraining, false))
	const granted = explicitScopeIds(ctx, "unit_id")
	return granted.length > 0 ? or(production, and(eq(unitsInCore.isTraining, true), inArray(unitsInCore.id, granted))) : production
}

export async function listUnits(
	db: SisubDb,
	ctx: UserContext,
	input?: ListPlaces
): Promise<Array<{ id: number; code: string | null; display_name: string | null; type: null }>> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.unitsInCore.findMany({
			columns: { id: true, code: true, displayName: true },
			where: unitListFilter(ctx, input),
			orderBy: (u, { asc }) => [asc(u.displayName)],
		})
	)
	return rows.map((r) => {
		const w = toWire<{ id: number; code: string | null; display_name: string | null }>(r)
		return { id: w.id, code: w.code, display_name: w.display_name, type: null }
	})
}

export async function listAllMessHalls(
	db: SisubDb,
	ctx: UserContext,
	input?: ListPlaces
): Promise<Array<Pick<MessHall, "id" | "unit_id" | "code" | "display_name" | "kitchen_id">>> {
	// Refeitório de treino: visível a quem tem grant escopado nele, na unidade ou na cozinha dele.
	const grantedHall = [
		inArray(messHallsInKitchen.id, explicitScopeIds(ctx, "mess_hall_id")),
		inArray(messHallsInKitchen.unitId, explicitScopeIds(ctx, "unit_id")),
		inArray(messHallsInKitchen.kitchenId, explicitScopeIds(ctx, "kitchen_id")),
	]
	const where = input?.includeTraining
		? undefined
		: or(eq(messHallsInKitchen.isTraining, false), and(eq(messHallsInKitchen.isTraining, true), or(...grantedHall)))
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.messHallsInKitchen.findMany({
			columns: { id: true, unitId: true, code: true, displayName: true, kitchenId: true },
			where,
			orderBy: (m, { asc }) => [asc(m.displayName)],
		})
	)
	return rows.map((r) => toWire(r))
}

export async function fetchPlacesGraph(
	db: SisubDb,
	_ctx: UserContext,
	input?: ListPlaces
): Promise<{ units: Unit[]; kitchens: Kitchen[]; messHalls: MessHall[] }> {
	const [units, kitchens, messHalls] = await runQuery("FETCH_FAILED", () =>
		Promise.all([
			db.select().from(unitsInCore).where(trainingFilter(unitsInCore.isTraining, input)).orderBy(asc(unitsInCore.displayName)),
			db.select().from(kitchenInKitchen).where(trainingFilter(kitchenInKitchen.isTraining, input)).orderBy(asc(kitchenInKitchen.displayName)),
			db.select().from(messHallsInKitchen).where(trainingFilter(messHallsInKitchen.isTraining, input)).orderBy(asc(messHallsInKitchen.displayName)),
		])
	)
	return {
		units: units.map((r) => toWire<Unit>(r)),
		kitchens: kitchens.map((r) => toWire<Kitchen>(r)),
		messHalls: messHalls.map((r) => toWire<MessHall>(r)),
	}
}

// ─── Org-graph mutations ────────────────────────────────────────────────────

export async function updatePlacesEntity(db: SisubDb, ctx: UserContext, input: UpdateEntityInput) {
	// A estrutura organizacional (OM, cozinha, refeitório) é da SDAB — sem este gate
	// qualquer usuário autenticado renomeava unidades e refeitórios da FAB inteira.
	requirePermission(ctx, "global", 2)

	await runQuery("UPDATE_FAILED", () => {
		if (input.entityType === "unit") {
			return db.update(unitsInCore).set({ displayName: input.display_name, code: input.code, type: input.type }).where(eq(unitsInCore.id, input.id))
		}
		if (input.entityType === "kitchen") {
			return db.update(kitchenInKitchen).set({ displayName: input.display_name, type: input.type }).where(eq(kitchenInKitchen.id, input.id))
		}
		return db.update(messHallsInKitchen).set({ displayName: input.display_name, code: input.code }).where(eq(messHallsInKitchen.id, input.id))
	})
	return { ok: true as const }
}

// Mapeia a coluna (snake, validada pelo Zod) → prop camelCase do Drizzle. `satisfies` garante,
// em compile-time, que cada destino é uma coluna real da tabela (sem o silent-drop do cast genérico).
const KITCHEN_DIFF_KEY = { unit_id: "unitId", purchase_unit_id: "purchaseUnitId", kitchen_id: "kitchenId" } satisfies Record<
	string,
	keyof typeof kitchenInKitchen.$inferInsert
>
const MESS_HALL_DIFF_KEY = { unit_id: "unitId", kitchen_id: "kitchenId" } satisfies Record<string, keyof typeof messHallsInKitchen.$inferInsert>

/**
 * Colunas que decidem o ALCANCE de quem tem permissão de `unit`: a OM de uma cozinha é
 * `unit_id` ou `purchase_unit_id` (`kitchen-unit.ts`), a de um refeitório é `unit_id`. Mudá-las
 * numa linha existente é reparentar — a cozinha passa a ser alcançada pelos administradores de
 * OUTRA OM, e deixa de ser pelos da antiga —, o que é mudança de acesso, não de cadastro.
 */
const REPARENT_COLUMNS: Record<PlacesDiffItem["table"], ReadonlySet<string>> = {
	kitchen: new Set(["unit_id", "purchase_unit_id"]),
	mess_halls: new Set(["unit_id"]),
}

/** O item do diff muda a OM de uma cozinha ou de um refeitório? */
export function isReparentDiff(diff: PlacesDiffItem): boolean {
	return REPARENT_COLUMNS[diff.table].has(diff.column)
}

type ReparentChange = { table: string; record_id: number; column: string; previous: number | null; value: number }

/**
 * Um item por (tabela, registro, coluna) — o ÚLTIMO do diff, que é o valor que ficaria — em ordem
 * canônica. Sem isso, A→B e B→C no mesmo diff gravariam no log duas mudanças a partir de A.
 */
function finalDiffs(diffs: readonly PlacesDiffItem[]): PlacesDiffItem[] {
	const byKey = new Map<string, PlacesDiffItem>()
	for (const diff of diffs) byKey.set(`${diff.table}:${diff.recordId}:${diff.column}`, diff)
	return [...byKey.values()].sort((a, b) => a.table.localeCompare(b.table) || a.recordId - b.recordId || a.column.localeCompare(b.column))
}

/** Valor atual da coluna, travado até o fim da transação — é o `previous` do log. */
async function lockCurrentValue(tx: SisubDb, diff: PlacesDiffItem): Promise<number | null> {
	const rows =
		diff.table === "kitchen"
			? await tx
					.select({ value: kitchenInKitchen[KITCHEN_DIFF_KEY[diff.column]] })
					.from(kitchenInKitchen)
					.where(eq(kitchenInKitchen.id, diff.recordId))
					.for("update")
			: await tx
					.select({ value: messHallsInKitchen[MESS_HALL_DIFF_KEY[diff.column]] })
					.from(messHallsInKitchen)
					.where(eq(messHallsInKitchen.id, diff.recordId))
					.for("update")
	if (rows.length === 0) throw new DomainError("UPDATE_FAILED", `${diff.table} ${diff.recordId} não encontrado`)
	const value = rows[0].value
	return value == null ? null : Number(value)
}

/**
 * Aplica o diff de relações da hierarquia. `global:2` para o diff; REPARENTAR (mudar a OM de
 * cozinha ou refeitório existente, `isReparentDiff`) exige também `admin:2`, porque decide quem
 * alcança aquela cozinha — e entra em `access_control.sensitive_operation_log` na MESMA
 * transação das escritas, com o antes e o depois de cada coluna.
 *
 * Tudo numa transação: um diff aplicado pela metade deixaria a hierarquia num estado que
 * ninguém desenhou, e o log descreveria o que não ficou.
 */
export async function applyPlacesDiff(
	db: SisubDb,
	ctx: UserContext,
	input: ApplyPlacesDiff,
	audit: AccessAudit = defaultAccessAudit("applyPlacesDiff")
): Promise<{ ok: true; count: number }> {
	// Sem gate, qualquer sessão válida remontava a hierarquia.
	requirePermission(ctx, "global", 2)
	const diffs = finalDiffs(input.diffs)
	if (diffs.some(isReparentDiff) && !hasPermission(ctx.permissions, "admin", 2)) {
		// 403 como qualquer guard, com a frase que diz o que fazer (a tela salva o lote inteiro).
		throw Object.assign(new PermissionDeniedError("admin", 2), {
			message:
				"Mudar a OM de uma cozinha ou de um refeitório muda quem os alcança e exige também administração de acessos (admin nível 2). Nada foi salvo: desfaça essa mudança para salvar o resto, ou peça a um administrador.",
		})
	}

	await db.transaction(async (tx) => {
		// Trava e lê o antes na ordem canônica (`finalDiffs`): dois saves concorrentes travam as
		// mesmas linhas na mesma ordem e não se cruzam em deadlock.
		const changes: ReparentChange[] = []
		for (const diff of diffs.filter(isReparentDiff)) {
			const previous = await runQuery("FETCH_FAILED", () => lockCurrentValue(tx as unknown as SisubDb, diff))
			if (previous !== diff.newValue) changes.push({ table: diff.table, record_id: diff.recordId, column: diff.column, previous, value: diff.newValue })
		}

		// Em sequência: a transação é uma conexão só.
		for (const diff of diffs) {
			try {
				if (diff.table === "kitchen") {
					await tx
						.update(kitchenInKitchen)
						.set({ [KITCHEN_DIFF_KEY[diff.column]]: diff.newValue })
						.where(eq(kitchenInKitchen.id, diff.recordId))
				} else {
					await tx
						.update(messHallsInKitchen)
						.set({ [MESS_HALL_DIFF_KEY[diff.column]]: diff.newValue })
						.where(eq(messHallsInKitchen.id, diff.recordId))
				}
			} catch (e) {
				throw driverFailure("UPDATE_FAILED", e, `Falha ao atualizar ${diff.table} (id ${diff.recordId})`, `Falha ao atualizar ${diff.table}`)
			}
		}

		if (changes.length > 0) {
			await recordSensitiveOperation(tx as unknown as SisubDb, ctx, {
				operation: audit.operation,
				assurance: audit.grade,
				target: { action: "reparent", changes },
			})
		}
	})
	return { ok: true as const, count: input.diffs.length }
}

// ─── Mess-hall lookups + diner presence ─────────────────────────────────────

export async function fetchMessHallByCode(
	db: SisubDb,
	_ctx: UserContext,
	input: FetchMessHallByCode
): Promise<Pick<MessHall, "id" | "unit_id" | "code" | "display_name"> | null> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.messHallsInKitchen.findFirst({
			columns: { id: true, unitId: true, code: true, displayName: true },
			where: eq(messHallsInKitchen.code, input.code),
		})
	)
	return row ? toWire(row) : null
}

export async function fetchMessHallIdByCode(db: SisubDb, _ctx: UserContext, input: FetchMessHallByCode): Promise<number | null> {
	if (!input.code) return null
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.messHallsInKitchen.findFirst({ columns: { id: true }, where: eq(messHallsInKitchen.code, input.code) })
	)
	return row ? Number(row.id) : null
}

export async function fetchUserArranchamento(db: SisubDb, _ctx: UserContext, input: FetchUserArranchamento): Promise<{ will_eat: boolean | null } | null> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ will_eat: arranchamentoInKitchen.willEat })
			.from(arranchamentoInKitchen)
			.where(
				and(
					eq(arranchamentoInKitchen.userId, input.userId),
					eq(arranchamentoInKitchen.date, input.date),
					eq(arranchamentoInKitchen.meal, input.meal),
					eq(arranchamentoInKitchen.messHallId, input.messHallId)
				)
			)
			.limit(1)
	)
	return rows[0] ?? null
}

export async function fetchOtherPresencesCount(db: SisubDb, _ctx: UserContext, input: FetchOtherPresencesCount): Promise<number> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ value: count() })
			.from(otherPresencesInKitchen)
			.where(
				and(
					eq(otherPresencesInKitchen.date, input.date),
					eq(otherPresencesInKitchen.meal, input.meal),
					eq(otherPresencesInKitchen.messHallId, input.messHallId)
				)
			)
	)
	return rows[0]?.value ?? 0
}

export async function addOtherPresence(db: SisubDb, ctx: UserContext, input: AddOtherPresence) {
	// Presença de não-cadastrado lançada pelo Fiscal de rancho.
	requireMessHall(ctx, 2, input.messHallId)

	await runQuery("INSERT_FAILED", () =>
		db.insert(otherPresencesInKitchen).values({ adminId: input.adminId, date: input.date, meal: input.meal, messHallId: input.messHallId })
	)
}

/**
 * Nome de exibição de uma pessoa, para o fiscal conferir quem ele acabou de ler no QR.
 *
 * O próprio nome é livre; o de TERCEIRO exige `messhall:1` no refeitório informado — o guard
 * vivia só na server fn, e esta operação descartava o contexto. A pessoa NÃO precisa ser da
 * OM do refeitório, e isso é deliberado: o comensal de outra OM é atendido em qualquer refeitório, e
 * restringir ao efetivo da unidade deixaria o fiscal sem saber quem entrou. O que se entrega
 * é o nome de exibição e só — e só a quem opera a fiscalização de um refeitório.
 */
export async function resolveDisplayName(db: SisubDb, ctx: UserContext, input: ResolveDisplayName): Promise<string | null> {
	if (input.userId !== ctx.userId) requireMessHall(ctx, 1, input.messHallId)
	try {
		const rows = await db
			.select({ display_name: vUserIdentityInCore.displayName })
			.from(vUserIdentityInCore)
			.where(eq(vUserIdentityInCore.id, input.userId))
			.limit(1)
		return rows[0]?.display_name ?? null
	} catch {
		return null
	}
}
