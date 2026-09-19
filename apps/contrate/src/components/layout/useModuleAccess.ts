import type { MeAccess } from "@iefa/alpha-client/access"
import { useQuery } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { useAuth } from "@/hooks/useAuth"
import { alphaAccessQueryOptions } from "@/lib/alpha/role"
import { accessibleModules, type ContrateModule } from "@/lib/modules"

export interface ModuleAccess {
	/** Módulos que a pessoa alcança, na ordem do registro. Sem sessão, só os abertos. */
	modules: ContrateModule[]
	/** Perfil do α, quando já chegou. */
	access: MeAccess | undefined
	/** Com sessão e perfil ainda chegando: a lista acima está incompleta. */
	isPending: boolean
	/** A consulta do perfil falhou — "sem papel" seria mentira. */
	accessFailed: boolean
	isAuthenticated: boolean
}

/**
 * Quais módulos o usuário alcança — a mesma resposta para o seletor da barra, o seletor de
 * OM e a home.
 *
 * O perfil vem do α (`/me/access`), só com sessão: sem ela a resposta já se sabe (os
 * módulos abertos). É conveniência de tela; quem decide é o servidor.
 */
export function useModuleAccess(): ModuleAccess {
	const { isAuthenticated, session } = useAuth()
	const token = session?.access_token
	const access = useQuery({ ...alphaAccessQueryOptions(token), enabled: isAuthenticated && !!token })
	const hydrated = useHydrated()

	// Até a hidratação terminar, o perfil é tratado como "ainda chegando", mesmo que já esteja
	// no cache. As rotas com OM são `ssr: false`: no cliente o guard delas busca `/me/access`
	// ANTES de o shell hidratar, e o primeiro render sairia com o menu de módulos enquanto o
	// HTML do servidor (que não tem o perfil) traz o link simples. O React descartaria a
	// árvore inteira e remontaria — o "Conferindo seu perfil…" piscando de novo.
	const data = hydrated ? access.data : undefined
	return {
		modules: accessibleModules({ isAuthenticated, access: data }),
		access: data,
		// Consulta desabilitada (sem token) também fica `pending` para sempre: não é espera.
		isPending: isAuthenticated && !!token && (!hydrated || access.isPending),
		accessFailed: hydrated && access.isError && access.data === undefined,
		isAuthenticated,
	}
}

const subscribeNever = () => () => {}

/** `false` no servidor e durante a hidratação; `true` a partir do primeiro render pós-hidratação. */
function useHydrated(): boolean {
	return useSyncExternalStore(
		subscribeNever,
		() => true,
		() => false
	)
}
