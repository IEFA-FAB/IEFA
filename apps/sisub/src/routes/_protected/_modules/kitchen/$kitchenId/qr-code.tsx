import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import QRAutoCheckinCard from "@/components/features/local/QRAutoCheckinCard"

/**
 * KITCHEN — Gerar QR Code para Check-in Automático
 * URL: /kitchen/:kitchenId/qr-code
 * Acesso: módulo "kitchen" nível 2 (escrita)
 */
export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/qr-code")({
	beforeLoad: ({ context }) => requirePermission(context, "kitchen", 2),
	component: QrCodePage,
	head: () => ({
		meta: [
			{ title: "QR Check-in" },
			{ name: "description", content: "Gere QR codes para check-in automático" },
		],
	}),
})

function QrCodePage() {
	const [selectedOm, setSelectedOm] = useState<string>("")

	return (
		<div className="p-6">
			<div className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">QR Check-in</h1>
				<p className="text-muted-foreground">
					Gere QR codes para check-in automático na sua unidade.
				</p>
			</div>

			<QRAutoCheckinCard
				selectedOm={selectedOm}
				onChangeSelectedOm={setSelectedOm}
				status="authorized"
			/>
		</div>
	)
}
