import { type BarcodeConfig, type BarcodeReading, interpretBarcode } from "@iefa/sisub-domain"
import { Barcode, Camera, CheckCircle2, XCircle } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DEFAULT_TIMING, type ScannerTiming, useGlobalBarcodeCapture } from "@/hooks/ui/useBarcodeScanner"
import { CameraScanDialog } from "./CameraScanDialog"

/**
 * Campo de leitura — o caminho principal de toda tela que lê código.
 *
 * Três decisões que vieram de bug ou de revisão:
 *  • o campo se refoca depois de cada leitura, porque o operador lê em série
 *    (30 caixas iguais) e tocar no mouse entre leituras é o que faz o
 *    conferente desistir e digitar tudo no fim;
 *  • Enter NUNCA submete formulário: o terminador do leitor não pode acionar
 *    "Efetivar definitivo" por acidente;
 *  • o que o campo aceita não é só GTIN. Etiqueta GS1 (com lote e validade),
 *    etiqueta interna de lote e chave de acesso do DANFE entram pelo mesmo
 *    lugar, e quem decide o que é cada coisa é `interpretBarcode`.
 */

interface ScanInputProps {
	/** Chamado com a leitura já interpretada. */
	onReading: (reading: BarcodeReading) => void
	/** Perfil calibrado da estação (prefixo/sufixo/substituto do GS). */
	config?: BarcodeConfig
	placeholder?: string
	disabled?: boolean
	/** A tela existe para ler código: sem foco automático o operador toca no mouse a cada leitura. */
	autoFocus?: boolean
	/** Oferece a leitura por câmera (celular, notebook com webcam). */
	allowCamera?: boolean
	label?: string
	/** Terminador calibrado da estação — só `tab` faz o Tab virar terminador. */
	terminator?: "enter" | "tab" | "none"
	/**
	 * Calibração da estação. Alimenta a captura GLOBAL: quando o foco escapa do
	 * campo (o operador clicou num botão, numa linha da tabela), a leitura ainda
	 * chega aqui em vez de se perder. Sem isso, os parâmetros medidos na tela
	 * "Testar leitor" eram gravados e nunca lidos.
	 */
	timing?: ScannerTiming
	/** Desliga a captura global (duas telas de leitura abertas ao mesmo tempo). */
	globalCapture?: boolean
}

export function ScanInput({
	onReading,
	config = {},
	placeholder = "Leia o código ou digite…",
	disabled,
	autoFocus = true,
	allowCamera = true,
	label = "Código lido",
	terminator = "enter",
	timing = DEFAULT_TIMING,
	globalCapture = true,
}: ScanInputProps) {
	const [value, setValue] = useState("")
	const [status, setStatus] = useState<{ kind: "idle" } | { kind: "ok"; text: string } | { kind: "error"; text: string }>({ kind: "idle" })
	const [cameraOpen, setCameraOpen] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	// leitura que chegou com o foco fora de campo editável
	useGlobalBarcodeCapture({ onScan: (raw) => submit(raw), timing, enabled: globalCapture && !disabled })

	function submit(raw: string) {
		const trimmed = raw.trim()
		if (trimmed === "") return
		const reading = interpretBarcode(trimmed, config)
		if (reading.kind === "unknown") {
			setStatus({ kind: "error", text: reading.reason })
			return
		}
		setStatus({ kind: "ok", text: describeReading(reading) })
		setValue("")
		onReading(reading)
		inputRef.current?.focus()
	}

	return (
		<div className="space-y-1">
			<div className="flex gap-2">
				<div className="relative flex-1">
					<Barcode className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						ref={inputRef}
						className="pl-8 pr-8 font-mono"
						value={value}
						placeholder={placeholder}
						disabled={disabled}
						autoFocus={autoFocus}
						aria-label={label}
						aria-invalid={status.kind === "error"}
						onChange={(event) => {
							setValue(event.target.value)
							if (status.kind !== "idle") setStatus({ kind: "idle" })
						}}
						onKeyDown={(event) => {
							// Enter é sempre terminador de leitura. Tab só quando a estação
							// foi calibrada para um leitor que envia Tab: prender o Tab por
							// padrão tira do teclado a única forma de sair do campo.
							const isTerminator = event.key === "Enter" || (terminator === "tab" && event.key === "Tab" && value.length > 0)
							if (!isTerminator) return
							event.preventDefault()
							submit(value)
						}}
					/>
					{status.kind === "ok" && <CheckCircle2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-success" />}
					{status.kind === "error" && <XCircle className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-destructive" />}
				</div>
				{allowCamera && (
					<Button type="button" variant="outline" size="icon" disabled={disabled} onClick={() => setCameraOpen(true)} aria-label="Ler com a câmera">
						<Camera className="size-4" />
					</Button>
				)}
			</div>
			{status.kind === "error" && <p className="text-xs text-destructive">{status.text}</p>}
			{status.kind === "ok" && <p className="text-xs text-muted-foreground">{status.text}</p>}
			{cameraOpen && (
				<CameraScanDialog
					onClose={() => setCameraOpen(false)}
					onScan={(raw) => {
						setCameraOpen(false)
						submit(raw)
					}}
				/>
			)}
		</div>
	)
}

/** Texto curto do que foi lido — o operador precisa saber o que o sistema entendeu. */
export function describeReading(reading: BarcodeReading): string {
	switch (reading.kind) {
		case "gtin":
			return `GTIN ${reading.gtin}`
		case "gs1": {
			const parts = [reading.fields.gtin ? `GTIN ${reading.fields.gtin}` : null]
			if (reading.fields.lotCode) parts.push(`lote ${reading.fields.lotCode}`)
			if (reading.fields.expiryDate) parts.push(`validade ${reading.fields.expiryDate}`)
			if (reading.fields.netMeasure) parts.push(`${reading.fields.netMeasure.value} ${reading.fields.netMeasure.unit}`)
			return parts.filter(Boolean).join(" · ")
		}
		case "lot_label":
			return `Etiqueta de lote ${reading.lotShortCode}`
		case "nfe_access_key":
			return `Chave de NF-e ${reading.accessKey.number} (série ${reading.accessKey.series})`
		default:
			return reading.reason
	}
}
