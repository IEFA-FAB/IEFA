import type { Person } from "@iefa/database/assignment-selection"
import { memo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"

const ImageWithFallback = memo(({ src, alt, className }: { src: string; alt: string; className: string }) => {
	const [error, setError] = useState(false)
	const [loading, setLoading] = useState(true)

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
					src={src}
					alt={alt}
					className={`${className} ${loading ? "opacity-0" : "opacity-100"} transition-opacity duration-300`}
					onError={() => {
						setError(true)
						setLoading(false)
					}}
					onLoad={() => setLoading(false)}
					loading="lazy"
				/>
			)}
		</div>
	)
})
ImageWithFallback.displayName = "ImageWithFallback"

/**
 * Card em destaque do militar da vez (overlay full-screen no painel).
 * Foto por edição+classificação (/pessoas/{ano}/{classificacao}.jpg) e brasão da
 * OM servidos de /public.
 */
export const PersonCard = memo(({ cardData, editionName }: { cardData: Person; editionName: string }) => {
	const personImageUrl = `/pessoas/${encodeURIComponent(editionName)}/${cardData.classificacao}.jpg`
	const omImageUrl = cardData.localidade ? `/dom/${encodeURIComponent(cardData.localidade)}.png` : ""

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
			role="dialog"
			aria-modal="true"
			aria-labelledby="person-card-title"
		>
			<Card className="relative w-full h-full max-w-[1400px] max-h-[30rem] bg-white shadow-2xl animate-in zoom-in-95 duration-300">
				<CardContent className="grid grid-cols-8 grid-rows-1 items-center gap-6 px-6 h-full">
					<div className="flex col-span-1 h-full items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-5xl font-bold text-slate-700 shadow-inner">
						<span className="drop-shadow-sm">{cardData.classificacao}º</span>
					</div>

					<div className="col-span-2 h-full">
						<ImageWithFallback src={personImageUrl} alt={`Foto de ${cardData.nome}`} className="w-full h-full object-cover rounded-md shadow-lg aspect-3/4" />
					</div>

					<div className="col-span-3 grid grid-rows-3 space-y-2">
						<div id="person-card-title" className="row-span-2">
							<p className="text-4xl font-bold text-slate-700">Asp.</p>
							<h3 className="text-6xl font-black text-left text-slate-900 leading-tight">{cardData.nome}</h3>
						</div>
						<div className="row-span-1">
							{cardData.show_om && (
								<div className="space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
									<p className="text-4xl font-bold text-slate-700">{cardData.localidade}</p>
									<p className="text-base text-slate-500">{cardData.estado}</p>
								</div>
							)}
						</div>
					</div>

					<div className="col-span-2 h-full">
						{cardData.show_om && omImageUrl && (
							<ImageWithFallback
								src={omImageUrl}
								alt={`Brasão de ${cardData.localidade}`}
								className="w-full h-full animate-in fade-in zoom-in-95 object-contain drop-shadow-lg duration-500 aspect-square"
							/>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	)
})
PersonCard.displayName = "PersonCard"
