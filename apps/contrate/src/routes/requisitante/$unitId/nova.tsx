import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Lock } from "iconoir-react"
import { useState } from "react"
import { SubmissionIntakeForm } from "@/components/alpha/SubmissionIntake"
import { RequesterNav } from "@/components/requisitante/RequesterNav"
import { useAuth } from "@/hooks/useAuth"
import { alphaAccessQueryOptions } from "@/lib/alpha/role"
import { getModule, moduleScopeOptions } from "@/lib/modules"
import { pickScopeForUnit } from "@/lib/scope"

export const Route = createFileRoute("/requisitante/$unitId/nova")({
	component: NovaPage,
	head: () => ({ meta: [{ title: "Enviar documento · Requisitante" }] }),
})

/**
 * Entrada do fluxo: envia, extrai e leva direto ao processo — é dele que saem a verificação
 * e o parecer.
 *
 * O processo abre no escopo da OM ESCOLHIDA no envio, quando a pessoa a alcança; senão fica
 * no escopo da URL (quem envia sempre lê o que enviou, qualquer que seja a OM).
 */
function NovaPage() {
	const navigate = useNavigate()
	const { session } = useAuth()
	const { unitId } = Route.useParams()
	const { scopeContext } = Route.useRouteContext()
	const access = useQuery(alphaAccessQueryOptions(session?.access_token))
	// Guardado assim que o documento existe no α: se a extração falhar, ainda há como
	// chegar ao processo em vez de reenviar o arquivo.
	const [submitted, setSubmitted] = useState<{ submissionId: string; unitId: number } | null>(null)

	/** O escopo em que o processo recém-enviado abre. */
	const scopeFor = (documentUnitId: number): string => {
		if (!access.data) return unitId
		const options = moduleScopeOptions(getModule("requisitante"), access.data)
		return pickScopeForUnit(options, documentUnitId)?.id ?? unitId
	}

	if (access.data && !access.data.can_submit) {
		return (
			<div className="mx-auto max-w-xl border border-border p-8">
				<Lock className="size-6 text-muted-foreground" aria-hidden="true" />
				<h1 className="mt-4 font-semibold text-2xl tracking-tighter">Envio bloqueado</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					O envio de documentos está bloqueado para a sua conta. Os processos que você já enviou continuam na lista. Se o bloqueio não faz sentido, fale com a
					administração de acessos da sua OM.
				</p>
			</div>
		)
	}

	return (
		<div>
			<RequesterNav
				scope={scopeContext.label}
				title="Enviar documento"
				subtitle="Envie um ETP, Termo de Referência ou Edital. O α extrai os campos da contratação e o processo entra na fila da OM com a extração pronta para verificar."
			/>

			<SubmissionIntakeForm
				defaultUnitId={scopeContext.unitId}
				onSubmitted={setSubmitted}
				onExtracted={({ submissionId, unitId: documentUnitId }) =>
					navigate({ to: "/requisitante/$unitId/processos/$submissionId", params: { unitId: scopeFor(documentUnitId), submissionId } })
				}
			/>

			{submitted ? (
				<p className="mt-3 text-sm">
					O documento já está no α.{" "}
					<Link
						to="/requisitante/$unitId/processos/$submissionId"
						params={{ unitId: scopeFor(submitted.unitId), submissionId: submitted.submissionId }}
						className="underline underline-offset-4"
					>
						Abrir o processo
					</Link>{" "}
					para extrair de novo ou acompanhar.
				</p>
			) : null}

			<dl className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-3">
				{[
					["1 · Extração", "Cada campo extraído carrega o trecho do documento que o originou. Sem origem rastreável, o campo é descartado."],
					[
						"2 · Verificação",
						"Estrutura contra o modelo AGU vigente; conteúdo contra a Lei 14.133, decretos e INs. Achado que cita dispositivo inexistente é barrado.",
					],
					["3 · Parecer", "O ACI da OM acata ou descarta cada achado, emite o parecer e leva o relatório final ao processo."],
				].map(([title, text]) => (
					<div key={title} className="bg-background p-4">
						<dt className="text-xs uppercase tracking-[0.1em]">{title}</dt>
						<dd className="mt-1 text-muted-foreground text-sm">{text}</dd>
					</div>
				))}
			</dl>
		</div>
	)
}
