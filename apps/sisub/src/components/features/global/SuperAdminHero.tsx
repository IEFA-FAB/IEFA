import { Shield } from "lucide-react"

export default function SuperAdminHero() {
	return (
		<div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/30 via-background to-muted/20 p-8 md:p-12 border border-border/50 text-center">
			{/* Dot pattern overlay */}
			<div className="absolute inset-0 bg-dot-pattern opacity-[0.03] -z-10" />

			<div className="relative">
				<div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm mb-4 bg-primary/10 text-primary border border-primary/20 font-sans font-medium">
					<Shield className="h-4 w-4" />
					Painel SuperAdmin
				</div>
				<h1 className="text-3xl md:text-4xl lg:text-5xl font-sans font-bold mb-4 text-foreground">
					Controle do Sistema
				</h1>
				<p className="text-sm md:text-base font-sans text-muted-foreground max-w-2xl mx-auto leading-relaxed">
					Gerencie permissões, cadastre administradores e acompanhe indicadores gerais do SISUB.
				</p>
			</div>
		</div>
	)
}
