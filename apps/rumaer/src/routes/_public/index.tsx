import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowRight, ChevronDown, Search } from "lucide-react"
import { type FormEvent, useState } from "react"
import { GRUPO_LABELS, GRUPO_ORDER } from "@/lib/uniforms/labels"

export const Route = createFileRoute("/_public/")({
	component: LandingPage,
})

const TASKS = [
	{
		title: "Composição peça a peça",
		desc: "Cada peça do uniforme com sua obrigatoriedade, e as variantes por círculo hierárquico e gênero.",
		icon: (
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.8}
				className="size-[23px]"
				aria-hidden="true"
			>
				<rect x="3" y="4" width="18" height="5" rx="1.5" />
				<rect x="3" y="13" width="18" height="7" rx="1.5" />
				<path d="M7 6.5h0M7 16.5h6" />
			</svg>
		),
	},
	{
		title: "Monte o seu uniforme",
		desc: "Guia passo a passo a partir do seu posto e círculo, mostrando o que vestir e como portar cada item.",
		icon: (
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.8}
				className="size-[23px]"
				aria-hidden="true"
			>
				<path d="M9 4h6l-1 3 4 2v11H6V9l4-2-1-3Z" />
				<path d="M9 13l2 2 4-4" />
			</svg>
		),
	},
	{
		title: "Tire suas dúvidas",
		desc: "Regras de uso, equivalências civis e interforças, e as perguntas mais frequentes, respondidas.",
		icon: (
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.8}
				className="size-[23px]"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="9" />
				<path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-1.4 1-1.4 1.9" />
				<path d="M12 17h0" />
			</svg>
		),
	},
] as const

