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

/**
 * Estrutura organizacional, não pessoa: segue pública.
 *
 * É uma allowlist, e é o que torna a classificação DEFAULT-DENY: rota registrada em
 * `routes.ts` que não esteja nem aqui nem em `RESTRICTED_PATHS` derruba a suíte. Acrescentar
 * um caminho a esta lista é uma decisão explícita, que aparece no diff e passa por revisão.
 */
const PUBLIC = ["/units", "/mess-halls"]

/**
 * Campos que identificam UMA PESSOA. Schema de resposta que exponha qualquer um deles é dado
 * pessoal, e a rota tem que estar em `RESTRICTED_PATHS`.
 *
 * `id` de propósito fora da lista: `/units` também tem `id`, e `id` sozinho não diz de quem.
 * `/user-data` é pego por `email` e `nrOrdem`, que dizem.
 */
const PERSONAL_DATA_FIELDS = ["userId", "user_id", "nrOrdem", "nrCpf", "cpf", "email", "nmGuerra", "nmPessoa", "sgPosto"]

type ResponseSchema = { items?: { properties?: Record<string, unknown> } }
type PathItem = { get?: { responses?: Record<string, { content?: Record<string, { schema?: ResponseSchema }> }> } }

/** Campos do schema de resposta 200 de cada rota GET, lidos do documento OpenAPI do roteador. */
function readResponseFields(): Map<string, string[]> {
	const doc = api.getOpenAPIDocument({ openapi: "3.0.0", info: { title: "inventory-probe", version: "0" } })
	const fields = new Map<string, string[]>()
	for (const [path, item] of Object.entries(doc.paths as Record<string, PathItem>)) {
		const schema = item.get?.responses?.["200"]?.content?.["application/json"]?.schema
		const properties = schema?.items?.properties
		if (properties) fields.set(path, Object.keys(properties))
	}
	return fields
}

/**
 * Inventário DERIVADO de `routes.ts` — não de uma cópia fixa.
 *
 * Uma cópia fixa da lista pegaria a remoção de um caminho e deixaria passar a ADIÇÃO, que é
 * justamente o modo de falha do #288: rota nova de dado pessoal registrada sem entrar na lista,
 * servindo o efetivo nominal anonimamente. Duas redes independentes, as duas lidas do roteador:
 * a projeção declarada no OpenAPI e a classificação de toda rota registrada.
 */
describe("inventário das rotas protegidas", () => {
	const responseFields = readResponseFields()

	// Sem esta guarda, uma mudança na forma do documento (upgrade do @hono/zod-openapi, por
	// exemplo) faria a extração devolver vazio e os dois casos abaixo passariam varrendo nada.
	test("a varredura do OpenAPI enxerga a projeção de todas as rotas GET", () => {
		const registered = api.routes.filter((route) => route.method === "GET").map((route) => route.path)
		expect(new Set(responseFields.keys())).toEqual(new Set(registered))
		for (const [path, fields] of responseFields) {
			expect(fields.length, `rota ${path} sem campos legíveis no schema de resposta`).toBeGreaterThan(0)
		}
	})

	test("toda rota que devolve dado pessoal está em RESTRICTED_PATHS", () => {
		const leaking = [...responseFields]
			.filter(([path]) => !RESTRICTED.includes(path as (typeof RESTRICTED_PATHS)[number]))
			.map(([path, fields]) => ({ path, personal: fields.filter((field) => PERSONAL_DATA_FIELDS.includes(field)) }))
			.filter((entry) => entry.personal.length > 0)
		expect(leaking).toEqual([])
	})

	test("toda rota registrada está classificada como protegida ou como pública", () => {
		const registered = api.routes.filter((route) => route.method === "GET").map((route) => route.path)
		const classified = new Set<string>([...RESTRICTED, ...PUBLIC])
		expect(registered.filter((path) => !classified.has(path))).toEqual([])
	})

	test("RESTRICTED_PATHS não lista caminho que o roteador não registra", () => {
		const registered = new Set(api.routes.map((route) => route.path))
		expect(RESTRICTED.filter((path) => !registered.has(path))).toEqual([])
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
