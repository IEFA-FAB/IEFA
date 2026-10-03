// Casos de teste de `.opengrep/rules/postgrest-silent-read.yaml`. Não é código do app.
//
// Rodar: opengrep test --config .opengrep/rules/postgrest-silent-read.yaml .opengrep/rules/__fixtures__/postgrest-silent-read.ts

type Row = { id: string }
type Result = { data: Row[] | null; error: { message: string } | null; count: number | null }
declare const inv: { from(table: string): { select(columns: string, options?: object): { eq(column: string, value: string): Promise<Result> } } }
declare const supabase: { auth: { getSession(): Promise<{ data: { session: null } }> } }

export async function discarded() {
	// ruleid: postgrest-read-error-discarded
	const { data: rows } = await inv.from("t").select("id").eq("kitchen_id", "1")
	// ruleid: postgrest-read-error-discarded
	const { data } = await inv.from("t").select("id").eq("kitchen_id", "1")
	// ruleid: postgrest-read-error-discarded
	const { count: total } = await inv.from("t").select("id", { count: "exact" }).eq("kitchen_id", "1")
	return [rows, data, total]
}

export async function handled() {
	// ok: postgrest-read-error-discarded
	const { data: rows, error } = await inv.from("t").select("id").eq("kitchen_id", "1")
	if (error) throw new Error(error.message)
	// ok: postgrest-read-error-discarded
	const { data: more, error: moreError } = await inv.from("t").select("id").eq("kitchen_id", "2")
	if (moreError) throw new Error(moreError.message)
	// ok: postgrest-read-error-discarded
	const { data: session } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }))
	return [rows, more, session]
}
