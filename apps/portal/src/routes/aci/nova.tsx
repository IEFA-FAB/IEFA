import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { AciNav } from "@/components/aci/AciNav"
import { SubmissionIntakeForm } from "@/components/alpha/SubmissionIntake"

export const Route = createFileRoute("/aci/nova")({
	component: NovaAnalisePage,
	head: () => ({ meta: [{ title: "Nova análise · Plataforma ACI" }] }),
})

/**
 * Entrada do fluxo: envia e extrai, e leva direto ao processo.
 *
 * O console mostra a extração na própria tela; aqui o destino é o processo,
 * porque é dele que saem a verificação e o parecer.
 */
function NovaAnalisePage() {
	const navigate = useNavigate()

	return (
		<div>
			<AciNav
				title="Nova análise"
				subtitle="Envie um ETP, Termo de Referência ou Edital. O α extrai os campos da contratação e o processo entra na fila com a extração pronta para verificar."
			/>

			<SubmissionIntakeForm onExtracted={({ submissionId }) => navigate({ to: "/aci/processos/$submissionId", params: { submissionId } })} />

			<dl className="mt-8 grid gap-px border border-border bg-border sm:grid-cols-3">
				{[
					["1 · Extração", "Cada campo extraído carrega o trecho do documento que o originou. Sem origem rastreável, o campo é descartado."],
					[
						"2 · Verificação",
						"Estrutura contra o modelo AGU vigente; conteúdo contra a Lei 14.133, decretos e INs. Achado que cita dispositivo inexistente é barrado.",
					],
					["3 · Parecer", "Você acata ou descarta cada achado, emite o parecer e leva o relatório final ao processo."],
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
