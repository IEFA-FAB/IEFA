import { Link } from "@tanstack/react-router"
import { GitBranch, OpenNewWindow, Star, StarSolid, User } from "iconoir-react"
import type { AppItem } from "@/types/domain"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card"

export function AppCard({ app, isFavorite, onToggleFavorite }: { app: AppItem; isFavorite?: boolean; onToggleFavorite?: (appId: string) => void }) {
	const isExternal = app.external && !!app.href
	const showFavorite = typeof onToggleFavorite === "function"

	return (
		<Card className="group flex h-full flex-col border border-border bg-card text-card-foreground transition-all hover:border-foreground hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[4px_4px_0_0_var(--foreground)] focus-within:ring-2 focus-within:ring-ring/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 mt-0">
				<div className="flex items-center gap-2">
					<span aria-hidden="true" className="text-primary">
						{app.icon}
					</span>
					<h3 className="text-lg font-semibold leading-tight">{app.title}</h3>
				</div>
				<div className="flex items-center gap-2">
					{isExternal ? (
						<Badge variant="secondary" className="gap-1">
							Externo <OpenNewWindow className="h-3 w-3" aria-hidden="true" />
						</Badge>
					) : null}
					{showFavorite ? (
						<button
							type="button"
							onClick={() => onToggleFavorite?.(app.id)}
							aria-pressed={isFavorite}
							aria-label={isFavorite ? `Remover ${app.title} dos favoritos` : `Favoritar ${app.title}`}
							title={isFavorite ? "Remover dos favoritos" : "Favoritar"}
							className="inline-flex h-8 w-8 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[fav=true]:text-foreground"
							data-fav={isFavorite ? "true" : "false"}
						>
							{isFavorite ? <StarSolid className="h-4 w-4" aria-hidden="true" /> : <Star className="h-4 w-4" aria-hidden="true" />}
						</button>
					) : null}
				</div>
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
						<div className="text-xs font-medium tracking-wide text-foreground">{app.contributors.length > 1 ? "Contribuidores" : "Contribuição"}</div>
						<ul className="mt-2 flex flex-row gap-x-8 gap-y-1.5">
							{app.contributors.map((c, idx) => {
								const isGithub = c.url?.includes("github.com")
								const iconEl = c.icon ?? (isGithub ? <GitBranch className="h-4 w-4" aria-hidden="true" /> : <User className="h-4 w-4" aria-hidden="true" />)

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
												<OpenNewWindow className="h-3.5 w-3.5" aria-hidden="true" />
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
					<Button nativeButton={false} render={<Link to={app.to}>Abrir</Link>} className="w-full" aria-label={`Abrir ${app.title}`} />
				) : app.href ? (
					<Button
						nativeButton={false}
						render={
							<a href={app.href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noreferrer noopener" : undefined}>
								Acessar
								{isExternal ? <OpenNewWindow className="ml-2 h-4 w-4" aria-hidden="true" /> : null}
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
