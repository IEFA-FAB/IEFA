import { createFileRoute } from "@tanstack/react-router"
import { DocumentEditor } from "@/components/comaer/DocumentEditor"

/**
 * Documento novo: começa do rascunho do navegador, que é o que sobrevive a um F5 no meio
 * da redação. Ao ser salvo pela primeira vez ele ganha endereço próprio e a rota passa a
 * ser a dele.
 */
export const Route = createFileRoute("/_public/_en/facilities/comunicacoes-oficiais/novo")({
	component: () => <DocumentEditor documentId={null} initialDocument={null} />,
	head: () => ({ meta: [{ title: "Novo documento — Comunicações Oficiais" }] }),
})
