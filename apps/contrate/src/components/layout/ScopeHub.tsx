import { Link, useRouter } from "@tanstack/react-router"
import { ArrowRight, WarningTriangle } from "iconoir-react"
import type { ReactNode } from "react"
import { SectionHeader } from "@/components/alpha/SectionNav"
import { Button } from "@/components/ui/button"
import { type ContrateModuleId, getModule, scopedPath } from "@/lib/modules"
import type { ScopeOption } from "@/lib/scope"

/**
 * Hub de um módulo com escopo: a escolha da OM em que se vai trabalhar — o mesmo papel do
 * `ScopeSelector` do sisub. Com uma OM só, a rota nem chega aqui (`enterScopeHub` leva direto
 * a ela); sem nenhuma, a tela explica o porquê em vez de mostrar uma lista vazia.
 *
 * A escolha não é lembrada: a OM é da URL. Quem trabalha sempre na mesma OM guarda o link.
 */
export function ScopeHub({ moduleId, options, empty }: { moduleId: ContrateModuleId; options: readonly ScopeOption[]; empty: ReactNode }) {
	const module = getModule(moduleId)
	const index = module.scope?.index
	if (!index || options.length === 0) return <>{empty}</>

	return (
		<div>
			<SectionHeader
				eyebrow={`Projeto α · ${module.label}`}
				title="Escolha a OM"
				subtitle="Você trabalha em mais de uma OM neste módulo. A OM escolhida fica no endereço da página — guarde o link para voltar direto a ela."
			/>

			<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{options.map((option) => (
					<li key={option.id}>
						<Link
							to={scopedPath(index, option.id)}
							className="group flex h-full items-center justify-between gap-4 border border-border bg-card p-4 transition-[transform,box-shadow,border-color] duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-foreground hover:shadow-[3px_3px_0_0_var(--foreground)] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
						>
							<span className="flex min-w-0 flex-col">
								<span className="truncate font-semibold tracking-tight">{option.label}</span>
								{option.caption ? <span className="truncate text-muted-foreground text-xs">{option.caption}</span> : null}
							</span>
							<ArrowRight
								className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
								aria-hidden="true"
							/>
						</Link>
					</li>
				))}
			</ul>
		</div>
	)
}

/** Enquanto o perfil do α é conferido — o `pendingComponent` das rotas com OM. */
export function CheckingAccess() {
	return <p className="text-muted-foreground text-sm">Conferindo seu perfil no Projeto α…</p>
}

/**
 * O perfil do α não pôde ser conferido. Não é "sem acesso": mostrar o hub vazio ou
 * devolver à home afirmaria uma falta de papel que ninguém conferiu.
 */
export function AccessCheckFailed({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
	const router = useRouter()
	return (
		<div className="max-w-xl border border-border p-6">
			<p className="flex items-center gap-2 font-medium text-sm">
				<WarningTriangle className="size-4" aria-hidden="true" />
				Não foi possível conferir seu perfil no Projeto α
			</p>
			<p className="mt-2 text-muted-foreground text-sm">{error instanceof Error ? error.message : "Falha desconhecida."}</p>
			<Button className="mt-4" size="sm" variant="outline" onClick={() => (onRetry ? onRetry() : router.invalidate())}>
				Tentar de novo
			</Button>
		</div>
	)
}
