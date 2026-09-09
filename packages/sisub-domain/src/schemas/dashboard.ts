import { z } from "zod"

/**
 * Janela máxima do painel, em dias.
 *
 * O painel devolve linha a linha de previsão e presença, mais o diretório das pessoas que
 * aparecem nelas. Sem teto, um intervalo de anos vira dump nominal — que é exatamente o que
 * este trabalho está fechando. 92 dias cobrem o trimestre, que é o horizonte real da tela.
 */
export const MAX_DASHBOARD_RANGE_DAYS = 92

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD")

function daysBetween(startDate: string, endDate: string): number {
	const start = Date.parse(`${startDate}T00:00:00Z`)
	const end = Date.parse(`${endDate}T00:00:00Z`)
	return (end - start) / 86_400_000
}

/**
 * Entrada do painel de uma unidade.
 *
 * `unitId` NÃO é decorativo: é ele que o guard usa para exigir `local-analytics` naquela
 * unidade, e é ele que recorta os refeitórios. Antes a tela ignorava a unidade da rota e
 * lia o efetivo de TODOS os refeitórios da FAB.
 */
export const UnitDashboardSchema = z
	.object({
		unitId: z.number().int().positive(),
		/** Refeitório específico; ausente = todos os refeitórios da unidade. */
		messHallId: z.number().int().positive().optional(),
		startDate: IsoDate,
		endDate: IsoDate,
	})
	.refine((v) => v.startDate <= v.endDate, {
		message: "startDate deve ser anterior ou igual a endDate",
		path: ["endDate"],
	})
	.refine((v) => daysBetween(v.startDate, v.endDate) <= MAX_DASHBOARD_RANGE_DAYS, {
		message: `Intervalo máximo de ${MAX_DASHBOARD_RANGE_DAYS} dias`,
		path: ["endDate"],
	})

export type UnitDashboard = z.infer<typeof UnitDashboardSchema>
