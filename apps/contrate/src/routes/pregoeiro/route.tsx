import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppLayout } from "@/components/AppLayout"

/** Ferramenta pública: a biblioteca abre sem login, e escrever frase ou preferência exige sessão. */
export const Route = createFileRoute("/pregoeiro")({
	component: () => (
		<AppLayout>
			<Outlet />
		</AppLayout>
	),
})
