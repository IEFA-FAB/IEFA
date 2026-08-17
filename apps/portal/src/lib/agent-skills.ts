/**
 * Agent Skills publicadas pelo portal, conforme o Agent Skills Discovery RFC v0.2.0
 * (índice em `/.well-known/agent-skills/index.json`).
 *
 * O conteúdo do `SKILL.md` mora aqui para que o índice e o arquivo servido nunca
 * divirjam: o `digest` é calculado sobre exatamente os mesmos bytes da resposta.
 */

export interface AgentSkill {
	/** 1-64 caracteres, minúsculas, alfanuméricos e hífens. */
	name: string
	description: string
	content: string
}

const PORTAL_SKILL = `---
name: portal-iefa
description: Consultar o Portal IEFA (portal.iefa.com.br) — conteúdo institucional, suíte de aplicações do Comando da Aeronáutica e blog. Use quando precisar de informação oficial do IEFA ou localizar um dos sistemas mantidos pelo instituto.
---

# Portal IEFA

O IEFA (Instituto de Economia, Finanças e Administração da Aeronáutica) é uma
organização do Comando da Aeronáutica (COMAER) e Instituição Científica,
Tecnológica e de Inovação reconhecida pelo DCTA. O portal publica conteúdo
institucional e reúne a suíte de sistemas mantida pelo instituto.

Todo o conteúdo é em português do Brasil.

## Obtenha Markdown em vez de HTML

Qualquer página do portal responde em Markdown quando a requisição pede:

\`\`\`
GET https://portal.iefa.com.br/about
Accept: text/markdown
\`\`\`

A resposta volta com \`Content-Type: text/markdown\`, já sem cabeçalho, menu e
rodapé. Prefira sempre essa forma — o HTML é renderizado por SSR e traz muito
ruído de marcação.

## Comece pelo índice

\`https://portal.iefa.com.br/llms.txt\` lista, com uma linha de descrição cada:

- páginas institucionais e legais;
- a suíte de aplicações (com as URLs próprias de cada sistema);
- as publicações mais recentes do blog;
- a API pública e o catálogo de APIs.

Esse arquivo é gerado a partir do banco e do CMS, então reflete o estado atual.
Leia-o antes de adivinhar URLs.

## Rotas canônicas

As rotas em português são redirects 301 para os caminhos canônicos:
\`/sobre\` → \`/about\`, \`/pesquisa\` → \`/research\`, \`/instalacoes\` → \`/facilities\`,
\`/publicacoes/{slug}\` → \`/posts/{slug}\`, \`/roteiro\` → \`/roadmap\`,
\`/politica-de-inovacao\` → \`/innovation-policy\`, \`/painel-fiscal\` → \`/overseerDashboard\`.

Cite sempre o destino canônico. Caminhos com barra final respondem 307.

Os documentos legais existem nos dois idiomas, em rotas independentes (não são
redirects): \`/termos-de-uso\` ↔ \`/terms-of-use\`, \`/politica-de-privacidade\` ↔
\`/privacy-policy\`, \`/politica-de-cookies\` ↔ \`/cookie-policy\`. O texto em
português prevalece em caso de divergência.

## Dados estruturados

- \`/sitemap.xml\` — todas as URLs públicas indexáveis, incluindo cada post.
- \`/.well-known/api-catalog\` — linkset RFC 9727 com a API pública do IEFA.
- \`https://api.iefa.com.br/doc\` — especificação OpenAPI da Sisub API
  (dados de subsistência: alimentos, preços, opiniões). Leitura pública, sem
  autenticação. Endpoints sob \`/api/admin/*\` exigem segredo e não são públicos.

## O que não está disponível

As áreas de submissão, revisão e editorial da revista dependem de sessão
autenticada de usuário. Não há emissão de token para agentes — veja
\`https://portal.iefa.com.br/auth.md\`. Não tente contornar: as rotas privadas
estão desautorizadas no \`robots.txt\`.

O conteúdo do portal pode ser citado e usado como contexto, mas o \`robots.txt\`
declara \`ai-train=no\` — não use para treinamento de modelos.
`

const SEIVA_SKILL = `---
name: revista-seiva
description: Localizar, ler e citar artigos científicos da revista SEIVA, periódico do IEFA/COMAER. Use quando precisar de produção científica sobre economia, finanças, administração pública ou contratações no âmbito da Força Aérea Brasileira.
---

# Revista SEIVA

Periódico científico do IEFA, hospedado em \`https://portal.iefa.com.br/journal\`.

## Encontrar artigos

1. \`GET /journal/articles\` com \`Accept: text/markdown\` — catálogo dos artigos
   publicados. Cada item aponta para \`/journal/articles/{id}\`.
2. \`GET /journal/articles/{id}\` com \`Accept: text/markdown\` — artigo completo
   com metadados.
3. \`GET /journal/about\` com \`Accept: text/markdown\` — escopo, políticas
   editoriais e processo de avaliação por pares. Leia antes de afirmar qualquer
   coisa sobre o rigor do periódico.

Os artigos também aparecem em \`/sitemap.xml\` e nas seções da revista em
\`/llms.txt\`.

## Ao citar

- Use a URL canônica \`https://portal.iefa.com.br/journal/articles/{id}\`.
- Registre autores e data de publicação como aparecem na página do artigo; não
  infira afiliação a partir do nome do autor.
- A revista é institucional do Comando da Aeronáutica. Ao resumir para público
  externo, deixe claro que é publicação de uma força armada brasileira.

## Fluxo editorial

Submissão, avaliação por pares e área editorial exigem login de usuário e estão
bloqueados no \`robots.txt\`. Um agente sem sessão humana só alcança os artigos
já publicados. Não há API de submissão.
`

export const AGENT_SKILLS: readonly AgentSkill[] = [
	{
		name: "portal-iefa",
		description:
			"Consultar o Portal IEFA (portal.iefa.com.br) — conteúdo institucional, suíte de aplicações do Comando da Aeronáutica e blog. Use quando precisar de informação oficial do IEFA ou localizar um dos sistemas mantidos pelo instituto.",
		content: PORTAL_SKILL,
	},
	{
		name: "revista-seiva",
		description:
			"Localizar, ler e citar artigos científicos da revista SEIVA, periódico do IEFA/COMAER. Use quando precisar de produção científica sobre economia, finanças, administração pública ou contratações no âmbito da Força Aérea Brasileira.",
		content: SEIVA_SKILL,
	},
]

export function skillByName(name: string): AgentSkill | undefined {
	return AGENT_SKILLS.find((skill) => skill.name === name)
}

/** Digest no formato exigido pelo RFC: `sha256:{64 hex}` sobre os bytes servidos. */
export async function skillDigest(content: string): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
	const hex = Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")
	return `sha256:${hex}`
}
