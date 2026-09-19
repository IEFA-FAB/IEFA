import { describe, expect, test } from "bun:test"
import { MAX_SIAFI_REPORT_BODY_BYTES } from "../../lib/upload-limit.ts"
import { MAX_SIAFI_COLUMNS } from "../../workers/siafi/read-file.ts"
import { createSiafiAdminRoutes, type SiafiAdminRoutesDeps } from "./siafi-admin.ts"

const SECRET = "segredo-de-teste"
const QUERY = "unit_id=1&report_type=ne&file_name=relatorio.csv"

/** Só o que a rota pede antes de parsear: a checagem de lote duplicado. */
function stubSupabase() {
	const chain = {
		select: () => chain,
		eq: () => chain,
		maybeSingle: async () => ({ data: null, error: null }),
	}
	return { from: () => chain } as unknown as ReturnType<NonNullable<SiafiAdminRoutesDeps["getSupabase"]>>
}

const routes = createSiafiAdminRoutes({ adminSecret: SECRET, getSupabase: stubSupabase })

function post(body: string | Uint8Array, headers: Record<string, string> = {}) {
	return routes.request(`/import?${QUERY}`, { method: "POST", body, headers: { "content-type": "text/csv", ...headers } })
}

describe("POST /api/admin/siafi/import — tetos", () => {
	test("sem o segredo é 401 antes de qualquer leitura do corpo", async () => {
		const res = await post(new Uint8Array(MAX_SIAFI_REPORT_BODY_BYTES + 1))
		expect(res.status).toBe(401)
	})

	test("com o segredo, corpo acima do teto é 413", async () => {
		const bytes = MAX_SIAFI_REPORT_BODY_BYTES + 1
		const res = await post(new Uint8Array(bytes), { "x-admin-secret": SECRET, "content-length": String(bytes) })
		expect(res.status).toBe(413)
	})

	test("arquivo acima do teto de colunas é 422", async () => {
		const res = await post(`Documento;Valor;UG\n${";".repeat(MAX_SIAFI_COLUMNS)}`, { "x-admin-secret": SECRET })
		expect(res.status).toBe(422)
		expect(((await res.json()) as { error: string }).error).toMatch(/colunas/)
	})
})
