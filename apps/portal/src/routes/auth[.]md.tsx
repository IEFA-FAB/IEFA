import { createFileRoute } from "@tanstack/react-router"
import { absoluteUrl } from "@/lib/agent-discovery"

/**
 * Documento de autenticação para agentes.
 *
 * O portal não emite credencial para agente: as áreas privadas usam sessão de
 * usuário em cookie, criada pelo Supabase Auth num navegador. Este arquivo diz
 * isso explicitamente para que um agente não fique tentando descobrir um fluxo
 * de registro que não existe.
 */
const AUTH_MD = `# Autenticação — Portal IEFA

## Resumo

Não há registro nem emissão de credenciais para agentes. O portal não expõe API
autenticada por token. Se você é um agente automatizado, todo o conteúdo que
pode alcançar é público e não requer autenticação.

## O que é público

Tudo que aparece em [\`/llms.txt\`](${absoluteUrl("/llms.txt")}) e em
[\`/sitemap.xml\`](${absoluteUrl("/sitemap.xml")}): páginas institucionais, a suíte
de aplicações, o blog e os artigos publicados da revista SEIVA. Nenhum
cabeçalho de autorização é necessário.

A API pública do IEFA está descrita em
[\`/.well-known/api-catalog\`](${absoluteUrl("/.well-known/api-catalog")}). Seus
endpoints de leitura são abertos; os endpoints administrativos exigem um segredo
compartilhado que não é distribuído.

## O que é privado

Submissão de artigos, avaliação por pares, painel editorial e perfil de usuário
(\`/journal/submit\`, \`/journal/submissions/*\`, \`/journal/review/*\`,
\`/journal/editorial/*\`, \`/journal/profile\`) dependem de sessão de usuário
autenticada por cookie, emitida pelo Supabase Auth durante um login humano no
navegador.

Essas rotas estão desautorizadas no \`robots.txt\`. Não tente acessá-las nem
reutilizar cookies de sessão de uma pessoa.

## Acesso humano

Contas são criadas em [\`/auth\`](${absoluteUrl("/auth")}) por militares e
servidores do Comando da Aeronáutica. Um agente que precise de dado restrito
deve pedir a uma pessoa autorizada que obtenha e compartilhe a informação, e não
tentar autenticar por conta própria.

## Uso do conteúdo

O \`robots.txt\` declara \`search=yes\`, \`ai-input=yes\` e \`ai-train=no\`: indexar,
citar e usar como contexto é permitido; treinar modelos com este conteúdo não é.

Contato institucional: ver [\`/about\`](${absoluteUrl("/about")}).
`

export const Route = createFileRoute("/auth.md")({
	server: {
		handlers: {
			GET: () =>
				new Response(AUTH_MD, {
					headers: {
						"content-type": "text/markdown; charset=utf-8",
						"cache-control": "public, max-age=3600",
					},
				}),
		},
	},
})
