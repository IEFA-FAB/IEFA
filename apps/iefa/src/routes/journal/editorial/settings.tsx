import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/journal/editorial/settings")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">
					Configurações do Periódico
				</h1>
				<p className="text-muted-foreground">
					Gerencie as configurações do sistema de publicações
				</p>
			</div>

			<div className="border rounded-lg p-8 bg-card text-center">
				<p className="text-muted-foreground">
					🚧 Página de configurações em desenvolvimento
				</p>
				<p className="text-sm text-muted-foreground mt-2">
					Em breve você poderá configurar: ISSN, DOI prefix, Crossref, templates
					de email, e mais.
				</p>
			</div>
		</div>
	);
}
