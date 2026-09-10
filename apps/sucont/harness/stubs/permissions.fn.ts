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
import type { AppModule, UserPermission } from "@iefa/pbac"

export type SucontUserSearchResult = { id: string; email: string; nrOrdem: string | null; posto: string | null; nomeGuerra: string | null }
export type SucontGrantTarget = { module: "sucont-1" | "sucont-3" | "sucont-4"; level: 1 | 2 } | { module: "sucont-admin"; level: 3 }
export type SucontGrant = {
	userId: string
	module: AppModule
	email: string
	nrOrdem: string | null
	posto: string | null
	nomeGuerra: string | null
	level: number
	expiresAt: string | null
	source: "inline" | "policy"
	policyName?: string
}

export async function fetchMySucontPermissionsFn(): Promise<UserPermission[]> {
	return []
}

export async function listSucontGrantsFn(): Promise<SucontGrant[]> {
	return [
		// SARAM vinculado e encontrado no cadastro: a linha é nomeada como na OM.
		{
			userId: "harness-admin",
			module: "sucont-admin",
			email: "nannijpsn@fab.mil.br",
			nrOrdem: "7379749",
			posto: "1T",
			nomeGuerra: "NANNI",
			level: 3,
			expiresAt: null,
			source: "inline",
		},
		// A MESMA pessoa em duas divisões — é o caso que o split introduz, e o que a
		// tela precisa mostrar sem parecer duplicata.
		{
			userId: "harness-admin",
			module: "sucont-4",
			email: "nannijpsn@fab.mil.br",
			nrOrdem: "7379749",
			posto: "1T",
			nomeGuerra: "NANNI",
			level: 2,
			expiresAt: null,
			source: "inline",
		},
		// Sem SARAM: o e-mail segura o rótulo.
		{
			userId: "harness-editor",
			module: "sucont-3",
			email: "editor@fab.mil.br",
			nrOrdem: null,
			posto: null,
			nomeGuerra: null,
			level: 2,
			expiresAt: null,
			source: "inline",
		},
		// Acesso emprestado por política: linha somente-leitura, "Revogar" desabilitado.
		{
			userId: "harness-policy",
			module: "sucont-1",
			email: "parceiro@fab.mil.br",
			nrOrdem: "1234567",
			posto: null,
			nomeGuerra: null,
			level: 1,
			expiresAt: null,
			source: "policy",
			policyName: "Conjunto Treino",
		},
		// Nem e-mail no ERP nem no GoTrue, nem SARAM: sobra o id, e é assim que a
		// tela deve ficar no pior caso.
		{
			userId: "8f1c0b6e-0000-4000-8000-000000000000",
			module: "sucont-3",
			email: "",
			nrOrdem: null,
			posto: null,
			nomeGuerra: null,
			level: 1,
			expiresAt: "2020-01-01T00:00:00.000Z",
			source: "inline",
		},
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
