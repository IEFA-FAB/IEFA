import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Dashboard, Group, List, NavArrowDown, OpenBook, Page, Settings, Upload } from "iconoir-react"
import { authQueryOptions } from "@/auth/service"
import { ProfileOnboarding } from "@/components/journal/ProfileOnboarding"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { userProfileQueryOptions } from "@/lib/journal/hooks"

export const Route = createFileRoute("/journal/")({
	staticData: {
		nav: {
			title: "Publicações científicas",
			section: "Revista",
			subtitle: "Entrada do sistema de gestão de publicações",
			keywords: ["journal", "revista", "seiva", "publicacoes"],
			order: 50,
		},
	},
	loader: async ({ context }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
		if (auth.user && auth.isAuthenticated) {
			try {
				await context.queryClient.ensureQueryData(userProfileQueryOptions(auth.user.id))
			} catch {
				// Profile doesn't exist yet, will be auto-created by trigger
			}
		}
	},
	component: RouteComponent,
})

function RouteComponent() {
	const { data: auth } = useSuspenseQuery(authQueryOptions())

	const { data: profile } = useQuery({
		...userProfileQueryOptions(auth.user?.id || ""),
		enabled: !!auth.user?.id && auth.isAuthenticated,
		retry: false,
	})

	if (auth.isAuthenticated && !profile) {
		return <ProfileOnboarding />
	}

	const isEditor = profile?.role === "editor"
	const isAuthenticated = auth.isAuthenticated

	return (
		<div className="relative flex flex-col w-full text-foreground">
			{/* ─── Hero — ocupa toda a primeira tela ─────────────────────────────── */}
			<section
				aria-label="Sistema de Gestão de Publicações"
				className="relative w-full
          min-h-[calc(100dvh-3.5rem-2rem)] md:min-h-[calc(100dvh-3.5rem-2.5rem)]
          flex flex-col items-center justify-between"
			>
				{/* Conteúdo central */}
				<div className="flex-1 flex flex-col items-center justify-center text-center gap-8 px-4 py-12">
					<p className="text-label text-muted-foreground">Periódico Científico · IEFA</p>

					<h1 className="text-hero text-balance">
						Sistema de Gestão
						<br className="hidden sm:block" /> de Publicações
					</h1>

					<p className="max-w-2xl text-sm sm:text-base text-muted-foreground text-pretty leading-relaxed">
						Plataforma completa para submissão, revisão e publicação de artigos científicos com suporte bilíngue (PT/EN).
					</p>

					<div className="flex flex-wrap gap-3 justify-center items-center pt-2">
						{isAuthenticated ? (
							<>
								<Button
									nativeButton={false}
									render={
										<Link to="/journal/submit" aria-label="Submeter novo artigo">
											Submeter Artigo
										</Link>
									}
									size="lg"
									variant="default"
								/>
								<Button
									nativeButton={false}
									render={
										<Link to="/journal/submissions" aria-label="Ver minhas submissões">
											Minhas Submissões
										</Link>
									}
									size="lg"
									variant="secondary"
								/>
							</>
						) : (
							<>
								<Button
									nativeButton={false}
									render={
										<Link to="/auth" aria-label="Fazer login">
											Fazer Login
										</Link>
									}
									size="lg"
									variant="default"
								/>
								<Button
									nativeButton={false}
									render={
										<Link to="/journal/articles" aria-label="Ver artigos publicados">
											Artigos Publicados
										</Link>
									}
									size="lg"
									variant="secondary"
								/>
							</>
						)}
					</div>
				</div>

				{/* Indicador de scroll */}
				<div className="pb-8 flex flex-col items-center gap-2 text-muted-foreground/60 select-none" aria-hidden="true">
					<span className="text-[10px] tracking-[0.2em] uppercase">Rolar</span>
					<NavArrowDown className="h-5 w-5 animate-bounce" />
				</div>
			</section>

			{/* ─── Seções de conteúdo ─────────────────────────────────────────────── */}
			<div className="flex flex-col gap-28 md:gap-36 pt-24 md:pt-28">
				{/* ── Ações ───────────────────────────────────────────────────────── */}
				<section aria-labelledby="acoes-heading">
					<div className="mb-1">
						<h2 id="acoes-heading" className="text-2xl md:text-3xl font-bold tracking-tight">
							{isAuthenticated ? "Minhas Ações" : "Para Autores"}
						</h2>
						<p className="text-muted-foreground mt-2 text-pretty">
							{isAuthenticated ? "Gerencie suas submissões e acompanhe o fluxo editorial." : "Explore os recursos disponíveis para novos autores."}
						</p>
					</div>

					<Separator className="my-6" />

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
						{isAuthenticated && (
							<Link to="/journal/submit" className="group">
								<div className="p-6 border border-border hover:bg-accent hover:border-foreground/20 transition-colors bg-card h-full flex flex-col">
									<div className="size-10 border border-border bg-muted flex items-center justify-center mb-4 shrink-0">
										<Upload className="size-5 text-foreground" aria-hidden="true" />
									</div>
									<h3 className="font-semibold text-base mb-2">Nova Submissão</h3>
									<p className="text-sm text-muted-foreground mb-4 flex-1 text-pretty leading-relaxed">
										Submeta um novo artigo para revisão por pares. Preencha o formulário com metadados bilíngues e faça upload dos arquivos.
									</p>
									<span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Iniciar Submissão →</span>
								</div>
							</Link>
						)}

						{isAuthenticated && (
							<Link to="/journal/submissions" className="group">
								<div className="p-6 border border-border hover:bg-accent hover:border-foreground/20 transition-colors bg-card h-full flex flex-col">
									<div className="size-10 border border-border bg-muted flex items-center justify-center mb-4 shrink-0">
										<List className="size-5 text-foreground" aria-hidden="true" />
									</div>
									<h3 className="font-semibold text-base mb-2">Minhas Submissões</h3>
									<p className="text-sm text-muted-foreground mb-4 flex-1 text-pretty leading-relaxed">
										Acompanhe o status de todos os seus artigos submetidos. Visualize comentários dos revisores e faça revisões.
									</p>
									<span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Ver Submissões →</span>
								</div>
							</Link>
						)}

						{isAuthenticated && (
							<Link to="/journal/profile" className="group">
								<div className="p-6 border border-border hover:bg-accent hover:border-foreground/20 transition-colors bg-card h-full flex flex-col">
									<div className="size-10 border border-border bg-muted flex items-center justify-center mb-4 shrink-0">
										<Group className="size-5 text-foreground" aria-hidden="true" />
									</div>
									<h3 className="font-semibold text-base mb-2">Meu Perfil</h3>
									<p className="text-sm text-muted-foreground mb-4 flex-1 text-pretty leading-relaxed">
										Gerencie suas informações pessoais, ORCID, afiliação institucional e áreas de expertise.
									</p>
									<span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Editar Perfil →</span>
								</div>
							</Link>
						)}

						<Link to="/journal/articles" className="group">
							<div className="p-6 border border-border hover:bg-accent hover:border-foreground/20 transition-colors bg-card h-full flex flex-col">
								<div className="size-10 border border-border bg-muted flex items-center justify-center mb-4 shrink-0">
									<OpenBook className="size-5 text-foreground" aria-hidden="true" />
								</div>
								<h3 className="font-semibold text-base mb-2">Artigos Publicados</h3>
								<p className="text-sm text-muted-foreground mb-4 flex-1 text-pretty leading-relaxed">
									Navegue pelos artigos já publicados na revista. Pesquise por área, autor ou palavra-chave.
								</p>
								<span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Explorar Artigos →</span>
							</div>
						</Link>

						<Link to="/journal/about" className="group">
							<div className="p-6 border border-border hover:bg-accent hover:border-foreground/20 transition-colors bg-card h-full flex flex-col">
								<div className="size-10 border border-border bg-muted flex items-center justify-center mb-4 shrink-0">
									<OpenBook className="size-5 text-foreground" aria-hidden="true" />
								</div>
								<h3 className="font-semibold text-base mb-2">Sobre a Revista</h3>
								<p className="text-sm text-muted-foreground mb-4 flex-1 text-pretty leading-relaxed">
									Conheça a missão, políticas editoriais e equipe da SEIVA.
								</p>
								<span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Saiba Mais →</span>
							</div>
						</Link>

						{isAuthenticated && (
							<>
								<div className="p-6 border border-border bg-card opacity-50 h-full flex flex-col cursor-not-allowed select-none">
									<div className="size-10 border border-border bg-muted flex items-center justify-center mb-4 shrink-0">
										<Page className="size-5 text-muted-foreground" aria-hidden="true" />
									</div>
									<h3 className="font-semibold text-base mb-2">Minhas Revisões</h3>
									<p className="text-sm text-muted-foreground mb-4 flex-1 text-pretty leading-relaxed">Visualize e complete revisões atribuídas a você.</p>
									<span className="text-label text-muted-foreground">Em breve · Fase 3</span>
								</div>

								{isEditor && (
									<div className="p-6 border border-border bg-card opacity-50 h-full flex flex-col cursor-not-allowed select-none">
										<div className="size-10 border border-border bg-muted flex items-center justify-center mb-4 shrink-0">
											<Settings className="size-5 text-muted-foreground" aria-hidden="true" />
										</div>
										<h3 className="font-semibold text-base mb-2">Configurações da Revista</h3>
										<p className="text-sm text-muted-foreground mb-4 flex-1 text-pretty leading-relaxed">
											Configure informações da revista, templates de email e DOI.
										</p>
										<span className="text-label text-muted-foreground">Em breve · Fase 4</span>
									</div>
								)}
							</>
						)}
					</div>
				</section>

				{/* ── Área Editorial — apenas editores ────────────────────────────── */}
				{isEditor && (
					<section aria-labelledby="editorial-heading">
						<div className="mb-1">
							<h2 id="editorial-heading" className="text-2xl md:text-3xl font-bold tracking-tight">
								Área Editorial
							</h2>
							<p className="text-muted-foreground mt-2 text-pretty">Ferramentas de gestão do fluxo editorial.</p>
						</div>

						<Separator className="my-6" />

						<div className="grid md:grid-cols-2 gap-5">
							<div className="p-8 border-2 border-foreground bg-card flex flex-col">
								<div className="size-12 border border-border bg-muted flex items-center justify-center mb-6 shrink-0">
									<Dashboard className="size-6 text-foreground" aria-hidden="true" />
								</div>
								<h3 className="font-semibold text-xl mb-2">Dashboard Editorial</h3>
								<p className="text-muted-foreground mb-6 flex-1 text-pretty leading-relaxed">
									Gerencie submissões, atribua revisores e tome decisões sobre artigos.
								</p>
								<Button
									nativeButton={false}
									render={
										<Link to="/journal/editorial/dashboard" aria-label="Acessar dashboard editorial">
											Acessar Dashboard →
										</Link>
									}
									variant="default"
									className="self-start"
								/>
							</div>

							<div className="p-8 border border-border bg-card">
								<h3 className="font-semibold text-base mb-4">Estatísticas Rápidas</h3>
								<div className="divide-y divide-border">
									<div className="flex items-center justify-between py-3">
										<span className="text-sm text-muted-foreground">Aguardando Decisão</span>
										<span className="font-semibold tabular-nums">—</span>
									</div>
									<div className="flex items-center justify-between py-3">
										<span className="text-sm text-muted-foreground">Em Revisão</span>
										<span className="font-semibold tabular-nums">—</span>
									</div>
									<div className="flex items-center justify-between py-3">
										<span className="text-sm text-muted-foreground">Publicados este mês</span>
										<span className="font-semibold tabular-nums">—</span>
									</div>
								</div>
								<p className="text-xs text-muted-foreground mt-4">Estatísticas disponíveis no dashboard</p>
							</div>
						</div>
					</section>
				)}

				{/* ── Sobre o sistema ─────────────────────────────────────────────── */}
				<section aria-label="Sobre o sistema">
					<Separator className="mb-12 md:mb-14" />

					<div className="flex flex-col sm:flex-row gap-8 items-start sm:items-center">
						<div className="border border-border bg-muted p-4 shrink-0">
							<OpenBook className="h-7 w-7 text-foreground" aria-hidden="true" />
						</div>

						<div className="flex-1">
							<p className="text-label text-muted-foreground mb-2">Sobre o Sistema</p>
							<p className="text-sm text-muted-foreground text-pretty leading-relaxed max-w-2xl">
								Sistema completo de gestão de publicações científicas com suporte a submissões bilíngues (PT/EN), revisão por pares, gestão de DOI e integração
								com Crossref.{!isAuthenticated && " Para começar, faça login e complete seu perfil."}
							</p>
						</div>

						{!isAuthenticated && (
							<Button
								nativeButton={false}
								render={
									<Link to="/auth" aria-label="Fazer login no portal">
										Fazer Login
									</Link>
								}
								variant="outline"
								className="shrink-0"
							/>
						)}
					</div>
				</section>
			</div>
		</div>
	)
}
