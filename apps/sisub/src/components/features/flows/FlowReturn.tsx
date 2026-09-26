import { Link, useRouterState } from "@tanstack/react-router"
import { ArrowLeft, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { FlowOrigin } from "./FlowView"

/**
 * "Voltar ao fluxo" nas telas abertas a partir de um fluxo guiado.
 *
 * A origem chega no history state do link (nada vai para cookie ou armazenamento). Ela fica em
 * memória enquanto o usuário resolve a etapa, inclusive passando por outras telas (o wizard troca
 * de passo com navegação nova, e o state não viaja junto), e some ao voltar ao fluxo ou ao fechar.
 */
export function FlowReturn() {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const incoming = useRouterState({ select: (s) => (s.location.state as { fromFlow?: FlowOrigin } | undefined)?.fromFlow })
	const [origin, setOrigin] = useState<FlowOrigin | null>(null)

	// Ajuste durante o render (sem efeito): a origem nova substitui a guardada.
	if (incoming && incoming.href !== origin?.href) setOrigin(incoming)
	if (origin && pathname === origin.href) {
		setOrigin(null)
		return null
	}
	if (!origin) return null

	return (
		<div className="mb-4 flex items-center gap-1">
			<Button
				size="sm"
				variant="outline"
				nativeButton={false}
				render={
					<Link to={origin.href as never}>
						<ArrowLeft data-icon="inline-start" aria-hidden="true" />
						Voltar ao fluxo: {origin.label}
					</Link>
				}
			/>
			<Button size="icon-sm" variant="ghost" onClick={() => setOrigin(null)} aria-label="Esconder atalho do fluxo">
				<X aria-hidden="true" />
			</Button>
		</div>
	)
}
