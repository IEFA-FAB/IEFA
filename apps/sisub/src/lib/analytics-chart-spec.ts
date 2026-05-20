/**
 * Robustly extract a JSON object from raw chart-spec block content.
 *
 * LLMs sometimes wrap the JSON with extra content:
 * - Nested ```json fences
 * - Explanatory text before/after the JSON
 * - Trailing commas
 */
export function extractJsonFromSpec(raw: string): string {
	let cleaned = raw.trim()

	cleaned = cleaned
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/```\s*$/, "")
		.trim()

	const firstBrace = cleaned.indexOf("{")
	const lastBrace = cleaned.lastIndexOf("}")

	if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
		throw new SyntaxError(`Nenhum objeto JSON encontrado no bloco chart-spec. Início do conteúdo: "${raw.slice(0, 120)}"`)
	}

	let json = cleaned.slice(firstBrace, lastBrace + 1)

	json = json.replace(/,\s*([\]}])/g, "$1")
	json = json.replace(/"((?:[^"\\]|\\[\s\S])*)"/g, (_match, content: string) => {
		const fixed = content.replace(/\r\n/g, "\\n").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
		return `"${fixed}"`
	})

	return json
}
