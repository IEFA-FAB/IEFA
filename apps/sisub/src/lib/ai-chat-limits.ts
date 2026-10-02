/**
 * @module ai-chat-limits
 * Freios dos dois chats de IA do sisub (chat dos módulos e assistente de analytics), num lugar
 * só para os endpoints não divergirem.
 *
 * Arquivo puro (sem env, banco nem request): é o que deixa o teste cobrar a regra sem subir rota.
 * @domain app
 */

import type { RateLimitConfig } from "@iefa/ai-provider"
import { hasUnscopedPermission } from "@iefa/pbac"
import type { UserPermission } from "@/types/domain/permissions"

/**
 * Tetos que valem quando a task definition não traz os `<PREFIX>_AI_MAX_*` (o env vence).
 *
 * Em produção o sisub rodava sem teto nenhum (AI-PROVIDERS.md, "O que está aplicado em
 * produção"): um usuário, uma aba em loop ou um prompt injetado que fizesse o modelo iterar
 * gastavam sem freio. Os valores seguem o `sisub.example.json` para turnos por minuto; a fatia
 * diária por usuário dá ~60 turnos longos de chat com tools por dia, folga larga para o uso real
 * e um corte para o abuso. Ver `@iefa/ai-provider/rate-limit.ts`.
 */
export const SISUB_AI_RATE_LIMIT_DEFAULTS: RateLimitConfig = {
	requestsPerMinute: 12,
	tokensPerDayPerUser: 1_000_000,
}

/** Iterações do loop agêntico por turno, nos dois chats: cada uma reenvia o histórico inteiro. */
export const AI_CHAT_MAX_ITERATIONS = 8

/**
 * O assistente de analytics roda SQL como `analytics_reader` (BYPASSRLS) sobre TODAS as OMs:
 * só quem tem `analytics` SEM escopo entra. `hasPermission(..., "analytics", 1)` sem escopo
 * aceitava um grant escopado, e o escopo não recortava nada do que o assistente lê. O banco e
 * o domínio já recusam conceder `analytics` com escopo (`UNSCOPED_ONLY_MODULES`); isto fecha o
 * endpoint mesmo para linha antiga ou criada fora desses caminhos.
 */
export function canUseAnalyticsAssistant(permissions: UserPermission[]): boolean {
	return hasUnscopedPermission(permissions, "analytics", 1)
}
