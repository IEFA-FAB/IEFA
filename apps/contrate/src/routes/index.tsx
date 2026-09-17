import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight } from "iconoir-react"
import { AppLayout } from "@/components/AppLayout"

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Contrate — copiloto de aquisições da FAB" },
			{
				name: "description",
				content: "Verificação de ETP e TR contra a Lei 14.133/21, fila de conformidade para o controle interno e apoio à condução do pregão.",
			},
		],
	}),
	component: HomePage,
})

const TOOLS = [
	{
		to: "/aci",
		eyebrow: "Controle interno",
		title: "Plataforma ACI",
		body: "Fila dos processos em verificação, triagem de cada achado e parecer de conformidade com relatório final.",
	},
	{
		to: "/alpha/analise/nova",
		eyebrow: "Requisitante",
		title: "Verificar um documento",
		body: "Envie o ETP ou o TR, confira os campos extraídos e rode a verificação contra as regras vigentes.",
	},
	{
		to: "/pregoeiro",
		eyebrow: "Sessão pública",
		title: "Facilidades do Pregoeiro",
		body: "Biblioteca de frases por fase do pregão, com as suas preferências salvas.",
	},
] as const

const STEPS = [
	{ n: "01", title: "Envio", body: "O requisitante envia o documento da contratação." },
	{ n: "02", title: "Extração", body: "Os campos do ETP/TR são lidos e conferidos por quem enviou." },
	{ n: "03", title: "Verificação", body: "Cada regra aponta o dispositivo da norma que fundamenta o achado." },
	{ n: "04", title: "Parecer", body: "O ACI acata ou descarta cada achado e emite o parecer." },
] as const

function HomePage() {
	return (
		<AppLayout>
			<div className="flex flex-col gap-16">
				<section className="flex flex-col gap-6 border-b border-border pb-12">
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">IEFA · Projeto α</p>
					<h1 className="max-w-3xl font-semibold text-4xl tracking-tighter md:text-6xl">Copiloto de aquisições da FAB</h1>
					<p className="max-w-2xl text-lg text-muted-foreground">
						Verificação de Estudo Técnico Preliminar e Termo de Referência contra a Lei 14.133/21 e as normas do COMAER. A máquina aponta e fundamenta; a
						palavra final é do gestor.
					</p>
				</section>

				<section aria-labelledby="ferramentas" className="flex flex-col gap-6">
					<h2 id="ferramentas" className="font-semibold text-2xl tracking-tight">
						Ferramentas
					</h2>
					<ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
						{TOOLS.map((tool) => (
							<li key={tool.to}>
								<Link
									to={tool.to}
									className="group flex h-full flex-col gap-3 border border-border p-6 transition-all hover:-translate-x-1 hover:-translate-y-1 hover:border-foreground hover:shadow-[4px_4px_0_0_var(--foreground)]"
								>
									<span className="text-muted-foreground text-xs uppercase tracking-wider">{tool.eyebrow}</span>
									<span className="font-semibold text-xl tracking-tight">{tool.title}</span>
									<span className="flex-1 text-muted-foreground text-sm">{tool.body}</span>
									<span className="inline-flex items-center gap-1 font-medium text-sm">
										Abrir <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>

				<section aria-labelledby="como-funciona" className="flex flex-col gap-6">
					<h2 id="como-funciona" className="font-semibold text-2xl tracking-tight">
						Como funciona a verificação
					</h2>
					<ol className="grid grid-cols-1 border border-border sm:grid-cols-2 lg:grid-cols-4">
						{STEPS.map((step) => (
							<li key={step.n} className="flex flex-col gap-2 border-border border-b p-6 last:border-b-0 sm:border-r lg:border-b-0 lg:last:border-r-0">
								<span className="font-mono text-muted-foreground text-xs">{step.n}</span>
								<span className="font-semibold tracking-tight">{step.title}</span>
								<span className="text-muted-foreground text-sm">{step.body}</span>
							</li>
						))}
					</ol>
				</section>
			</div>
		</AppLayout>
	)
}
