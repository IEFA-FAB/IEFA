import { type BarcodeConfig, type BarcodeReading, interpretBarcode } from "@iefa/sisub-domain"
import { Barcode, Camera, CheckCircle2, XCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DEFAULT_TIMING, type ScannerTiming, useGlobalBarcodeCapture } from "@/hooks/ui/useBarcodeScanner"
import { type FieldRhythm, IDLE_RHYTHM, looksScanned, nextFieldRhythm, tabEndsScan } from "@/lib/scanner-burst"
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
	// Ritmo das teclas DENTRO do campo. É o que separa o leitor da mão: o leitor
	// despeja o código em rajada, mais rápido do que qualquer digitação. Sem
	// medir isso, o campo só sabia o que a calibração dizia — e quem nunca
	// calibrou a estação (o caso normal no primeiro dia) perdia o leitor que
	// termina com Tab, e o leitor sem terminador nunca submetia.
	const burstRef = useRef<FieldRhythm>(IDLE_RHYTHM)
	const valueRef = useRef("")
	const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	useEffect(
		() => () => {
			if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
		},
		[]
	)

	// leitura que chegou com o foco fora de campo editável
	useGlobalBarcodeCapture({ onScan: (raw) => submit(raw), timing, enabled: globalCapture && !disabled })

	function submit(raw: string) {
		if (idleTimerRef.current) {
			clearTimeout(idleTimerRef.current)
			idleTimerRef.current = null
		}
		burstRef.current = IDLE_RHYTHM
		const trimmed = raw.trim()
		if (trimmed === "") return
		const reading = interpretBarcode(trimmed, config)
		if (reading.kind === "unknown") {
			setStatus({ kind: "error", text: reading.reason })
			return
		}
		setStatus({ kind: "ok", text: describeReading(reading) })
		setValue("")
		valueRef.current = ""
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
							valueRef.current = event.target.value
							if (status.kind !== "idle") setStatus({ kind: "idle" })
						}}
						onKeyDown={(event) => {
							if (event.key.length === 1) {
								burstRef.current = nextFieldRhythm(burstRef.current, performance.now(), value.length === 0, timing.maxKeyIntervalMs)

								// Leitor sem terminador: a leitura fecha quando as teclas
								// param. Só em rajada — digitação humana nunca é submetida
								// sozinha no meio da palavra.
								if (terminator === "none") {
									if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
									idleTimerRef.current = setTimeout(() => {
										idleTimerRef.current = null
										if (looksScanned(burstRef.current, valueRef.current, timing.minLength)) submit(valueRef.current)
									}, timing.idleTimeoutMs)
								}
								return
							}

							// Enter é sempre terminador; o Tab, só quando é o leitor terminando
							// o código (ver `tabEndsScan`)
							const endsByTab = event.key === "Tab" && tabEndsScan(terminator, burstRef.current, value, timing.minLength)
							if (event.key !== "Enter" && !endsByTab) return
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

/**
 * Perfil calibrado → props do `ScanInput`.
 *
 * Existe para que nenhuma tela esqueça de repassar a calibração. Sem ela, o
 * leitor configurado para terminar com Tab não submetia nada e os parâmetros
 * medidos na tela "Testar leitor" ficavam gravados e nunca lidos — que era
 * exatamente o defeito que a calibração deveria ter resolvido.
 */
export function scannerPropsFrom(profile: {
	prefix: string | null
	suffix: string | null
	gsSubstitute: string | null
	terminator: "enter" | "tab" | "none"
	maxKeyIntervalMs: number
	minLength: number
	idleTimeoutMs: number
}): Pick<ScanInputProps, "config" | "terminator" | "timing"> {
	return {
		config: {
			prefix: profile.prefix ?? undefined,
			suffix: profile.suffix ?? undefined,
			gsSubstitute: profile.gsSubstitute ?? undefined,
		},
		terminator: profile.terminator,
		timing: {
			maxKeyIntervalMs: profile.maxKeyIntervalMs,
			minLength: profile.minLength,
			terminator: profile.terminator,
			idleTimeoutMs: profile.idleTimeoutMs,
		},
	}
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
