import { z } from "zod"

export type JsonSchemaObject = {
	type: "object"
	properties: Record<string, unknown>
	required?: string[]
}

/**
 * Converte um schema Zod no JSON Schema que as ferramentas de IA anunciam (MCP
 * `inputSchema`, function-calling `parameters`).
 *
 * Usa o conversor nativo do Zod 4. A versão anterior chamava `zod-to-json-schema`, um
 * pacote escrito para o Zod 3: com schemas do Zod 4 ele não reconhece nada e devolve
 * `{ "$schema": "..." }` — objeto vazio, sem `properties`. Ou seja, TODA tool do servidor
 * MCP anunciava "não recebe parâmetro nenhum", e o modelo do outro lado só podia adivinhar
 * os argumentos. Nada quebrava no typecheck porque o retorno continuava sendo um objeto.
 *
 * `io: "input"` é o lado certo: o que trafega é o argumento antes do parse (com os
 * `.default()` ainda opcionais). `reused: "inline"` mantém o schema autocontido — clientes
 * MCP não resolvem `$ref` para `$defs`.
 */
// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema Zod, como o conversor
export function toJsonSchema(schema: any): JsonSchemaObject {
	return z.toJSONSchema(schema, { target: "draft-7", io: "input", reused: "inline" }) as unknown as JsonSchemaObject
}
