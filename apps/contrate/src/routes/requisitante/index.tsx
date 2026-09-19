import { createFileRoute } from "@tanstack/react-router"
import { AccessCheckFailed, CheckingAccess, ScopeHub } from "@/components/layout/ScopeHub"
import { enterScopeHub } from "@/lib/scope-route"

/**
 * Hub do Requisitante: a escolha da OM. Nunca é vazio — sem papel de requisitante, a única
 * opção é `minhas`, e o hub leva direto a ela.
 */
export const Route = createFileRoute("/requisitante/")({
	ssr: false,
	beforeLoad: (opts) => enterScopeHub(opts, "requisitante"),
	pendingComponent: CheckingAccess,
	errorComponent: AccessCheckFailed,
	component: RequesterHub,
	head: () => ({ meta: [{ title: "Requisitante · Contrate" }] }),
})

function RequesterHub() {
	const { scopeOptions } = Route.useRouteContext()
	return <ScopeHub moduleId="requisitante" options={scopeOptions} empty={null} />
}
