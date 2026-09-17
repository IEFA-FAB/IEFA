import { type BarcodeConfig, parseGtin } from "@iefa/sisub-domain"
import { ScanInput } from "@/components/features/storage/scan/ScanInput"

/**
 * Campo de leitura de GTIN.
 *
 * Virou um invólucro do `ScanInput`: a interpretação (GTIN, GS1 com lote e
 * validade, etiqueta interna, chave de NF-e) mora em um lugar só. Quem só
 * quer o GTIN continua recebendo só o GTIN — a leitura GS1 também resolve,
 * porque o AI 01 é um GTIN.
 *
 * A detecção de rajada que existia aqui (`burstKeys`) era código morto:
 * calculada e nunca lida. A captura de rajada real é o
 * `useGlobalBarcodeCapture`, e ela só age quando o foco está FORA de campo
 * editável.
 */

interface GtinScannerFieldProps {
	onScan: (gtin: string) => void
	placeholder?: string
	autoFocus?: boolean
	disabled?: boolean
	config?: BarcodeConfig
	allowCamera?: boolean
}

export function GtinScannerField({ onScan, placeholder = "Escaneie ou digite o GTIN…", autoFocus, disabled, config, allowCamera }: GtinScannerFieldProps) {
	return (
		<ScanInput
			label="GTIN"
			placeholder={placeholder}
			autoFocus={autoFocus}
			disabled={disabled}
			config={config}
			allowCamera={allowCamera}
			onReading={(reading) => {
				if (reading.kind === "gtin") {
					onScan(reading.gtin)
					return
				}
				if (reading.kind === "gs1" && reading.fields.gtin) {
					onScan(reading.fields.gtin)
					return
				}
				// digitação de GTIN sem dígito verificador não chega aqui (a
				// interpretação recusa antes), mas colar um GTIN-14 com zeros à
				// esquerda chega como "gtin" normalmente
				const fallback = parseGtin(reading.raw)
				if (fallback) onScan(fallback)
			}}
		/>
	)
}
