/**
 * Leitura dos blocos de `wrapUntrusted` num prompt montado, para os testes da montagem.
 *
 * O bloco abre e fecha em linhas próprias (`<tag>` e `</tag>`); o cabeçalho que cita a
 * tag no meio da linha fica do lado de fora. O que importa ao teste é a partição: o
 * texto do cliente tem de estar só do lado de dentro.
 */
export function splitPromptBlocks(prompt: string, tag: string): { inside: string[]; outside: string } {
	const inside: string[] = []
	const outside: string[] = []
	let current: string[] | null = null
	for (const line of prompt.split("\n")) {
		if (current === null && line === `<${tag}>`) {
			current = []
		} else if (current !== null && line === `</${tag}>`) {
			inside.push(current.join("\n"))
			current = null
		} else if (current !== null) {
			current.push(line)
		} else {
			outside.push(line)
		}
	}
	// Bloco aberto sem fechamento é montagem quebrada: o resto vira "fora", e o teste falha.
	if (current !== null) outside.push(...current)
	return { inside, outside: outside.join("\n") }
}
