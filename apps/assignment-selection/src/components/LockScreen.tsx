import { useState } from "react"
import { useAssetPreloadStatus } from "@/lib/asset-cache"

/** Brasão do IEFA; se o arquivo faltar, cai no símbolo do app. */
const CREST_SRC = "/dom/IEFA.png"
const CREST_FALLBACK = "/favicon.svg"

/**
 * Tela de espera do telão, acionada pelo controlador. O painel continua vivo por
 * trás (o card do militar em cena é desmontado pelo chamador), então o véu é
 * opaco por si só — `backdrop-blur` é acabamento, não o que esconde: navegador
 * sem suporte a backdrop-filter deixaria passar um card branco de 1400 px.
 */
export function LockScreen({ editionName }: { editionName: string }) {
	const [crest, setCrest] = useState(CREST_SRC)
	const { loaded, total, done } = useAssetPreloadStatus()

	return (
		<div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-500">
			<img
				src={crest}
				alt="Brasão do IEFA"
				className="w-[22rem] max-w-[40vw] object-contain drop-shadow-2xl"
				onError={() => setCrest((current) => (current === CREST_SRC ? CREST_FALLBACK : current))}
			/>

			<div className="text-center">
				<p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-300/70">CPAINT · Força Aérea Brasileira</p>
				<p className="mt-2 text-3xl font-black tracking-tight text-white/90">Escolha de Vagas {editionName}</p>
			</div>

			{/* Legível de longe: é por ele que o operador sabe se já pode começar. */}
			{total > 0 && !done && (
				<p className="text-2xl font-medium tabular-nums text-white/70">
					Preparando imagens · {loaded} de {total}
				</p>
			)}
		</div>
	)
}
