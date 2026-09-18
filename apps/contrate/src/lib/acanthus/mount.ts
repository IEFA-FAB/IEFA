/**
 * Liga o pintor da folha ao DOM: tamanho (ResizeObserver), visibilidade
 * (IntersectionObserver + `document.hidden`), tema (classe do <html> e
 * preferência do SO) e `prefers-reduced-motion`. Só é chamado de dentro de
 * efeito — nada roda no servidor.
 *
 * A variante (folha procedural ou a arte do mantenedor) é sorteada aqui, a cada
 * carga, e carregada sob demanda — ver `variant.ts`.
 *
 * O laço anda a ~24 quadros/s e o ângulo é função do tempo ATIVO acumulado:
 * pausar fora da tela ou com a aba escondida não faz a folha pular ao voltar.
 */

import { createAcanthusPainter, type PainterStyle } from "./painter"
import type { AsciiScene } from "./scene"
import { type AcanthusVariant, pickVariant } from "./variant"

/** Uma volta completa em 75 s. */
const REVOLUTION_MS = 75_000
const FRAME_MS = 1000 / 24
const MAX_DPR = 2

/**
 * Cada variante é um chunk separado: quem sorteia a procedural não baixa a arte
 * de 70 kB, e quem sorteia a arte não carrega o gerador de geometria.
 */
async function loadScene(variant: AcanthusVariant): Promise<AsciiScene> {
	if (variant === "intendencia") {
		const [{ createIntendenciaScene }, { default: text }] = await Promise.all([import("./intendencia"), import("./art/intendencia.txt?raw")])
		return createIntendenciaScene(text)
	}
	const { createProceduralScene } = await import("./procedural")
	return createProceduralScene()
}

function readStyle(host: HTMLElement): PainterStyle {
	const computed = getComputedStyle(host)
	const color = computed.getPropertyValue("--foreground").trim() || computed.color
	const fontFamily = computed.getPropertyValue("--font-mono").trim() || "ui-monospace, Menlo, monospace"
	return { color, fontFamily }
}

export interface MountOptions {
	/** Chamado uma vez, depois do primeiro quadro pintado — hora do fade-in. */
	onFirstFrame?: () => void
}

/** Monta a animação em `canvas`, dimensionada por `host`. Devolve a limpeza. */
export function mountAcanthus(host: HTMLElement, canvas: HTMLCanvasElement, { onFirstFrame }: MountOptions = {}): () => void {
	const doc = host.ownerDocument
	const view = doc.defaultView
	if (!view) return () => {}

	const reducedQuery = view.matchMedia("(prefers-reduced-motion: reduce)")
	const schemeQuery = view.matchMedia("(prefers-color-scheme: dark)")

	let painter: ReturnType<typeof createAcanthusPainter> = null
	let scene: AsciiScene | null = null
	let disposed = false
	let inView = true
	let sized = false
	let firstFramePainted = false
	let yaw = 0
	let raf = 0
	let lastTick = 0
	let lastDraw = 0
	let size = { width: 0, height: 0 }

	const paint = () => {
		if (!painter || !sized) return
		const covered = painter.render(reducedQuery.matches && scene ? scene.staticYaw : yaw)
		if (!firstFramePainted && covered > 0) {
			firstFramePainted = true
			onFirstFrame?.()
		}
	}

	const shouldRun = () => !!painter && sized && inView && !doc.hidden && !reducedQuery.matches

	const tick = (now: number) => {
		raf = 0
		if (!shouldRun()) return
		// Passo limitado: um quadro atrasado (GC, aba recém-reaberta) não vira salto.
		yaw += (Math.min(now - lastTick, 100) / REVOLUTION_MS) * Math.PI * 2
		lastTick = now
		if (now - lastDraw >= FRAME_MS - 2) {
			lastDraw = now
			paint()
		}
		raf = view.requestAnimationFrame(tick)
	}

	const sync = () => {
		if (disposed) return
		if (shouldRun()) {
			if (raf === 0) {
				lastTick = view.performance.now()
				raf = view.requestAnimationFrame(tick)
			}
		} else if (raf !== 0) {
			view.cancelAnimationFrame(raf)
			raf = 0
		}
	}

	const relayout = () => {
		if (!painter) return
		const dpr = Math.min(view.devicePixelRatio || 1, MAX_DPR)
		sized = painter.layout({ width: size.width, height: size.height, dpr })
		// Redimensionar limpa o canvas: repinta já, mesmo parado.
		paint()
		sync()
	}

	const restyle = () => {
		if (!painter) return
		painter.setStyle(readStyle(host))
		paint()
	}

	const resizeObserver = new ResizeObserver((entries) => {
		const box = entries[entries.length - 1]?.contentRect
		if (!box) return
		if (box.width === size.width && box.height === size.height) return
		size = { width: box.width, height: box.height }
		relayout()
	})

	const intersectionObserver = new IntersectionObserver((entries) => {
		const entry = entries[entries.length - 1]
		if (!entry) return
		inView = entry.isIntersecting
		sync()
	})

	// Tema: o ThemeProvider troca a classe do <html>; sem escolha, o SO decide.
	const themeObserver = new MutationObserver(restyle)

	const onReducedChange = () => {
		paint()
		sync()
	}

	// Montar a cena custa dezenas de ms (e um chunk): fica para depois da
	// hidratação, num momento ocioso, para não disputar o primeiro quadro.
	const start = async () => {
		if (disposed) return
		let loaded: AsciiScene
		try {
			loaded = await loadScene(pickVariant(view.location.search))
		} catch {
			// Chunk que não chegou (rede, deploy novo): a hero segue sem o fundo.
			return
		}
		if (disposed) return
		scene = loaded
		yaw = loaded.startYaw
		painter = createAcanthusPainter(canvas, loaded)
		if (!painter) return
		painter.setStyle(readStyle(host))
		// Tamanho de layout (o mesmo do ResizeObserver): a animação de entrada da
		// hero aplica transform, e o retângulo transformado mentiria.
		size = { width: host.clientWidth, height: host.clientHeight }
		relayout()
		resizeObserver.observe(host)
		intersectionObserver.observe(host)
		themeObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] })
		schemeQuery.addEventListener("change", restyle)
		reducedQuery.addEventListener("change", onReducedChange)
		doc.addEventListener("visibilitychange", sync)
		// Fontes chegam depois: o atlas é refeito com a família certa.
		doc.fonts?.ready.then(() => {
			if (!disposed && painter) {
				painter.layout({ width: size.width, height: size.height, dpr: Math.min(view.devicePixelRatio || 1, MAX_DPR) })
				paint()
			}
		})
	}

	const idle = typeof view.requestIdleCallback === "function"
	const kickoff = () => void start()
	const startHandle = idle ? view.requestIdleCallback(kickoff, { timeout: 600 }) : view.setTimeout(kickoff, 60)

	return () => {
		disposed = true
		if (idle) view.cancelIdleCallback(startHandle)
		else view.clearTimeout(startHandle)
		if (raf !== 0) view.cancelAnimationFrame(raf)
		resizeObserver.disconnect()
		intersectionObserver.disconnect()
		themeObserver.disconnect()
		schemeQuery.removeEventListener("change", restyle)
		reducedQuery.removeEventListener("change", onReducedChange)
		doc.removeEventListener("visibilitychange", sync)
	}
}
