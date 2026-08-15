# @iefa/agent-web

Infraestrutura compartilhada para deixar os apps web do monorepo legíveis por
agentes de IA: negociação de conteúdo, `llms.txt`, `sitemap.xml` e os documentos
em `/.well-known/*`.

Extraído do trabalho feito no `portal` para não virar seis cópias divergentes.

## O bug que motivou o package

O handler do TanStack Start responde **500** para qualquer requisição de rota cujo
`Accept` não contenha `text/html` nem o coringa:

```json
{ "error": "Only HTML requests are supported here" }
```

Isso vale para o site inteiro — `curl -H "Accept: application/json" /` quebra em
todo app Start do monorepo. Ver `executeRouter` em
`start-server-core/src/createStartHandler.ts`.

Não dá para corrigir com request middleware: `executeRouter` lê o `request` do
closure, então trocar `ctx.request` via `next({ request })` não tem efeito. A
única costura possível é envelopar o handler no entry do servidor, que é o que
`createAgentServerEntry` faz.

## Uso

### 1. Entry do servidor

Crie `src/server.ts` no app:

```ts
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server"
import { createAgentServerEntry } from "@iefa/agent-web/server"
import { CATALOG } from "@/lib/agent-discovery"

export default createAgentServerEntry({
	handler: createStartHandler(defaultStreamHandler),
	discoveryDocuments: CATALOG.discoveryDocuments,
})
```

> **O nome do arquivo importa.** O `start-plugin-core` resolve o entry do servidor
> como `src/server.{ts,js,mts,mjs,tsx,jsx}`. Um `src/ssr.tsx` é **ignorado** — o
> plugin cai no entry padrão embutido e o arquivo vira código morto. Vários apps
> do monorepo tinham exatamente esse arquivo morto. Se existir um `src/ssr.tsx`,
> renomeie; não crie os dois.

Isso dá ao app:

- `Accept: text/markdown` servindo a página em Markdown, extraída da região de
  conteúdo (`main#conteudo`, depois `main`, depois `body`);
- `406 Not Acceptable` com corpo explicativo no lugar do 500;
- cabeçalhos `Link` (RFC 8288) nas respostas de documento — server functions
  ficam de fora, porque centenas de bytes por RPC não compram nada.

### 2. Catálogo

Um `SiteCatalog` por app, em `src/lib/agent-discovery.ts`. É a fonte única de
verdade: `sitemap.xml`, `llms.txt` e o header `Link` derivam dele.

```ts
import type { SiteCatalog } from "@iefa/agent-web"

export const CATALOG: SiteCatalog = {
	name: "SISUB",
	url: "https://sisub.iefa.com.br",
	description: "Sistema de Subsistência da FAB.",
	pages: [
		{ path: "/", title: "Início", summary: "…", section: "Institucional", changefreq: "weekly", priority: 1 },
		{ path: "/entrar", title: "Entrar", summary: "…", section: "Conta", noindex: true },
	],
	discoveryDocuments: [{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "Guide for agents" }],
}
```

`noindex: true` tira a página do `sitemap.xml` mas mantém no `llms.txt` — útil
para a tela de login, que vale descrever mas não indexar.

Títulos de `discoveryDocuments` **precisam ser ASCII**: valores de header HTTP não
carregam UTF-8 e acento sai corrompido no fio. `createAgentServerEntry` valida
isso na montagem, para o erro aparecer no boot.

### 3. Rotas dos documentos

```ts
// src/routes/llms[.]txt.tsx
import { createFileRoute } from "@tanstack/react-router"
import { renderLlmsTxt } from "@iefa/agent-web"
import { CATALOG } from "@/lib/agent-discovery"

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: () =>
				new Response(renderLlmsTxt(CATALOG), {
					headers: { "content-type": "text/plain; charset=utf-8" },
				}),
		},
	},
})
```

O nome do arquivo escapa o ponto com `[.]`: o gerador do TanStack Router divide
segmentos em `.` exceto entre colchetes. `[.]well-known.api-catalog.tsx` vira
`/.well-known/api-catalog`.

## API

| Export | Uso |
|---|---|
| `createAgentServerEntry` | envelopa o handler do Start (`@iefa/agent-web/server`) |
| `renderLlmsTxt` | `llms.txt` a partir do catálogo mais seções dinâmicas |
| `renderSitemap`, `catalogSitemapEntries` | `sitemap.xml` |
| `renderApiCatalog` | linkset RFC 9727 |
| `renderSkillsIndex`, `skillDigest` | Agent Skills Discovery RFC v0.2.0 |
| `formatContentSignal`, `ASSISTANT_USER_AGENTS`, `TRAINING_USER_AGENTS` | montagem do `robots.txt` |
| `htmlToMarkdown` | conversão isolada, se o app precisar dela em outro contexto |

## Gotcha de desenvolvimento

Rotas terminadas em `.md` (`/auth.md`, `SKILL.md`) retornam **404 no `vite dev`** —
são interceptadas antes do handler SSR. No build de produção funcionam. Valide
rotas de documento com `bun run build` + `bun .output/server/index.mjs`, nunca só
no dev.

## Testes

```bash
cd packages/agent-web && bun test
```
