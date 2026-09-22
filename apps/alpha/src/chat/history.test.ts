import { describe, expect, it } from "bun:test"
import { buildHistory, type StoredMessage } from "./history.ts"

const q = (content: string): StoredMessage => ({ role: "user", content, status: "complete" })
const a = (content: string, status: StoredMessage["status"] = "complete"): StoredMessage => ({ role: "assistant", content, status })

describe("buildHistory", () => {
	it("mantém os pares completos e tira os rótulos de citação", () => {
		expect(buildHistory([q("P1"), a("R1 [N1]."), q("P2"), a("R2")])).toEqual([
			{ role: "user", content: "P1" },
			{ role: "assistant", content: "R1." },
			{ role: "user", content: "P2" },
			{ role: "assistant", content: "R2" },
		])
	})

	it("pergunta cujo turno caiu sai do histórico, com a resposta interrompida", () => {
		expect(buildHistory([q("P1"), a("", "error"), q("P2"), a("parcial", "aborted"), q("P3"), a("R3")])).toEqual([
			{ role: "user", content: "P3" },
			{ role: "assistant", content: "R3" },
		])
	})

	it("pergunta sem resposta nenhuma (a do turno corrente, já gravada) não entra", () => {
		expect(buildHistory([q("P1"), a("R1"), q("P2")])).toHaveLength(2)
	})

	it("corta pelos pares mais recentes, começando sempre numa pergunta", () => {
		const messages = [q("P1"), a("R1"), q("P2"), a("R2"), q("P3"), a("R3")]
		expect(buildHistory(messages, 5).map((message) => message.content)).toEqual(["P2", "R2", "P3", "R3"])
	})
})
