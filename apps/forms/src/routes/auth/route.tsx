import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router"
import { z } from "zod"

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
	return (
		<div className="min-h-screen flex flex-col md:flex-row bg-background">
			{/* LEFT PANEL — BRAND (desktop only) */}
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

			{/* MOBILE HEADER */}
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

			{/* RIGHT PANEL — FORM */}
			<div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16">
				<div className="w-full max-w-[420px]">
					<Outlet />
				</div>
			</div>
		</div>
	)
}
