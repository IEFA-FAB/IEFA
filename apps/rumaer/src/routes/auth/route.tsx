import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router"
import { z } from "zod"

const authSearchSchema = z.object({
	redirect: z.string().optional(),
})

export const Route = createFileRoute("/auth")({
	validateSearch: authSearchSchema,
	beforeLoad: ({ context, search }) => {
		if (context.auth.isAuthenticated) {
			throw redirect({ to: search.redirect || "/" })
		}
	},
	component: AuthLayout,
})

function AuthLayout() {
	return (
		<div className="grid min-h-screen w-full bg-background md:grid-cols-2">
			{/* ===== LEFT — FORM ===== */}
			<div className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
				<div className="w-full max-w-[380px]">
					<Outlet />
				</div>
			</div>

			{/* ===== RIGHT — IMAGE PANEL (desktop only) ===== */}
			<div className="relative hidden overflow-hidden bg-primary md:block">
				<img
					src="/login-background.jpg"
					alt="Sargento da Força Aérea Brasileira em uniforme de gala, com luvas brancas e espadim, ao lado da bandeira nacional"
					className="absolute inset-0 h-full w-full object-cover"
				/>

				{/* gradiente navy para profundidade e leitura da legenda */}
				<div
					className="absolute inset-0"
					style={{ backgroundImage: "linear-gradient(160deg, oklch(0.27 0.085 264 / 0.10) 0%, transparent 40%, oklch(0.20 0.07 264 / 0.55) 100%)" }}
					aria-hidden
				/>

				{/* legenda — pílula inferior esquerda (estilo referência) */}
				<div className="absolute bottom-5 left-5 z-10 flex items-center gap-2.5 rounded-full bg-background/10 px-3.5 py-2 text-primary-foreground backdrop-blur-md">
					<span className="size-2.5 rounded-full bg-gold" aria-hidden />
					<span className="text-xs">
						<span className="font-semibold">RUMAER</span>
						<span className="text-primary-foreground/70"> · RCA 35-2/2023</span>
					</span>
				</div>

				{/* link de volta ao regulamento — canto superior direito */}
				<Link
					to="/"
					className="text-label absolute top-5 right-5 z-10 rounded-full bg-background/10 px-3.5 py-2 text-primary-foreground/90 backdrop-blur-md transition-colors hover:bg-background/20 hover:text-primary-foreground"
				>
					Ver regulamento
				</Link>
			</div>
		</div>
	)
}
