import { parseGtin } from "@iefa/sisub-domain/gtin"
import { Barcode, CheckCircle2, XCircle } from "lucide-react"
import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"

/**
 * Campo de leitura de GTIN por scanner de código de barras.
 *
 * Leitores USB/BT emulam teclado: rajada de dígitos (< ~50 ms entre teclas)
 * terminada em Enter. O campo detecta a rajada, normaliza para GTIN-14 e
 * valida o check digit (utils do sisub-domain — o banco só valida formato).
 * Digitação manual funciona igual: Enter confirma.
 */

const BURST_MAX_INTERVAL_MS = 80

interface GtinScannerFieldProps {
	onScan: (gtin: string) => void
	placeholder?: string
	autoFocus?: boolean
	disabled?: boolean
}

export function GtinScannerField({ onScan, placeholder = "Escaneie ou digite o GTIN…", autoFocus, disabled }: GtinScannerFieldProps) {
	const [value, setValue] = useState("")
	const [status, setStatus] = useState<"idle" | "valid" | "invalid">("idle")
	const lastKeyAt = useRef(0)
	const burstKeys = useRef(0)

	function submit(raw: string) {
		const gtin = parseGtin(raw)
		if (gtin) {
			setStatus("valid")
			setValue("")
			onScan(gtin)
		} else {
			setStatus("invalid")
		}
		burstKeys.current = 0
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		const now = performance.now()
		if (e.key === "Enter") {
			e.preventDefault()
			submit(value)
			return
		}
		if (e.key.length === 1) {
			burstKeys.current = now - lastKeyAt.current < BURST_MAX_INTERVAL_MS ? burstKeys.current + 1 : 1
			lastKeyAt.current = now
		}
	}

	return (
		<div className="relative">
			<Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
			<Input
				className="pl-8 pr-8 font-mono"
				inputMode="numeric"
				value={value}
				placeholder={placeholder}
				autoFocus={autoFocus}
				disabled={disabled}
				aria-label="GTIN"
				aria-invalid={status === "invalid"}
				onChange={(e) => {
					setValue(e.target.value.replace(/\D/g, ""))
					if (status !== "idle") setStatus("idle")
				}}
				onKeyDown={handleKeyDown}
			/>
			{status === "valid" && <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-success" />}
			{status === "invalid" && <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-destructive" />}
			{status === "invalid" && <p className="mt-1 text-xs text-destructive">GTIN inválido — confira o dígito verificador</p>}
		</div>
	)
}
