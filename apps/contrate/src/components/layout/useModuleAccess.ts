import type { MeAccess } from "@iefa/alpha-client/access"
import { useQuery } from "@tanstack/react-query"
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

	return {
		modules: accessibleModules({ isAuthenticated, access: access.data }),
		access: access.data,
		// Consulta desabilitada (sem token) também fica `pending` para sempre: não é espera.
		isPending: isAuthenticated && !!token && access.isPending,
		accessFailed: access.isError && access.data === undefined,
		isAuthenticated,
	}
}
