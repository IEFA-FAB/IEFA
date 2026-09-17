/**
 * @module ui/markdown
 * Markdown de resposta de modelo, renderizado.
 *
 * Existe porque texto de IA CHEGA em Markdown: `**negrito**`, `1.`, `-` e `###` são a
 * forma como o modelo separa ideia de ideia. Impresso cru dentro de um `<p>`, o asterisco
 * vira ruído no meio da frase e a enumeração — que na NSCA 5-3 é item, alínea e subalínea —
 * perde a hierarquia que a resposta tinha.
 *
 * Três decisões que não são estética:
 *
 * 1. **`rehypeSanitize` é obrigatório.** O texto vem do modelo, e o modelo repete o que o
 *    usuário mandou: é entrada não confiável virando HTML. Sem o sanitizador, um `<img
 *    onerror>` copiado para dentro da conversa executa.
 * 2. **Plugins e mapa de componentes são constantes de módulo.** O `react-markdown`
 *    reprocessa a árvore quando a identidade dessas props muda; declará-los inline faz cada
 *    token do stream reparsear a mensagem inteira com objetos novos.
 * 3. **`memo` por bloco.** Durante o stream o estado do chat muda a cada delta e re-renderiza
 *    a transcrição toda; sem isto, as mensagens ANTERIORES — já fechadas — seriam reparseadas
 *    a cada token da mensagem em curso.
 *
 * Duas alternativas prontas foram medidas antes desta, e as duas perdem AQUI:
 *
 * - **`TextPart` de `@tanstack/ai-react/ui`** é o mesmo `react-markdown`, com um encadeamento
 *   fixo de `remark-gfm` + `rehype-raw` + `rehype-highlight` + `rehype-sanitize`. O
 *   `rehype-highlight` arrasta o `lowlight` com as 37 linguagens do `common` para o BUNDLE DO
 *   NAVEGADOR, e o único jeito de tirá-lo (`disableDefaultPlugins`) leva junto o sanitizador.
 *   Medido nos dois builds: o chunk do DocumentEditor vai de 265 KB para 604 KB, e o JS total
 *   do portal, de 4,67 MB para 5,01 MB (+105 KB comprimidos) — para destacar sintaxe num
 *   painel que redige ofício em português e nunca mostra código.
 * - **`Bun.markdown`** (nativo, quatro modos, ~2,8 µs por render aqui) é API do RUNTIME: não
 *   existe no navegador, e esta transcrição é montada no cliente, token a token. Serviria a
 *   Markdown renderizado no servidor — a página de documentos legais, por exemplo —, que é
 *   outra mudança.
 */

import { memo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

// `remarkBreaks`: quebra de linha simples do modelo é intenção de quebra, não continuação
// de parágrafo — sem ele, "1º ...\n2º ..." sai numa linha só.
const remarkPlugins = [remarkGfm, remarkBreaks]
const rehypePlugins = [rehypeSanitize]

/** Escala de conversa: menor que a da página legal e sem margem sobrando no fim do balão. */
const components: Partial<Components> = {
	p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
	ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 flex flex-col gap-1">{children}</ul>,
	ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 flex flex-col gap-1">{children}</ol>,
	li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
	strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
	em: ({ children }) => <em className="italic">{children}</em>,
	// Título dentro de balão de conversa não é hierarquia de página: vira ênfase de bloco, e
	// sem nível de heading para não injetar um h1 no meio do documento de quem usa leitor.
	h1: ({ children }) => <p className="text-sm font-semibold mb-2 last:mb-0">{children}</p>,
	h2: ({ children }) => <p className="text-sm font-semibold mb-2 last:mb-0">{children}</p>,
	h3: ({ children }) => <p className="text-sm font-semibold mb-2 last:mb-0">{children}</p>,
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
			{children}
		</a>
	),
	code: ({ children }) => <code className="bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
	pre: ({ children }) => <pre className="bg-muted p-2 my-2 overflow-x-auto text-xs">{children}</pre>,
	blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 my-2 italic">{children}</blockquote>,
	hr: () => <hr className="border-border my-3" />,
	table: ({ children }) => (
		<div className="my-2 overflow-x-auto border border-border">
			<table className="w-full border-collapse text-xs">{children}</table>
		</div>
	),
	thead: ({ children }) => <thead className="border-b border-border bg-muted/40">{children}</thead>,
	th: ({ children }) => <th className="px-2 py-1 text-left font-semibold align-top">{children}</th>,
	td: ({ children }) => <td className="border-b border-border px-2 py-1 align-top">{children}</td>,
}

/** Renderiza Markdown vindo de modelo. Sanitizado: o conteúdo não é confiável. */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
	return (
		<ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
			{children}
		</ReactMarkdown>
	)
})
