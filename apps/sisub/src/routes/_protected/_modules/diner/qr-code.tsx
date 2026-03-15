import { createFileRoute } from "@tanstack/react-router"
import { Copy, Download } from "lucide-react"
import { QRCodeCanvas } from "qrcode.react"
import { useRef, useState } from "react"
import { PageHeader } from "@/components/common/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/auth/useAuth"
import { useMilitaryData, useUserData } from "@/hooks/auth/useProfile"

export const Route = createFileRoute("/_protected/_modules/diner/qr-code")({
	component: QrCodePage,
	head: () => ({
		meta: [
			{ title: "Meu QR Code - SISUB" },
			{ name: "description", content: "Seu QR Code pessoal para identificação no rancho" },
		],
	}),
})

function QrCodePage() {
	const { user } = useAuth()
	const userId = user?.id ?? null

	const { data: userData } = useUserData(userId ?? undefined)
	const nrOrdem = userData?.nrOrdem ?? ""
	const { data: military } = useMilitaryData(nrOrdem)

	const [hasCopied, setHasCopied] = useState(false)
	const qrCanvasRef = useRef<HTMLCanvasElement | null>(null)

	const displayName = military?.nmGuerra ?? military?.nmPessoa ?? user?.email?.split("@")[0] ?? "—"
	const rankAndUnit = [military?.sgPosto, military?.sgOrg].filter(Boolean).join(" / ")

	const handleCopy = async () => {
		if (!userId) return
		try {
			await navigator.clipboard.writeText(userId)
			setHasCopied(true)
			setTimeout(() => setHasCopied(false), 1600)
		} catch {}
	}

	const handleDownload = () => {
		if (!qrCanvasRef.current || !userId) return
		try {
			const url = qrCanvasRef.current.toDataURL("image/png")
			const a = document.createElement("a")
			a.href = url
			a.download = `sisub-qrcode-${userId.slice(0, 8)}.png`
			a.click()
		} catch {}
	}

	return (
		<div className="space-y-6">
			<PageHeader
				title="Meu QR Code"
				description="Apresente este código ao Fiscal de Rancho para registrar sua presença."
			/>

			{/* Card do QR */}
			<div className="mx-auto max-w-sm rounded-2xl border bg-card p-6 flex flex-col items-center gap-4 shadow-sm">
				{/* Identificação */}
				<div className="text-center space-y-0.5">
					<p className="font-semibold text-foreground">{displayName}</p>
					{rankAndUnit && <p className="text-xs text-muted-foreground">{rankAndUnit}</p>}
				</div>

				{/* QR Code */}
				<div className="rounded-xl border-2 bg-white p-3 shadow">
					{userId ? (
						<QRCodeCanvas
							role="img"
							aria-label="Seu QR Code pessoal"
							value={userId}
							size={240}
							level="M"
							bgColor="#ffffff"
							fgColor="#111827"
							ref={qrCanvasRef}
						/>
					) : (
						<div className="h-[240px] w-[240px] animate-pulse rounded-lg bg-muted" />
					)}
				</div>

				{/* UUID */}
				<div className="w-full rounded-lg border bg-muted/50 px-3 py-2 text-center">
					<p className="font-mono text-xs text-muted-foreground truncate">{userId ?? "—"}</p>
				</div>

				{/* Ações */}
				<div className="flex w-full gap-2">
					<Button
						variant="outline"
						size="sm"
						className="flex-1"
						onClick={handleCopy}
						disabled={!userId}
					>
						<Copy className="h-3.5 w-3.5 mr-2" />
						{hasCopied ? "Copiado!" : "Copiar ID"}
					</Button>
					<Button
						variant="default"
						size="sm"
						className="flex-1"
						onClick={handleDownload}
						disabled={!userId}
					>
						<Download className="h-3.5 w-3.5 mr-2" />
						Baixar PNG
					</Button>
				</div>
			</div>

			<p className="text-xs text-muted-foreground text-center">
				Não compartilhe seu QR Code publicamente.
			</p>
		</div>
	)
}
