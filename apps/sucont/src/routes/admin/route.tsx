import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { hasPermission, mySucontPermissionsQueryOptions } from "#/auth/pbac"
import { canAccessHub, SUCONT_ADMIN_MODULE } from "#/lib/permission-modules"

/**
 * Módulo `admin` — governança do próprio SUCONT.
 *
 * A raiz já exige sessão e grant em ALGUM módulo do sucont; aqui o gate é o
 * módulo `sucont-admin` no nível 3, o mesmo que `requireSucontAdmin` cobra em
 * cada server function do módulo. Ter uma divisão não abre esta tela: o acesso a
 * ferramenta e a administração de acessos são grants separados desde o split.
 *
 * Quem não tem volta para o hub, se puder abri-lo — mandar para `/auth` sugeriria
 * que falta login, e não módulo. Sem divisão nenhuma o hub também está fechado, e
 * aí `/auth` é o único destino que não faz bounce entre dois guards.
 */
export const Route = createFileRoute("/admin")({
	beforeLoad: async ({ context }) => {
		const permissions = await context.queryClient.query({ ...mySucontPermissionsQueryOptions(), staleTime: "static" })
		if (hasPermission(permissions, SUCONT_ADMIN_MODULE, 3)) return
		if (canAccessHub(permissions)) throw redirect({ to: "/", search: { denied: SUCONT_ADMIN_MODULE } })
		// auth-redirect-without-return-path: autenticado e sem módulo nenhum do sucont.
		// Guardar `/admin` como volta devolveria o usuário ao mesmo redirecionamento
		// depois do login — a mesma escolha do guard da raiz e de `requireModules`.
		throw redirect({ to: "/auth", search: { denied: "1" } })
	},
	component: Outlet,
})
