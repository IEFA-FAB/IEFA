import { createFileRoute, Link } from "@tanstack/react-router"
import { KeyRound } from "lucide-react"
import { useSisprovAccess } from "@/auth/pbac"
import { PageHeader } from "@/components/layout/PageHeader"
import { ModuleFoundation } from "@/components/ModuleFoundation"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_protected/admin/")({
	component: AdminPage,
})

function AdminPage() {
	const { canManage } = useSisprovAccess()
	return (
		<div className="space-y-6">
			<PageHeader
				title="Administração"
				description="SDAB: grupos de demanda e enxovais, curvas de tamanhos, períodos de planejamento, aprovação de OF e acessos."
			>
				{/* A tela nunca oferece o que a política nega: o botão só existe para quem gerencia acessos. */}
				{canManage && (
					<Button size="sm" variant="outline" nativeButton={false} render={<Link to="/admin/permissoes" />}>
						<KeyRound className="size-4" />
						Permissões
					</Button>
				)}
			</PageHeader>
			<ModuleFoundation
				title="Módulo em fundação"
				description="O que já existe: a concessão de acessos aos papéis do SISPROV (Permissões). A gestão sistêmica chega nos próximos changes."
				upcoming={[
					{ title: "Catálogo de fardamento", description: "Famílias, variantes, grade de tamanhos e vínculo com o RUMAER.", change: "sisprov-catalog" },
					{
						title: "Grupos de demanda e enxovais sistêmicos",
						description: "Tabela da SDAB como seed, limites por OM e região.",
						change: "sisprov-demand-groups",
					},
					{
						title: "Curva de tamanhos versionada",
						description: "Fallback individual, OM, região e global; amostra mínima parametrizada.",
						change: "sisprov-size-curve",
					},
					{
						title: "Períodos, previsão e aprovação de OF",
						description: "O motor: necessidade líquida e ordem de fornecimento com aprovação humana.",
						change: "sisprov-engine",
					},
				]}
			/>
		</div>
	)
}
