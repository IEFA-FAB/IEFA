/**
 * Contrato de autorização das rotas legadas de `/api/*`.
 *
 * Cinco delas devolvem dado pessoal e nasceram anônimas: `/user-military-data` servia o
 * efetivo nominal (nome, nome de guerra, posto, OM), `/user-data` os e-mails institucionais
 * com número de ordem, e `/rancho_previsoes` + `/wherewhowhen` o rastro de presença por
 * pessoa. Este teste é o que impede que voltem a ser públicas.
 *
 * É teste de UNIDADE e é HERMÉTICO: o PostgREST fica num dublê em loopback, SEMPRE — nunca
 * em ambiente real, nem quando a máquina (ou o CI) tem credencial de produção exportada.
 * A versão anterior só usava o dublê quando `API_SUPABASE_URL` estava ausente; no
 * `check-api`, que injetava as credenciais de produção, os casos positivos saíam pela rede
 * até o banco de produção e estouravam o timeout de 5 s sempre que a produção estava lenta.
 * Vermelho intermitente sem relação com o diff, derrubando build e deploy por `needs:`.
 *
 * O preço dessa decisão é que este arquivo FIXA o env de `routes.ts` no processo (o módulo
 * lê `env.ts` na carga). Por isso a suíte que precisa do ambiente real mora fora de `src/` —
 * em `tests/integration/`, rodada por `bun run test:integration`, em outro processo.
 */

import { afterAll, describe, expect, test } from "bun:test"

/** Quantas requisições chegaram ao dublê — é o que prova que o guard deixou passar. */
let upstreamHits = 0

// PostgREST de mentira: responde `[]` a qualquer consulta. Sem ele o caso positivo do guard
// dependeria de rede — e um handler pendurado num socket remoto transforma o contrato de
// autorização num teste de latência de terceiros.
const stub = Bun.serve({
	port: 0,
	fetch: () => {
		upstreamHits++
		return new Response("[]", { headers: { "Content-Type": "application/json" } })
	},
})

// Atribuição INCONDICIONAL de propósito: credencial de produção no ambiente não pode mudar
// para onde este teste aponta.
process.env.API_SUPABASE_URL = `http://127.0.0.1:${stub.port}`
process.env.API_SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
process.env.ADMIN_SECRET = "test-admin-secret"

const ADMIN_SECRET = process.env.ADMIN_SECRET

// Import DINÂMICO: `import` estático é içado acima das atribuições acima, e `env.ts` valida
// na carga do módulo — com o estático o teste morria em ZodError antes de rodar.
const { api, RESTRICTED_PATHS } = await import("./routes.ts")

/** Rotas com dado pessoal — a lista vem do roteador, não de uma cópia local que diverge. */
const RESTRICTED = [...RESTRICTED_PATHS]

/** Estrutura organizacional, não pessoa: segue pública. */
const PUBLIC = ["/units", "/mess-halls"]

describe("inventário das rotas protegidas", () => {
	// Os casos abaixo derivam de `RESTRICTED_PATHS`; sem esta âncora, apagar uma rota da lista
	// tiraria o guard dela E o teste dela no mesmo commit, deixando a suíte verde.
	test("a lista do roteador cobre todas as rotas com dado pessoal", () => {
		expect(new Set(RESTRICTED)).toEqual(new Set(["/opinion", "/rancho_previsoes", "/wherewhowhen", "/user-military-data", "/user-data"]))
	})
})

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
		const before = upstreamHits
		const res = await api.request(path, { headers: { "x-admin-secret": ADMIN_SECRET } })
		expect(res.status).toBe(200)
		// 200 sozinho não distingue "o guard deixou passar" de "alguém trocou o handler por um
		// stub": o contador prova que a requisição chegou ao fim da cadeia.
		expect(upstreamHits).toBeGreaterThan(before)
	})

	test("rota protegida não chega ao handler sem credencial", async () => {
		const before = upstreamHits
		await api.request("/user-military-data")
		expect(upstreamHits).toBe(before)
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
	stub.stop(true)
})
