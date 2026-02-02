import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/health")({
	component: HealthCheck,
})

function HealthCheck() {
	return <div>OK</div>
}
