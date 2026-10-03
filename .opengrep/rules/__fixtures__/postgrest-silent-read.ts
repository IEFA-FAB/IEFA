// Casos de teste de `.opengrep/rules/postgrest-silent-read.yaml`. Não é código do app.
//
// Rodar: opengrep test --config .opengrep/rules/postgrest-silent-read.yaml .opengrep/rules/__fixtures__/postgrest-silent-read.ts

type Row = { id: string }
type Result = { data: Row[] | null; error: { message: string } | null; count: number | null }
type Query = { eq(column: string, value: string): Promise<Result> }
declare const inv: { from(table: string): { select(columns: string, options?: object): Query } }
declare const supabase: {
	auth: {
		getSession(): Promise<{ data: { session: null } }>
		getUser(): Promise<{ data: { user: null } }>
		mfa: { listFactors(): Promise<{ data: { all: Row[] } }> }
	}
}

export async function discarded() {
	// ruleid: postgrest-read-error-discarded
	const { data: rows } = await inv.from("t").select("id").eq("kitchen_id", "1")
	// ruleid: postgrest-read-error-discarded
	const { data } = await inv.from("t").select("id").eq("kitchen_id", "1")
	// ruleid: postgrest-read-error-discarded
	const { count: total } = await inv.from("t").select("id", { count: "exact" }).eq("kitchen_id", "1")
	// ruleid: postgrest-read-error-discarded
	const { data: withCount, count } = await inv.from("t").select("id", { count: "exact" }).eq("kitchen_id", "1")
	// ruleid: postgrest-read-error-discarded
	let { data: mutable } = await inv.from("t").select("id").eq("kitchen_id", "1")
	mutable = null
	// ruleid: postgrest-read-error-discarded
	const { data: silenced, error: _ignored } = await inv.from("t").select("id").eq("kitchen_id", "1")
	// ruleid: postgrest-read-error-discarded
	const [{ data: first }, { data: second, error: secondError }] = await Promise.all([
		inv.from("t").select("id").eq("kitchen_id", "1"),
		inv.from("u").select("id").eq("kitchen_id", "1"),
	])
	return [rows, data, total, withCount, count, mutable, silenced, first, second, secondError]
}

export async function handled() {
	// ok: postgrest-read-error-discarded
	const { data: rows, error } = await inv.from("t").select("id").eq("kitchen_id", "1")
	if (error) throw new Error(error.message)
	// ok: postgrest-read-error-discarded
	const { data: more, error: moreError } = await inv.from("t").select("id").eq("kitchen_id", "2")
	if (moreError) throw new Error(moreError.message)
	// ok: postgrest-read-error-discarded
	const [{ data: a, error: aError }, { data: b, error: bError }] = await Promise.all([
		inv.from("t").select("id").eq("kitchen_id", "1"),
		inv.from("u").select("id").eq("kitchen_id", "1"),
	])
	if (aError ?? bError) throw new Error("falhou")
	return [rows, more, a, b]
}

export async function auth() {
	// ok: postgrest-read-error-discarded
	const { data: session } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
	// ok: postgrest-read-error-discarded
	const { data: user } = await supabase.auth.getUser()
	// ok: postgrest-read-error-discarded
	const { data: factors } = await supabase.auth.mfa.listFactors()
	// ok: postgrest-read-error-discarded
	const { data: caught } = await supabase.auth.mfa.listFactors().catch(() => ({ data: { all: [] } }))
	return [session, user, factors, caught]
}
