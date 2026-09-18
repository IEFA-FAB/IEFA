import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Lock, NavArrowDown } from "iconoir-react"
import { Fragment } from "react"
import { AppLayout } from "@/components/AppLayout"
import { AcanthusAscii } from "@/components/home/AcanthusAscii"
import { ModuleGrid } from "@/components/home/ModuleGrid"
import { useModuleAccess } from "@/components/layout/useModuleAccess"
import { Button } from "@/components/ui/button"
import { accessibleModules } from "@/lib/modules"

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Contrate — copiloto de aquisições da FAB" },
			{
				name: "description",
				content:
					"Verificação de ETP e TR contra a Lei 14.133/21 e as normas do COMAER, fila de conformidade para o controle interno e apoio à condução do pregão. A máquina aponta; a palavra final é do gestor.",
			},
		],
	}),
	component: HomePage,
})

/** Quem age em cada etapa é o que o leitor precisa saber — por isso o `actor` vem antes do texto. */
const STEPS = [
	{ n: "01", actor: "Requisitante", title: "Envio", body: "O requisitante envia o ETP ou o TR da contratação." },
	{ n: "02", actor: "Requisitante", title: "Extração", body: "O α lê os campos do documento, e quem enviou confere cada um antes de seguir." },
	{ n: "03", actor: "Projeto α", title: "Verificação", body: "Cada regra que dispara aponta o dispositivo da norma que fundamenta o achado." },
	{ n: "04", actor: "Controle interno", title: "Parecer", body: "O ACI acata ou descarta cada achado e emite o parecer de conformidade." },
] as const

// A folha só aparece no miolo da caixa: a elipse encosta nas quatro bordas e some
// antes delas, então o texto que avança sobre a caixa nunca disputa com o desenho.
const ACANTHUS_MASK = "radial-gradient(closest-side, black 68%, transparent 100%)"

function HomePage() {
	return (
		<AppLayout>
			<div className="flex flex-col">
				<Hero />

				<section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-20 border-border border-t py-16 md:py-24">
					<SectionHeading id="como-funciona-titulo" eyebrow="A verificação" title="Do documento ao parecer, em quatro etapas">
						A máquina lê e confere; quem assina decide. Nenhum achado vira parecer sem passar pelo analista.
					</SectionHeading>
					<ol className="mt-10 grid grid-cols-1 border border-border sm:grid-cols-2 lg:grid-cols-4">
						{STEPS.map((step) => (
							<li
								key={step.n}
								className="flex flex-col gap-3 border-border border-b p-6 last:border-b-0 sm:odd:border-r lg:border-r lg:border-b-0 sm:[&:nth-child(n+3)]:border-b-0 lg:last:border-r-0"
							>
								<div className="flex items-baseline justify-between gap-3">
									<span className="font-mono text-muted-foreground text-sm tabular-nums">{step.n}</span>
									<span className="font-mono text-label text-muted-foreground">
										<LabelText text={step.actor} />
									</span>
								</div>
								<h3 className="mt-4 font-semibold text-lg tracking-tight">{step.title}</h3>
								<p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
							</li>
						))}
					</ol>
				</section>

				<section id="modulos" aria-labelledby="modulos-titulo" className="scroll-mt-20 border-border border-t py-16 md:py-24">
					<SectionHeading id="modulos-titulo" eyebrow="Módulos" title="Cada perfil tem o seu espaço">
						Quem envia o documento, o analista de controle interno, o pregoeiro e quem calibra o α fazem trabalhos diferentes. Cada módulo tem navegação própria
						— e, onde o trabalho é de uma OM, a OM fica no endereço da página.
					</SectionHeading>
					<div className="mt-10">
						<HomeModules />
					</div>
				</section>
			</div>
		</AppLayout>
	)
}

function HomeModules() {
	// Mesma consulta da barra dos módulos: o cache é compartilhado, não há segunda ida ao α.
	// Falha na consulta não é "sem papel" (`accessFailed`): sem este sinal a tela ficaria
	// presa em "Verificando acesso…" ou, pior, afirmaria um papel que ninguém conferiu.
	const { isAuthenticated, access, accessFailed } = useModuleAccess()
	return <ModuleGrid isAuthenticated={isAuthenticated} access={access} accessFailed={accessFailed} />
}

