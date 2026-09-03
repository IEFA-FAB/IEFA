import { describe, expect, it } from "bun:test"
import { AiProposalSchema } from "@/lib/comaer/schema"
import { aiProposalJsonSchema } from "@/server/document-extraction.schema"

/**
 * O schema de extração é imposto ao Bedrock como `inputSchema` da saída estruturada, e é
 * lido pelo `AiProposalSchema` na volta. As duas pontas precisam falar do mesmo campo.
 *
 * A renomeação para inglês trocou toda chave de `properties` e deixou os `required` em
 * português: o modelo era obrigado a devolver `paragrafos`, chave que o schema não define, e
 * a importação de minuta quebrava em TODA entrada. Nenhum teste pegou porque só o smoke
 * opt-in chega ao provider.
 */
type JsonSchemaNode = { type?: string; properties?: Record<string, JsonSchemaNode>; items?: JsonSchemaNode; required?: readonly string[] }

function walk(node: JsonSchemaNode, path: string, visit: (node: JsonSchemaNode, path: string) => void) {
	visit(node, path)
	for (const [key, child] of Object.entries(node.properties ?? {})) walk(child, `${path}.${key}`, visit)
	if (node.items) walk(node.items, `${path}[]`, visit)
}

describe("schema de extração de minuta", () => {
	it("todo campo obrigatório existe em `properties` do mesmo objeto", () => {
		const orphans: string[] = []
		walk(aiProposalJsonSchema as JsonSchemaNode, "raiz", (node, path) => {
			for (const name of node.required ?? []) {
				if (!node.properties || !(name in node.properties)) orphans.push(`${path}.${name}`)
			}
		})
		expect(orphans).toEqual([])
	})

	it("o que o modelo devolve no formato do schema passa pelo parse da proposta", () => {
		const fromModel = {
			kind: "oficio-comaer",
			scope: "comaer",
			subject: "Prorrogação de prazo",
			sender: { position: "Chefe da Divisão de Ensino" },
			recipients: [{ position: "Chefe do COMGEP", gender: "m" }],
			paragraphs: [
				{
					text: "Solicito prorrogação.",
					items: [{ text: "Doze OM não responderam.", alineas: [{ text: "Prazo original.", subalineas: [{ text: "30 dias." }] }] }],
				},
			],
			references: ["Ofício nº 136/DP/1288"],
			annexes: [],
		}
		expect(() => AiProposalSchema.parse(fromModel)).not.toThrow()
	})
})
