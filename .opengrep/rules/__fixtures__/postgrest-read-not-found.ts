// Casos de teste de `.opengrep/rules/postgrest-read-not-found.yaml`. Não é código do app.
//
// Rodar: opengrep test --config .opengrep/rules/postgrest-read-not-found.yaml .opengrep/rules/__fixtures__/postgrest-read-not-found.ts

type Row = { id: string; gpc_brick_code: string | null }
type Result = { data: Row | null; error: { message: string } | null }
type Query = { maybeSingle(): Promise<Result>; single(): Promise<Result> }
declare const inv: { from(table: string): { select(columns: string): { eq(column: string, value: string): Query } } }
declare function publicDbMessage(error: unknown): string
declare function toolErr(message: string): unknown
declare function requireReadRow(result: Result, messages: { readError: string; notFound: string }): Row

export async function conflated(id: string) {
	const { data: row, error } = await inv.from("t").select("id").eq("id", id).maybeSingle()
	// ruleid: postgrest-read-error-as-not-found
	if (error || !row) throw new Error("Recebimento não encontrado")
	return row
}

export async function conflatedBlock(id: string) {
	const { data: arp, error: arpError } = await inv.from("t").select("id").eq("id", id).single()
	// O achado cai na linha da mensagem, dentro do bloco.
	if (arpError || !arp) {
		// ruleid: postgrest-read-error-as-not-found
		throw new Error(`ARP ${id} não encontrada`)
	}
	return arp
}

export async function conflatedTool(id: string) {
	const { data: menu, error } = await inv.from("t").select("id").eq("id", id).maybeSingle()
	// ruleid: postgrest-read-error-as-not-found
	if (error || menu == null) return toolErr("Cardápio nao encontrado")
	return menu
}

export async function discardedError(id: string) {
	// ruleid: postgrest-read-data-without-error
	const brick = (await inv.from("gs1").select("gpc_brick_code").eq("gtin", id).maybeSingle()).data?.gpc_brick_code ?? null
	// ruleid: postgrest-read-data-without-error
	const other = (await inv.from("gs1").select("gpc_brick_code").eq("gtin", id).single()).data
	return [brick, other]
}

export async function separated(id: string) {
	const { data: row, error } = await inv.from("t").select("id").eq("id", id).maybeSingle()
	// ok: postgrest-read-error-as-not-found
	if (error) throw new Error(`Erro ao carregar: ${publicDbMessage(error)}`)
	// ok: postgrest-read-error-as-not-found
	if (!row) throw new Error("Recebimento não encontrado")
	return row
}

export async function writeWithReason(id: string) {
	const { data: doc, error } = await inv.from("t").select("id").eq("id", id).single()
	// ok: postgrest-read-error-as-not-found
	if (error || !doc) throw new Error(`Erro ao criar o ajuste: ${publicDbMessage(error)}`)
	return doc
}

export async function viaHelper(id: string) {
	// ok: postgrest-read-data-without-error
	return requireReadRow(await inv.from("t").select("id").eq("id", id).maybeSingle(), {
		readError: "Erro ao carregar",
		notFound: "Não encontrado",
	})
}

declare function fail(message: string, status: number): never

export async function capitalized(id: string) {
	const { data: row, error } = await inv.from("t").select("id").eq("id", id).maybeSingle()
	// ruleid: postgrest-read-error-as-not-found
	if (error || !row) throw new Error("Não encontrado")
	return row
}

export async function reversed(id: string) {
	const { data: row, error: readErr } = await inv.from("t").select("id").eq("id", id).maybeSingle()
	// ruleid: postgrest-read-error-as-not-found
	if (!row || readErr) fail("Usuário não encontrado.", 404)
	return row
}

export async function ternarySeparates(id: string) {
	const { data: row, error } = await inv.from("t").select("id").eq("id", id).maybeSingle()
	// ok: postgrest-read-error-as-not-found
	if (error || !row) throw new Error(error ? publicDbMessage(error) : "Receita não encontrada")
	return row
}

export function guardWithoutDatabase(kitchenId: string | null, menu: Row | null) {
	// ok: postgrest-read-error-as-not-found
	if (!kitchenId || !menu) throw new Error("Cardápio não encontrado")
	return menu
}

export async function honestMessage(id: string) {
	const { data: row, error } = await inv.from("t").select("id").eq("id", id).maybeSingle()
	// ok: postgrest-read-error-as-not-found
	if (error || !row) throw new Error("Receita não encontrada ou erro ao carregar")
	return row
}

export async function commentInside(id: string) {
	const { data: doc, error } = await inv.from("t").select("id").eq("id", id).single()
	if (error || !doc) {
		// ok: postgrest-read-error-as-not-found
		// antes dizia "não encontrado"; agora traz o motivo do banco
		throw new Error(`Erro ao criar: ${publicDbMessage(error)}`)
	}
	return doc
}

export async function optionalChaining(id: string) {
	// ruleid: postgrest-read-data-without-error
	return (await inv.from("gs1").select("gpc_brick_code").eq("gtin", id).maybeSingle())?.data
}
