/**
 * @module blurred-image
 * Imagem com prévia borrada (LQIP) por baixo.
 *
 * As ilustrações moram num bucket privado: primeiro sai um round trip para assinar a URL,
 * só então começa o download do arquivo — que é grande. `placeholder` é o data URL de
 * ~1,5 KB gerado no servidor por `Bun.Image#placeholder()` e entregue junto da
 * linha, então ele já está em mãos antes de `src` existir. A prévia cobre o intervalo
 * inteiro com a cor média, o aspecto e a silhueta certos, e a imagem real aparece por
 * cima quando termina de decodificar.
 *
 * Sem `placeholder` (linha anterior ao backfill, formato que o decoder não abre) o
 * componente cai em `fallback` — a prévia é melhoria progressiva, nunca requisito.
 */

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"

type BlurredImageProps = {
	/** URL assinada da imagem real. `undefined` enquanto a assinatura não voltou. */
	src: string | undefined
	/** Data URL do LQIP, ou `null` quando a linha não tem prévia. */
	placeholder: string | null | undefined
	alt: string
	/** Exibido quando não há `src` NEM `placeholder` (ex.: spinner, ícone de "sem ilustração"). */
	fallback?: React.ReactNode
	loading?: "eager" | "lazy"
	className?: string
}

export function BlurredImage({ src, placeholder, alt, fallback, loading, className }: BlurredImageProps) {
	// Guardamos QUAL src carregou, não um booleano: trocar de variante (ou de look) troca a
	// `src` no mesmo elemento, e um booleano deixaria a imagem nova já opaca enquanto ainda
	// mostra os pixels da anterior. Comparando a URL, a troca volta a passar pelo blur.
	const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

	// `onLoad` não dispara para imagem que já está no cache do browser quando o React monta o
	// elemento (o decode terminou antes do listener existir). Sem esta checagem no ref a
	// imagem cacheada ficaria presa em opacity-0 — visível como card permanentemente borrado
	// ao voltar para uma tela já visitada.
	const measure = useCallback((node: HTMLImageElement | null) => {
		if (node?.complete && node.naturalWidth > 0) setLoadedSrc(node.currentSrc || node.src)
	}, [])

	const loaded = !!src && loadedSrc === src
	const showPlaceholder = !!placeholder && !loaded

	if (!src && !placeholder) {
		return <div className={cn("flex items-center justify-center", className)}>{fallback}</div>
	}

	return (
		<div className={cn("relative overflow-hidden", className)}>
			{showPlaceholder && (
				// `scale-105` come a franja que o blur cria nas bordas do próprio thumbhash.
				// `aria-hidden` + alt vazio: é a MESMA imagem do <img> real, e anunciá-la duas
				// vezes faria o leitor de tela repetir a legenda do uniforme.
				<img
					src={placeholder}
					alt=""
					aria-hidden="true"
					className="absolute inset-0 h-full w-full scale-105 object-contain blur-lg"
					// O thumbhash tem ~32px: sem isto o browser aplica suavização de downscale
					// e o resultado fica sujo em vez de borrado.
					style={{ imageRendering: "auto" }}
				/>
			)}
			{src && (
				<img
					ref={measure}
					src={src}
					alt={alt}
					loading={loading}
					onLoad={(e) => setLoadedSrc(e.currentTarget.currentSrc || e.currentTarget.src)}
					// Erro de carga não pode prender a tela no blur para sempre: assumimos
					// carregado e deixamos o <img> quebrado aparecer, que é o estado honesto.
					onError={() => setLoadedSrc(src)}
					className={cn(
						"absolute inset-0 h-full w-full object-contain transition-opacity duration-500 motion-reduce:transition-none",
						loaded ? "opacity-100" : "opacity-0"
					)}
				/>
			)}
		</div>
	)
}
