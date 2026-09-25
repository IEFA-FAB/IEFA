import { createFileRoute } from "@tanstack/react-router"
import { CalendarRange } from "lucide-react"
import { requirePermission } from "@/auth/pbac"
import { GlobalTemplateCatalog } from "@/components/features/global/GlobalTemplateCatalog"

/**
 * GLOBAL — Eventos Modelo (SDAB)
 * URL: /global/events
 * Acesso: módulo "global" nível 1+ (leitura); criar, editar, remover e restaurar exigem nível 2.
 * As cozinhas veem estes modelos em /kitchen/:kitchenId/events e os adaptam como cópia local.
 */
export const Route = createFileRoute("/_protected/_modules/global/events/")({
	beforeLoad: (opts) => requirePermission(opts, "global", 1),
	component: GlobalEventsPage,
	head: () => ({
		meta: [{ name: "description", content: "Cardápios de eventos especiais disponíveis para todas as cozinhas" }],
	}),
})

function GlobalEventsPage() {
	return (
		<GlobalTemplateCatalog
			templateType="event"
			title="Eventos Modelo"
			description="Cardápios de refeições especiais que as cozinhas adaptam para o próprio anexo quantitativo do TR."
			icon={CalendarRange}
			nounWithArticle="o evento"
			newLabel="Novo Evento"
			emptyMessage="Nenhum evento modelo cadastrado."
			emptyHint="Crie um evento para que as cozinhas possam adaptá-lo."
			newLink={{ to: "/global/events/new" }}
			editorLink={(eventId) => ({ to: "/global/events/$eventId", params: { eventId } })}
		/>
	)
}
