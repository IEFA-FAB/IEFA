import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import type { UserPermission } from "@/types/domain/permissions"
import { AI_CHAT_MAX_ITERATIONS, canUseAnalyticsAssistant, SISUB_AI_RATE_LIMIT_DEFAULTS } from "./ai-chat-limits"

function perm(overrides: Partial<UserPermission>): UserPermission {
	return { module: "analytics", level: 1, unit_id: null, kitchen_id: null, mess_hall_id: null, ...overrides }
}

describe("canUseAnalyticsAssistant — o assistente lê todas as OMs, então só entra analytics sem escopo", () => {
	test("analytics sem escopo entra", () => {
		expect(canUseAnalyticsAssistant([perm({ level: 1 })])).toBe(true)
		expect(canUseAnalyticsAssistant([perm({ level: 2 })])).toBe(true)
	})

	test("analytics escopado numa OM não entra", () => {
		expect(canUseAnalyticsAssistant([perm({ unit_id: 5 })])).toBe(false)
		expect(canUseAnalyticsAssistant([perm({ kitchen_id: 7, level: 2 })])).toBe(false)
	})

	test("local-analytics (a visão por OM) não abre o assistente global", () => {
		expect(canUseAnalyticsAssistant([perm({ module: "local-analytics", level: 2 })])).toBe(false)
	})

	test("deny do módulo nega, mesmo escopado", () => {
		expect(canUseAnalyticsAssistant([perm({ level: 2 }), perm({ level: 0, unit_id: 5 })])).toBe(false)
	})

	test("sem permissão nenhuma não entra", () => {
		expect(canUseAnalyticsAssistant([])).toBe(false)
	})
})

/**
 * As rotas SSE não sobem em teste unitário (Nitro + sessão + Supabase). O que se cobra aqui é o
 * fio: cada endpoint usa a regra de acesso, os tetos e o limite de iterações deste módulo, e não
 * uma cópia que diverge.
 */
describe("os dois endpoints de chat usam os freios deste módulo", () => {
	const ROUTES = {
		analytics: resolve(__dirname, "../../routes/api/analytics/stream.post.ts"),
		moduleChat: resolve(__dirname, "../../routes/api/module-chat/stream.post.ts"),
	}

	test("analytics: acesso sem escopo, teto antes do SSE e limite de iterações", () => {
		const source = readFileSync(ROUTES.analytics, "utf8")
		expect(source).toContain("canUseAnalyticsAssistant(permissions)")
		expect(source).not.toMatch(/hasPermission\(permissions, "analytics"/)
		expect(source).toContain('enforceRequestRateLimit("ANALYTICS", user.id, defaultRateLimitStore, SISUB_AI_RATE_LIMIT_DEFAULTS)')
		expect(source).toContain("rateLimitDefaults: SISUB_AI_RATE_LIMIT_DEFAULTS")
		expect(source).toContain("maxIterationsMiddleware(AI_CHAT_MAX_ITERATIONS)")
		expect(source.indexOf("enforceRequestRateLimit(")).toBeLessThan(source.indexOf("toServerSentEventsResponse(stream)"))
	})

	test("chat dos módulos: mesmos tetos e mesmo limite de iterações", () => {
		const source = readFileSync(ROUTES.moduleChat, "utf8")
		expect(source).toContain('enforceRequestRateLimit("MODULE_CHAT", user.id, defaultRateLimitStore, SISUB_AI_RATE_LIMIT_DEFAULTS)')
		expect(source).toContain("rateLimitDefaults: SISUB_AI_RATE_LIMIT_DEFAULTS")
		expect(source).toContain("maxIterationsMiddleware(AI_CHAT_MAX_ITERATIONS)")
	})

	test("os defaults têm teto por usuário e por minuto", () => {
		expect(SISUB_AI_RATE_LIMIT_DEFAULTS.requestsPerMinute).toBeGreaterThan(0)
		expect(SISUB_AI_RATE_LIMIT_DEFAULTS.tokensPerDayPerUser).toBeGreaterThan(0)
		expect(AI_CHAT_MAX_ITERATIONS).toBeGreaterThan(0)
	})
})
