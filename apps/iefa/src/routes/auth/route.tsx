// src/routes/auth.tsx
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { z } from "zod";
import { HeroHighlight } from "@/components/hero-highlight";

// Validação para garantir que o redirect seja seguro e opcional
const authSearchSchema = z.object({
	redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
	validateSearch: authSearchSchema,
	// Proteção Inversa: Se já estiver logado, não deixa ver login/register
	beforeLoad: ({ context, search }) => {
		if (context.auth.isAuthenticated) {
			throw redirect({ to: search.redirect || "/panel" });
		}
	},
	component: AuthLayout,
});

function AuthLayout() {
	return (
		<HeroHighlight
			className="w-full"
			containerClassName="align-center justify-center items-center min-h-screen w-full flex flex-col items-center justify-center p-4"
		>
			{/* Ambient Light Effect matching Landing Page */}
			<div className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-primary/20 blur-[120px] rounded-full pointer-events-none -z-10 opacity-50" />

			<div className="w-full relative z-10">
				{/* Header Brand */}
				<div className="text-center mb-8 animate-fade-in-up">
					<Link
						to="/"
						className="inline-block hover:opacity-80 transition-opacity"
					>
						<img
							src="/favicon.svg"
							alt="IEFA"
							className="h-16 w-auto mx-auto drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
						/>
					</Link>
					<h1 className="mt-6 text-2xl font-bold tracking-tight text-white">
						Bem-vindo ao IEFA
					</h1>
					<p className="text-muted-foreground mt-2 text-sm">
						Cadastro de Facilidades Aeroportuárias
					</p>
				</div>

				{/* Onde as páginas (Login, Register) serão renderizadas */}
				<Outlet />
			</div>
		</HeroHighlight>
	);
}
