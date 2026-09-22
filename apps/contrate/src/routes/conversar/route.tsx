import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authQueryOptions } from "@/auth/service"
import { ModuleShell } from "@/components/layout/ModuleShell"

/**
 * Chat avulso: o usuário solta os próprios arquivos e conversa com eles, sem abrir processo —
 * o substituto do NotebookLM/ChatGPT dentro do contrate. Exige sessão: a conversa e os
 * anexos são guardados, e são dele.
 */
export const Route = createFileRoute("/conversar")({
	ssr: false,
	beforeLoad: async ({ context, location }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (!auth.isAuthenticated) {
			throw redirect({ to: "/auth", search: { redirect: location.href } })
		}
		return { auth }
	},
	component: () => (
		<ModuleShell moduleId="conversar">
			<Outlet />
		</ModuleShell>
	),
})
