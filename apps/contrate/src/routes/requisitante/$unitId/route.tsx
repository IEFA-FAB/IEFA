import { createFileRoute } from "@tanstack/react-router"
import { AccessCheckFailed, CheckingAccess } from "@/components/layout/ScopeHub"
import { enterScope } from "@/lib/scope-route"

/**
 * O escopo do Requisitante na URL: uma OM da cobertura de requisitante, `todas` para o papel
 * global, ou `minhas` para quem não tem o papel em OM nenhuma. O resto volta ao hub.
 */
export const Route = createFileRoute("/requisitante/$unitId")({
	ssr: false,
	beforeLoad: (opts) => enterScope(opts, "requisitante"),
	pendingComponent: CheckingAccess,
	errorComponent: AccessCheckFailed,
})
