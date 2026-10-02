// Casos de teste de `.opengrep/rules/ssr-session-payload.yaml`. Não é código do app.
//
// Rodar: opengrep test --config .opengrep/rules/ssr-session-payload.yaml .opengrep/rules/__fixtures__/ssr-session-payload.ts

declare const supabase: { auth: { getSession(): Promise<unknown>; getUser(): Promise<unknown> } }
declare function getIefaAuthClient(): typeof supabase

export async function leaks() {
	// ruleid: ssr-auth-session-payload
	const { data } = (await supabase.auth.getSession()) as { data: unknown }
	// ruleid: ssr-auth-session-payload
	await getIefaAuthClient().auth.getSession()
	return data
}

export async function userOnly() {
	// ok: ssr-auth-session-payload
	return await getIefaAuthClient().auth.getUser()
}
