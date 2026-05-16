import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { env } from "@/env"

const authSearchSchema = z.object({
	redirect: z.string().optional(),
})

export const Route = createFileRoute("/auth")({
	validateSearch: authSearchSchema,
	beforeLoad: ({ context, search }) => {
		if (context.auth.isAuthenticated) {
			throw redirect({ to: search.redirect || "/dashboard" })
		}
	},
	component: AuthLayout,
})

function AuthLayout() {
	const isCincoS = env.VITE_APP_TENANT === "cinco-s"

	return (
		<div className="min-h-screen flex flex-col md:flex-row bg-background">
			{/* LEFT PANEL — BRAND (desktop only) */}
			{isCincoS ? (
				<div
					className="hidden md:flex md:w-[460px] lg:w-[520px] shrink-0 flex-col justify-between border-r border-black/10 p-12 relative overflow-hidden"
					style={{ background: "var(--5s-navy-deep)", color: "white" }}
				>
					{/* Curva luminosa decorativa */}
					<svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
						<defs>
							<filter id="auth-glow">
								<feGaussianBlur stdDeviation="8" result="blur" />
								<feMerge>
									<feMergeNode in="blur" />
									<feMergeNode in="SourceGraphic" />
								</feMerge>
							</filter>
						</defs>
						<path d="M-40,80 Q120,160 80,320 Q40,480 160,600" fill="none" style={{ stroke: "var(--5s-electric)", strokeWidth: "2" }} filter="url(#auth-glow)" />
					</svg>

					<Link to="/" className="relative inline-block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/50">
						<div className="flex items-center gap-2.5">
							<img src="/5s/favicon.svg" alt="VETOR 5S" className="h-8 w-auto" />
							<span className="font-bold text-lg tracking-tight text-white">SEFA</span>
						</div>
					</Link>

					<div className="relative space-y-6">
						<p className="font-semibold uppercase text-white/45 tracking-widest" style={{ fontSize: "11px", letterSpacing: "0.12em" }}>
							Programa
						</p>

						{/* VETOR 5S — bold italic bicolor */}
						<div
							style={{
								fontSize: "clamp(2.75rem, 4vw, 3.75rem)",
								fontWeight: 900,
								fontStyle: "italic",
								lineHeight: 1,
								letterSpacing: "-0.03em",
							}}
						>
							<span className="text-white">VETOR </span>
							<span style={{ color: "var(--5s-electric)" }}>5S</span>
						</div>

						{/* Banner MELHORIA CONTÍNUA */}
						<div className="inline-flex items-stretch self-start overflow-hidden rounded-sm">
							<div className="px-3 py-1.5" style={{ background: "oklch(0.10 0.04 258)" }}>
								<span className="text-xs font-bold tracking-widest uppercase text-white">MELHORIA CONTÍNUA</span>
							</div>
							<div className="px-2.5 flex items-center justify-center" style={{ background: "var(--5s-gold)" }}>
								<span className="text-base font-black leading-none" style={{ color: "var(--5s-navy-deep)" }}>
									»
								</span>
							</div>
						</div>

						<p className="text-sm text-white/50 leading-relaxed max-w-[270px] italic">"Direção clara. Esforços alinhados. Excelência contínua."</p>

						{/* Linha dourada */}
						<div className="h-0.5 w-12 rounded-full" style={{ background: "var(--5s-gold)", opacity: 0.7 }} />
					</div>

					<div className="relative space-y-4">
						<div className="border-t border-white/15" />
						<p className="font-medium uppercase text-white/35" style={{ fontSize: "11px", letterSpacing: "0.08em" }}>
							Acesso exclusivo — @fab.mil.br
						</p>
					</div>
				</div>
			) : (
				<div className="hidden md:flex md:w-[460px] lg:w-[520px] shrink-0 flex-col justify-between border-r border-border p-12 bg-foreground text-background">
					<Link to="/" className="inline-block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-background/50">
						<img src="/favicon.svg" alt="IEFA" className="h-9 w-auto invert" />
					</Link>

					<div className="space-y-7">
						<p className="text-background/40 font-medium uppercase" style={{ fontSize: "11px", letterSpacing: "0.08em" }}>
							Força Aérea Brasileira · IEFA
						</p>

						<h1
							className="font-serif text-background leading-[1.04]"
							style={{
								fontSize: "clamp(2.75rem, 4vw, 3.75rem)",
								fontWeight: 700,
								letterSpacing: "-0.04em",
							}}
						>
							Formulários
							<br />
							Questionários
							<br />
							Pesquisas
						</h1>

						<p className="text-sm text-background/50 leading-relaxed max-w-[270px]">
							Sistema de questionários internos do IEFA — coleta estruturada de dados a serviço do COMAER.
						</p>
					</div>

					<div className="space-y-4">
						<div className="border-t border-background/15" />
						<p className="text-background/30 font-medium uppercase" style={{ fontSize: "11px", letterSpacing: "0.08em" }}>
							Acesso exclusivo — @fab.mil.br
						</p>
					</div>
				</div>
			)}

			{/* MOBILE HEADER */}
			{isCincoS ? (
				<div className="md:hidden border-b border-black/10 px-6 py-4 flex items-center gap-3" style={{ background: "var(--5s-navy-deep)" }}>
					<Link to="/" className="inline-block">
						<img src="/5s/favicon.svg" alt="VETOR 5S" className="h-7 w-auto" />
					</Link>
					<div>
						<p className="text-sm font-semibold leading-tight text-white">Programa VETOR 5S</p>
						<p className="font-medium uppercase text-white/45" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
							SEFA · FAB
						</p>
					</div>
				</div>
			) : (
				<div className="md:hidden border-b border-border bg-foreground text-background px-6 py-4 flex items-center gap-3">
					<Link to="/" className="inline-block">
						<img src="/favicon.svg" alt="IEFA" className="h-7 w-auto invert" />
					</Link>
					<div>
						<p className="text-sm font-semibold text-background leading-tight">Formulários IEFA</p>
						<p className="text-background/45 font-medium uppercase" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>
							Força Aérea Brasileira
						</p>
					</div>
				</div>
			)}

			{/* RIGHT PANEL — FORM */}
			<div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16">
				<div className="w-full max-w-[420px]">
					<Outlet />
				</div>
			</div>
		</div>
	)
}
