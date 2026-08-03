import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"

/**
 * Pré-carga das imagens do telão (fotos + brasões) em blobs de memória.
 *
 * O evento roda ~1h com a mesma aba aberta e as imagens são imutáveis, mas o card
 * de cada militar só monta na hora em que ele é chamado — sem pré-carga, cada
 * revelação depende da rede na frente da plateia. Aqui cada arquivo é baixado uma
 * vez no início e servido de `blob:` a partir daí, então a revelação não toca a
 * rede nem depende de header de cache.
 *
 * Guardamos o blob comprimido (~18 MB para as 61 imagens da edição 2026), não o
 * bitmap decodificado — a decodificação continua sob demanda, por imagem exibida.
 * localStorage foi descartado: 5 MB de cota, síncrono na thread principal e só
 * aceita texto (base64 inflaria ~33%), ou seja, o oposto do que se quer aqui.
 */

/** Teto do cache. Acima disso os arquivos restantes seguem pela rede. */
const MAX_CACHE_BYTES = 96 * 1024 * 1024
/** Downloads simultâneos — o bastante para saturar o link sem enfileirar tudo. */
const CONCURRENCY = 6

export interface AssetCacheStatus {
	/** Arquivos já processados (em cache ou desistidos). */
	loaded: number
	total: number
	bytes: number
	done: boolean
}

interface AssetCacheValue extends AssetCacheStatus {
	/** URL local do arquivo, ou a própria URL de rede se ele não estiver em cache. */
	resolve: (src: string) => string
}

const AssetCacheContext = createContext<AssetCacheValue>({ resolve: (src) => src, loaded: 0, total: 0, bytes: 0, done: true })

export function useAssetUrl(src: string): string {
	return useContext(AssetCacheContext).resolve(src)
}

/** Versão em função, para resolver várias URLs numa lista (hooks não vão em loop). */
export function useAssetResolver(): (src: string) => string {
	return useContext(AssetCacheContext).resolve
}

export function useAssetCacheStatus(): AssetCacheStatus {
	const { loaded, total, bytes, done } = useContext(AssetCacheContext)
	return { loaded, total, bytes, done }
}

export function AssetPreloader({ sources, children }: { sources: string[]; children: ReactNode }) {
	const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map())
	const [loaded, setLoaded] = useState(0)
	const [bytes, setBytes] = useState(0)

	// A lista é derivada dos dados do quadro e muda de identidade a cada render;
	// a chave estável evita reiniciar a pré-carga à toa.
	const key = sources.join("|")

	useEffect(() => {
		const list = key ? key.split("|") : []
		if (list.length === 0) return

		let cancelled = false
		const created: string[] = []
		let cursor = 0
		let used = 0

		const worker = async () => {
			while (!cancelled) {
				const index = cursor++
				if (index >= list.length) return
				const src = list[index]
				try {
					const res = await fetch(src, { cache: "force-cache" })
					if (!res.ok) throw new Error(`${res.status} em ${src}`)
					const blob = await res.blob()
					if (cancelled) return
					// Estourar o teto não é erro: a imagem simplesmente continua vindo da rede.
					if (used + blob.size <= MAX_CACHE_BYTES) {
						used += blob.size
						const url = URL.createObjectURL(blob)
						created.push(url)
						setUrls((prev) => new Map(prev).set(src, url))
						setBytes(used)
					}
				} catch {
					// Falha de rede numa imagem não pode travar o resto da pré-carga.
				}
				if (!cancelled) setLoaded((n) => n + 1)
			}
		}

		setLoaded(0)
		setBytes(0)
		void Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker))

		return () => {
			cancelled = true
			for (const url of created) URL.revokeObjectURL(url)
			setUrls(new Map())
		}
	}, [key])

	const total = key ? key.split("|").length : 0
	const value = useMemo<AssetCacheValue>(
		() => ({
			resolve: (src: string) => urls.get(src) ?? src,
			loaded,
			total,
			bytes,
			done: total > 0 && loaded >= total,
		}),
		[urls, loaded, total, bytes]
	)

	return <AssetCacheContext.Provider value={value}>{children}</AssetCacheContext.Provider>
}
