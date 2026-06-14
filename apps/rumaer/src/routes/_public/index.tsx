import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowRight, Search } from "lucide-react"
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
			{/* HERO */}
			<section
				className="relative grid overflow-hidden rounded-[1.5rem] bg-primary text-primary-foreground shadow-2xl md:grid-cols-[1.45fr_0.55fr]"
				style={{ backgroundImage: "radial-gradient(135% 120% at 92% -15%, var(--navy-2) 0%, transparent 60%)" }}
			>
				<div className="px-7 py-12 sm:px-10 md:py-14 md:pl-12">
					<span className="text-label inline-flex items-center gap-3 text-gold">
						<span className="h-0.5 w-6 rounded-full bg-gold" />
						Força Aérea Brasileira
						<span className="font-semibold tracking-normal text-primary-foreground/70">RCA 35-2/2023</span>
					</span>

					<h1 className="mt-5 max-w-[16ch] text-4xl leading-[1.05] font-extrabold sm:text-5xl">
						Encontre e monte o seu <span className="text-gold">uniforme</span>
					</h1>

					<p className="mt-4 max-w-[50ch] text-base leading-relaxed text-primary-foreground/85">
						Busque o uniforme certo, veja a composição peça a peça e saiba exatamente como montá-lo, conforme o seu círculo hierárquico.
					</p>

					{/* Busca — ação principal */}
					<form onSubmit={onSearch} className="mt-7 flex max-w-xl items-center gap-2 rounded-[14px] bg-background p-1.5 pl-4 shadow-lg">
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
						<span className="font-semibold text-primary-foreground/60">Ir direto para</span>
						{GRUPO_ORDER.map((g) => (
							<Link
								key={g}
								to="/uniformes"
								search={{ grupo: g }}
								className="border-b-[1.5px] border-transparent pb-0.5 font-medium text-primary-foreground/90 transition-colors hover:border-gold hover:text-primary-foreground"
							>
								{GRUPO_LABELS[g]}
							</Link>
						))}
					</div>
				</div>

				{/* Foto do uniforme histórico (asset estático em public/) */}
				<div className="relative hidden items-end justify-center border-l border-white/10 px-5 pt-7 md:flex">
					<span className="text-label absolute inset-x-0 top-6 z-10 text-center text-[10.5px] text-primary-foreground/70">Uniforme histórico</span>
					<img
						src="/uniforme-historico.png"
						alt="Uniforme histórico da Força Aérea Brasileira — túnica azul-ferrete com quepe branco e espadim"
						className="h-auto max-h-[380px] w-auto self-end object-contain drop-shadow-[0_14px_24px_oklch(0_0_0/0.4)]"
					/>
				</div>
			</section>

			{/* TAREFAS */}
			<section className="mt-14">
				<p className="text-label text-muted-foreground">Para começar</p>
				<h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-primary">O que você precisa resolver</h2>

				<div className="mt-4 border-t border-border/70">
					{TASKS.map((t) => (
						<Link
							key={t.title}
							to="/uniformes"
							className="group grid grid-cols-[auto_1fr_auto] items-center gap-6 border-b border-border/70 px-3 py-6 transition-all hover:bg-accent/50 hover:pl-5"
						>
							<span className="grid size-11 place-items-center rounded-xl bg-primary/[0.06] text-primary transition-colors group-hover:bg-primary group-hover:text-gold">
								{t.icon}
							</span>
							<span>
								<span className="block text-lg font-bold tracking-tight text-foreground">{t.title}</span>
								<span className="mt-0.5 block max-w-[62ch] text-sm text-muted-foreground">{t.desc}</span>
							</span>
							<ArrowRight className="size-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-gold-2" aria-hidden="true" />
						</Link>
					))}
				</div>
			</section>
		</div>
	)
}
