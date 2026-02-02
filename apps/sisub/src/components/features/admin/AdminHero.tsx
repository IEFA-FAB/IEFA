import { AlertCircle, Shield } from "lucide-react"

interface AdminHeroProps {
	error: string | null
}

export default function AdminHero({ error }: AdminHeroProps) {
	return (
		<div className="text-center">
			<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border mb-3">
				<Shield />
				Painel Administrativo
			</div>
			<h1 className="text-3xl md:text-4xl font-boldmb-3">Controles da sua OM</h1>
			<p className="max-w-2xl mx-auto">
				Gere o QR de auto check-in e acompanhe indicadores da unidade em tempo real.
			</p>

			{error && (
				<div
					className="mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2"
					role="alert"
				>
					<AlertCircle className="h-4 w-4" aria-hidden="true" />
					<span>{error}</span>
				</div>
			)}
		</div>
	)
}
