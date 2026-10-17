/**
 * Sessão de leitura pela câmera, sem DOM: o diálogo entrega o ambiente (câmera, detector nativo,
 * zxing, quadros) e recebe de volta a função que encerra a sessão.
 *
 * A regra que justifica o módulo: tudo o que a sessão obtém é devolvido, mesmo o que chega DEPOIS
 * do encerramento. Fechar o diálogo com o pedido de permissão aberto (ou o efeito duplo do
 * StrictMode) encerra a sessão enquanto `getUserMedia` ainda não respondeu; quando ele responde, a
 * stream nasce sem dono e a luz da câmera fica acesa até recarregar a página. O mesmo com os
 * controles do zxing, que chegam depois de um `await`.
 */

export interface CameraTrackLike {
	stop(): void
}

export interface CameraStreamLike {
	getTracks(): CameraTrackLike[]
}

export interface ScanControlsLike {
	stop(): void
}

export interface NativeDetectorLike {
	detect(): Promise<Array<{ rawValue: string }>>
}

export interface ZxingReaderLike {
	decode(onText: (text: string) => void): Promise<ScanControlsLike>
}

export interface CameraScanEnvironment {
	openCamera(): Promise<CameraStreamLike>
	/** Liga a stream ao vídeo e começa a reproduzir. */
	playStream(stream: CameraStreamLike): Promise<void>
	/** `null` quando o navegador não tem `BarcodeDetector`. */
	createNativeDetector(): NativeDetectorLike | null
	/** Carrega o `@zxing/browser` sob demanda. */
	loadZxingReader(): Promise<ZxingReaderLike>
	requestFrame(callback: () => void): number
	cancelFrame(id: number): void
}

export interface CameraScanCallbacks {
	onScan(raw: string): void
	onScanning(): void
	onError(message: string): void
}

export const CAMERA_UNAVAILABLE_MESSAGE = "Não foi possível abrir a câmera — verifique a permissão do navegador ou use o leitor USB"
export const CAMERA_UNSUPPORTED_MESSAGE = "Este navegador não consegue ler pela câmera — use o leitor USB"

/** Começa a sessão e devolve a função que a encerra. */
export function startCameraScan(env: CameraScanEnvironment, callbacks: CameraScanCallbacks): () => void {
	let stopped = false
	let stream: CameraStreamLike | null = null
	let controls: ScanControlsLike | null = null
	let frame = 0

	const releaseStream = () => {
		for (const track of stream?.getTracks() ?? []) track.stop()
		stream = null
	}
	const releaseControls = () => {
		controls?.stop()
		controls = null
	}

	const scanWithNativeDetector = (detector: NativeDetectorLike) => {
		callbacks.onScanning()
		const tick = async () => {
			if (stopped) return
			try {
				const first = (await detector.detect())[0]?.rawValue
				if (first) {
					if (!stopped) callbacks.onScan(first)
					return
				}
			} catch {
				// quadro ruim: tenta o próximo
			}
			if (!stopped) frame = env.requestFrame(() => void tick())
		}
		void tick()
	}

	const scanWithZxing = async () => {
		try {
			const reader = await env.loadZxingReader()
			if (stopped) return
			callbacks.onScanning()
			controls = await reader.decode((text) => {
				if (!stopped) callbacks.onScan(text)
			})
			// Encerrada enquanto o zxing abria: os controles chegaram sem dono.
			if (stopped) releaseControls()
		} catch {
			if (!stopped) callbacks.onError(CAMERA_UNSUPPORTED_MESSAGE)
		}
	}

	const run = async () => {
		try {
			stream = await env.openCamera()
			// Encerrada durante o pedido de permissão: a stream chegou sem dono.
			if (stopped) return releaseStream()
			await env.playStream(stream)
			if (stopped) return
		} catch {
			// Fechada durante a espera: não há mais tela para avisar.
			if (!stopped) callbacks.onError(CAMERA_UNAVAILABLE_MESSAGE)
			return
		}
		const detector = env.createNativeDetector()
		if (detector) scanWithNativeDetector(detector)
		// sem detector nativo: só aqui o leitor alternativo entra no bundle
		else await scanWithZxing()
	}

	void run()
	return () => {
		stopped = true
		if (frame) env.cancelFrame(frame)
		releaseControls()
		releaseStream()
	}
}
