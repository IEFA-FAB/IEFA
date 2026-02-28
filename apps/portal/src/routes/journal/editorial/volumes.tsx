import { Button, Input } from "@iefa/ui"
import { createFileRoute } from "@tanstack/react-router"
import { BookOpen, Calendar, Edit, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/journal/editorial/volumes")({
	component: VolumeManagement,
})

interface Volume {
	id: string
	volume_number: number
	issue_number: number
	year: number
	published_date: string
	article_count: number
}

function VolumeManagement() {
	const [showCreateForm, setShowCreateForm] = useState(false)
	const [_editingVolume, setEditingVolume] = useState<string | null>(null)

	// Placeholder - will use volumesQueryOptions
	const volumes: Volume[] = []

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Gerenciar Volumes e Edições</h1>
					<p className="text-muted-foreground">
						Organize os artigos publicados por volume e edição
					</p>
				</div>
				<Button onClick={() => setShowCreateForm(true)}>
					<Plus className="size-4 mr-2" />
					Novo Volume/Edição
				</Button>
			</div>

			{/* Create Form */}
			{showCreateForm && (
				<div className="p-6 border rounded-lg bg-card space-y-4">
					<h3 className="font-semibold text-lg">Criar Novo Volume/Edição</h3>
					<div className="grid md:grid-cols-3 gap-4">
						<div className="space-y-2">
							<label className="text-sm font-medium" htmlFor="volume">
								Volume
							</label>
							<Input id="volume" type="number" placeholder="Ex: 1" />
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium" htmlFor="issue">
								Edição/Número
							</label>
							<Input id="issue" type="number" placeholder="Ex: 1" />
						</div>
						<div className="space-y-2">
							<label className="text-sm font-medium" htmlFor="year">
								Ano
							</label>
							<Input id="year" type="number" placeholder={new Date().getFullYear().toString()} />
						</div>
					</div>
					<div className="space-y-2">
						<label className="text-sm font-medium" htmlFor="published_date">
							Data de Publicação
						</label>
						<Input id="published_date" type="date" />
					</div>
					<div className="flex gap-3">
						<Button>Criar Volume/Edição</Button>
						<Button variant="outline" onClick={() => setShowCreateForm(false)}>
							Cancelar
						</Button>
					</div>
				</div>
			)}

			{/* Volumes Grid */}
			{volumes.length > 0 ? (
				<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
					{volumes.map((volume) => (
						<div
							key={volume.id}
							className="p-6 border rounded-lg bg-card hover:border-primary transition-colors"
						>
							<div className="flex items-start justify-between mb-4">
								<div className="flex items-center gap-3">
									<div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
										<BookOpen className="size-6 text-primary" />
									</div>
									<div>
										<h3 className="font-semibold text-lg">
											Vol. {volume.volume_number}, Nº {volume.issue_number}
										</h3>
										<p className="text-sm text-muted-foreground">Ano {volume.year}</p>
									</div>
								</div>
							</div>

							<div className="space-y-2 mb-4">
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<Calendar className="size-4" />
									Publicado em {new Date(volume.published_date).toLocaleDateString("pt-BR")}
								</div>
								<div className="flex items-center gap-2 text-sm">
									<span className="font-medium">{volume.article_count}</span>
									<span className="text-muted-foreground">
										{volume.article_count === 1 ? "artigo" : "artigos"}
									</span>
								</div>
							</div>

							<div className="flex gap-2">
								<Button
									// TODO: Implementar rota de detalhes do volume (/journal/editorial/volumes/$volumeId)
									// render={
									// 	<Link
									// 		to="/journal/editorial/volumes/$volumeId"
									// 		params={{ volumeId: volume.id }}
									// 	>
									// 		Ver Artigos
									// 	</Link>
									// }
									size="sm"
									variant="outline"
									className="flex-1"
									disabled
									title="Em breve"
								>
									Ver Artigos
								</Button>
								<Button size="sm" variant="ghost" onClick={() => setEditingVolume(volume.id)}>
									<Edit className="size-4" />
								</Button>
								<Button size="sm" variant="ghost">
									<Trash2 className="size-4 text-destructive" />
								</Button>
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="flex flex-col items-center justify-center py-16 px-4 text-center border rounded-lg bg-card">
					<div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
						<BookOpen className="size-8 text-muted-foreground" />
					</div>
					<h3 className="text-lg font-semibold mb-2">Nenhum volume criado ainda</h3>
					<p className="text-muted-foreground max-w-md mb-6">
						Crie volumes e edições para organizar os artigos publicados do seu periódico.
					</p>
					<Button onClick={() => setShowCreateForm(true)}>
						<Plus className="size-4 mr-2" />
						Criar Primeiro Volume
					</Button>
				</div>
			)}

			{/* Info */}
			<div className="p-4 bg-muted rounded-lg">
				<h3 className="font-semibold mb-2">💡 Dica</h3>
				<p className="text-sm text-muted-foreground">
					Os volumes e edições ajudam a organizar os artigos publicados cronologicamente. Cada
					artigo deve ser atribuído a um volume e edição específicos no momento da publicação.
				</p>
			</div>
		</div>
	)
}
