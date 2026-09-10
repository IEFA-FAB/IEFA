/**
 * @module workspace.fn
 * Área de trabalho da seção (checklist mensal, avisos, nota livre) e referência de
 * Unidades Gestoras — persistidos no schema `sucont`. Antes viviam só em localStorage
 * (por-browser); agora são dados compartilhados da seção.
 *
 * Telas da SEÇÃO, não de divisão: o checklist, os avisos e as UGs não têm coluna de
 * divisão e valem para os três lados. Leitura exige nível 1 em QUALQUER divisão;
 * escrita, nível 2 em qualquer uma (requireSucontEditor).
 */

import type { ChecklistCurrent, Notice, UnidadeGestora } from "@iefa/database/sucont"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAccess, requireSucontEditor } from "#/lib/auth.server"
import { todayBrLabel } from "#/lib/brasilia"
import { type ChecklistRecurrence, deadlineLabel, MAX_BUSINESS_DAY } from "#/lib/checklist"
import { getSucontServerClient } from "#/lib/supabase.server"

/**
 * Recorrência e dia útil validados JUNTOS, como o par (módulo, nível) da tela de
 * acessos. Em dois campos independentes, `weekly` + `businessDay: 4` chegaria ao
 * banco e só a checagem `checklist_item_business_day_matches_recurrence` o pegaria
 * — erro de constraint no lugar de erro de formulário.
 */
const RecurrenceSchema = z.discriminatedUnion("recurrence", [
	z.object({ recurrence: z.literal("monthly_business_day"), businessDay: z.number().int().min(1).max(MAX_BUSINESS_DAY) }),
	z.object({ recurrence: z.literal("monthly") }),
	z.object({ recurrence: z.literal("weekly") }),
])

/** O par aceito pelo formulário — a tela tipa o seletor com ele. */
export type ChecklistRecurrenceInput = z.infer<typeof RecurrenceSchema>

// ── Checklist ─────────────────────────────────────────────────────────────────
/**
 * Cronograma com o período corrente já resolvido.
 *
 * Lê a VIEW, não a tabela: `due_on` e `done_at` da competência de hoje saem do
 * banco prontos. A conta de dia útil precisa do calendário de feriados e é a mesma
 * que o cron do `prazo_perdido` usa — refazê-la em TypeScript garantiria duas
 * respostas diferentes para o mesmo prazo no primeiro feriado móvel.
 */
export const listChecklistFn = createServerFn({ method: "GET" }).handler(async (): Promise<ChecklistCurrent[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient()
		.from("checklist_current")
		.select("*")
		.order("sort_order", { ascending: true })
		.order("created_at", { ascending: true })
	if (error) throw new Error(error.message)
	return data ?? []
})

export const createChecklistItemFn = createServerFn({ method: "POST" })
	.validator(
		z
			.object({
				task: z.string().min(1),
				description: z.string().optional(),
				responsible: z.string().optional(),
				path: z.string().optional(),
			})
			.and(RecurrenceSchema)
	)
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const businessDay = data.recurrence === "monthly_business_day" ? data.businessDay : null
		const { error } = await getSucontServerClient()
			.from("checklist_item")
			.insert({
				task: data.task,
				// O rótulo é DERIVADO da recorrência: pedir os dois ao usuário
				// deixaria o texto dizer "semanal" e a coluna calcular por mês.
				deadline: deadlineLabel(data.recurrence as ChecklistRecurrence, businessDay),
				recurrence: data.recurrence,
				business_day: businessDay,
				description: data.description ?? "",
				responsible: data.responsible ?? "Pendente",
				path: data.path || null,
				sort_order: 999,
			})
		if (error) throw new Error(error.message)
		return { ok: true }
	})

