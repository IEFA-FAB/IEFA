import { Eye, Lock, MonitorOff, MonitorPlay, MonitorUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { describeScreen, type ScreenView } from "@/lib/conduct"
import { cn } from "@/lib/utils"

interface ScreenStatusBarProps {
	view: ScreenView
	busy?: boolean
	onActivate: () => void
	onToggleLock: (locked: boolean) => void
}

/**
 * O que a plateia está vendo agora, sempre à vista. O operador fica de costas para a
 * projeção: sem esta faixa ele chamaria e revelaria militares por trás da tela de espera.
 */
export function ScreenStatusBar({ view, busy, onActivate, onToggleLock }: ScreenStatusBarProps) {
	const { headline, detail } = describeScreen(view)
	const isLocked = view.kind === "locked"
	const isOffAir = view.kind === "other-edition" || view.kind === "no-edition"

	const Icon = isLocked ? Lock : isOffAir ? MonitorOff : MonitorPlay

	return (
		<section
			aria-label="Telão"
			className={cn(
				"flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-4 py-3",
				isLocked ? "border-warning/40 bg-warning/10" : isOffAir ? "border-border bg-muted/60" : "border-border bg-card"
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"grid size-10 shrink-0 place-items-center rounded-lg",
					isLocked ? "bg-warning/15 text-warning" : isOffAir ? "bg-background text-muted-foreground" : "bg-success/15 text-success"
				)}
			>
				<Icon className="size-5" />
			</span>

			{/* `aria-live`: a troca do que está projetado é anunciada sem roubar o foco. */}
			<div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs font-medium text-muted-foreground">No telão agora</span>
					{isLocked ? (
						<Badge variant="warning">Bloqueado</Badge>
					) : isOffAir ? (
						<Badge>Fora do ar</Badge>
					) : (
						<Badge variant="success">
							<span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
							Ao vivo
						</Badge>
					)}
				</div>
				<p className="mt-0.5 truncate text-base font-semibold text-foreground">{headline}</p>
				{detail && <p className="truncate text-sm text-muted-foreground">{detail}</p>}
			</div>

			<div className="flex shrink-0 items-center gap-2">
				{isOffAir ? (
					view.kind === "other-edition" && (
						<Button size="lg" onClick={onActivate} disabled={busy}>
							<MonitorUp /> Levar esta edição ao telão
						</Button>
					)
				) : isLocked ? (
					<Button size="lg" onClick={() => onToggleLock(false)} disabled={busy}>
						<Eye /> Liberar telão
					</Button>
				) : (
					<Button size="lg" variant="outline" onClick={() => onToggleLock(true)} disabled={busy}>
						<Lock /> Pôr tela de espera
					</Button>
				)}
			</div>
		</section>
	)
}
