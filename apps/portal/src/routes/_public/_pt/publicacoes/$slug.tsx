import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_public/_pt/publicacoes/$slug")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/posts/$slug", params: { slug: params.slug }, statusCode: 301 })
	},
})
