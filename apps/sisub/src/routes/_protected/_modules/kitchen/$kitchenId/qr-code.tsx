import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
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
		meta: [{ title: "QR Check-in" }, { name: "description", content: "Gere QR codes para check-in automático" }],
	}),
})

function QrCodePage() {
	const [selectedOm, setSelectedOm] = useState<string>("")

	return (
		<div className="space-y-6">
			<PageHeader title="QR Check-in" description="Gere QR codes para check-in automático na sua unidade." />

			<QRAutoCheckinCard selectedOm={selectedOm} onChangeSelectedOm={setSelectedOm} status="authorized" />
		</div>
	)
}
