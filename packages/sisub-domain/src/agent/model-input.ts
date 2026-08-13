/**
 * Normalização dos argumentos que um modelo manda para uma tool.
 *
 * Modelo não omite campo opcional: ele manda `null`. `{"limit":2,"search":null}` foi o que o
 * llama-3.3 mandou de verdade para `list_recipes`, e foi o começo de uma morte em cadeia —
 * o schema rejeitou, o modelo tentou de novo com sintaxe de function call quebrada e o
 * provider matou a run com `tool_use_failed`.
 *
 * A regra: **`null` que o schema não previu significa "não informado"**. Os schemas do
 * domínio declaram os opcionais como `.nullish()` e tratam o `null` eles mesmos; as tools de
 * JSON Schema escrito à mão (`{ "type": "string" }`) não preveem `null`, e para elas o campo
 * é apagado antes de chegar no handler — sem isso, `safeInt(null)` vira `0` em silêncio e
 * `Number(null)` passa por "inteiro válido".
 *
 * Onde roda: no `wrapTool` do chat dos módulos e no despacho do servidor MCP — os dois
 * únicos pontos por onde argumento de modelo entra no domínio.
 */

type JsonValue = unknown
type JsonSchemaLike = { type?: unknown; properties?: Record<string, unknown>; anyOf?: unknown[]; oneOf?: unknown[]; enum?: unknown[]; const?: unknown }

function asSchema(value: unknown): JsonSchemaLike | undefined {
	return value != null && typeof value === "object" ? (value as JsonSchemaLike) : undefined
}

/** O schema desta propriedade aceita `null` explicitamente? */
function allowsNull(schema: unknown): boolean {
	const s = asSchema(schema)
	if (!s) return false
	if (s.type === "null") return true
	if (Array.isArray(s.type) && s.type.includes("null")) return true
	if (s.const === null) return true
	if (Array.isArray(s.enum) && s.enum.includes(null)) return true
	for (const branch of [...(s.anyOf ?? []), ...(s.oneOf ?? [])]) {
		if (allowsNull(branch)) return true
	}
	return false
}

/**
 * Remove de `args` os campos em `null` que o schema não declara como anuláveis. Recursivo
 * nos objetos aninhados; arrays passam intactos (posição em array é significativa — apagar
 * um item deslocaria os demais).
 */
export function dropUnexpectedNulls<T extends Record<string, JsonValue>>(args: T, schema?: unknown): T {
	if (args == null || typeof args !== "object" || Array.isArray(args)) return args

	const properties = asSchema(schema)?.properties
	const out: Record<string, JsonValue> = {}

	for (const [key, value] of Object.entries(args)) {
		const propSchema = properties?.[key]

		if (value === null) {
			if (allowsNull(propSchema)) out[key] = value
			continue
		}
		if (value === undefined) continue

		if (value != null && typeof value === "object" && !Array.isArray(value)) {
			out[key] = dropUnexpectedNulls(value as Record<string, JsonValue>, propSchema)
			continue
		}

		out[key] = value
	}

	return out as T
}
