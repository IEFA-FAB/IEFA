import type { Genero, Piece } from "@iefa/database/rumaer"
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { pieceItemsQueryOptions, piecesQueryOptions } from "@/lib/uniforms/hooks"
import { formatPieceName, GENERO_LABELS, pieceItemAttrs, TIPO_PECA_LABELS } from "@/lib/uniforms/labels"
import { deletePieceItemFn, upsertPieceItemFn } from "@/server/admin.fn"

const GENEROS = Object.keys(GENERO_LABELS) as Genero[]

export const Route = createFileRoute("/admin/itens/")({
	loader: async ({ context }) => {
		await Promise.all([context.queryClient.ensureQueryData(piecesQueryOptions()), context.queryClient.ensureQueryData(pieceItemsQueryOptions())])
	},
	component: PieceItemsAdmin,
})

const EMPTY_FORM = {
	piece_id: null as string | null,
	nome: "",
	tamanho: "",
	cor: "",
	posto: "",
	quadro: "",
	especialidade: "",
	genero: null as Genero | null,
}

function PieceItemsAdmin() {
	const { data: pieces } = useSuspenseQuery(piecesQueryOptions())
	const { data: items } = useSuspenseQuery(pieceItemsQueryOptions())
	const queryClient = useQueryClient()

	const [form, setForm] = useState(EMPTY_FORM)
	const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rumaer", "piece-items"] })

	const create = useMutation({
		mutationFn: () =>
			upsertPieceItemFn({
				data: {
					piece_id: form.piece_id as string,
					nome: form.nome.trim(),
					tamanho: form.tamanho.trim() || null,
					cor: form.cor.trim() || null,
					posto: form.posto.trim() || null,
					quadro: form.quadro.trim() || null,
					especialidade: form.especialidade.trim() || null,
					genero: form.genero,
				},
			}),
		onSuccess: async () => {
			toast.success("Item criado")
			setForm((f) => ({ ...EMPTY_FORM, piece_id: f.piece_id })) // mantém peça-pai p/ cadastro em série
			await invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	const remove = useMutation({
		mutationFn: (id: string) => deletePieceItemFn({ data: { id } }),
		onSuccess: async () => {
			toast.success("Item removido")
			await invalidate()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	// Agrupa itens pela peça-pai para leitura.
	const grouped = useMemo(() => {
		const map = new Map<string, { piece: Piece; items: typeof items }>()
		for (const it of items) {
			const g = map.get(it.piece_id) ?? { piece: it.piece, items: [] as typeof items }
			g.items.push(it)
			map.set(it.piece_id, g)
		}
		return [...map.values()].sort((a, b) => a.piece.nome.localeCompare(b.piece.nome))
	}, [items])

	// Opções de peça ordenadas alfabeticamente; label inclui tipo (pesquisável no combobox).
	const pieceComboItems = useMemo(
		() =>
			[...pieces]
				.map((p) => ({ value: p.id, label: `${formatPieceName(p.nome)}${p.tipo ? ` · ${TIPO_PECA_LABELS[p.tipo]}` : ""}` }))
				.sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
		[pieces]
	)

	return (
		<div className="flex flex-col gap-8">
			<Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
				<ArrowLeft className="size-4" />
				Administração
			</Link>

			<header>
				<h1 className="font-serif text-3xl font-bold tracking-tight">Itens de venda</h1>
				<p className="text-sm text-muted-foreground">
					Variantes compráveis de cada peça — ex.: <em>Sapato 43</em>, <em>Platina de Capitão Intendente</em>. A peça abstrata (sapato, platina) vive no
					catálogo de peças.
				</p>
			</header>

			<section className="flex flex-col gap-3 border border-border rounded-lg p-4">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Novo item</h2>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					<LabeledField label="Peça (item do uniforme)">
						<Combobox
							items={pieceComboItems}
							value={form.piece_id}
							onValueChange={(v) => setField("piece_id", v)}
							placeholder="Buscar peça…"
							emptyText="Nenhuma peça encontrada."
						/>
					</LabeledField>
					<LabeledField label="Nome do item">
						<Input value={form.nome} onChange={(e) => setField("nome", e.target.value)} placeholder="Ex.: Platina de Capitão Intendente" />
					</LabeledField>
					<LabeledField label="Tamanho">
						<Input value={form.tamanho} onChange={(e) => setField("tamanho", e.target.value)} placeholder="43 / P / M / G" />
					</LabeledField>
					<LabeledField label="Cor">
						<Input value={form.cor} onChange={(e) => setField("cor", e.target.value)} placeholder="preta / branca" />
					</LabeledField>
					<LabeledField label="Posto">
						<Input value={form.posto} onChange={(e) => setField("posto", e.target.value)} placeholder="capitão" />
					</LabeledField>
					<LabeledField label="Quadro">
						<Input value={form.quadro} onChange={(e) => setField("quadro", e.target.value)} placeholder="intendente" />
					</LabeledField>
					<LabeledField label="Especialidade">
						<Input value={form.especialidade} onChange={(e) => setField("especialidade", e.target.value)} placeholder="combate" />
					</LabeledField>
					<LabeledField label="Gênero">
						<Select value={form.genero} onValueChange={(v) => setField("genero", v as Genero)}>
							<SelectTrigger>
								<SelectValue placeholder="—">{form.genero ? GENERO_LABELS[form.genero] : undefined}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{GENEROS.map((g) => (
									<SelectItem key={g} value={g}>
										{GENERO_LABELS[g]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</LabeledField>
				</div>

				<div className="flex justify-end">
					<Button onClick={() => create.mutate()} disabled={!form.piece_id || !form.nome.trim() || create.isPending}>
						<Plus className="size-4" />
						Criar item
					</Button>
				</div>
			</section>

			<section className="flex flex-col gap-4">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					{items.length} item(ns) em {grouped.length} peça(s)
				</h2>
				{grouped.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
				) : (
					grouped.map(({ piece, items: groupItems }) => (
						<div key={piece.id} className="flex flex-col gap-2 border border-border rounded-lg p-4">
							<div className="flex items-center gap-2">
								<Badge variant="outline">{piece.tipo ? TIPO_PECA_LABELS[piece.tipo] : "Sem tipo"}</Badge>
								<span className="text-sm font-semibold">{formatPieceName(piece.nome)}</span>
								<span className="text-xs text-muted-foreground">{groupItems.length} item(ns)</span>
							</div>
							<ul className="flex flex-col divide-y divide-border">
								{groupItems.map((it) => (
									<li key={it.id} className="flex items-center justify-between gap-3 py-2">
										<div className="flex flex-wrap items-center gap-2">
											<span className="text-sm font-medium">{it.nome}</span>
											{pieceItemAttrs(it).map((a) => (
												<Badge key={a.label} variant="secondary" className="font-normal">
													{a.label} {a.value}
												</Badge>
											))}
										</div>
										<Button variant="ghost" size="sm" onClick={() => remove.mutate(it.id)} disabled={remove.isPending}>
											<Trash2 className="size-4" />
										</Button>
									</li>
								))}
							</ul>
						</div>
					))
				)}
			</section>
		</div>
	)
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
			{children}
		</div>
	)
}
