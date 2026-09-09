/**
 * Contrato de autorização das rotas legadas de `/api/*`.
 *
 * Cinco delas devolvem dado pessoal e nasceram anônimas: `/user-military-data` servia o
 * efetivo nominal (nome, nome de guerra, posto, OM), `/user-data` os e-mails institucionais
 * com número de ordem, e `/rancho_previsoes` + `/wherewhowhen` o rastro de presença por
 * pessoa. Este teste é o que impede que voltem a ser públicas.
 *
 * O env é preenchido ANTES do import de `./routes.ts` porque `env.ts` valida na carga do
 * módulo; a URL aponta para uma porta fechada de propósito, então o handler que passar pelo
 * guard falha no fetch em vez de tocar em banco nenhum.
 */

import { afterAll, describe, expect, test } from "bun:test"

// Bun roda TODOS os arquivos de teste no MESMO processo, e `routes.ts` fixa a URL do Supabase
// na carga do módulo. Sobrescrever o env aqui sequestrava o `routes.test.ts` de integração:
// ele importava o mesmo módulo já apontado para o dublê e pulava os 30 casos em silêncio.
// Por isso o dublê SÓ entra quando não há ambiente real — com env de integração, este arquivo
// usa o mesmo destino que os outros.
const hasRealEnv = !!process.env.API_SUPABASE_URL && !!process.env.API_SUPABASE_SERVICE_ROLE_KEY

// PostgREST de mentira: responde `[]` a qualquer consulta. Sem ele o caso positivo do guard
// dependeria de rede — e um handler pendurado em socket fechado transforma o contrato de
// autorização num teste de timeout.
const stub = hasRealEnv ? null : Bun.serve({ port: 0, fetch: () => new Response("[]", { headers: { "Content-Type": "application/json" } }) })

if (stub) {
	process.env.API_SUPABASE_URL = `http://127.0.0.1:${stub.port}`
	process.env.API_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
}
process.env.ADMIN_SECRET ??= "test-admin-secret"

const ADMIN_SECRET = process.env.ADMIN_SECRET as string

// Import DINÂMICO: `import` estático é içado acima das atribuições acima, e `env.ts` valida
// na carga do módulo — com o estático o teste morria em ZodError antes de rodar.
const { api, RESTRICTED_PATHS } = await import("./routes.ts")

/** Rotas com dado pessoal — a lista vem do roteador, não de uma cópia local que diverge. */
const RESTRICTED = [...RESTRICTED_PATHS]

/** Estrutura organizacional, não pessoa: segue pública. */
const PUBLIC = ["/units", "/mess-halls"]

describe("rotas com dado pessoal exigem x-admin-secret", () => {
	test.each(RESTRICTED)("%s sem header devolve 401", async (path) => {
		const res = await api.request(path)
		expect(res.status).toBe(401)
	})

	test.each(RESTRICTED)("%s com segredo errado devolve 401", async (path) => {
		const res = await api.request(path, { headers: { "x-admin-secret": "errado" } })
		expect(res.status).toBe(401)
	})

	test.each(RESTRICTED)("%s com o segredo certo responde normalmente", async (path) => {
		const res = await api.request(path, { headers: { "x-admin-secret": ADMIN_SECRET } })
		expect(res.status).toBe(200)
	})

	test("o guard não vaza o corpo do erro", async () => {
		const res = await api.request("/user-military-data")
		expect(await res.json()).toEqual({ error: "Unauthorized" })
	})

	test("resposta autorizada não vai para cache compartilhado", async () => {
		const res = await api.request("/user-data", { headers: { "x-admin-secret": ADMIN_SECRET } })
		expect(res.headers.get("Cache-Control")).toBe("no-store")
	})
})

describe("rotas de estrutura organizacional seguem públicas", () => {
	test.each(PUBLIC)("%s não exige credencial", async (path) => {
		const res = await api.request(path)
		expect(res.status).toBe(200)
	})
})

afterAll(() => {
	stub?.stop(true)
})
