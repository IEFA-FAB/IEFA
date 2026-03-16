import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ShieldCheck } from "lucide-react"
import { requirePermission, usePBAC } from "@/auth/pbac"
import { ScopeSelector } from "@/components/features/shared/ScopeSelector"
import { useMessHalls } from "@/hooks/data/useMessHalls"

export const Route = createFileRoute("/_protected/_modules/messhall/")({
	beforeLoad: ({ context }) => requirePermission(context, "messhall", 1),
	component: MessHallHubPage,
	head: () => ({
		meta: [{ title: "Fiscal — Selecionar Refeitório" }],
	}),
})

function MessHallHubPage() {
	const navigate = useNavigate()
	const { permissions } = usePBAC()
	const { messHalls, isLoading } = useMessHalls()

	// IDs permitidos via PBAC. Permissão global (todos os campos nulos) libera todos.
	const isGlobal = permissions.some((p) => p.module === "messhall" && p.mess_hall_id === null && p.unit_id === null && p.kitchen_id === null)
	const allowedIds = new Set(permissions.filter((p) => p.module === "messhall" && p.mess_hall_id !== null).map((p) => p.mess_hall_id as number))

	const items = (isGlobal ? messHalls : messHalls.filter((mh) => allowedIds.has(mh.id))).map((mh) => ({
		id: mh.id,
		name: mh.display_name ?? mh.code,
		subtitle: mh.code !== mh.display_name ? mh.code : undefined,
	}))

	const handleSelect = (id: number) => {
		navigate({
			to: "/messhall/$messHallId/presence",
			params: { messHallId: String(id) },
		})
	}

	return (
		<ScopeSelector
			title="Selecionar Refeitório"
			description="Escolha o refeitório para iniciar a fiscalização"
			icon={ShieldCheck}
			items={items}
			isLoading={isLoading}
			onSelect={handleSelect}
			emptyTitle="Nenhum refeitório disponível"
			emptyDescription="Você não tem permissão para fiscalizar nenhum refeitório."
		/>
	)
}
