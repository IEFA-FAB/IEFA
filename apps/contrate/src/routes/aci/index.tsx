import { createFileRoute, Link } from "@tanstack/react-router"
import { Lock } from "iconoir-react"
import { AccessCheckFailed, CheckingAccess, ScopeHub } from "@/components/layout/ScopeHub"
import { enterScopeHub } from "@/lib/scope-route"

/**
 * Hub da Plataforma ACI: a escolha da OM cuja fila se vai abrir. Com uma OM só (o caso de
 * quem trabalha numa seção de licitações), leva direto a ela.
 *
 * `ssr: false`: o guard lê o perfil no α, a partir do navegador (`lib/scope-route.ts`).
 */
export const Route = createFileRoute("/aci/")({
	ssr: false,
	beforeLoad: (opts) => enterScopeHub(opts, "aci"),
	pendingComponent: CheckingAccess,
	errorComponent: AccessCheckFailed,
	component: AciHub,
	head: () => ({ meta: [{ title: "Plataforma ACI" }] }),
})

function AciHub() {
	const { scopeOptions } = Route.useRouteContext()
	return <ScopeHub moduleId="aci" options={scopeOptions} empty={<AccessDenied />} />
}

/**
 * Quem entrou mas não tem papel na fila vê a explicação e a quem pedir — mandar para a home
 * esconderia o motivo.
 */
function AccessDenied() {
	return (
		<div className="mx-auto max-w-xl border border-border p-8">
			<Lock className="size-6 text-muted-foreground" aria-hidden="true" />
			<h1 className="mt-4 font-semibold text-2xl tracking-tighter">Plataforma ACI</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				Esta área é da seção de licitações e do analista de controle interno: ela lista os processos das OMs em que eles atuam. Você ainda não tem esse papel em
				nenhuma OM.
			</p>
			<p className="mt-4 text-sm">
				O papel é concedido pela administração de acessos da sua OM. Enquanto isso, o envio e o acompanhamento dos seus documentos seguem disponíveis no módulo
				Requisitante, e o ChatRADA continua no Portal IEFA.
			</p>
			<div className="mt-6 flex flex-wrap gap-4 text-sm">
				<Link to="/requisitante" className="underline underline-offset-4">
					Abrir o módulo Requisitante
				</Link>
				<a href="https://portal.iefa.com.br/chatRada" className="underline underline-offset-4">
					Abrir o ChatRADA
				</a>
			</div>
		</div>
	)
}
