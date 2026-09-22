/**
 * A rotina de expurgo apaga só o que a regra manda, e pelo mesmo caminho do `DELETE`
 * (arquivo antes da linha). Banco e Storage de memória; o mock declara todos os exports do
 * módulo real (o `mock.module` do bun vale para o processo — #384).
 */

import { beforeEach, describe, expect, mock, test } from "bun:test"

type Row = Record<string, unknown>

const state: { threads: Row[]; attachments: Row[]; failRemoveFor: Set<string>; removed: string[]; usage: Row[]; failUsage: boolean } = {
	threads: [],
	attachments: [],
	failRemoveFor: new Set(),
	removed: [],
	usage: [],
	failUsage: false,
}

function from(table: string) {
	const filters: Array<(row: Row) => boolean> = []
	let verb: "select" | "delete" = "select"
	const rows = () => (table === "chat_thread" ? state.threads : table === "chat_turn_usage" ? state.usage : state.attachments)
	const matched = () => rows().filter((row) => filters.every((f) => f(row)))
	const run = () => {
		const hit = matched()
		if (verb === "delete" && table === "chat_turn_usage" && state.failUsage) return { data: null, error: { message: "relation does not exist" } }
		if (verb === "delete" && table === "chat_turn_usage") {
			state.usage = state.usage.filter((row) => !hit.includes(row))
			return { data: hit, error: null }
		}
		if (verb === "delete") {
			state.threads = state.threads.filter((row) => !hit.includes(row))
			state.attachments = state.attachments.filter((row) => !hit.some((thread) => thread.id === row.thread_id))
		}
		return { data: hit, error: null }
	}
	const api = {
		select: () => api,
		delete: () => {
			verb = "delete"
			return api
		},
		eq: (column: string, value: unknown) => {
			filters.push((row) => row[column] === value)
			return api
		},
		is: (column: string, value: unknown) => {
			filters.push((row) => (row[column] ?? null) === value)
			return api
		},
		lt: (column: string, value: string) => {
			filters.push((row) => String(row[column]) < value)
			return api
		},
		lte: (column: string, value: string) => {
			filters.push((row) => String(row[column]) <= value)
			return api
		},
		order: () => api,
		limit: () => api,
		// biome-ignore lint/suspicious/noThenProperty: imita o builder do supabase-js, que só executa quando aguardado
		then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(run()).then(onFulfilled),
	}
	return api
}

const fakeClient = {
	from,
	storage: {
		from: () => ({
			remove: async (paths: string[]) => {
				if (paths.some((path) => state.failRemoveFor.has(path))) return { error: { message: "storage fora do ar" } }
				state.removed.push(...paths)
				return { error: null }
			},
		}),
	},
}

mock.module("../db/supabase.ts", () => ({ supabase: fakeClient, core: fakeClient, accessControl: fakeClient }))

const { purgeExpiredChats } = await import("./purge-chats.ts")

const NOW = new Date("2026-09-22T12:00:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

beforeEach(() => {
	state.failUsage = false
	state.failRemoveFor = new Set()
	state.removed = []
	state.threads = [
		{ id: "old-loose", user_id: "u", submission_id: null, saved_at: null, last_activity_at: daysAgo(181) },
		{ id: "young-loose", user_id: "u", submission_id: null, saved_at: null, last_activity_at: daysAgo(10) },
		{ id: "old-saved", user_id: "u", submission_id: null, saved_at: daysAgo(390), last_activity_at: daysAgo(400) },
		{ id: "old-process", user_id: "u", submission_id: "sub-1", saved_at: null, last_activity_at: daysAgo(400) },
	]
	state.usage = [
		{ id: "u-old", user_id: "u", created_at: daysAgo(3) },
		{ id: "u-new", user_id: "u", created_at: daysAgo(0.5) },
	]
	state.attachments = [
		{ thread_id: "old-loose", storage_path: "u/old-loose/a.pdf" },
		{ thread_id: "old-loose", storage_path: "u/old-loose/b.docx" },
	]
})

describe("purgeExpiredChats", () => {
	test("apaga só a avulsa não salva com 180 dias ou mais, com os arquivos", async () => {
		const report = await purgeExpiredChats(NOW)

		expect(report).toEqual({ removed: 1, failed: 0, usage: 1 })
		// O teto diário olha 24 h; o registro de 3 dias atrás sai, o de 12 horas fica.
		expect(state.usage.map((row) => row.id)).toEqual(["u-new"])
		expect(state.threads.map((row) => row.id)).toEqual(["young-loose", "old-saved", "old-process"])
		expect(state.removed).toEqual(["u/old-loose/a.pdf", "u/old-loose/b.docx"])
		expect(state.attachments).toEqual([])
	})

	test("Storage falhando mantém a conversa para a próxima rodada", async () => {
		state.failRemoveFor.add("u/old-loose/a.pdf")
		const report = await purgeExpiredChats(NOW)

		expect(report).toEqual({ removed: 0, failed: 1, usage: 1 })
		expect(state.threads.map((row) => row.id)).toContain("old-loose")
		expect(state.attachments).toHaveLength(2)
	})

	test("falha na faxina do teto diário não impede o expurgo das conversas", async () => {
		state.failUsage = true
		const report = await purgeExpiredChats(NOW)

		expect(report).toEqual({ removed: 1, failed: 0, usage: 0 })
		expect(state.threads.map((row) => row.id)).not.toContain("old-loose")
	})
})
