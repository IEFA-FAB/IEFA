import type { Person } from "@iefa/database/assignment-selection"
import { memo, useCallback, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type ImageStatus = "loading" | "loaded" | "error"

const ImageWithFallback = memo(({ src, alt, className }: { src: string; alt: string; className: string }) => {
	const [state, setState] = useState<{ src: string; status: ImageStatus }>({ src, status: "loading" })

	// Troca de militar reinicia o estado no mesmo <img> (sem esperar um efeito).
	if (state.src !== src) setState({ src, status: "loading" })

	// A imagem pode ficar pronta antes do React anexar os handlers — HTML vindo do
	// SSR, ou arquivo já em cache. Nesse caso onLoad nunca dispara e o card ficaria
	// preso no spinner, então o estado inicial vem do próprio elemento.
	const settleFromElement = useCallback((el: HTMLImageElement | null) => {
		if (!el?.complete) return
		setState({ src: el.getAttribute("src") ?? "", status: el.naturalWidth > 0 ? "loaded" : "error" })
	}, [])

	const loading = state.status === "loading"
	const error = state.status === "error"

	return (
		<div className={`relative ${className}`}>
			{loading && !error && (
				<div className="absolute inset-0 bg-slate-200 animate-pulse rounded-md flex items-center justify-center">
					<div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
				</div>
			)}
			{error ? (
				<div className="absolute inset-0 bg-slate-200 rounded-md flex items-center justify-center">
					<span className="text-slate-500 text-sm">Sem imagem</span>
				</div>
			) : (
				<img
					ref={settleFromElement}
					src={src}
					alt={alt}
					className={`${className} ${loading ? "opacity-0" : "opacity-100"} transition-opacity duration-300`}
					onError={() => setState({ src, status: "error" })}
					onLoad={() => setState({ src, status: "loaded" })}
					loading="lazy"
				/>
			)}
		</div>
	)
})
ImageWithFallback.displayName = "ImageWithFallback"

/**
 * Card em destaque do militar da vez. Foto por edição+classificação
 * (/pessoas/{ano}/{classificacao}.jpg) e brasão da OM servidos de /public.
 *
 * Duas geometrias, comandadas por `show_om`:
 * - antes da revelação, o card cobre só a área do mapa (`absolute inset-0` no
 *   próprio slot), deixando o quadro de vagas nítido ao lado — o militar chamado
 *   precisa ver para onde ainda pode ir antes de anunciar;
 * - revelada a OM, vira overlay de tela cheia: o quadro sai de cena e sobram o
 *   card com o brasão e o mapa desfocado ao fundo, com o estado destacado.
 */
export const PersonCard = memo(({ cardData, editionName }: { cardData: Person; editionName: string }) => {
	const personImageUrl = `/pessoas/${encodeURIComponent(editionName)}/${cardData.classificacao}.jpg`
	const omImageUrl = cardData.localidade ? `/dom/${encodeURIComponent(cardData.localidade)}.png` : ""
	const revealed = Boolean(cardData.show_om)

	return (
		<div
			className={cn(
				"z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300",
				revealed ? "fixed inset-0" : "absolute inset-0"
			)}
			role="dialog"
			aria-modal={revealed}
			aria-labelledby="person-card-title"
		>
			<Card
				className={cn(
					"relative w-full h-full max-h-[30rem] bg-white shadow-2xl animate-in zoom-in-95 duration-300",
					revealed ? "max-w-[1400px]" : "max-w-[980px]"
				)}
			>
				<CardContent className={cn("grid grid-rows-1 items-center gap-6 px-6 h-full", revealed ? "grid-cols-8" : "grid-cols-6")}>
					<div className="flex col-span-1 h-full items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-5xl font-bold text-slate-700 shadow-inner">
						<span className="drop-shadow-sm">{cardData.classificacao}º</span>
					</div>

					<div className="col-span-2 h-full">
						<ImageWithFallback src={personImageUrl} alt={`Foto de ${cardData.nome}`} className="w-full h-full object-cover rounded-md shadow-lg aspect-3/4" />
					</div>

					<div className="col-span-3 grid grid-rows-3 space-y-2">
						<div id="person-card-title" className="row-span-2">
							<p className="text-4xl font-bold text-slate-700">Asp.</p>
							<h3 className={cn("font-black text-left text-slate-900 leading-tight", revealed ? "text-6xl" : "text-5xl")}>{cardData.nome}</h3>
						</div>
						<div className="row-span-1">
							{revealed && (
								<div className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
									<p className="text-4xl font-bold text-slate-700">{cardData.localidade}</p>
									<p className="text-base text-slate-500">{cardData.estado}</p>
								</div>
							)}
						</div>
					</div>

					{revealed && (
						<div className="col-span-2 h-full">
							{omImageUrl && (
								<ImageWithFallback
									src={omImageUrl}
									alt={`Brasão de ${cardData.localidade}`}
									className="w-full h-full animate-in fade-in zoom-in-95 object-contain drop-shadow-lg duration-500 aspect-square"
								/>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
})
PersonCard.displayName = "PersonCard"
