import { Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

/**
 * Leitura por câmera — alternativa ao leitor USB (celular na câmara, notebook
 * com webcam no recebimento).
 *
 * Dois caminhos, nesta ordem:
 *  1. `BarcodeDetector` nativo, quando o navegador tem (Chrome/Edge em
 *     Android). É o mais leve e o que entrega o separador GS intacto.
 *  2. `@zxing/browser` carregado SOB DEMANDA. Chrome de desktop e Firefox não
 *     têm o detector nativo, e o `qr-scanner` que o app já usava só lê QR —
 *     não lê EAN-13, que é o código de 90% das embalagens.
 *
 * A câmera só é pedida quando este diálogo abre: permissão de dispositivo não
 * se pede "por precaução".
 */

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "itf", "code_128", "data_matrix", "qr_code"] as const

interface BarcodeDetectorLike {
	detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
}

interface BarcodeDetectorConstructor {
	new (options?: { formats?: readonly string[] }): BarcodeDetectorLike
	getSupportedFormats?: () => Promise<string[]>
}

interface CameraScanDialogProps {
	onScan: (raw: string) => void
	onClose: () => void
}

export function CameraScanDialog({ onScan, onClose }: CameraScanDialogProps) {
	const videoRef = useRef<HTMLVideoElement>(null)
	const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting")
	const [message, setMessage] = useState("Abrindo a câmera…")

	useEffect(() => {
		let stopped = false
		let stream: MediaStream | null = null
		let frame = 0
		// biome-ignore lint/suspicious/noExplicitAny: controls do zxing, carregado sob demanda
		let zxingControls: any = null

		async function start() {
			const video = videoRef.current
			if (!video) return
			try {
				stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
				if (stopped) return
				video.srcObject = stream
				await video.play()
			} catch {
				setStatus("error")
				setMessage("Não foi possível abrir a câmera — verifique a permissão do navegador ou use o leitor USB")
				return
			}

			const DetectorCtor = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
			if (DetectorCtor) {
				const detector = new DetectorCtor({ formats: FORMATS })
				setStatus("scanning")
				setMessage("Aponte o código para a câmera")
				const tick = async () => {
					if (stopped) return
					try {
						const found = await detector.detect(video)
						const first = found[0]?.rawValue
						if (first) {
							onScan(first)
							return
						}
					} catch {
						// quadro ruim: tenta o próximo
					}
					frame = requestAnimationFrame(() => void tick())
				}
				void tick()
				return
			}

			// sem detector nativo: só aqui o leitor alternativo entra no bundle
			try {
				const { BrowserMultiFormatReader } = await import("@zxing/browser")
				if (stopped) return
				const reader = new BrowserMultiFormatReader()
				setStatus("scanning")
				setMessage("Aponte o código para a câmera")
				zxingControls = await reader.decodeFromVideoElement(video, (result) => {
					if (result && !stopped) onScan(result.getText())
				})
			} catch {
				setStatus("error")
				setMessage("Este navegador não consegue ler pela câmera — use o leitor USB")
			}
		}

		void start()
		return () => {
			stopped = true
			if (frame) cancelAnimationFrame(frame)
			zxingControls?.stop?.()
			for (const track of stream?.getTracks() ?? []) track.stop()
		}
	}, [onScan])

	return (
		<div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4">
			{/* Imagem ao vivo da câmera, não conteúdo com fala: legenda não se aplica. */}
			<video ref={videoRef} className="max-h-[70vh] w-full max-w-lg rounded-xl bg-black object-cover" muted playsInline />
			<p className="flex items-center gap-2 text-sm text-white">
				{status === "starting" && <Loader2 className="size-4 animate-spin" />}
				{message}
			</p>
			<Button type="button" variant="secondary" onClick={onClose}>
				<X className="mr-2 size-4" />
				Fechar
			</Button>
		</div>
	)
}
