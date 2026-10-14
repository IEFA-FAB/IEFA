// Casos de teste de `.opengrep/rules/postgrest-row-cap.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/postgrest-row-cap.yaml .opengrep/rules/__fixtures__/postgrest-row-cap.ts

type Result = { data: { id: string }[] | null; error: { message: string } | null }
type Query = PromiseLike<Result> & {
	eq(column: string, value: string): Query
	order(column: string): Query
	limit(n: number): Query
	range(from: number, to: number): Query
}
declare const supabase: {
	from(table: string): { select(columns: string): Query }
	rpc(fn: string, args?: object): Query
}
declare const fin: { schema(name: string): typeof supabase }
declare const db: { select(): { from(table: unknown): { where(cond: unknown): { limit(n: number): Promise<unknown[]> } } } }
declare const table: unknown
declare const input: { limit: number }
declare function readAllPages<T>(what: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]>

export async function capped(unitId: string) {
	// `budget.fn.ts` antes do #626.
	// ruleid: postgrest-limit-above-row-cap
	await fin.schema("finance").from("v_empenho_vigente").select("empenho_id, valor_vigente").eq("unit_id", unitId).limit(2000)
	// O achado começa onde começa a cadeia.
	// ruleid: postgrest-limit-above-row-cap
	await supabase
		.from("catmat_class")
		.select("codigo_classe")
		.order("codigo_classe")
		.limit(10_000)
	// ruleid: postgrest-limit-above-row-cap
	await supabase.rpc("list_rows", { unit_id: unitId }).limit(1001)
}

export async function fine(unitId: string) {
	// No teto: volta tudo o que pediu.
	// ok: postgrest-limit-above-row-cap
	await supabase.from("t").select("id").eq("unit_id", unitId).limit(1000)
	// ok: postgrest-limit-above-row-cap
	await supabase.from("t").select("id").limit(1)
	// Valor em variável: fora do alcance de uma regra sem seguir o valor.
	// ok: postgrest-limit-above-row-cap
	await supabase.from("t").select("id").limit(input.limit)
	// Drizzle não passa pelo PostgREST e não tem teto.
	// ok: postgrest-limit-above-row-cap
	await db.select().from(table).where(unitId).limit(5000)
	// ok: postgrest-limit-above-row-cap
	await readAllPages("os empenhos", (from, to) => supabase.from("empenho").select("id").eq("unit_id", unitId).order("id").range(from, to))
}