function Hero() {
	return (
		<section
			aria-labelledby="home-titulo"
			// Primeira dobra inteira: 100svh menos o cabeçalho (h-14) e o respiro de topo do AppLayout.
			className="relative flex min-h-[calc(100svh-3.5rem-2rem)] flex-col md:min-h-[calc(100svh-3.5rem-2.5rem)]"
		>
			<div
				aria-hidden="true"
				className="relative order-2 h-[38svh] min-h-64 w-full lg:absolute lg:inset-y-0 lg:right-0 lg:order-none lg:h-auto lg:w-[48%] xl:w-[56%]"
				style={{ maskImage: ACANTHUS_MASK, WebkitMaskImage: ACANTHUS_MASK }}
			>
				<AcanthusAscii />
			</div>

			<div className="relative order-1 flex flex-1 flex-col justify-center py-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 lg:max-w-[50%] lg:py-16">
				<p className="font-mono text-label text-muted-foreground">
					<LabelText text="IEFA · Projeto α · Força Aérea Brasileira" />
				</p>

				{/* Escala do `.text-display`, mas mais contida no desktop: a coluna de texto divide a
				    largura com a folha, e "A máquina aponta." precisa caber numa linha só. */}
				<h1
					id="home-titulo"
					className="mt-6 text-balance font-bold text-[length:clamp(2.5rem,6vw,4.5rem)] leading-[1.05] tracking-[-0.04em] md:mt-8 lg:text-[length:clamp(2.5rem,4.6vw,4.5rem)]"
				>
					A máquina aponta.
					<span className="block font-normal font-serif italic tracking-[-0.03em]">O gestor decide.</span>
				</h1>

				<p className="mt-6 max-w-[34rem] text-lg text-muted-foreground leading-relaxed md:mt-8">
					O Contrate verifica o Estudo Técnico Preliminar e o Termo de Referência contra a Lei 14.133/21 e as normas do COMAER. Cada achado cita o dispositivo
					que o fundamenta; acatar ou descartar é de quem assina.
				</p>

				<div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4 md:mt-10">
					<HeroCta />
				</div>
			</div>

			<div className="relative order-3 flex items-center justify-between gap-4 border-border border-t pt-4 pb-2">
				<button
					type="button"
					onClick={() =>
						document
							.getElementById("como-funciona")
							?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
					}
					className="inline-flex items-center gap-2 font-mono text-label text-muted-foreground transition-colors hover:text-foreground"
				>
					<NavArrowDown className="size-4 motion-safe:animate-bounce" aria-hidden="true" />
					Como funciona
				</button>
				<p className="hidden font-mono text-label text-muted-foreground sm:block">Folha de acanto — símbolo da Intendência</p>
			</div>
		</section>
	)
}

const CTA_CLASS = "h-11 gap-2 px-5 text-base"

function HeroCta() {
	const { isAuthenticated, access, isPending } = useModuleAccess()

	if (!isAuthenticated) {
		return (
			<>
				<Button
					size="lg"
					className={CTA_CLASS}
					nativeButton={false}
					render={
						<Link to="/auth">
							Entrar
							<ArrowRight className="size-4" aria-hidden="true" />
						</Link>
					}
				/>
				<span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground text-xs">
					<Lock className="size-3.5" aria-hidden="true" />
					Acesso restrito ao efetivo autorizado
				</span>
			</>
		)
	}

	// Antes do perfil chegar, "Abrir Requisitante" seria uma promessa que muda sozinha
	// meio segundo depois para quem é analista.
	if (isPending) {
		return (
			<Button size="lg" className={CTA_CLASS} disabled>
				Verificando acesso…
			</Button>
		)
	}

	// Com sessão, `accessibleModules` sempre inclui o Requisitante (só exige login) — é o
	// piso, e é também para onde vai quem teve a consulta do perfil falhando.
	const [first] = accessibleModules({ isAuthenticated, access })
	if (!first) return null

	return (
		<>
			<Button
				size="lg"
				className={CTA_CLASS}
				nativeButton={false}
				render={
					<Link to={first.home}>
						Abrir {first.label}
						<ArrowRight className="size-4" aria-hidden="true" />
					</Link>
				}
			/>
			{/* Enviar documento vale para qualquer autenticado. Quando o primeiro módulo é outro
			    (a fila, para quem revisa), o atalho leva ao Requisitante, onde o envio mora. */}
			{first.id !== "requisitante" && (
				<Link to="/requisitante" className="font-mono text-muted-foreground text-xs underline-offset-4 transition-colors hover:text-foreground hover:underline">
					Enviar um documento
				</Link>
			)}
			<a href="#modulos" className="font-mono text-muted-foreground text-xs underline-offset-4 transition-colors hover:text-foreground hover:underline">
				Ver todos os módulos
			</a>
		</>
	)
}

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
	return (
		<div className="flex max-w-2xl flex-col gap-4">
			<p className="font-mono text-label text-muted-foreground">{eyebrow}</p>
			<h2 id={id} className="text-balance text-headline">
				{title}
			</h2>
			<p className="text-muted-foreground leading-relaxed">{children}</p>
		</div>
	)
}

/**
 * Texto de rótulo em caixa alta que preserva o α. Com `uppercase` ele vira "Α" (alfa
 * maiúsculo), indistinguível de um A latino — "PROJETO A".
 */
function LabelText({ text }: { text: string }) {
	const parts = text.split("α")
	return parts.map((part, i) => (
		<Fragment key={i}>
			{part}
			{i < parts.length - 1 && <span className="normal-case">α</span>}
		</Fragment>
	))
}
