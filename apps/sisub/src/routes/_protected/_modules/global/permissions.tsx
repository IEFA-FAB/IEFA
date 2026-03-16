import { createFileRoute } from "@tanstack/react-router"
import { requirePermission } from "@/auth/pbac"
import { PageHeader } from "@/components/common/layout/PageHeader"
import PermissionsManager from "@/components/features/global/PermissionsManager"

export const Route = createFileRoute("/_protected/_modules/global/permissions")({
	beforeLoad: ({ context }) => requirePermission(context, "global", 2),
	component: PermissionsPage,
	head: () => ({
		meta: [
			{ title: "Permissões — SISUB" },
			{
				name: "description",
				content: "Gerencie permissões de acesso dos usuários",
			},
		],
	}),
})

function PermissionsPage() {
	return (
		<div className="space-y-6">
			<PageHeader title="Gerenciar Permissões" description="Busque pelo email do usuário para gerenciar permissões." />
			<PermissionsManager />
		</div>
	)
}
