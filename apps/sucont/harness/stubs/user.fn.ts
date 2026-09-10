/**
 * Stub do `#/server/user.fn` para o harness — mesmo motivo dos demais: o módulo
 * real declara server functions do TanStack Start e importa `lib/*.server`, que
 * lê credencial na carga; o harness roda em Vite puro.
 *
 * A identidade da sessão vem semeada no cache do react-query (`hub.tsx`), então
 * `fetchMyIdentityFn` existe só para o grafo de imports resolver. `saveMyNrOrdemFn`
 * devolve uma identificação plausível: é o que permite abrir o diálogo de SARAM no
 * harness e ver o caminho de sucesso sem tocar no Supabase.
 */

export type SucontIdentity = { nrOrdem: string | null; posto: string | null; nomeGuerra: string | null }

export async function fetchMyIdentityFn(): Promise<SucontIdentity> {
	return { nrOrdem: null, posto: null, nomeGuerra: null }
}

export async function saveMyNrOrdemFn({ data }: { data: { nrOrdem: string } }): Promise<SucontIdentity> {
	return { nrOrdem: data.nrOrdem, posto: "1T", nomeGuerra: "NANNI" }
}

export async function syncSucontIdentityFn(): Promise<{ ok: boolean }> {
	return { ok: true }
}
