import { describe, expect, it } from "bun:test"
import { buildHistory, hasTurnInProgress, type StoredMessage } from "./history.ts"

let seq = 0
const at = (minute: number) => new Date(Date.UTC(2026, 8, 22, 12, minute)).toISOString()
const q = (content: string, minute = seq): StoredMessage => ({
	id: `q-${content}`,
	role: "user",
	content,
	status: "complete",
	reply_to: null,
	created_at: at(minute),
})
const a = (content: string, question: string, status: StoredMessage["status"] = "complete"): StoredMessage => ({
	id: `a-${content}-${seq++}`,
	role: "assistant",
	content,
	status,
	reply_to: `q-${question}`,
	created_at: at(seq),
})

describe("buildHistory", () => {
	it("mantém os pares completos e tira os rótulos de citação", () => {
		expect(buildHistory([q("P1"), a("R1 [N1].", "P1"), q("P2"), a("R2", "P2")])).toEqual([
			{ role: "user", content: "P1" },
			{ role: "assistant", content: "R1." },
			{ role: "user", content: "P2" },
			{ role: "assistant", content: "R2" },
		])
	})

	it("dois turnos simultâneos: pareia pela pergunta respondida, não pela ordem das linhas", () => {
		// Duas abas: as perguntas gravadas antes das respostas.
		expect(buildHistory([q("P1"), q("P2"), a("R1", "P1"), a("R2", "P2")])).toEqual([
			{ role: "user", content: "P1" },
			{ role: "assistant", content: "R1" },
			{ role: "user", content: "P2" },
			{ role: "assistant", content: "R2" },
		])
	})

	it("pergunta cujo turno caiu sai do histórico, com a resposta interrompida", () => {
		expect(buildHistory([q("P1"), a("", "P1", "error"), q("P2"), a("parcial", "P2", "aborted"), q("P3"), a("R3", "P3")])).toEqual([
			{ role: "user", content: "P3" },
			{ role: "assistant", content: "R3" },
		])
	})

	it("pergunta sem resposta nenhuma não entra", () => {
		expect(buildHistory([q("P1"), a("R1", "P1"), q("P2")])).toHaveLength(2)
	})

	it("corta pelos pares mais recentes, começando sempre numa pergunta", () => {
		const messages = [q("P1"), a("R1", "P1"), q("P2"), a("R2", "P2"), q("P3"), a("R3", "P3")]
		expect(buildHistory(messages, 5).map((message) => message.content)).toEqual(["P2", "R2", "P3", "R3"])
	})
})

describe("hasTurnInProgress", () => {
	const now = new Date(at(10))

	it("pergunta recente sem resposta: turno em andamento", () => {
		expect(hasTurnInProgress([q("P1", 9)], now, 180_000)).toBe(true)
	})

	it("pergunta antiga sem resposta (o processo caiu no meio) não trava a conversa", () => {
		expect(hasTurnInProgress([q("P1", 1)], now, 180_000)).toBe(false)
	})

	it("pergunta respondida, mesmo com erro, não é turno em andamento", () => {
		expect(hasTurnInProgress([q("P1", 9), a("", "P1", "error")], now, 180_000)).toBe(false)
	})
})
