# Agent Readiness — Portal IEFA

Como o portal se apresenta para agentes de IA e crawlers. Baseado nos padrões
verificados por [isitagentready.com](https://isitagentready.com/portal.iefa.com.br).

Ponto de partida: **21/100 (Level 1)** na varredura de 30/07/2026 — dois checks
falhavam com HTTP 500, não com 404.

## O bug que estava por baixo

`Accept: text/markdown` e `Accept: application/json` retornavam **500** em
qualquer URL do portal, incluindo a home. A origem é o `executeRouter` do
TanStack Start (`start-server-core/src/createStartHandler.ts`), que responde

```json
{ "error": "Only HTML requests are supported here" }
```

com status 500 para todo `Accept` que não contenha `text/html` nem o coringa.
Isso afetava qualquer cliente HTTP não-navegador, não só agentes.

Corrigido em `src/server.ts`, que envelopa o handler do Start. O 500 genérico
vira `406 Not Acceptable` com corpo explicativo; requisições de Markdown são
atendidas de verdade.

## Fonte única de verdade

`src/lib/agent-discovery.ts` define as páginas públicas canônicas, os documentos
de descoberta e a API pública. `sitemap.xml`, `llms.txt`, `/.well-known/api-catalog`
e os cabeçalhos `Link` derivam todos dele — não há lista duplicada para
dessincronizar.

## O que é servido

| Endereço | Formato | Origem |
|---|---|---|
| `/llms.txt` | `text/plain` | catálogo + apps do banco (`iefa.apps`) + posts do Sanity |
| `/sitemap.xml` | `application/xml` | catálogo + posts do Sanity |
| `/robots.txt` | `text/plain` | estático, em `public/` |
| `/.well-known/api-catalog` | `application/linkset+json` | RFC 9727 |
| `/.well-known/agent-skills/index.json` | `application/json` | Agent Skills Discovery RFC v0.2.0 |
| `/.well-known/agent-skills/{skill}/SKILL.md` | `text/markdown` | `src/lib/agent-skills.ts` |
| `/auth.md` | `text/markdown` | documento honesto sobre autenticação |
| qualquer página | `text/markdown` | via `Accept: text/markdown` |

O `digest` no índice de skills é calculado em tempo de requisição sobre os mesmos
bytes servidos em `SKILL.md`. Índice e artefato não têm como divergir.

### Negociação de Markdown

`src/server/agent/html-to-markdown.ts` extrai `<main id="conteudo">` do HTML
renderizado por SSR — o mesmo elemento definido em `AppLayout` e usado tanto pelo
layout `_public` quanto pelo `/journal` — e converte para Markdown. Cabeçalho,
navegação, rodapé e o estado serializado do router ficam de fora.

Como o Markdown espelha o HTML que aquele requisitante receberia, o
comportamento com sessão autenticada é preservado sem trabalho extra.

### Sitemap

O `public/sitemap.xml` anterior apontava para `/chat/rada` e `/facilidades`, que
**não existem** (as rotas reais são `/chatRada` e `/instalacoes`, esta última um
301 para `/facilities`). Também carimbava `lastmod: 2025-11-01` em tudo.

Agora é gerado dinamicamente: 15 páginas canônicas mais um item por post do
Sanity, com `lastmod` real vindo do `publishedAt`. Páginas estáticas não trazem
`lastmod` — melhor omitir do que inventar uma data.

### Content-Signal

`public/robots.txt` declara `search=yes, ai-input=yes, ai-train=no` e bloqueia os
coletores voltados a treinamento. **Esses valores são decisão institucional, não
técnica** — quem manda no conteúdo do IEFA decide se `ai-train` continua `no`.

O `robots.txt` também passou a desautorizar `/auth`, `/journal/editorial/`,
`/journal/submissions/`, `/journal/review/`, `/journal/profile` e `/health`, que
antes eram liberados para crawl.

### WebMCP

`src/components/WebMcpTools.tsx` registra três tools via
`navigator.modelContext.provideContext()`: `buscar_no_portal`,
`listar_aplicacoes` e `abrir_pagina`.

Só rotas **públicas** entram. As descrições de tool podem sair do navegador para
um modelo de terceiros, então o mapa de rotas autenticadas fica de fora de
propósito.

## O que não foi implementado, e por quê

**MCP Server Card** (`/.well-known/mcp/server-card.json`) — o portal não tem
endpoint MCP. `sisub-mcp` é stdio local, não exposto por HTTP. Publicar um card
faria agentes tentarem conectar num endereço que não responde. Pontuar no scanner
não compensa anunciar capacidade inexistente.

**OAuth / OIDC discovery** e **OAuth Protected Resource** — as áreas privadas do
portal usam sessão em cookie do Supabase Auth. Não há aceitação de
`Authorization: Bearer` em lugar nenhum. Publicar metadados de OAuth diria a um
agente que existe um fluxo de token que não existe. O `/auth.md` documenta a
situação real.

**Web Bot Auth** (`/.well-known/http-message-signatures-directory`) — esse
diretório é publicado por quem *opera* um bot, para que sites validem suas
assinaturas. O portal é o site, não o bot. O check não se aplica.

**Commerce** (x402, MPP, UCP, ACP) — portal institucional, sem comércio.

## DNS-AID — pendente, exige acesso à zona DNS

Não dá para fazer por código: precisa de registros na zona `iefa.com.br`
(registro.br). Aplicar:

```dns
_index._agents.portal.iefa.com.br. 3600 IN HTTPS 1 . alpn="h2" (
    endpoint="https://portal.iefa.com.br/llms.txt" )

_mcp._agents.portal.iefa.com.br.   3600 IN HTTPS 1 . alpn="h2" (
    endpoint="https://portal.iefa.com.br/.well-known/agent-skills/index.json" )
```

A zona já tem DNSSEC (a varredura confirmou `AD=true` e registro RRSIG/SOA), então
resolvers validantes vão devolver dados autenticados sem trabalho adicional.

Só publicar `_mcp._agents` se algum dia existir MCP de verdade — hoje o registro
acima aponta para o índice de skills, que é o que existe. Se preferir não
sobrecarregar o rótulo `_mcp`, publique apenas `_index._agents`.

## Gotchas

**`.md` dá 404 no `vite dev`.** Rotas terminadas em `.md` (`/auth.md`,
`SKILL.md`) são interceptadas por um middleware antes do handler SSR no servidor
de desenvolvimento e retornam `Cannot GET`. No build de produção
(`bun run build` + `.output/server/index.mjs`) funcionam normalmente. Não tente
"consertar" isso mexendo nas rotas — valide sempre no build.

**Nomes de arquivo de rota escapados.** `/.well-known/api-catalog` vem de
`src/routes/[.]well-known.api-catalog.tsx`. O gerador do TanStack Router divide
segmentos em `.` exceto quando escapado com `[.]` (`SPLIT_REGEX` em
`router-generator/utils.js`).

**O entry do servidor é `src/server.ts`, não `src/ssr.tsx`.** O
`start-plugin-core` resolve `src/server.{ts,js,mts,mjs,tsx,jsx}`. O antigo
`src/ssr.tsx` era código morto — o plugin usava o entry padrão embutido e
ignorava o arquivo. Ele precisa exportar `{ fetch }` como default, não uma
função.

**Títulos no header `Link` são ASCII de propósito.** Valores de header HTTP não
carregam UTF-8; "Catálogo" saía corrompido no fio.
