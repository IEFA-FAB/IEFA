import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { AppShell } from "@/components/common/layout/AppShell"
import { SidebarProvider } from "@/components/ui/sidebar"

/**
 * Hook para determinar o estado padrão da sidebar baseado no tamanho da tela
 * Sidebar aberta em telas >= 1280px (xl breakpoint)
 */
function useResponsiveSidebarDefault() {
	const [defaultOpen, setDefaultOpen] = useState(() => {
		if (typeof window === "undefined") return true
		return window.innerWidth >= 1280
	})

	useEffect(() => {
		const handleResize = () => {
			const shouldBeOpen = window.innerWidth >= 1280
			setDefaultOpen(shouldBeOpen)
		}

		let timeoutId: NodeJS.Timeout
		const debouncedResize = () => {
			clearTimeout(timeoutId)
			timeoutId = setTimeout(handleResize, 150)
		}

		window.addEventListener("resize", debouncedResize)
		return () => {
			window.removeEventListener("resize", debouncedResize)
			clearTimeout(timeoutId)
		}
	}, [])

	return defaultOpen
}

/**
 * Layout para rotas de módulos — sidebar com seletor de módulo via TeamSwitcher.
 * Renderiza dentro do gradiente de fundo do _protected/route.tsx.
 * Dialogs de onboarding (SaramDialog, EvaluationDialog) estão no layout pai.
 */
export const Route = createFileRoute("/_protected/_modules")({
	component: ModulesLayout,
})

function ModulesLayout() {
	const responsiveSidebarDefault = useResponsiveSidebarDefault()

	return (
		<SidebarProvider defaultOpen={responsiveSidebarDefault} className="bg-transparent text-foreground h-full">
			<AppShell />
		</SidebarProvider>
	)
}
