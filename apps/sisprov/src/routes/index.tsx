import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * O SISPROV não tem vitrine pública: `/` leva ao hub (autenticado) ou ao login. As únicas
 * rotas públicas são os documentos legais e o `/health`.
 */
export const Route = createFileRoute("/")({
	beforeLoad: ({ context }) => {
		throw redirect({ to: context.auth.isAuthenticated ? "/hub" : "/auth", replace: true })
	},
})
