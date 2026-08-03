import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"

/**
 * Pré-carga das imagens do telão (fotos + brasões).
 *
 * O card de cada militar só monta na hora em que ele é chamado — sem pré-carga, a
 * primeira exibição de cada arquivo depende da rede na frente da plateia. Aqui
 * cada imagem é baixada uma vez no carregamento da página; a partir daí ela sai
 * do cache HTTP do navegador, que o app serve com `max-age` (ver `vite.config.ts`).
 *
 * Deliberadamente sem blob/objectURL: além de duplicar em memória o que o cache do
 * disco já guarda, os blobs morrem no F5 (justamente quando se quer recuperação
 * rápida) e trocar a URL de rede pela `blob:` com a imagem já em tela faz o card
 * piscar. localStorage também foi descartado — 5 MB de cota, síncrono na thread
 * principal e só aceita texto.
 */

/** Downloads simultâneos — o bastante para saturar o link sem enfileirar tudo. */
const CONCURRENCY = 6

export interface AssetPreloadStatus {
	/** Imagens já resolvidas (carregadas ou falhas). */
	loaded: number
	total: number
	done: boolean
}

const AssetPreloadContext = createContext<AssetPreloadStatus>({ loaded: 0, total: 0, done: true })

export function useAssetPreloadStatus(): AssetPreloadStatus {
	return useContext(AssetPreloadContext)
}

export function AssetPreloader({ sources, children }: { sources: string[]; children: ReactNode }) {
	const [loaded, setLoaded] = useState(0)

	// A lista é derivada dos dados do quadro e muda de identidade a cada render;
	// a chave estável evita reiniciar a pré-carga à toa.
	const key = sources.join("|")

	useEffect(() => {
		const list = key ? key.split("|") : []
		if (list.length === 0) return

		let cancelled = false
		let cursor = 0

		const next = () => {
			const index = cursor++
			if (cancelled || index >= list.length) return
			const img = new Image()
			// Falha de rede numa imagem não pode travar o resto da fila.
			const settle = () => {
				if (cancelled) return
				setLoaded((n) => n + 1)
				next()
			}
			img.onload = settle
			img.onerror = settle
			img.src = list[index]
		}

		setLoaded(0)
		for (let i = 0; i < Math.min(CONCURRENCY, list.length); i++) next()

		return () => {
			cancelled = true
		}
	}, [key])

	const total = sources.length
	const value = useMemo<AssetPreloadStatus>(() => ({ loaded, total, done: total > 0 && loaded >= total }), [loaded, total])

	return <AssetPreloadContext.Provider value={value}>{children}</AssetPreloadContext.Provider>
}
