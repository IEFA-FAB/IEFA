import { createFileRoute } from "@tanstack/react-router"
import { AccessCheckFailed, CheckingAccess } from "@/components/layout/ScopeHub"
import { enterScope } from "@/lib/scope-route"

/**
 * A OM da Plataforma ACI na URL. Aceita uma OM da cobertura de licitações ∪ ACI, ou `todas`
 * para o papel global; o resto volta ao hub. Entrega `scopeContext` às telas e à casca.
 */
export const Route = createFileRoute("/aci/$unitId")({
	ssr: false,
	beforeLoad: (opts) => enterScope(opts, "aci"),
	pendingComponent: CheckingAccess,
	errorComponent: AccessCheckFailed,
})
