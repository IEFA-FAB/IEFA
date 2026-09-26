import { AlertTriangle, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMenuItemSubstituteOptions, useRecordMenuSubstitution } from "@/hooks/data/usePlanningAdjustments"
import { cn } from "@/lib/cn"
import { type SnapshotIngredientLine, type SubstitutionEntry, snapshotIngredientLines } from "@/lib/menu-substitutions"
import type { MenuItem } from "@/types/domain/planning"

interface SubstitutionModalProps {
	open: boolean
	onClose: () => void
	menuItem: MenuItem | null
}

/**
 * Faltou um insumo: registra o que entrou no lugar DENTRO da preparação deste dia. A ficha
 * técnica não muda — o registro fica no item e é o que a Produção Cozinha mostra ao turno.
 *
 * Os substitutos que a ficha já prevê aparecem primeiro, a um clique; o que não está previsto
 * se digita. Antes o seletor vinha desligado e a lista lia o snapshot num formato que ele não
 * tem ("Insumo Inexistente" em todo insumo) — a substituição acontecia no caderno.
 */
export function SubstitutionModal({ open, onClose, menuItem }: SubstitutionModalProps) {
	const [line, setLine] = useState<SnapshotIngredientLine | null>(null)
	const [substituteId, setSubstituteId] = useState<string | null>(null)
	const [substituteName, setSubstituteName] = useState("")
	const [rationale, setRationale] = useState("")
	const { mutate: recordSubstitution, isPending } = useRecordMenuSubstitution()
	const { data: options } = useMenuItemSubstituteOptions(open ? (menuItem?.id ?? null) : null)

	useEffect(() => {
		if (!open) return
		setLine(null)
		setSubstituteId(null)
		setSubstituteName("")
		setRationale("")
	}, [open])

	const recipeName = (menuItem?.recipe as { name?: string } | null)?.name ?? "Preparação"
	const lines = snapshotIngredientLines(menuItem?.recipe)
	const existing = (menuItem?.substitutions as Record<string, SubstitutionEntry> | null) ?? {}
	const suggestions = line ? (options?.[line.lineId] ?? []) : []

	const canSave = line != null && substituteName.trim() !== "" && rationale.trim() !== ""

	const handleSave = () => {
		if (!menuItem || !line || !canSave) return
		// Merge atômico no servidor: o turno pode ter registrado outro substituto neste item.
		recordSubstitution(
			{
				menuItemId: menuItem.id,
				ingredientId: line.ingredientId,
				substituteIngredientId: substituteId,
				substituteDescription: substituteName.trim(),
				rationale: rationale.trim(),
			},
			{ onSuccess: onClose }
		)
	}

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Substituir insumo</DialogTitle>
					<DialogDescription>{recipeName}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
						<AlertTriangle className="mt-0.5 size-4 shrink-0" />
						<p>Vale só para este dia. A ficha técnica da preparação não muda.</p>
					</div>

					<Field>
						<FieldLabel>Qual insumo faltou?</FieldLabel>
						<ScrollArea className="h-44 rounded-md border p-2">
							{lines.length === 0 ? (
								<p className="p-4 text-center text-sm text-muted-foreground">Esta preparação não tem insumos na ficha gravada no dia.</p>
							) : (
								<div className="space-y-1.5">
									{lines.map((l) => {
										const done = existing[l.ingredientId]?.substitute_description
										return (
											<button
												key={l.lineId}
												type="button"
												aria-pressed={line?.lineId === l.lineId}
												className={cn("w-full rounded border p-2 text-left hover:bg-accent", line?.lineId === l.lineId && "border-primary bg-primary/5")}
												onClick={() => {
													setLine(l)
													setSubstituteId(null)
													setSubstituteName("")
												}}
											>
												<div className="flex justify-between gap-2 text-sm">
													<span className="text-subheading">{l.name}</span>
													<span className="shrink-0 text-muted-foreground tabular-nums">{l.quantityLabel}</span>
												</div>
												{done && <p className="text-xs text-muted-foreground">Substituído por {done}</p>}
											</button>
										)
									})}
								</div>
							)}
						</ScrollArea>
					</Field>

					{line && (
						<Field>
							<FieldLabel htmlFor="substitute-name">O que entrou no lugar de {line.name}?</FieldLabel>
							{suggestions.length > 0 && (
								<div className="flex flex-wrap gap-1.5">
									{suggestions.map((s) => (
										<Button
											key={`${s.kind}-${s.id}`}
											type="button"
											size="xs"
											variant={substituteName === (s.description ?? "") ? "default" : "outline"}
											onClick={() => {
												// Só insumo do catálogo vira id; preparação congelada vai pelo nome.
												setSubstituteId(s.kind === "ingredient" ? s.id : null)
												setSubstituteName(s.description ?? "")
											}}
										>
											{s.description}
											{s.kind === "frozen_preparation" ? " (congelada)" : ""}
										</Button>
									))}
								</div>
							)}
							<Input
								id="substitute-name"
								value={substituteName}
								onChange={(e) => {
									setSubstituteName(e.target.value)
									setSubstituteId(null)
								}}
								placeholder="Ex.: Polpa de acerola"
								maxLength={200}
							/>
							<FieldDescription>
								{suggestions.length > 0
									? "Substitutos previstos na ficha acima; ou digite outro."
									: "A ficha não prevê substituto para este insumo — digite o que foi usado."}
							</FieldDescription>
						</Field>
					)}

					<Field>
						<FieldLabel htmlFor="substitute-rationale">Motivo</FieldLabel>
						<Input
							id="substitute-rationale"
							value={rationale}
							onChange={(e) => setRationale(e.target.value)}
							placeholder="Ex.: Produto em falta no fornecedor"
						/>
					</Field>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button onClick={handleSave} disabled={isPending || !canSave}>
						{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
						Registrar substituição
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
