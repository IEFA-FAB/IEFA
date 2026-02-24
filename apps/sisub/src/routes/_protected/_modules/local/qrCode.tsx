import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState } from "react"
import QRAutoCheckinCard from "@/components/features/admin/QRAutoCheckinCard"
import { adminProfileQueryOptions } from "@/services/AdminService"

export const Route = createFileRoute("/_protected/_modules/local/qrCode")({
	beforeLoad: async ({ context }) => {
		const { user } = context.auth

		if (!user?.id) {
			throw redirect({ to: "/auth" })
		}

		const profile = await context.queryClient.ensureQueryData(adminProfileQueryOptions(user.id))

		const isAuthorized = profile?.role === "admin" || profile?.role === "superadmin"

		if (!isAuthorized) {
			throw redirect({ to: "/hub" })
		}
	},
	component: QrCodePage,
	head: () => ({
		meta: [{ title: "QR Check-in" }, { name: "description", content: "Gere QR codes para check-in automático" }],
	}),
})

function QrCodePage() {
	const [selectedOm, setSelectedOm] = useState<string>("")

	return (
		<div className="p-6">
			<div className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight text-foreground">QR Check-in</h1>
				<p className="text-muted-foreground">Gere QR codes para check-in automático na sua unidade.</p>
			</div>

			<QRAutoCheckinCard
				selectedOm={selectedOm}
				onChangeSelectedOm={setSelectedOm}
				status="authorized"
			/>
		</div>
	)
}
