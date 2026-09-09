/**
 * @module queries
 * Fábricas de query options das rotas de dados do sucont.
 *
 * Existem para que a MESMA definição sirva ao loader (que aquece o cache antes do
 * HTML sair) e ao componente (que lê o cache já quente). Chave escrita duas vezes
 * é chave livre para divergir: o loader busca uma coisa, a tela espera outra e o
 * resultado é um fetch a mais depois da hidratação — exatamente a cascata que o
 * priming veio remover.
 *
 * As options de auth e PBAC continuam em `auth/service.ts` e `auth/pbac.ts`, junto
 * do domínio delas.
 */

import { queryOptions } from "@tanstack/react-query"
import { loadAuditorBalancesFn } from "#/server/auditor.fn"
import { listReportsFn } from "#/server/reports.fn"
import { listDgcRunsFn } from "#/server/sacdgc.fn"
import { getWorkspaceNoteFn, listChecklistFn, listNoticesFn, listUnidadesGestorasFn } from "#/server/workspace.fn"

/** Série completa de saldos SIAFI x SILOMS — o payload mais pesado do app. */
export const auditorBalancesQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "auditor", "balances"] as const,
		queryFn: () => loadAuditorBalancesFn({ data: {} }),
	})

/** Cronograma da seção. */
export const checklistQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "checklist"] as const,
		queryFn: () => listChecklistFn(),
	})

/** Avisos da seção. */
export const noticesQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "notices"] as const,
		queryFn: () => listNoticesFn(),
	})

/** Unidades Gestoras (tabela de referência). */
export const unidadesGestorasQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "unidades"] as const,
		queryFn: () => listUnidadesGestorasFn(),
	})

/** Nota livre compartilhada da área de trabalho. */
export const workspaceNoteQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "note"] as const,
		queryFn: () => getWorkspaceNoteFn(),
	})

/** Relatórios anexados pela seção. */
export const reportsQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "reports"] as const,
		queryFn: () => listReportsFn(),
	})

/**
 * Histórico de rodadas gravadas do SAC-DGC. Em React Query, e não em `useState` +
 * `.catch`, porque os três estados precisam chegar separados na tela: carregando,
 * falhou e vazio. Colapsá-los em `[]` fazia uma consulta morta parecer competência
 * nova.
 */
export const dgcRunsQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "dgc", "runs"] as const,
		queryFn: () => listDgcRunsFn(),
	})
