import { AnimatedThemeToggler, Button, SidebarTrigger } from "@iefa/ui"
import { QrCode } from "lucide-react"
import type { NavItem } from "@/components/common/layout/sidebar/NavItems"
import { NavUser } from "@/components/common/layout/sidebar/NavUser"
import { useTheme } from "@/hooks/ui/useTheme"
import type { UserLevelOrNull } from "@/types/domain/"

export type TopbarProps = {
	showSidebar: boolean
	navItems: NavItem[]
	sheetOpen: boolean
	onSheetOpenChange: (open: boolean) => void
	onSidebarNavigate: () => void
	showGlobalProgress: boolean
	onOpenQr: () => void
	userId: string | null
	userLevel: UserLevelOrNull | undefined
}

export function Topbar({ onOpenQr, userId, userLevel, showSidebar }: TopbarProps) {
	const { toggle } = useTheme()

	return (
		<header className=" top-2 mx-auto w-full max-w-7xl sticky rounded-full shadow-xl z-40 flex h-14 items-center border-b bg-background/80 px-3 backdrop-blur supports-backdrop-filter:bg-background/60 sm:px-4 shrink-0 gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
			<div className="flex w-full items-center">
				{/* Esquerda: trigger do sidebar (somente se disponível) ou NavUser */}
				{userLevel && showSidebar ? (
					<div className="flex items-center">
						<SidebarTrigger />
					</div>
				) : (
					<div className="flex items-center">
						<NavUser />
					</div>
				)}

				{/* Direita: todas as ações */}
				<div
					role="toolbar"
					aria-label="Ações rápidas"
					className="ml-auto flex items-center gap-2 sm:gap-3"
				>
					<Button
						variant="outline"
						size="sm"
						onClick={onOpenQr}
						className="flex items-center gap-2 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
						aria-label="Abrir QR do usuário"
						disabled={!userId}
						title={userId ? "Mostrar QR" : "Usuário não identificado"}
					>
						<QrCode className="h-4 w-4" />
						<span className="hidden font-medium sm:inline">QR</span>
					</Button>

					<AnimatedThemeToggler toggle={toggle} />
				</div>
			</div>
		</header>
	)
}
