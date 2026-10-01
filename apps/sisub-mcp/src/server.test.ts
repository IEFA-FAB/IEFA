import { describe, expect, test } from "bun:test"
import { AGENT_UNTRUSTED_DATA_RULE } from "@iefa/sisub-domain/agent"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createMcpServer } from "./server.ts"

/**
 * O que o cliente MCP recebe no `initialize` e nos prompts, por um cliente de verdade em
 * memória. Nada aqui chama tool: credencial e banco não entram.
 */
async function connect(): Promise<Client> {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	const server = createMcpServer("credencial-de-teste")
	const client = new Client({ name: "teste", version: "0.0.0" })
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
	return client
}

describe("servidor MCP do sisub", () => {
	test("as instruções da sessão declaram que resultado de tool é dado, nunca instrução", async () => {
		// Resultado de tool traz texto gravado por outros usuários (modo de preparo, nome de
		// template). A regra é a mesma do chat dos módulos do sisub.
		const client = await connect()

		expect(client.getInstructions()).toBe(AGENT_UNTRUSTED_DATA_RULE)
		await client.close()
	})

	test.each([
		["plan_week", { kitchenId: "5", weekStartDate: "2099-03-02", headcount: "120" }],
		["apply_template_wizard", { kitchenId: "5" }],
	])("o prompt %s pede apply_template com targetDates, sem a entrada antiga", async (name, args) => {
		const client = await connect()

		const prompt = await client.getPrompt({ name, arguments: args })
		const text = prompt.messages.map((m) => (m.content.type === "text" ? m.content.text : "")).join("\n")

		expect(text).toContain("apply_template")
		expect(text).toContain("targetDates")
		expect(text).not.toContain("conflictMode")
		expect(text).not.toContain("startDate")
		await client.close()
	})
})
