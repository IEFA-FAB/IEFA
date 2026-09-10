/**
 * Stub do `#/server/workspace.fn` para o harness.
 *
 * O cronograma é o que mais mudou de forma na tela e o que mais depende de estado
 * do banco (prazo vencido, prazo de hoje, execução registrada). A fixture cobre um
 * item de cada estado — vencido, vence hoje, futuro e feito —, que é justamente o
 * que nenhum typecheck enxerga.
 *
 * As datas são derivadas de HOJE, não fixas: o estado de um prazo é relativo, e uma
 * fixture com data literal viraria "tudo vencido" alguns meses depois — o harness
 * pararia de cobrir justamente a distinção que ele existe para mostrar.
 */

import type { ChecklistCurrent, Notice, UnidadeGestora } from "@iefa/database/sucont"
import { addDays, todayInBrasilia } from "#/lib/brasilia"

const TODAY = todayInBrasilia()
const COMPETENCIA = `${TODAY.slice(0, 7)}-01`

const item = (over: Partial<ChecklistCurrent>): ChecklistCurrent =>
	({
		id: crypto.randomUUID(),
		task: "Tarefa",
		deadline: "Mensal",
		description: "Descrição da atividade da seção.",
		responsible: "3S VANESSA",
		path: null,
		recurrence: "monthly",
		business_day: null,
		sort_order: 1,
		created_at: "2026-07-06T12:00:00Z",
		updated_at: "2026-07-06T12:00:00Z",
		competencia: COMPETENCIA,
		due_on: addDays(TODAY, 20),
		done_at: null,
		done_by: null,
		...over,
	}) as ChecklistCurrent

export async function listChecklistFn(): Promise<ChecklistCurrent[]> {
	return [
		item({
			task: "Verificação de Carga de XML de Depreciação",
			deadline: "2º dia útil do mês",
			recurrence: "monthly_business_day",
			business_day: 2,
			due_on: addDays(TODAY, -6),
			description: "Confirmar se cada UG realizou a carga do arquivo XML de depreciação e baixa de bens.",
			responsible: "Cada Responsável",
			path: "Tesouro Gerencial: Sucont-4.1 > Monitoramento das UG > Acomp. registro da depreciação",
			sort_order: 1,
		}),
		item({
			task: "Relatório Depreciação > Bem",
			deadline: "4º dia útil do mês",
			recurrence: "monthly_business_day",
			business_day: 4,
			due_on: addDays(TODAY, -4),
			done_at: `${addDays(TODAY, -4)}T14:30:00Z`,
			done_by: "harness-admin",
			description: "Comparar o saldo de depreciação acumulada com o saldo do bem no SIAFI.",
			responsible: "Cada Responsável",
			sort_order: 2,
		}),
		item({
			task: "Prestação de Contas",
			deadline: "1x por semana",
			recurrence: "weekly",
			competencia: addDays(TODAY, -3),
			due_on: TODAY,
			description: "Acompanhamento do fechamento SIAFI.",
			responsible: "Vanessa",
			sort_order: 3,
		}),
		item({
			task: "Conciliação Mensal de Contas de Trânsito",
			description: "Verificar discrepâncias entre conta de trânsito e conta de controle.",
			responsible: "SGT KLEBSON, 3S VANESSA, SGT IARA",
			sort_order: 4,
		}),
	]
}

export async function createChecklistItemFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function setChecklistDoneFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function updateChecklistResponsibleFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function deleteChecklistItemFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function listNoticesFn(): Promise<Notice[]> {
	return [
		{ id: "a1", content: "Reunião de alinhamento mensal agendada para o 1º dia útil.", date: "01/09/2026", type: "info", created_at: "2026-09-01T12:00:00Z" },
		{
			id: "a2",
			content: "Lembrete: prazo final para carga de XML de depreciação se aproxima.",
			date: "04/09/2026",
			type: "alert",
			created_at: "2026-09-04T13:20:00Z",
		},
	]
}

export async function createNoticeFn(): Promise<Notice> {
	return { id: "novo", content: "", date: "10/09/2026", type: "info", created_at: "2026-09-10T12:00:00Z" }
}

export async function deleteNoticeFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function getWorkspaceNoteFn(): Promise<string> {
	return "Pendências da semana:\n- cobrar BAFZ sobre o XML de agosto\n- conferir 1.2.3.1.1.05.03 na BAAF"
}

export async function saveWorkspaceNoteFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function listUnidadesGestorasFn(): Promise<UnidadeGestora[]> {
	const ug = (codigo: string, nome: string, operador: string): UnidadeGestora =>
		({
			codigo,
			nome,
			operador,
			ods: null,
			orgao_superior: null,
			is_setorial: false,
			is_stn: false,
			created_at: "2026-07-06T12:00:00Z",
			updated_at: "2026-07-06T12:00:00Z",
		}) as UnidadeGestora
	return [
		ug("120005", "PABR", "3S VANESSA"),
		ug("120014", "BAFZ", "3S VANESSA"),
		ug("120001", "GABAER", "SGT KLEBSON"),
		ug("120008", "CINDACTA I", "SGT KLEBSON"),
		ug("120004", "BABR", "3S TALITA"),
	]
}
