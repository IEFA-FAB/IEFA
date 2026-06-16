import type { TipoPeca } from "@iefa/database/rumaer"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { piecesQueryOptions } from "@/lib/uniforms/hooks"
import { formatPieceName, TIPO_PECA_LABELS } from "@/lib/uniforms/labels"
import { deletePieceFn, upsertPieceFn } from "@/server/admin.fn"

const TIPOS = Object.keys(TIPO_PECA_LABELS) as TipoPeca[]

function slugify(s: string) {
	return s
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
}

export const Route = createFileRoute("/admin/pecas/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(piecesQueryOptions()),
	component: PiecesAdmin,
})

function PiecesAdmin() {
	const { data: pieces } = useSuspenseQuery(piecesQueryOptions())
	const queryClient = useQueryClient()

	const [showForm, setShowForm] = useState(false)
	const [nome, setNome] = useState("")
	const [tipo, setTipo] = useState<TipoPeca | null>(null)
	const [codigo, setCodigo] = useState("")

	const [editingId, setEditingId] = useState<string | null>(null)
	const [editNome, setEditNome] = useState("")
	const [editCodigo, setEditCodigo] = useState("")
	const [editTipo, setEditTipo] = useState<TipoPeca | null>(null)

	// Busca + filtro por tipo
	const [query, setQuery] = useState("")
	const [tipoFilter, setTipoFilter] = useState<TipoPeca | "all" | "none">("all")

	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rumaer", "pieces"] })

	// Lista filtrada e ordenada alfabeticamente.
	const filtered = useMemo(() => {
		const term = query.trim().toLowerCase()
		return [...pieces]
			.filter((p) => {
				if (tipoFilter === "none" && p.tipo) return false
				if (tipoFilter !== "all" && tipoFilter !== "none" && p.tipo !== tipoFilter) return false
				if (!term) return true
				const hay = [formatPieceName(p.nome), p.codigo ?? "", p.slug, p.tipo ? TIPO_PECA_LABELS[p.tipo] : "sem tipo"].join(" ").toLowerCase()
				return hay.includes(term)
			})
			.sort((a, b) => formatPieceName(a.nome).localeCompare(formatPieceName(b.nome), "pt-BR"))
	}, [pieces, query, tipoFilter])

	const create = useMutation({
		mutationFn: () => upsertPieceFn({ data: { nome: nome.trim(), slug: slugify(nome), tipo, codigo: codigo.trim() || null } }),
		onSuccess: async () => {
			toast.success("Peça criada")
			setNome("")
			setTipo(null)
			setCodigo("")
			await invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	const rename = useMutation({
		mutationFn: (vars: { id: string; slug: string; tipo: TipoPeca | null; nome: string; codigo: string | null }) =>
			upsertPieceFn({ data: { id: vars.id, nome: vars.nome.trim(), slug: vars.slug, tipo: vars.tipo, codigo: vars.codigo } }),
		onSuccess: async () => {
			toast.success("Peça atualizada")
			setEditingId(null)
			setEditNome("")
			setEditCodigo("")
			setEditTipo(null)
			await invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	const remove = useMutation({
		mutationFn: (id: string) => deletePieceFn({ data: { id } }),
		onSuccess: async () => {
			toast.success("Peça removida")
			await invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	return (
		<div className="flex flex-col gap-8">
			<Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
				<ArrowLeft className="size-4" />
				Administração
			</Link>

			<header className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-serif text-3xl font-bold tracking-tight">Catálogo de peças</h1>
					<p className="text-sm text-muted-foreground">Peças, insígnias, distintivos e identificações usados nas composições.</p>
				</div>
				<Button variant={showForm ? "outline" : "default"} onClick={() => setShowForm((v) => !v)}>
					{showForm ? <X className="size-4" /> : <Plus className="size-4" />}
					{showForm ? "Fechar" : "Nova peça"}
				</Button>
			</header>

			{showForm && (
				<section className="flex flex-col gap-3 border border-border rounded-lg p-4">
					<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Nova peça</h2>
					<div className="flex flex-col sm:flex-row gap-3 sm:items-end">
						<div className="flex flex-col gap-1.5 flex-1">
							<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome</span>
							<Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Quepe" />
						</div>
						<div className="flex flex-col gap-1.5 sm:w-40">
							<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Código (opcional)</span>
							<Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="FAB-V-001" className="font-mono" />
						</div>
						<div className="flex flex-col gap-1.5 min-w-48">
							<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo (opcional)</span>
							<Select value={tipo ?? null} onValueChange={(v) => setTipo(v as TipoPeca)}>
								<SelectTrigger>
									<SelectValue placeholder="Selecione…">{tipo ? TIPO_PECA_LABELS[tipo] : undefined}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{TIPOS.map((t) => (
										<SelectItem key={t} value={t}>
											{TIPO_PECA_LABELS[t]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button onClick={() => create.mutate()} disabled={!nome.trim() || create.isPending}>
							<Plus className="size-4" />
							Criar
						</Button>
					</div>
				</section>
			)}

			<section className="flex flex-col gap-3">
				<div className="flex flex-col sm:flex-row gap-3 sm:items-end">
					<div className="flex flex-col gap-1.5 flex-1">
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buscar</span>
						<div className="flex items-center gap-2 rounded-lg border border-input bg-card px-3 shadow-xs focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30">
							<Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								placeholder="Nome, código, tipo…"
								aria-label="Buscar peça"
								className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5 min-w-48">
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</span>
						<Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as TipoPeca | "all" | "none")}>
							<SelectTrigger>
								<SelectValue>{tipoFilter === "all" ? "Todos os tipos" : tipoFilter === "none" ? "Sem tipo" : TIPO_PECA_LABELS[tipoFilter]}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">Todos os tipos</SelectItem>
								<SelectItem value="none">Sem tipo</SelectItem>
								{TIPOS.map((t) => (
									<SelectItem key={t} value={t}>
										{TIPO_PECA_LABELS[t]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					{filtered.length} de {pieces.length} peça(s)
				</h2>
				{filtered.length === 0 ? (
					<p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma peça encontrada.</p>
				) : (
					<ul className="flex flex-col divide-y divide-border border border-border rounded-md overflow-hidden">
						{filtered.map((p) => (
							<li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
								{editingId === p.id ? (
									<div className="flex items-center gap-2 flex-1 min-w-0">
										<Input value={editCodigo} onChange={(e) => setEditCodigo(e.target.value)} placeholder="Código" className="h-8 font-mono w-36 shrink-0" />
										<Select value={editTipo ?? null} onValueChange={(v) => setEditTipo(v as TipoPeca)}>
											<SelectTrigger className="h-8 w-44 shrink-0">
												<SelectValue placeholder="Tipo…">{editTipo ? TIPO_PECA_LABELS[editTipo] : undefined}</SelectValue>
											</SelectTrigger>
											<SelectContent>
												{TIPOS.map((t) => (
													<SelectItem key={t} value={t}>
														{TIPO_PECA_LABELS[t]}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Input
											value={editNome}
											onChange={(e) => setEditNome(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && editNome.trim())
													rename.mutate({ id: p.id, slug: p.slug, tipo: editTipo, nome: editNome, codigo: editCodigo.trim() || null })
												if (e.key === "Escape") setEditingId(null)
											}}
											placeholder="Nome"
											autoFocus
											className="h-8 w-auto flex-1 min-w-0"
										/>
									</div>
								) : (
									<div className="flex items-center gap-3 flex-1 min-w-0">
										{p.codigo ? (
											<Badge variant="secondary" className="font-mono">
												{p.codigo}
											</Badge>
										) : null}
										{p.tipo ? <Badge variant="outline">{TIPO_PECA_LABELS[p.tipo]}</Badge> : <Badge variant="outline">Sem tipo</Badge>}
										<span className="text-sm font-medium">{formatPieceName(p.nome)}</span>
										<span className="font-mono text-xs text-muted-foreground truncate">{p.slug}</span>
									</div>
								)}
								{editingId === p.id ? (
									<div className="flex items-center gap-1">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => rename.mutate({ id: p.id, slug: p.slug, tipo: editTipo, nome: editNome, codigo: editCodigo.trim() || null })}
											disabled={!editNome.trim() || rename.isPending}
										>
											<Check className="size-4" />
										</Button>
										<Button variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={rename.isPending}>
											<X className="size-4" />
										</Button>
									</div>
								) : (
									<div className="flex items-center gap-1">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												setEditingId(p.id)
												setEditNome(p.nome)
												setEditCodigo(p.codigo ?? "")
												setEditTipo(p.tipo)
											}}
										>
											<Pencil className="size-4" />
										</Button>
										<Button variant="ghost" size="sm" onClick={() => remove.mutate(p.id)} disabled={remove.isPending}>
											<Trash2 className="size-4" />
										</Button>
									</div>
								)}
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	)
}
