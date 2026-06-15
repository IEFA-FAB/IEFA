import type { TipoPeca } from "@iefa/database/rumaer"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { piecesQueryOptions } from "@/lib/uniforms/hooks"
import { TIPO_PECA_LABELS } from "@/lib/uniforms/labels"
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

	const [nome, setNome] = useState("")
	const [tipo, setTipo] = useState<TipoPeca | null>(null)

	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rumaer", "pieces"] })

	const create = useMutation({
		mutationFn: () => upsertPieceFn({ data: { nome: nome.trim(), slug: slugify(nome), tipo: tipo as TipoPeca } }),
		onSuccess: async () => {
			toast.success("Peça criada")
			setNome("")
			setTipo(null)
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

			<header>
				<h1 className="font-serif text-3xl font-bold tracking-tight">Catálogo de peças</h1>
				<p className="text-sm text-muted-foreground">Peças, insígnias, distintivos e identificações usados nas composições.</p>
			</header>

			<section className="flex flex-col gap-3 border border-border rounded-lg p-4">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Nova peça</h2>
				<div className="flex flex-col sm:flex-row gap-3 sm:items-end">
					<div className="flex flex-col gap-1.5 flex-1">
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome</span>
						<Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Quepe" />
					</div>
					<div className="flex flex-col gap-1.5 min-w-48">
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo</span>
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
					<Button onClick={() => create.mutate()} disabled={!nome.trim() || !tipo || create.isPending}>
						<Plus className="size-4" />
						Criar
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{pieces.length} peça(s)</h2>
				<ul className="flex flex-col divide-y divide-border border border-border rounded-md overflow-hidden">
					{pieces.map((p) => (
						<li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
							<div className="flex items-center gap-3">
								<Badge variant="outline">{TIPO_PECA_LABELS[p.tipo]}</Badge>
								<span className="text-sm font-medium">{p.nome}</span>
								<span className="font-mono text-xs text-muted-foreground">{p.slug}</span>
							</div>
							<Button variant="ghost" size="sm" onClick={() => remove.mutate(p.id)} disabled={remove.isPending}>
								<Trash2 className="size-4" />
							</Button>
						</li>
					))}
				</ul>
			</section>
		</div>
	)
}
