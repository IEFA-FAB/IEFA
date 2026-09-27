import { createFileRoute } from "@tanstack/react-router"
import { Sandwich } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { GlobalTemplateCatalog } from "@/components/features/global/GlobalTemplateCatalog"

/**
 * GLOBAL — Cardápios de Apoio Modelo (SDAB)
 * URL: /global/support-menus
 * Acesso: módulo "global" nível 1+ (leitura); criar, editar, remover e restaurar exigem nível 2.
 * As cozinhas veem estes modelos em /kitchen/:kitchenId/support-menus e os adaptam como cópia local.
 */
export const Route = createFileRoute("/_protected/_modules/global/support-menus/")({
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalSupportMenusPage,
	head: () => ({
		meta: [
			{
				name: "description",
				content: "Cardápios de apoio previsíveis (lanches de bordo e de apoio, coffee breaks, cafés de reunião) disponíveis para todas as cozinhas",
			},
		],
	}),
})

function GlobalSupportMenusPage() {
	return (
		<GlobalTemplateCatalog
			templateType="apoio"
			title="Cardápios de Apoio Modelo"
			description="Refeições previsíveis fora da rotina semanal — lanches de bordo e de apoio, coffee breaks, cafés de reunião — que as cozinhas adaptam para o próprio anexo quantitativo do TR."
			icon={Sandwich}
			nounWithArticle="o cardápio de apoio"
			newLabel="Novo Cardápio de Apoio"
			emptyMessage="Nenhum cardápio de apoio modelo cadastrado."
			emptyHint="Crie um cardápio de apoio para que as cozinhas possam adaptá-lo."
			newLink={{ to: "/global/support-menus/new" }}
			editorLink={(supportMenuId) => ({ to: "/global/support-menus/$supportMenuId", params: { supportMenuId } })}
		/>
	)
}
