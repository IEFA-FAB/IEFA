import { Link } from "@tanstack/react-router"
import { User, WarningCircle } from "iconoir-react"
import { Alert, AlertDescription, AlertTitle } from "../ui/alert"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader } from "../ui/card"

export function ProfileOnboarding() {
	return (
		<div className="container mx-auto max-w-4xl px-4 py-12">
			<Card className="border-2">
				<CardHeader className="text-center pb-6">
					<div className="mx-auto size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
						<User className="size-8 text-primary" aria-hidden="true" />
					</div>
					<h1 className="text-3xl font-bold tracking-tight mb-2">Complete Seu Perfil</h1>
					<p className="text-muted-foreground">Para utilizar o Sistema de Gestão de Publicações, você precisa primeiro completar seu perfil.</p>
				</CardHeader>

				<CardContent className="space-y-6">
					{/* Info Alert */}
					<Alert variant="info" role="note">
						<WarningCircle className="size-5" aria-hidden="true" />
						<AlertTitle>
							<h3 className="text-base font-semibold">Por que preciso completar meu perfil?</h3>
						</AlertTitle>
						<AlertDescription>
							O Sistema de Gestão de Publicações utiliza suas informações de perfil para identificar você como autor, revisor ou editor. Seus dados são
							essenciais para a gestão adequada de artigos, revisões e publicações.
						</AlertDescription>
					</Alert>

					{/* Required Information */}
					<div>
						<h2 className="font-semibold text-lg mb-3">Informações Necessárias</h2>
						<ul className="space-y-2 text-sm text-muted-foreground">
							<li className="flex items-start gap-2">
								<span className="text-primary mt-1">•</span>
								<span>Nome completo</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-primary mt-1">•</span>
								<span>Afiliação institucional</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-primary mt-1">•</span>
								<span>ORCID (opcional, mas recomendado)</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-primary mt-1">•</span>
								<span>Áreas de expertise (para revisores)</span>
							</li>
						</ul>
					</div>

					{/* CTA */}
					<div className="pt-4">
						<Link to="/journal/profile" className="block">
							<Button size="lg" className="w-full">
								Completar Perfil Agora →
							</Button>
						</Link>
					</div>

					{/* Secondary Action */}
					<div className="text-center">
						<Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
							Voltar para a página inicial
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
