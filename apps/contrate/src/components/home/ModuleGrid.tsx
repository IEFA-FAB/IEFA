import type { MeAccess } from "@iefa/alpha-client/access"
import { Link } from "@tanstack/react-router"
import { ArrowRight, Lock } from "iconoir-react"
import type { ReactNode } from "react"
import { CONTRATE_MODULES, type ContrateModule } from "@/lib/modules"
import { describeModuleScope, type ModuleAccess, resolveModuleAccess } from "./module-access"

const CARD_BASE = "flex h-full flex-col border bg-card p-6"
const CARD_INTERACTIVE =
	"group border-border transition-[transform,box-shadow,border-color] duration-150 hover:-translate-x-1 hover:-translate-y-1 hover:border-foreground hover:shadow-[4px_4px_0_0_var(--foreground)] motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"

export function ModuleGrid({
	isAuthenticated,
	access,
	accessFailed,
}: {
	isAuthenticated: boolean
	/** Perfil do α; `undefined` enquanto chega (ou sem sessão). */
	access: MeAccess | undefined
	accessFailed: boolean
}) {
	return (
		<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{CONTRATE_MODULES.map((module) => {
				const moduleAccess = resolveModuleAccess(module, isAuthenticated, access, accessFailed)
				return (
					<li key={module.id}>
						<ModuleCard module={module} access={moduleAccess} scope={describeModuleScope(module, access, moduleAccess)} />
					</li>
				)
			})}
		</ul>
	)
}

function ModuleCard({ module, access, scope }: { module: ContrateModule; access: ModuleAccess; scope: string | null }) {
	const body = <ModuleCardBody module={module} access={access} scope={scope} />

	if (access === "open") {
		return (
			<Link to={module.home} className={`${CARD_BASE} ${CARD_INTERACTIVE}`}>
				{body}
			</Link>
		)
	}
	if (access === "sign-in") {
		return (
			<Link to="/auth" search={{ redirect: module.home }} className={`${CARD_BASE} ${CARD_INTERACTIVE}`}>
				{body}
			</Link>
		)
	}
	// Sem link: um cartão que leva a uma tela de "sem permissão" é beco sem saída.
	return <div className={`${CARD_BASE} border-dashed border-border bg-transparent`}>{body}</div>
}

function ModuleCardBody({ module, access, scope }: { module: ContrateModule; access: ModuleAccess; scope: string | null }) {
	const Icon = module.icon
	const muted = access === "denied"

	return (
		<>
			<div className="flex items-start justify-between gap-4">
				<span
					aria-hidden="true"
					className={`flex size-10 shrink-0 items-center justify-center border ${muted ? "border-border text-muted-foreground" : "border-foreground text-foreground"}`}
				>
					<Icon className="size-5" />
				</span>
				<span className="pt-1 text-right font-mono text-label text-muted-foreground">{module.audience}</span>
			</div>

			<h3 className={`mt-6 font-semibold text-xl tracking-tight ${muted ? "text-muted-foreground" : ""}`}>{module.label}</h3>
			<p className="mt-2 flex-1 text-muted-foreground text-sm leading-relaxed">{module.description}</p>

			<div className="mt-6 flex items-center justify-between gap-3 border-border border-t pt-4 text-sm">
				<ModuleCardFooter module={module} access={access} scope={scope} />
			</div>
		</>
	)
}

function ModuleCardFooter({ module, access, scope }: { module: ContrateModule; access: ModuleAccess; scope: string | null }): ReactNode {
	switch (access) {
		case "open":
			return (
				<>
					<span className="inline-flex items-center gap-1.5 font-medium">
						Abrir
						<ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
					</span>
					{module.gate.kind === "public" && <span className="font-mono text-label text-muted-foreground">Sem login</span>}
					{scope && <span className="truncate font-mono text-label text-muted-foreground">{scope}</span>}
				</>
			)
		case "sign-in":
			return (
				<span className="inline-flex items-center gap-1.5 font-medium">
					<Lock className="size-4" aria-hidden="true" />
					Entrar para abrir
				</span>
			)
		case "denied":
			return (
				<span className="inline-flex items-center gap-1.5 text-muted-foreground">
					<Lock className="size-4" aria-hidden="true" />
					Papel não concedido · solicite acesso
				</span>
			)
		case "checking":
			return <span className="text-muted-foreground">Verificando acesso…</span>
		case "unverified":
			return <span className="text-muted-foreground">Não foi possível verificar o acesso</span>
	}
}
