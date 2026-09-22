import { describe, expect, it } from "bun:test"
import { isPurgeable, purgeAt, RETENTION_DAYS } from "./retention.ts"

const DAY = 24 * 60 * 60 * 1000
const now = new Date("2026-09-22T12:00:00Z")
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY).toISOString()
const avulsa = (lastActivityDaysAgo: number) => ({ submission_id: null, saved_at: null, last_activity_at: daysAgo(lastActivityDaysAgo) })

describe("guarda de conversa", () => {
	it("avulsa com 179 dias sem uso fica", () => {
		expect(isPurgeable(avulsa(179), now)).toBe(false)
	})

	it(`avulsa com ${RETENTION_DAYS} dias sem uso sai`, () => {
		expect(isPurgeable(avulsa(RETENTION_DAYS), now)).toBe(true)
	})

	it("salva não expira, por mais antiga que seja", () => {
		const thread = { ...avulsa(400), saved_at: daysAgo(390) }
		expect(purgeAt(thread)).toBeNull()
		expect(isPurgeable(thread, now)).toBe(false)
	})

	it("de processo não entra na regra: vive com o processo", () => {
		const thread = { ...avulsa(400), submission_id: "submission-1" }
		expect(purgeAt(thread)).toBeNull()
		expect(isPurgeable(thread, now)).toBe(false)
	})

	it("recém-desmarcada conta o prazo a partir de agora, porque desmarcar toca a atividade", () => {
		const thread = { submission_id: null, saved_at: null, last_activity_at: now.toISOString() }
		expect(purgeAt(thread)?.toISOString()).toBe(new Date(now.getTime() + RETENTION_DAYS * DAY).toISOString())
		expect(isPurgeable(thread, now)).toBe(false)
	})
})
