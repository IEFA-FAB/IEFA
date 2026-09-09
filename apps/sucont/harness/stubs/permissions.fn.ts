/**
 * Stub do `#/server/permissions.fn` para o harness — mesmo motivo dos stubs de
 * `auth.fn` e `legal.fn`: o módulo real declara server functions do TanStack
 * Start, e o harness roda em Vite puro.
 *
 * A leitura das PRÓPRIAS permissões vem semeada no cache do react-query
 * (`hub.tsx`), então `fetchMySucontPermissionsFn` existe só para o grafo de
 * imports resolver. As três de administração devolvem dado fixo: é o que faz a
 * tela de permissões renderizar a lista, e não o estado de falha.
 */
import type { UserPermission } from "@iefa/pbac"

export type SucontUserSearchResult = { id: string; email: string }
export type SucontGrant = { userId: string; email: string; level: number; expiresAt: string | null; source: "inline" | "policy"; policyName?: string }

export async function fetchMySucontPermissionsFn(): Promise<UserPermission[]> {
	return []
}

export async function listSucontGrantsFn(): Promise<SucontGrant[]> {
	return [
		{ userId: "harness-admin", email: "nannijpsn@fab.mil.br", level: 3, expiresAt: null, source: "inline" },
		{ userId: "harness-editor", email: "editor@fab.mil.br", level: 2, expiresAt: null, source: "inline" },
		// Acesso emprestado por política: linha somente-leitura, "Revogar" desabilitado.
		{ userId: "harness-policy", email: "parceiro@fab.mil.br", level: 1, expiresAt: null, source: "policy", policyName: "Conjunto Treino" },
		// Sem linha em `core.user_data`: a tela cai no id, e é assim que ela deve ficar.
		{ userId: "8f1c0b6e-0000-4000-8000-000000000000", email: "", level: 1, expiresAt: "2020-01-01T00:00:00.000Z", source: "inline" },
	]
}

export async function searchUsersByEmailFn(): Promise<SucontUserSearchResult[]> {
	return []
}

export async function grantSucontPermissionFn(): Promise<{ ok: true }> {
	return { ok: true }
}

export async function revokeSucontPermissionFn(): Promise<{ ok: true }> {
	return { ok: true }
}
