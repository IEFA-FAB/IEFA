import { createFileRoute } from "@tanstack/react-router"

// Endpoint de health check do ALB (target group → matcher 200-399). Público:
// isento do guard de auth no __root (ver isPublicPath). Não depende de Supabase
// nem de sessão — responde 200 assim que o servidor SSR está de pé.
export const Route = createFileRoute("/health")({
	component: Health,
})

function Health() {
	return <div>ok</div>
}
