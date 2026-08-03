import { useState } from "react"
import { useAssetCacheStatus } from "@/lib/asset-cache"

/** Brasão do IEFA; enquanto o arquivo não existir, cai no símbolo do favicon. */
const CREST_SRC = "/dom/IEFA.png"
const CREST_FALLBACK = "/favicon.svg"

/**
 * Tela de espera do telão, acionada pelo controlador. Cobre o painel inteiro
 * (mapa, quadro e card) com o conteúdo desfocado por trás — o telão pode ficar
 * projetado antes e entre as chamadas sem revelar nada.
 */
export function LockScreen({ editionName }: { editionName: string }) {
	const [crest, setCrest] = useState(CREST_SRC)
	const { loaded, total, done } = useAssetCacheStatus()

	return (
		<div
			className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-slate-950/70 backdrop-blur-2xl animate-in fade-in duration-500"
			role="dialog"
			aria-modal="true"
			aria-label="Telão em espera"
		>
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

			{/* Só aparece enquanto as imagens do evento ainda estão sendo baixadas. */}
			{total > 0 && !done && (
				<p className="font-mono text-sm text-white/40">
					preparando imagens · {loaded}/{total}
				</p>
			)}
		</div>
	)
}
