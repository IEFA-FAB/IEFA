/**
 * Stub do `#/server/user.fn` para o harness — mesmo motivo dos demais: o módulo
 * real declara server functions do TanStack Start e importa `lib/*.server`, que
 * lê credencial na carga; o harness roda em Vite puro.
 *
 * A identidade da sessão vem semeada no cache do react-query (`hub.tsx`), então
 * `fetchMyIdentityFn` existe só para o grafo de imports resolver. `saveMySaramFn`
 * devolve uma identificação plausível: é o que permite abrir o diálogo de SARAM no
 * harness e ver o caminho de sucesso sem tocar no Supabase.
 */

import type { SaramClaimOutcome, SaramLinkIdentity } from "#/lib/saram-link"

export type SucontIdentity = SaramLinkIdentity & { outcome: SaramClaimOutcome | null }

export async function fetchMyIdentityFn(): Promise<SucontIdentity> {
	return { saram: null, posto: null, nomeGuerra: null, registered: false, status: "suggestion", outcome: null }
}

export async function saveMySaramFn({ data }: { data: { saram: string } }): Promise<SucontIdentity> {
	return { saram: data.saram, posto: "1T", nomeGuerra: "NANNI", registered: true, status: "verified", outcome: "linked" }
}

export async function syncSucontIdentityFn(): Promise<{ ok: boolean }> {
	return { ok: true }
}
