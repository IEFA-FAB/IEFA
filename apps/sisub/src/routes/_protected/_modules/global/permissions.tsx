import { createFileRoute, useNavigate } from "@tanstack/react-router"
import * as React from "react"
import { z } from "zod"
import { requirePermission } from "@/auth/pbac"
import PermissionsManager from "@/components/features/global/PermissionsManager"
import { PoliciesManager } from "@/components/features/global/policies/PoliciesManager"
import { PageHeader } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUserKitchens } from "@/hooks/data/useKitchens"
import { useMessHalls } from "@/hooks/data/useMessHalls"

const VIEWS = ["usuarios", "politicas"] as const
type View = (typeof VIEWS)[number]

const searchSchema = z.object({
	view: z.enum(VIEWS).catch("usuarios").optional(),
})

export const Route = createFileRoute("/_protected/_modules/global/permissions")({
	validateSearch: searchSchema,
	beforeLoad: (opts) => requirePermission(opts, "global", 2),
	component: PermissionsPage,
	head: () => ({
		meta: [
			{ title: "Gestão de Acesso — SISUB" },
			{
				name: "description",
				content: "Políticas e permissões de acesso dos usuários",
			},
		],
	}),
})

function PermissionsPage() {
	const { view } = Route.useSearch()
	const navigate = useNavigate({ from: Route.fullPath })
	const activeView: View = view ?? "usuarios"

	// Carregado uma vez e compartilhado pelas duas visões: ambas precisam traduzir
	// id de escopo → nome legível, e duplicar a query faria as telas divergirem.
	const { units, messHalls } = useMessHalls()
	const { data: kitchens = [] } = useUserKitchens()

	const maps = React.useMemo(
		() => ({
			unitMap: Object.fromEntries(units.map((u) => [u.id, u.display_name ?? u.code])),
			kitchenMap: Object.fromEntries(kitchens.map((k) => [k.id, k.unit?.display_name ?? k.unit?.code ?? `Cozinha ${k.id}`])),
			messHallMap: Object.fromEntries(messHalls.map((m) => [m.id, m.display_name ?? m.code])),
		}),
		[units, kitchens, messHalls]
	)

	const scopes = React.useMemo(
		() => ({
			units: units.map((u) => ({ id: u.id, label: u.display_name ?? u.code })),
			kitchens: kitchens.map((k) => ({ id: k.id, label: k.unit?.display_name ?? k.unit?.code ?? `Cozinha ${k.id}` })),
			messHalls: messHalls.map((m) => ({ id: m.id, label: m.display_name ?? m.code })),
		}),
		[units, kitchens, messHalls]
	)

	return (
		<div className="space-y-6">
			<PageHeader
				title="Gestão de Acesso"
				description="Políticas são conjuntos nomeados de permissões; grants diretos valem só para um usuário. As permissões efetivas somam as duas origens."
			/>

			<Tabs value={activeView} onValueChange={(value) => navigate({ search: { view: value as View }, replace: true })}>
				<TabsList className="grid w-full max-w-md grid-cols-2">
					<TabsTrigger value="usuarios">Usuários</TabsTrigger>
					<TabsTrigger value="politicas">Políticas</TabsTrigger>
				</TabsList>

				<TabsContent value="usuarios" className="pt-4">
					<PermissionsManager />
				</TabsContent>

				<TabsContent value="politicas" className="pt-4">
					<PoliciesManager maps={maps} scopes={scopes} />
				</TabsContent>
			</Tabs>
		</div>
	)
}
