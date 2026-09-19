import { isRequestOrigin } from "@iefa/auth-kit"
import { createCsrfMiddleware, createStart } from "@tanstack/react-start"

/**
 * CSRF das server functions.
 *
 * Server fn é endpoint HTTP com a sessão do cookie, e o handler do TanStack Start aceita
 * `multipart/form-data` e corpo sem `Content-Type` — POST que o navegador manda cross-site
 * SEM preflight — além de GET por navegação. Sem este middleware, uma página em outro
 * subdomínio de `iefa.com.br` (mesmo site para o `SameSite=Lax` do cookie) disparava server
 * fn com a sessão da vítima.
 *
 * O middleware confere `Sec-Fetch-Site: same-origin` e, em navegador que não o manda, a
 * origem do `Origin`/`Referer`. A comparação padrão da origem (`Origin` contra
 * `request.url`) recusaria todo request legítimo atrás do ALB, onde `request.url` chega com
 * `http:` — por isso a origem é comparada pelo host (`isRequestOrigin`).
 */
const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
	origin: (origin, ctx) => isRequestOrigin(origin, ctx.request.headers, ctx.request.url),
})

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware],
}))
