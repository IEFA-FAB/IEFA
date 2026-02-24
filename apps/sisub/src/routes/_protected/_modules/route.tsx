import { SidebarProvider } from "@iefa/ui"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { UserQrDialog } from "@/components/common/dialogs/UserQrDialog"
import { AppShell } from "@/components/common/layout/AppShell"
import { useAuth } from "@/hooks/auth/useAuth"

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
	const { user } = useAuth()
	const userId = user?.id ?? null
	const responsiveSidebarDefault = useResponsiveSidebarDefault()

	// QR Dialog State
	const [qrOpen, setQrOpen] = useState(false)
	const [hasCopiedId, setHasCopiedId] = useState(false)
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const handleCopyUserId = async () => {
		if (!user?.id) return
		if (typeof navigator === "undefined" || !navigator.clipboard) return
		try {
			await navigator.clipboard.writeText(user.id)
			setHasCopiedId(true)
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
			copyTimeoutRef.current = setTimeout(() => setHasCopiedId(false), 1600)
		} catch (error) {
			console.error("Erro ao copiar ID:", error)
		}
	}

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
		}
	}, [])

	return (
		<>
			<UserQrDialog
				open={qrOpen}
				onOpenChange={setQrOpen}
				userId={userId}
				onCopy={handleCopyUserId}
				hasCopied={hasCopiedId}
			/>

			<SidebarProvider
				defaultOpen={responsiveSidebarDefault}
				className="bg-transparent text-foreground h-full"
			>
				<AppShell onOpenQr={() => setQrOpen(true)} />
			</SidebarProvider>
		</>
	)
}
