import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { myAlphaPermissionsQueryOptions } from "@/lib/alpha/permissions"
import { accessibleModules, type ContrateModule } from "@/lib/modules"

export interface ModuleAccess {
	/** Módulos que a pessoa alcança, na ordem do registro. Sem sessão, só os abertos. */
	modules: ContrateModule[]
	/** Com sessão e permissões ainda chegando: a lista acima está incompleta. */
	isPending: boolean
	isAuthenticated: boolean
}

/**
 * Quais módulos o usuário alcança — a mesma resposta para o seletor da barra e para
 * o "Abrir" do cabeçalho da home.
 *
 * Só consulta com sessão: sem ela o servidor responde 401, e a resposta já se sabe
 * (os módulos abertos). É conveniência de tela; quem decide é o servidor.
 */
export function useModuleAccess(): ModuleAccess {
	const { isAuthenticated } = useAuth()
	const permissions = useQuery({ ...myAlphaPermissionsQueryOptions(), enabled: isAuthenticated })

	return {
		modules: accessibleModules(permissions.data ?? []),
		isPending: isAuthenticated && permissions.isPending,
		isAuthenticated,
	}
}
