import type { Piece, PieceItemWithPiece } from "@iefa/database/rumaer"
import { useMutation } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { type ReactElement, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatPieceName, OBRIGATORIEDADE_LABELS, OBRIGATORIEDADE_ORDER, TIPO_PECA_LABELS } from "@/lib/uniforms/labels"
import { addPieceToVariantsFn } from "@/server/admin.fn"

/** Alvo selecionável: uma variante de uniforme. `group` opcional agrupa por uniforme. */
export type BulkTarget = { id: string; label: string; group?: string }

/**
 * Modal "Adicionar peça em lote": escolhe UMA peça (+ item concreto, obrigatoriedade,
 * observação) e a anexa à composição das variantes marcadas. Reutilizável tanto para
 * as variantes de um uniforme quanto para todas as variantes (dashboard).
 */
export function BulkAddPieceDialog({
	trigger,
	targets,
	pieces,
	pieceItems,
	onChanged,
	title = "Adicionar peça em lote",
	description,
}: {
	trigger: ReactElement
	targets: BulkTarget[]
	pieces: Piece[]
	pieceItems: PieceItemWithPiece[]
	onChanged: () => Promise<unknown>
	title?: string
	description?: string
}) {
	const [open, setOpen] = useState(false)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger} />
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description && <DialogDescription>{description}</DialogDescription>}
				</DialogHeader>
				{open && (
					<BulkAddPieceForm
						targets={targets}
						pieces={pieces}
						pieceItems={pieceItems}
						onDone={async () => {
							await onChanged()
							setOpen(false)
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	)
}

function BulkAddPieceForm({
	targets,
	pieces,
	pieceItems,
	onDone,
}: {
	targets: BulkTarget[]
	pieces: Piece[]
	pieceItems: PieceItemWithPiece[]
	onDone: () => Promise<void>
}) {
	const [pieceId, setPieceId] = useState<string | null>(null)
	const [pieceItemId, setPieceItemId] = useState<string | null>(null)
	const [obrigatoriedade, setObrigatoriedade] = useState<(typeof OBRIGATORIEDADE_ORDER)[number]>("obrigatorio")
	const [observacao, setObservacao] = useState("")
	const [selected, setSelected] = useState<Set<string>>(() => new Set(targets.map((t) => t.id)))

	// Mantém a seleção coerente se a lista de alvos mudar (ex.: variante criada).
	useEffect(() => {
		setSelected((prev) => {
			const ids = new Set(targets.map((t) => t.id))
			return new Set([...prev].filter((id) => ids.has(id)))
		})
	}, [targets])

	const itemsForPiece = pieceId ? pieceItems.filter((it) => it.piece_id === pieceId) : []
	const allSelected = selected.size === targets.length

	// Opções ordenadas alfabeticamente; label inclui código/tipo para serem pesquisáveis.
	const pieceOptions = useMemo(
		() =>
			[...pieces]
				.sort((a, b) => formatPieceName(a.nome).localeCompare(formatPieceName(b.nome), "pt-BR"))
				.map((p) => ({
					value: p.id,
					label: `${p.codigo ? `${p.codigo} · ` : ""}${formatPieceName(p.nome)}${p.tipo ? ` · ${TIPO_PECA_LABELS[p.tipo]}` : ""}`,
				})),
		[pieces]
	)
	const itemOptions = useMemo(
		() => [...itemsForPiece].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((it) => ({ value: it.id, label: it.nome })),
		[itemsForPiece]
	)

	// Agrupa por `group` preservando a ordem de chegada; sem groups → grupo único.
	const groups = useMemo(() => {
		const map = new Map<string, BulkTarget[]>()
		for (const t of targets) {
			const key = t.group ?? ""
			const arr = map.get(key)
			if (arr) arr.push(t)
			else map.set(key, [t])
		}
		return [...map.entries()]
	}, [targets])

	const toggle = (id: string) =>
		setSelected((s) => {
			const next = new Set(s)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const toggleGroup = (items: BulkTarget[]) =>
		setSelected((s) => {
			const next = new Set(s)
			const allOn = items.every((t) => next.has(t.id))
			for (const t of items) {
				if (allOn) next.delete(t.id)
				else next.add(t.id)
			}
			return next
		})

	const add = useMutation({
		mutationFn: () => {
			if (!pieceId) throw new Error("Selecione a peça")
			const variantIds = targets.filter((t) => selected.has(t.id)).map((t) => t.id)
			if (variantIds.length === 0) throw new Error("Selecione ao menos uma variante")
			return addPieceToVariantsFn({
				data: { variantIds, piece_id: pieceId, piece_item_id: pieceItemId, obrigatoriedade, observacao: observacao || null },
			})
		},
		onSuccess: async (res) => {
			toast.success(`Peça adicionada a ${res.count} variante(s)`)
			await onDone()
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
	})

	return (
		<div className="flex flex-col gap-4">
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<FormField label="Peça">
					<Combobox
						items={pieceOptions}
						value={pieceId}
						onValueChange={(v) => {
							setPieceId(v)
							setPieceItemId(null)
						}}
						placeholder="Buscar peça…"
						emptyText="Nenhuma peça encontrada."
					/>
				</FormField>
				<FormField label="Item concreto">
					<Combobox
						items={itemOptions}
						value={pieceItemId}
						onValueChange={setPieceItemId}
						disabled={!pieceId || itemOptions.length === 0}
						placeholder={pieceId && itemOptions.length === 0 ? "sem item concreto" : "opcional — buscar item…"}
						emptyText="Nenhum item encontrado."
					/>
				</FormField>
				<FormField label="Obrigatoriedade">
					<Select value={obrigatoriedade} onValueChange={(v) => setObrigatoriedade(v as typeof obrigatoriedade)}>
						<SelectTrigger>
							<SelectValue>{OBRIGATORIEDADE_LABELS[obrigatoriedade]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{OBRIGATORIEDADE_ORDER.map((o) => (
								<SelectItem key={o} value={o}>
									{OBRIGATORIEDADE_LABELS[o]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormField>
				<FormField label="Observação">
					<Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="opcional" />
				</FormField>
			</div>

			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-3">
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Variantes ({selected.size} de {targets.length})
					</span>
					<button
						type="button"
						onClick={() => setSelected(allSelected ? new Set() : new Set(targets.map((t) => t.id)))}
						className="text-xs font-medium text-muted-foreground hover:text-foreground"
					>
						{allSelected ? "Desmarcar todas" : "Marcar todas"}
					</button>
				</div>

				<div className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto pr-1">
					{groups.map(([groupLabel, items]) => (
						<div key={groupLabel || "__"} className="flex flex-col gap-1.5">
							{groupLabel && (
								<button
									type="button"
									onClick={() => toggleGroup(items)}
									className="text-xs font-semibold text-foreground/80 hover:text-foreground w-fit"
									title="Alternar todas deste uniforme"
								>
									{groupLabel}
								</button>
							)}
							<div className="flex flex-wrap gap-2">
								{items.map((t) => {
									const on = selected.has(t.id)
									return (
										<button
											key={t.id}
											type="button"
											onClick={() => toggle(t.id)}
											className={`border rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}
										>
											{t.label}
										</button>
									)
								})}
							</div>
						</div>
					))}
				</div>
			</div>

			<DialogFooter>
				<DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
				<Button onClick={() => add.mutate()} disabled={!pieceId || selected.size === 0 || add.isPending}>
					<Plus className="size-4" />
					Adicionar a {selected.size} variante(s)
				</Button>
			</DialogFooter>
		</div>
	)
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
			{children}
		</div>
	)
}