/**
 * Marca (ou desmarca) a execução do item na competência CORRENTE.
 *
 * A execução é linha em `checklist_occurrence`, não um booleano no item: a coluna
 * `done` que existia no schema desde o começo — e que nenhuma linha de código
 * chegou a ler — não tinha como significar nada para uma tarefa que se repete todo
 * mês. Marcar em setembro tem que continuar marcado em setembro depois de outubro
 * começar.
 *
 * A competência e o `due_on` vêm da VIEW, nunca do cliente: aceitá-los por
 * parâmetro deixaria qualquer editor gravar execução em competência arbitrária.
 * `due_on` fica congelado na linha — mudar a recorrência do item depois não pode
 * reescrever o prazo que valia naquele mês.
 *
 * Desmarcar apaga o carimbo e mantém a linha: a competência EXISTIU, e é o gatilho
 * do banco que reabre a notificação de prazo perdido a partir dela.
 */
export const setChecklistDoneFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid(), done: z.boolean() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireSucontEditor()
		const db = getSucontServerClient()

		const { data: period, error: periodError } = await db.from("checklist_current").select("competencia, due_on").eq("id", data.id).maybeSingle()
		if (periodError) throw new Error(periodError.message)
		if (!period?.competencia || !period.due_on) throw new Error("Tarefa não encontrada.")

		const { error } = await db.from("checklist_occurrence").upsert(
			{
				item_id: data.id,
				competencia: period.competencia,
				due_on: period.due_on,
				done_at: data.done ? new Date().toISOString() : null,
				done_by: data.done ? ctx.userId : null,
			},
			{ onConflict: "item_id,competencia" }
		)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

export const updateChecklistResponsibleFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid(), responsible: z.string() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const { error } = await getSucontServerClient().from("checklist_item").update({ responsible: data.responsible }).eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

export const deleteChecklistItemFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const { error } = await getSucontServerClient().from("checklist_item").delete().eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// ── Avisos ────────────────────────────────────────────────────────────────────
export const listNoticesFn = createServerFn({ method: "GET" }).handler(async (): Promise<Notice[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient().from("notice").select("*").order("created_at", { ascending: false })
	if (error) throw new Error(error.message)
	return data ?? []
})

export const createNoticeFn = createServerFn({ method: "POST" })
	.validator(z.object({ content: z.string().min(1), type: z.enum(["info", "alert"]) }))
	.handler(async ({ data }): Promise<Notice> => {
		await requireSucontEditor()
		const { data: row, error } = await getSucontServerClient()
			.from("notice")
			// `toLocaleDateString` no servidor lê o fuso do container, que é UTC: o
			// aviso postado às 22h saía com a data do dia seguinte. O fan-out para o
			// sino é gatilho do banco (20260910190600), não daqui.
			.insert({ content: data.content, type: data.type, date: todayBrLabel() })
			.select("*")
			.single()
		if (error) throw new Error(error.message)
		return row
	})

export const deleteNoticeFn = createServerFn({ method: "POST" })
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const { error } = await getSucontServerClient().from("notice").delete().eq("id", data.id)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// ── Nota livre (singleton) ────────────────────────────────────────────────────
export const getWorkspaceNoteFn = createServerFn({ method: "GET" }).handler(async (): Promise<string> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient().from("workspace_note").select("content").eq("id", 1).maybeSingle()
	if (error) throw new Error(error.message)
	return data?.content ?? ""
})

export const saveWorkspaceNoteFn = createServerFn({ method: "POST" })
	.validator(z.object({ content: z.string() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireSucontEditor()
		const { error } = await getSucontServerClient().from("workspace_note").upsert({ id: 1, content: data.content, updated_by: ctx.userId })
		if (error) throw new Error(error.message)
		return { ok: true }
	})

// ── Referência: Unidades Gestoras ─────────────────────────────────────────────
export const listUnidadesGestorasFn = createServerFn({ method: "GET" }).handler(async (): Promise<UnidadeGestora[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient().from("unidade_gestora").select("*").order("codigo", { ascending: true })
	if (error) throw new Error(error.message)
	return data ?? []
})
