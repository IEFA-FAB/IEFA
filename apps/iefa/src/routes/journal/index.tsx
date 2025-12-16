import { Button } from "@iefa/ui";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	BookOpen,
	FileText,
	LayoutDashboard,
	List,
	Settings,
	Upload,
	Users,
} from "lucide-react";
import { authQueryOptions } from "@/auth/service";
import { userProfileQueryOptions } from "@/lib/journal/hooks";

export const Route = createFileRoute("/journal/")({
	loader: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions());
		if (auth.user && auth.isAuthenticated) {
			// Only try to load profile if user is authenticated with valid ID
			try {
				await context.queryClient.ensureQueryData(
					userProfileQueryOptions(auth.user.id),
				);
			} catch {
				// Profile doesn't exist yet, will be auto-created by trigger
			}
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { data: auth } = useSuspenseQuery(authQueryOptions());

	// Use regular useQuery for profile since it's optional and may not exist
	const { data: profile } = useQuery({
		...userProfileQueryOptions(auth.user?.id || ""),
		enabled: !!auth.user?.id && auth.isAuthenticated,
		retry: false,
	});

	const isEditor = profile?.role === "editor";
	const isAuthenticated = auth.isAuthenticated;

	return (
		<div className="container mx-auto max-w-6xl px-4 py-12">
			{/* Header */}
			<div className="text-center mb-12">
				<h1 className="text-4xl font-bold tracking-tight mb-4">
					Sistema de Gestão de Publicações
				</h1>
				<p className="text-lg text-muted-foreground max-w-2xl mx-auto">
					Plataforma completa para submissão, revisão e publicação de artigos
					científicos
				</p>
			</div>

			{/* Action Cards for Authors */}
			<div className="mb-12">
				<h2 className="text-2xl font-semibold mb-6">
					{isAuthenticated ? "Minhas Ações" : "Para Autores"}
				</h2>

				<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
					{/* Submit Article Card */}
					<Link
						to={isAuthenticated ? "/journal/submit" : "/auth"}
						className="group"
					>
						<div className="p-6 border rounded-lg hover:border-primary transition-colors bg-card h-full flex flex-col">
							<div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
								<Upload className="size-6 text-primary" />
							</div>
							<h3 className="font-semibold text-lg mb-2">Nova Submissão</h3>
							<p className="text-sm text-muted-foreground mb-4 flex-1">
								Submeta um novo artigo para revisão por pares. Preencha o
								formulário com metadados bilíngues e faça upload dos arquivos.
							</p>
							<Button variant="ghost" className="w-full justify-start px-0">
								{isAuthenticated ? "Iniciar Submissão" : "Fazer Login"} →
							</Button>
						</div>
					</Link>

					{/* My Submissions Card */}
					<Link
						to={isAuthenticated ? "/journal/submissions" : "/auth"}
						className="group"
					>
						<div className="p-6 border rounded-lg hover:border-primary transition-colors bg-card h-full flex flex-col">
							<div className="size-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
								<List className="size-6 text-blue-600 dark:text-blue-400" />
							</div>
							<h3 className="font-semibold text-lg mb-2">Minhas Submissões</h3>
							<p className="text-sm text-muted-foreground mb-4 flex-1">
								Acompanhe o status de todos os seus artigos submetidos.
								Visualize comentários dos revisores e faça revisões.
							</p>
							<Button variant="ghost" className="w-full justify-start px-0">
								{isAuthenticated ? "Ver Submissões" : "Fazer Login"} →
							</Button>
						</div>
					</Link>

					{/* Profile Card */}
					<Link
						to={isAuthenticated ? "/journal/profile" : "/auth"}
						className="group"
					>
						<div className="p-6 border rounded-lg hover:border-primary transition-colors bg-card h-full flex flex-col">
							<div className="size-12 rounded-lg bg-green-500/10 flex items-center justify-center mb-4 group-hover:bg-green-500/20 transition-colors">
								<Users className="size-6 text-green-600 dark:text-green-400" />
							</div>
							<h3 className="font-semibold text-lg mb-2">Meu Perfil</h3>
							<p className="text-sm text-muted-foreground mb-4 flex-1">
								Gerencie suas informações pessoais, ORCID, afiliação
								institucional e áreas de expertise.
							</p>
							<Button variant="ghost" className="w-full justify-start px-0">
								{isAuthenticated ? "Editar Perfil" : "Fazer Login"} →
							</Button>
						</div>
					</Link>

					{/* Published Articles Card */}
					<Link to="/journal/articles" className="group">
						<div className="p-6 border rounded-lg hover:border-primary transition-colors bg-card h-full flex flex-col">
							<div className="size-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
								<BookOpen className="size-6 text-purple-600 dark:text-purple-400" />
							</div>
							<h3 className="font-semibold text-lg mb-2">Artigos Publicados</h3>
							<p className="text-sm text-muted-foreground mb-4 flex-1">
								Navegue pelos artigos já publicados na revista. Pesquise por
								área, autor ou palavra-chave.
							</p>
							<Button variant="ghost" className="w-full justify-start px-0">
								Explorar Artigos →
							</Button>
						</div>
					</Link>

					{/* Placeholder Cards */}
					<div className="p-6 border rounded-lg bg-card opacity-60 h-full flex flex-col">
						<div className="size-12 rounded-lg bg-muted flex items-center justify-center mb-4">
							<FileText className="size-6 text-muted-foreground" />
						</div>
						<h3 className="font-semibold text-lg mb-2">Minhas Revisões</h3>
						<p className="text-sm text-muted-foreground mb-4 flex-1">
							Visualize e complete revisões atribuídas a você.
						</p>
						<p className="text-xs text-muted-foreground italic">
							Em breve (Fase 3)
						</p>
					</div>

					<div className="p-6 border rounded-lg bg-card opacity-60 h-full flex flex-col">
						<div className="size-12 rounded-lg bg-muted flex items-center justify-center mb-4">
							<Settings className="size-6 text-muted-foreground" />
						</div>
						<h3 className="font-semibold text-lg mb-2">
							Configurações da Revista
						</h3>
						<p className="text-sm text-muted-foreground mb-4 flex-1">
							Configure informações da revista, templates de email e DOI.
						</p>
						<p className="text-xs text-muted-foreground italic">
							Em breve (Fase 4)
						</p>
					</div>
				</div>
			</div>

			{/* Editorial Section - Only for Editors */}
			{isEditor && (
				<div className="border-t pt-12">
					<h2 className="text-2xl font-semibold mb-6">Área Editorial</h2>

					<div className="grid md:grid-cols-2 gap-6">
						<Link to="/journal/editorial/dashboard" className="group">
							<div className="p-8 border-2 border-primary/50 rounded-lg hover:border-primary transition-colors bg-primary/5 h-full">
								<div className="size-16 rounded-lg bg-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/30 transition-colors">
									<LayoutDashboard className="size-8 text-primary" />
								</div>
								<h3 className="font-semibold text-xl mb-2">
									Dashboard Editorial
								</h3>
								<p className="text-muted-foreground mb-4">
									Gerencie submissões, atribua revisores e tome decisões sobre
									artigos.
								</p>
								<Button className="mt-4">Acessar Dashboard →</Button>
							</div>
						</Link>

						<div className="p-8 border rounded-lg bg-card">
							<h3 className="font-semibold text-lg mb-4">
								Estatísticas Rápidas
							</h3>
							<div className="space-y-3">
								<div className="flex items-center justify-between p-3 bg-muted rounded">
									<span className="text-sm text-muted-foreground">
										Aguardando Decisão
									</span>
									<span className="font-semibold">-</span>
								</div>
								<div className="flex items-center justify-between p-3 bg-muted rounded">
									<span className="text-sm text-muted-foreground">
										Em Revisão
									</span>
									<span className="font-semibold">-</span>
								</div>
								<div className="flex items-center justify-between p-3 bg-muted rounded">
									<span className="text-sm text-muted-foreground">
										Publicados este mês
									</span>
									<span className="font-semibold">-</span>
								</div>
							</div>
							<p className="text-xs text-muted-foreground mt-4 italic">
								Estatísticas disponíveis no dashboard
							</p>
						</div>
					</div>
				</div>
			)}

			{/* Info Section */}
			<div className="mt-12 p-6 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-900">
				<h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
					ℹ️ Sobre o Sistema
				</h3>
				<p className="text-sm text-blue-800 dark:text-blue-200">
					Este é um sistema completo de gestão de publicações científicas com
					suporte a submissões bilíngues (PT/EN), revisão por pares, gestão de
					DOI e integração com Crossref. Para começar, faça login e complete seu
					perfil.
				</p>
			</div>

			{/* Quick Links */}
			{!isAuthenticated && (
				<div className="mt-8 text-center">
					<p className="text-muted-foreground mb-4">Já possui uma conta?</p>
					<Link to="/auth">
						<Button size="lg">Fazer Login</Button>
					</Link>
				</div>
			)}
		</div>
	);
}
