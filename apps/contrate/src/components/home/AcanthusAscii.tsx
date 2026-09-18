import { useEffect, useRef, useState } from "react"
import { mountAcanthus } from "@/lib/acanthus/mount"
import { cn } from "@/lib/utils"

/**
 * Folha de acanto — símbolo do quadro de Intendência — em arte ASCII, girando
 * devagar em 3D. Fundo decorativo da hero: preenche o pai (que precisa ser
 * `position: relative` com tamanho definido), não recebe clique nem foco e some
 * da árvore de acessibilidade.
 *
 * Tudo que toca o DOM roda no efeito: no SSR sai só o contêiner vazio, e a folha
 * entra em fade depois do primeiro quadro. Sem canvas 2D, fica o vazio — é
 * enfeite, nunca quebra a página.
 */
export function AcanthusAscii({ className }: { className?: string }) {
	const hostRef = useRef<HTMLDivElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const [visible, setVisible] = useState(false)

	useEffect(() => {
		const host = hostRef.current
		const canvas = canvasRef.current
		if (!host || !canvas) return
		try {
			return mountAcanthus(host, canvas, { onFirstFrame: () => setVisible(true) })
		} catch {
			// Navegador sem os observers ou sem canvas: a hero segue sem o fundo.
			return undefined
		}
	}, [])

	return (
		<div ref={hostRef} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden select-none", className)}>
			<canvas
				ref={canvasRef}
				className="absolute inset-0 size-full transition-opacity duration-1000 ease-out motion-reduce:transition-none"
				style={{ opacity: visible ? 1 : 0 }}
			/>
		</div>
	)
}
