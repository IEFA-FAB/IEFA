import { cors } from "hono/cors"

/**
 * Origens que podem chamar o α pelo browser.
 *
 * O console e o ChatRADA vivem no portal, em domínio diferente do α, então toda
 * chamada é cross-origin — sem isto o browser bloqueia antes de sair o request,
 * e a tela mostra "Failed to fetch" sem nenhum erro do lado do servidor.
 * `credentials` fica desligado de propósito: a autenticação é por Bearer, não
 * por cookie.
 */
export const ALLOWED_ORIGINS = [
	"https://portal.iefa.com.br",
	"https://iefa.com.br",
	"https://www.iefa.com.br",
	"http://localhost:3000",
	"http://localhost:3010",
]

/**
 * Em módulo próprio porque não é só `/api/v1/*` que o browser chama.
 *
 * `/health` é a sonda de estado do ChatRADA e mora fora daquele prefixo. Enquanto
 * o middleware ficou preso a ele, a resposta vinha sem `Access-Control-Allow-Origin`,
 * o browser bloqueava a LEITURA (a requisição chegava a sair), o `fetch` rejeitava
 * e a tela mostrava "Offline" com o α no ar — desabilitando o envio por uma falha
 * que só existia no cliente.
 */
export const browserCors = cors({
	origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]),
	allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
	allowHeaders: ["Content-Type", "Authorization"],
	maxAge: 300,
})
