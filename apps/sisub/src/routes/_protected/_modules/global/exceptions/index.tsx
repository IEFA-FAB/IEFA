import { createFileRoute } from "@tanstack/react-router"
import { Sandwich } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { GlobalTemplateCatalog } from "@/components/features/global/GlobalTemplateCatalog"

/**
 * GLOBAL — Exceções Modelo (SDAB)
 * URL: /global/exceptions
 * Acesso: módulo "global" nível 1+ (leitura); criar, editar, remover e restaurar exigem nível 2.
 * As cozinhas veem estes modelos em /kitchen/:kitchenId/exceptions e os adaptam como cópia local.
 */
export const Route = createFileRoute("/_protected/_modules/global/exceptions/")({
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalExceptionsPage,
	head: () => ({
		meta: [{ name: "description", content: "Cardápios de exceções previsíveis (lanches de bordo, cafés de reunião) disponíveis para todas as cozinhas" }],
	}),
})

function GlobalExceptionsPage() {
	return (
		<GlobalTemplateCatalog
			templateType="exception"
			title="Exceções Modelo"
			description="Refeições previsíveis fora da rotina semanal — lanches de bordo, cafés de reunião — que as cozinhas adaptam para o próprio anexo quantitativo do TR."
			icon={Sandwich}
			nounWithArticle="a exceção"
			newLabel="Nova Exceção"
			emptyMessage="Nenhuma exceção modelo cadastrada."
			emptyHint="Crie uma exceção para que as cozinhas possam adaptá-la."
			newLink={{ to: "/global/exceptions/new" }}
			editorLink={(exceptionId) => ({ to: "/global/exceptions/$exceptionId", params: { exceptionId } })}
		/>
	)
}
