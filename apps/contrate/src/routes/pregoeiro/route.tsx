import { createFileRoute, Outlet } from "@tanstack/react-router"
import { ModuleShell } from "@/components/layout/ModuleShell"

/**
 * Ferramenta pública: a biblioteca abre sem login, e escrever frase ou preferência
 * exige sessão. A casca funciona sem sessão — o seletor lista só o que o visitante
 * alcança (aqui, só este módulo) e o rodapé da barra oferece "Entrar".
 */
export const Route = createFileRoute("/pregoeiro")({
	component: () => (
		<ModuleShell moduleId="pregoeiro">
			<Outlet />
		</ModuleShell>
	),
})
