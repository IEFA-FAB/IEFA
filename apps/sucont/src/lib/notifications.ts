/**
 * @module notifications
 * Query options da caixa de entrada do sino.
 *
 * Mora aqui, e não em `lib/queries.ts`, pelo mesmo motivo que as de auth e PBAC
 * moram em `auth/`: quem consome é a CASCA (`hub-layout`), montada em toda tela.
 * `lib/queries.ts` reúne as leituras das telas de dados e importa `auditor.fn`,
 * `sacdgc.fn` e `reports.fn` — fazer a casca depender dele arrastaria o grafo
 * inteiro de server functions para dentro de qualquer coisa que monte o layout,
 * inclusive o harness visual, que roda em Vite puro e quebra ao encontrá-lo.
 */

import { queryOptions } from "@tanstack/react-query"
import { listNotificationsFn } from "#/server/notifications.fn"

/**
 * `staleTime` curto porque o número da bolinha é a promessa da tela: um cache
 * longo mostraria "3" depois de o usuário já ter lido os três. Não há realtime
 * aqui de propósito — o sino não é chat, e um canal WS por aba para quatro pessoas
 * custa mais do que a próxima navegação já resolve.
 */
export const notificationsQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "notifications"] as const,
		queryFn: () => listNotificationsFn(),
		staleTime: 60_000,
	})
