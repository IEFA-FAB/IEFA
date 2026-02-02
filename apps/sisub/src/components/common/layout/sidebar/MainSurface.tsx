import { Button, cn } from "@iefa/ui"
import type { ReactNode } from "react"

export type MainSurfaceProps = {
	showInitialError: boolean
	showInitialLoading: boolean
	onRetry: () => void
	children: ReactNode
}

export function MainSurface({
	showInitialError,
	showInitialLoading,
	onRetry,
	children,
}: MainSurfaceProps) {
	return (
		<div
			className={cn(
				"relative isolate flex flex-col bg-transparent text-foreground transition-colors duration-300",
				"min-h-svh supports-[height:100dvh]:min-h-dvh",
				"main-content-surface" // For View Transitions API animations
			)}
		>
			{showInitialError ? (
				<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
					<p className="text-sm font-medium text-destructive">
						Não foi possível carregar suas permissões no momento.
					</p>
					<p className="text-xs text-muted-foreground">
						Atualize a página ou entre em contato com um administrador.
					</p>
					<Button size="sm" variant="outline" onClick={onRetry}>
						Tentar novamente
					</Button>
				</div>
			) : showInitialLoading ? (
				<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
					Carregando painel...
				</div>
			) : (
				children
			)}
		</div>
	)
}
