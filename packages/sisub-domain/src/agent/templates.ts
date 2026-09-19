/**
 * Aplicação de template semanal por um agente de IA.
 *
 * O chat dos módulos tinha uma `apply_template` própria, montada em PostgREST: sempre
 * soft-deletava os cardápios das datas (modo "replace" fixo), não tinha teto de datas e
 * desfazia a falha no meio com um rollback "melhor esforço" fora de transação. Numa tool que
 * um modelo decide chamar — e que um texto injetado numa receita ou num nome de template pode
 * induzir —, isso era apagar o planejamento de um mês inteiro com uma frase.
 *
 * Aqui a tool vira um invólucro fino da operation do domínio, com duas travas que o fluxo de
 * tela não precisa:
 *   - **só `conflictMode: "skip"`**: o agente preenche refeições vazias e nunca apaga nem
 *     substitui planejamento existente. Substituir continua possível pela tela, que mostra a
 *     prévia do que vai para a lixeira;
 *   - **no máximo {@link AGENT_APPLY_TEMPLATE_MAX_DATES} datas por chamada** — um mês.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { z } from "zod"
import { applyTemplate } from "../operations/templates.ts"
import { DateSchema, KitchenIdSchema } from "../schemas/common.ts"
import type { UserContext } from "../types/context.ts"

/** Teto de datas por chamada de agente: um mês de calendário. */
export const AGENT_APPLY_TEMPLATE_MAX_DATES = 31

export const AgentApplyTemplateSchema = z.object({
	templateId: z.uuid().describe("ID (UUID) do template semanal"),
	kitchenId: KitchenIdSchema.describe("ID da cozinha destino"),
	targetDates: z
		.array(DateSchema)
		.min(1)
		.max(AGENT_APPLY_TEMPLATE_MAX_DATES)
		.describe(`Datas YYYY-MM-DD a preencher (no máximo ${AGENT_APPLY_TEMPLATE_MAX_DATES}). Só essas datas são tocadas`),
	startDayOfWeek: z.number().int().min(1).max(7).describe("Dia do template (1=seg..7=dom) que corresponde à primeira data"),
})
export type AgentApplyTemplate = z.infer<typeof AgentApplyTemplateSchema>

export type AgentApplyTemplateResult = Awaited<ReturnType<typeof applyTemplate>>

/**
 * Materializa o template nas datas pedidas SEM tocar no que já está planejado.
 *
 * Guards (`kitchen:2` na cozinha, template global ou da mesma cozinha, só semanal) e a
 * transação vêm de `applyTemplate`; a lista exata de datas vai em `dates`, então nenhuma data
 * entre a menor e a maior é tocada.
 */
export async function agentApplyTemplate(db: SisubDb, ctx: UserContext, input: AgentApplyTemplate): Promise<AgentApplyTemplateResult> {
	const dates = [...new Set(input.targetDates)].toSorted()
	return applyTemplate(db, ctx, {
		templateId: input.templateId,
		kitchenId: input.kitchenId,
		startDate: dates[0],
		endDate: dates[dates.length - 1],
		startDayOfWeek: input.startDayOfWeek,
		dates,
		conflictMode: "skip",
	})
}
