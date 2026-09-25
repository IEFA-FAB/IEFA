import { createFileRoute } from "@tanstack/react-router"
import { Sandwich } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { GlobalTemplateCatalog } from "@/components/features/global/GlobalTemplateCatalog"

/**
 * GLOBAL — Apoios Modelo (SDAB)
 * URL: /global/exceptions
 * Acesso: módulo "global" nível 1+ (leitura); criar, editar, remover e restaurar exigem nível 2.
 * As cozinhas veem estes modelos em /kitchen/:kitchenId/exceptions e os adaptam como cópia local.
 */
export const Route = createFileRoute("/_protected/_modules/global/exceptions/")({
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalExceptionsPage,
	head: () => ({
		meta: [
			{
				name: "description",
				content: "Cardápios de apoio previsíveis (lanches de bordo e de apoio, coffee breaks, cafés de reunião) disponíveis para todas as cozinhas",
			},
		],
	}),
})

function GlobalExceptionsPage() {
	return (
		<GlobalTemplateCatalog
			templateType="exception"
			title="Apoios Modelo"
			description="Refeições previsíveis fora da rotina semanal — lanches de bordo e de apoio, coffee breaks, cafés de reunião — que as cozinhas adaptam para o próprio anexo quantitativo do TR."
			icon={Sandwich}
			nounWithArticle="o apoio"
			newLabel="Novo Apoio"
			emptyMessage="Nenhum apoio modelo cadastrado."
			emptyHint="Crie um apoio para que as cozinhas possam adaptá-lo."
			newLink={{ to: "/global/exceptions/new" }}
			editorLink={(exceptionId) => ({ to: "/global/exceptions/$exceptionId", params: { exceptionId } })}
		/>
	)
}
