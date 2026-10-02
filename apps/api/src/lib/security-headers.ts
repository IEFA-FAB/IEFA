import { secureHeaders } from "hono/secure-headers"

/**
 * Cabeçalhos de segurança da API: HSTS (180 dias, com subdomínios), `nosniff`,
 * `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer` e os demais padrões do Hono.
 *
 * Duas exceções ao padrão, de propósito:
 *   - `Cross-Origin-Resource-Policy` desligado: a API é pública (catálogo, documentos legais,
 *     favicon) e é lida de outras origens. Leitura por `fetch` com CORS não passa pelo CORP,
 *     mas o `same-origin` padrão quebraria qualquer uso sem CORS (`<img>`, `<link>`) e não
 *     protege dado nenhum que o CORS já não proteja.
 *   - sem CSP: a documentação Scalar em `/` carrega script e estilo da CDN do Scalar, e uma
 *     CSP aqui teria de listá-los — fica para quando a página for servida sem CDN.
 */
export const apiSecureHeaders = secureHeaders({ crossOriginResourcePolicy: false })