function LandingPage() {
	const navigate = useNavigate()
	const [query, setQuery] = useState("")

	function onSearch(e: FormEvent) {
		e.preventDefault()
		const q = query.trim()
		navigate({ to: "/uniformes", search: q ? { q } : {} })
	}

	return (
		<div className="flex flex-col">
			{/* HERO — canvas claro, busca como ação principal; navy só como acento */}
			<section className="relative -mt-8 flex min-h-[calc(100svh-3.75rem)] items-center md:-mt-10">
				{/* Textura de fundo full-bleed — grade técnica (adapta ao tema) + brilhos navy/dourado */}
				<div className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden" aria-hidden="true">
					<div
						className="absolute inset-0 text-foreground/[0.055]"
						style={{
							backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
							backgroundSize: "46px 46px",
							maskImage: "radial-gradient(118% 88% at 26% 22%, #000 0%, transparent 72%)",
							WebkitMaskImage: "radial-gradient(118% 88% at 26% 22%, #000 0%, transparent 72%)",
						}}
					/>
					<div
						className="absolute top-[-14rem] right-[-10rem] size-[34rem] rounded-full"
						style={{ background: "radial-gradient(circle, oklch(0.78 0.095 86 / 0.20) 0%, transparent 68%)" }}
					/>
					<div
						className="absolute bottom-[-12rem] left-[-14rem] size-[32rem] rounded-full"
						style={{ background: "radial-gradient(circle, oklch(0.45 0.105 264 / 0.14) 0%, transparent 70%)" }}
					/>
				</div>

				<div className="grid w-full items-center gap-10 py-16 md:grid-cols-[1.5fr_0.5fr] md:py-12">
					<div>
						<span className="text-label inline-flex items-center gap-3 text-primary">
							<span className="h-0.5 w-6 rounded-full bg-gold" />
							Força Aérea Brasileira
							<span className="font-semibold tracking-normal text-muted-foreground">RCA 35-2/2023</span>
						</span>

						<h1 className="mt-5 max-w-[15ch] text-4xl leading-[1.05] font-extrabold text-foreground sm:text-5xl">
							Encontre e monte o seu <span className="underline decoration-gold decoration-4 underline-offset-[6px]">uniforme</span>
						</h1>

						<p className="mt-5 max-w-[52ch] text-base leading-relaxed text-muted-foreground">
							Consulta oficial do RUMAER: a composição de cada peça e o porte correto, conforme o seu posto e círculo hierárquico.
						</p>

						{/* Busca — ação principal */}
						<form
							onSubmit={onSearch}
							className="mt-8 flex max-w-xl items-center gap-2 rounded-[14px] border border-input bg-card p-1.5 pl-4 shadow-xs transition-shadow focus-within:border-ring focus-within:shadow-sm"
						>
							<Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Busque por uniforme, ocasião ou peça…"
								aria-label="Buscar uniforme"
								className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
							/>
							<button
								type="submit"
								className="inline-flex shrink-0 items-center gap-2 rounded-[9px] bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-navy-deep"
							>
								Buscar
							</button>
						</form>

						{/* Atalhos por grupo */}
						<div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
							<span className="font-semibold text-muted-foreground">Ir direto para</span>
							{GRUPO_ORDER.map((g) => (
								<Link
									key={g}
									to="/uniformes"
									search={{ grupo: g }}
									className="border-b-[1.5px] border-transparent pb-0.5 font-medium text-foreground/80 transition-colors hover:border-gold hover:text-foreground"
								>
									{GRUPO_LABELS[g]}
								</Link>
							))}
						</div>
					</div>

					{/* Foto do uniforme histórico (asset estático em public/) */}
					<div className="relative hidden items-end justify-center pt-9 md:flex">
						<span className="text-label absolute inset-x-0 top-0 z-10 text-center text-[10.5px] text-muted-foreground">Uniforme histórico</span>
						<img
							src="/uniforme-historico.png"
							alt="Uniforme histórico da Força Aérea Brasileira — túnica azul-ferrete com quepe branco e espadim"
							className="h-auto max-h-[440px] w-auto self-end object-contain drop-shadow-[0_14px_28px_oklch(0.27_0.085_264/0.22)]"
						/>
					</div>
				</div>

				{/* Indicador de rolagem — sinaliza que há mais conteúdo abaixo */}
				<a
					href="#continue"
					aria-label="Ver os continue abaixo"
					className="group absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-full px-3 py-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				>
					<span className="text-label text-[10px]">Continue</span>
					<ChevronDown className="size-4 animate-nudge text-gold-2 motion-reduce:animate-none" aria-hidden="true" />
				</a>
			</section>

			{/* continue — banda navy full-bleed; única zona drenada, encosta no rodapé */}
			<section
				id="continue"
				className="relative left-1/2 -mb-8 w-screen -translate-x-1/2 scroll-mt-15 overflow-hidden bg-primary text-primary-foreground md:-mb-10"
				style={{ backgroundImage: "radial-gradient(120% 130% at 92% -10%, var(--navy-2) 0%, transparent 55%)" }}
			>
				<div className="mx-auto w-full px-4 py-16 sm:px-6 md:px-8 md:py-20 lg:max-w-[1100px] xl:max-w-[1180px]">
					<p className="text-label inline-flex items-center gap-3 text-gold">
						<span className="h-0.5 w-6 rounded-full bg-gold" />
						Comece por aqui
					</p>
					<h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">O que você precisa resolver</h2>

					<div className="mt-6 border-t border-white/12">
						{TASKS.map((t) => (
							<Link
								key={t.title}
								to="/uniformes"
								className="group grid grid-cols-[auto_1fr_auto] items-center gap-6 border-b border-white/12 px-3 py-6 transition-all hover:bg-white/[0.04] hover:pl-5"
							>
								<span className="grid size-11 place-items-center rounded-xl bg-white/10 text-primary-foreground transition-colors group-hover:bg-gold group-hover:text-gold-foreground">
									{t.icon}
								</span>
								<span>
									<span className="block text-lg font-bold tracking-tight">{t.title}</span>
									<span className="mt-0.5 block max-w-[62ch] text-sm text-primary-foreground/70">{t.desc}</span>
								</span>
								<ArrowRight className="size-5 text-primary-foreground/50 transition-all group-hover:translate-x-1 group-hover:text-gold" aria-hidden="true" />
							</Link>
						))}
					</div>
				</div>
			</section>
		</div>
	)
}
