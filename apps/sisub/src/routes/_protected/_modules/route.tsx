import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/layout/AppShell"
import { SidebarProvider } from "@/components/ui/sidebar"

/**
 * Layout para rotas de módulos — sidebar com seletor de módulo via TeamSwitcher.
 * Renderiza dentro do gradiente de fundo do _protected/route.tsx.
 * Dialogs de onboarding (SaramDialog, EvaluationDialog) estão no layout pai.
 */
export const Route = createFileRoute("/_protected/_modules")({
	component: ModulesLayout,
})

function ModulesLayout() {
	// SSR always renders `open=true` (expanded). After mount, adjust to actual
	// viewport so server/client markup matches on hydration (no mismatch).
	const [open, setOpen] = useState(true)

	useEffect(() => {
		setOpen(window.innerWidth >= 1280)
	}, [])

	return (
		<SidebarProvider open={open} onOpenChange={setOpen} className="bg-transparent text-foreground h-full">
			<AppShell />
		</SidebarProvider>
	)
}
