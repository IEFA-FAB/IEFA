import { Badge, Button, Card, CardContent, CardFooter, CardHeader } from "@iefa/ui"
import { Link } from "@tanstack/react-router"
import { ExternalLink, Github, User } from "lucide-react"
import type { AppItem } from "@/types/domain"

export function AppCard({ app }: { app: AppItem }) {
	const isExternal = app.external && !!app.href

	return (
		<Card className="group flex h-full flex-col border border-border bg-card text-card-foreground transition-all hover:border-primary/40 hover:shadow-lg focus-within:ring-2 focus-within:ring-primary/40">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 mt-0">
				<div className="flex items-center gap-2">
					<span aria-hidden="true" className="text-primary">
						{app.icon}
					</span>
					<h3 className="text-lg font-semibold leading-tight">{app.title}</h3>
				</div>
				{isExternal ? (
					<Badge variant="secondary" className="gap-1">
						Externo <ExternalLink className="h-3 w-3" aria-hidden="true" />
					</Badge>
				) : null}
			</CardHeader>

			<CardContent className="flex-1 space-y-3 w-full">
				<p className="text-sm sm:text-base text-muted-foreground text-pretty">{app.description}</p>

				{app.badges && app.badges.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{app.badges.map((b, _idx) => (
							<Badge key={b} variant="outline">
								{b}
							</Badge>
						))}
					</div>
				) : null}

				{app.contributors && app.contributors.length > 0 ? (
					<div className="pt-1">
						<div className="text-xs font-medium tracking-wide text-foreground">
							{app.contributors.length > 1 ? "Contribuidores" : "Contribuição"}
						</div>
						<ul className="mt-2 flex flex-row gap-x-8 gap-y-1.5">
							{app.contributors.map((c, idx) => {
								const isGithub = c.url?.includes("github.com")
								const iconEl =
									c.icon ??
									(isGithub ? (
										<Github className="h-4 w-4" aria-hidden="true" />
									) : (
										<User className="h-4 w-4" aria-hidden="true" />
									))

								return (
									<li key={`${c.label}-${idx}`} className="flex items-center gap-2">
										<span className="text-muted-foreground" aria-hidden="true">
											{iconEl}
										</span>

										{c.url ? (
											<a
												href={c.url}
												target="_blank"
												rel="noreferrer noopener"
												className="inline-flex items-center gap-1.5 text-sm hover:underline underline-offset-4"
												aria-label={`Abrir perfil de ${c.label} em nova aba`}
											>
												<span>{c.label}</span>
												<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
											</a>
										) : (
											<span className="text-sm text-muted-foreground">{c.label}</span>
										)}
									</li>
								)
							})}
						</ul>
					</div>
				) : null}
			</CardContent>

			<CardFooter className="mb-0">
				{app.to ? (
					<Button
						render={<Link to={app.to}>Abrir</Link>}
						className="w-full"
						aria-label={`Abrir ${app.title}`}
					/>
				) : app.href ? (
					<Button
						render={
							<a
								href={app.href}
								target={isExternal ? "_blank" : undefined}
								rel={isExternal ? "noreferrer noopener" : undefined}
							>
								Acessar
								{isExternal ? <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" /> : null}
							</a>
						}
						className="w-full"
						aria-label={`Acessar ${app.title}`}
					/>
				) : null}
			</CardFooter>
		</Card>
	)
}
