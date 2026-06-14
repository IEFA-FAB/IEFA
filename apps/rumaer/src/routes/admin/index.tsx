import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { Pencil, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { uniformsQueryOptions } from "@/lib/uniforms/hooks"
import { GRUPO_LABELS, GRUPO_ORDER, uniformTitle } from "@/lib/uniforms/labels"
import { upsertUniformFn } from "@/server/admin.fn"

export const Route = createFileRoute("/admin/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(uniformsQueryOptions({})),
	component: AdminDashboard,
})

type Grupo = (typeof GRUPO_ORDER)[number]

function AdminDashboard() {
	const { data: uniforms } = useSuspenseQuery(uniformsQueryOptions({}))
	const queryClient = useQueryClient()
	const router = useRouter()

	const [nome, setNome] = useState("")
	const [grupo, setGrupo] = useState<Grupo | null>(null)

	const create = useMutation({
		mutationFn: () => upsertUniformFn({ data: { nome: nome.trim(), grupo: grupo as Grupo } }),
		onSuccess: async (row) => {
			toast.success("Uniforme criado")
			setNome("")
			setGrupo(null)
			await queryClient.invalidateQueries({ queryKey: ["rumaer", "uniforms"] })
			router.navigate({ to: "/admin/uniformes/$uniformId", params: { uniformId: row.id } })
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar"),
	})

	return (
		<div className="flex flex-col gap-8">
			<header className="flex items-center justify-between gap-4">
				<div>
					<h1 className="font-serif text-3xl font-bold tracking-tight">Administração</h1>
					<p className="text-sm text-muted-foreground">Cadastro de uniformes, variantes, composições e peças.</p>
				</div>
				<Button nativeButton={false} render={<Link to="/admin/pecas">Catálogo de peças</Link>} variant="outline" />
			</header>

			<section className="flex flex-col gap-3 border border-border p-4">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Novo uniforme</h2>
				<div className="flex flex-col sm:flex-row gap-3 sm:items-end">
					<div className="flex flex-col gap-1.5 flex-1">
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome</span>
						<Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: 5º Uniforme A" />
					</div>
					<div className="flex flex-col gap-1.5 min-w-48">
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grupo</span>
						<Select value={grupo ?? null} onValueChange={(v) => setGrupo(v as Grupo)}>
							<SelectTrigger>
								<SelectValue placeholder="Selecione…">{grupo ? GRUPO_LABELS[grupo] : undefined}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{GRUPO_ORDER.map((g) => (
									<SelectItem key={g} value={g}>
										{GRUPO_LABELS[g]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button onClick={() => create.mutate()} disabled={!nome.trim() || !grupo || create.isPending}>
						<Plus className="size-4" />
						Criar
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{uniforms.length} uniforme(s)</h2>
				<ul className="flex flex-col divide-y divide-border border border-border">
					{uniforms.map((u) => (
						<li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
							<div className="flex items-center gap-3">
								<Badge variant="outline">{GRUPO_LABELS[u.grupo]}</Badge>
								<span className="text-sm font-medium">{uniformTitle(u)}</span>
								<span className="text-xs text-muted-foreground">{u.traje}</span>
							</div>
							<Button
								nativeButton={false}
								variant="ghost"
								size="sm"
								render={
									<Link to="/admin/uniformes/$uniformId" params={{ uniformId: u.id }}>
										<Pencil className="size-4" />
										Editar
									</Link>
								}
							/>
						</li>
					))}
				</ul>
			</section>
		</div>
	)
}
