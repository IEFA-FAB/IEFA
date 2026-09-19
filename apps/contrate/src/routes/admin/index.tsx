import { createFileRoute } from "@tanstack/react-router"
import { Lock } from "iconoir-react"
import { AccessCheckFailed, CheckingAccess, ScopeHub } from "@/components/layout/ScopeHub"
import { enterScopeHub } from "@/lib/scope-route"

/**
 * Hub da administração de acessos: a escolha da OM administrada. Quem administra uma OM só
 * (sem apoiadas) vai direto a ela; o administrador global escolhe uma OM ou "Todas as OMs",
 * que é onde ficam também os grants globais.
 */
export const Route = createFileRoute("/admin/")({
	ssr: false,
	beforeLoad: (opts) => enterScopeHub(opts, "admin"),
	pendingComponent: CheckingAccess,
	errorComponent: AccessCheckFailed,
	component: AdminHub,
	head: () => ({ meta: [{ title: "Acessos | Contrate" }] }),
})

function AdminHub() {
	const { scopeOptions } = Route.useRouteContext()
	return (
		<ScopeHub
			moduleId="admin"
			options={scopeOptions}
			empty={
				<div className="mx-auto max-w-xl border border-border p-8">
					<Lock className="size-6 text-muted-foreground" aria-hidden="true" />
					<h1 className="mt-4 font-semibold text-2xl tracking-tighter">Acessos</h1>
					<p className="mt-2 text-muted-foreground text-sm">
						Esta área é da administração de acessos do Projeto α, e você não administra nenhuma OM. O papel é concedido por outro administrador.
					</p>
				</div>
			}
		/>
	)
}
