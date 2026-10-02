import { secureHeaders } from "hono/secure-headers"

/**
 * Cabeçalhos de segurança do α: HSTS (180 dias, com subdomínios), `nosniff`,
 * `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer` e os demais padrões do Hono.
 *
 * `Cross-Origin-Resource-Policy` desligado: o contrate e o portal leem o α de outra origem
 * (CORS em `cors.ts`), e os metadados de agente (`/.well-known`, `/llms.txt`, `/legal`) são
 * públicos. Leitura com CORS não passa pelo CORP; o `same-origin` padrão só quebraria o uso
 * sem CORS e não protegeria nada que o CORS e o Bearer já não protejam.
 *
 * Vale para o SSE: os cabeçalhos entram na resposta do `streamSSE` antes de ela sair.
 */
export const alphaSecureHeaders = secureHeaders({ crossOriginResourcePolicy: false })
