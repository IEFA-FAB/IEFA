import { Button } from "@iefa/ui"
import { AlertCircle, CheckCircle2, Copy, Download, QrCode } from "lucide-react"
import { QRCodeCanvas } from "qrcode.react"
import { useRef, useState } from "react"
import { UnitSelector } from "@/components/features/forecast/MessHallSelector"
import type { AdminStatus } from "@/types/domain/"

export default function QRAutoCheckinCard({
	selectedOm,
	onChangeSelectedOm,
	status,
}: {
	selectedOm: string
	onChangeSelectedOm: (value: string) => void
	status: AdminStatus
}) {
	const baseUrl = "https://app.previsaosisub.com.br/checkin"
	const currentOm = selectedOm?.trim()

	const url = new URL(baseUrl)
	const om = (currentOm ?? "").normalize("NFKC").trim()
	url.searchParams.set("u", om)
	const qrValue = url.toString()

	// Ações do QR (copiar / baixar)
	const qrWrapRef = useRef<HTMLDivElement | null>(null)
	const [copied, setCopied] = useState(false)

	const handleCopyOm = async () => {
		try {
			if (!currentOm) return
			await navigator.clipboard.writeText(currentOm)
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		} catch {
			alert("Não foi possível copiar a OM.")
		}
	}

	const handleDownloadPng = () => {
		const canvas: HTMLCanvasElement | null =
			(qrWrapRef.current?.querySelector("canvas") as HTMLCanvasElement) ?? null
		if (!canvas) return
		const url = canvas.toDataURL("image/png")
		const a = document.createElement("a")
		a.href = url
		a.download = `qr-auto-checkin-${currentOm || "om"}.png`
		a.click()
	}

	return (
		<div className="rounded-2xl border  shadow-sm p-6">
			<div className="flex items-center justify-between mb-2">
				<div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs   border ">
					<QrCode className="h-4 w-4" aria-hidden="true" />
					Auto Check-In
				</div>
				{currentOm ? (
					<span className="text-xs ">OM: {currentOm}</span>
				) : (
					<span className="text-xs ">OM não definida</span>
				)}
			</div>

			<h2 className="text-xl font-bold  mb-4">QR Code de Auto Check-In</h2>

			{/* UnitSelector — escolhe a OM do QR */}
			<div className="mb-4">
				<UnitSelector
					value={selectedOm}
					onChange={onChangeSelectedOm}
					disabled={status !== "authorized"}
					hasDefaultUnit={false}
					showValidation={true}
					size="md"
					placeholder="Selecione uma unidade..."
				/>
			</div>

			<div className=" text-sm mb-4">
				Exiba este QR no ponto de acesso. Usuários autorizados farão check-in pela câmera do
				celular.
			</div>

			<div
				ref={qrWrapRef}
				className="flex flex-col items-center justify-center rounded-xl border   p-6"
			>
				{currentOm ? (
					<QRCodeCanvas
						value={qrValue}
						size={256}
						level="Q"
						bgColor="#ffffff"
						fgColor="#1f2937"
						aria-label="QR code para auto check-in da OM"
						marginSize={2}
					/>
				) : (
					<div
						className="inline-flex items-center gap-2 rounded-lg border  px-3 py-2 "
						aria-live="polite"
					>
						<AlertCircle className="h-4 w-4" aria-hidden="true" />
						Defina uma OM para gerar o QR Code.
					</div>
				)}
			</div>

			<div className="mt-4 flex flex-col sm:flex-row gap-2">
				<Button
					onClick={handleCopyOm}
					disabled={!currentOm}
					className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 shadow-sm ${
						currentOm ? " ver:bg-emerald-700" : "  cursor-not-allowed"
					}`}
				>
					{copied ? (
						<>
							<CheckCircle2 className="h-4 w-4" aria-hidden="true" />
							Copiado
						</>
					) : (
						<>
							<Copy className="h-4 w-4" aria-hidden="true" />
							Copiar OM
						</>
					)}
				</Button>
				<Button
					onClick={handleDownloadPng}
					disabled={!currentOm}
					className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-150 border ${
						currentOm ? "border-gray-300   hover:bg-gray-50" : "border-gray-200  cursor-not-allowed"
					}`}
				>
					<Download className="h-4 w-4" aria-hidden="true" />
					Baixar PNG do QR
				</Button>
			</div>
		</div>
	)
}
