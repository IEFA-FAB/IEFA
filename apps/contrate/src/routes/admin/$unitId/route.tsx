import { createFileRoute } from "@tanstack/react-router"
import { AccessCheckFailed, CheckingAccess } from "@/components/layout/ScopeHub"
import { enterScope } from "@/lib/scope-route"

/**
 * A OM administrada, na URL: uma da cobertura de `alpha-admin` (a OM do grant e as que ela
 * apoia), ou `todas` para o administrador global. O resto volta ao hub. As server functions
 * reconferem a cobertura a cada chamada — isto só evita abrir uma tela que daria 403.
 */
export const Route = createFileRoute("/admin/$unitId")({
	ssr: false,
	beforeLoad: (opts) => enterScope(opts, "admin"),
	pendingComponent: CheckingAccess,
	errorComponent: AccessCheckFailed,
})
