import { Button } from "@iefa/ui"
import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"

interface PageHeaderProps {
	title: string
	description?: string
	/** Right-side action buttons / controls */
	children?: ReactNode
	/** Simple programmatic back — para back via Link, passe-o dentro de children */
	onBack?: () => void
}

/**
 * Toolbar de página — senta no topo do conteúdo de cada route protegido.
 *
 * Uso padrão (sem section wrapper extra — AppShell já provê padding e max-width):
 *
 * ```tsx
 * function MyPage() {
 *   return (
 *     <div className="space-y-6">
 *       <PageHeader title="Preparações">
 *         <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />Nova</Button>
 *       </PageHeader>
 *       <MyContentComponent />
 *     </div>
 *   )
 * }
 * ```
 *
 * Adicione `description` apenas quando a página precisa de contexto que o título
 * não transmite (ex.: orientação de uso, nome dinâmico de entidade, dados de contexto).
 */
export function PageHeader({ title, description, children, onBack }: PageHeaderProps) {
	return (
		<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 border-b border-border/60 pb-4">
			<div className="flex items-start gap-2 min-w-0">
				{onBack && (
					<Button
						variant="ghost"
						size="icon"
						onClick={onBack}
						className="mt-0.5 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft className="h-4 w-4" />
					</Button>
				)}
				<div className="min-w-0">
					<h1 className="text-xl font-semibold tracking-tight text-foreground leading-tight">
						{title}
					</h1>
					{description && (
						<p className="mt-0.5 text-sm text-muted-foreground leading-snug max-w-prose">
							{description}
						</p>
					)}
				</div>
			</div>
			{children && (
				<div className="flex flex-wrap items-center gap-2 shrink-0 sm:pt-px">{children}</div>
			)}
		</header>
	)
}
