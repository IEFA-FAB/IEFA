/**
 * @module message-text
 * Texto de uma resposta do modelo.
 *
 * Existe porque `.content.toString()` deixou de funcionar quando o α passou para o
 * Bedrock. O `ChatOpenAI` devolvia `content` como string; o `ChatBedrockConverse` devolve
 * um ARRAY de blocos (`[{ type: "text", text: "…" }]`), e `Array.prototype.toString()`
 * junta os elementos com vírgula chamando `String()` em cada um — o que produz
 * `"[object Object],[object Object]"`.
 *
 * Não era erro visível em lugar nenhum: a resposta chegava ao usuário com esse literal no
 * lugar do texto. Módulo puro para poder ser testado sem credencial.
 */

/** Bloco de conteúdo do LangChain, no que interessa aqui. */
type ContentPart = string | { type?: string; text?: string; [k: string]: unknown }

/**
 * Concatena o texto dos blocos, descartando o que não é texto (uso de ferramenta,
 * imagem, raciocínio). String passa direto.
 */
export function messageText(content: unknown): string {
	if (typeof content === "string") return content
	if (!Array.isArray(content)) return ""

	return (content as ContentPart[])
		.map((part) => {
			if (typeof part === "string") return part
			// `text` só conta quando o bloco É de texto: blocos de tool use trazem outros
			// campos e incluí-los misturaria argumento de ferramenta na resposta.
			return part && (part.type === "text" || part.type === undefined) && typeof part.text === "string" ? part.text : ""
		})
		.join("")
}
