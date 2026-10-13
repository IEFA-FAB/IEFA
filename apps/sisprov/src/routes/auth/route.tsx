import { safeRedirect } from "@iefa/auth-kit"
import { LegalFooterLinks } from "@iefa/legal-kit/react"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { z } from "zod"
import { isPasswordRecovery, urlLooksLikeRecovery } from "@/auth/recovery-session"

const authSearchSchema = z.object({
	// `unknown` de propósito: o router coage `?redirect=5` para número, e `z.string()`
	// derrubaria a rota inteira em vez de ignorar o valor. Ver `safeRedirect` no auth-kit.
	redirect: z.unknown().optional().transform(safeRedirect),
	/** Preenchido pelo guard quando a conta não tem módulo nenhum do SISPROV. */
	denied: z.string().optional(),
})

export const Route = createFileRoute("/auth")({
	validateSearch: authSearchSchema,
	// Quem já está autenticado não tem o que fazer aqui, EXCETO quem chegou por um link de
	// recuperação: essa sessão autentica, mas o usuário ainda vai digitar a senha nova.
	beforeLoad: ({ context, search }) => {
		if (context.auth.isAuthenticated && !isPasswordRecovery() && !urlLooksLikeRecovery()) {
			throw redirect({ to: search.redirect || "/hub" })
		}
	},
	component: AuthLayout,
})

function AuthLayout() {
	return (
		<div className="flex min-h-svh flex-col bg-background">
			<div className="flex flex-1 items-center justify-center px-6 py-12">
				<div className="w-full max-w-[380px] space-y-8">
					<div className="space-y-1">
						<p className="font-mono text-base font-bold tracking-widest uppercase text-foreground">SISPROV</p>
						<p className="text-caption text-muted-foreground">Sistema de Provisões. Estoque e fardamento gratuito.</p>
					</div>
					<Outlet />
				</div>
			</div>
			<footer className="border-t border-border/60">
				<div className="mx-auto flex h-12 w-full max-w-[380px] items-center justify-between px-6 text-caption text-muted-foreground sm:px-0">
					<span>IEFA</span>
					<LegalFooterLinks className="flex items-center gap-x-3" />
				</div>
			</footer>
		</div>
	)
}
