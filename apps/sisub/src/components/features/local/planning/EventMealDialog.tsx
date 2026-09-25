import { EVENT_MEAL_GROUP_SUGGESTIONS, MAX_EVENT_MEAL_GROUPS } from "@iefa/sisub-domain/schemas"
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type EventMealDraft, findDuplicateGroup, isSuggestionPresent, resolveGroupKeys } from "@/lib/event-meals"

/** Tetos do schema (`TemplateEventMealSchema` / `MenuGroupSchema`): acima deles o salvamento inteiro seria recusado. */
const MAX_NAME = 80
const MAX_LABEL = 60

/** Linha da composição no diálogo. `key` vazia = grupo novo, a chave sai do rótulo ao salvar. */
type DraftGroup = { key: string; label: string }

/**
 * Cria ou edita uma refeição do evento: nome, horário no calendário e composição.
 *
 * A composição é da refeição, não de um conjunto compartilhado — mudar as colunas do coquetel
 * não mexe em cardápio nenhum da semana. Por isso não há "escolha um conjunto" aqui: o
 * evento monta as colunas que precisa, com os grupos típicos de evento a um clique.
 */
export function EventMealDialog({
	open,
	onOpenChange,
	meal,
	isNew,
	mealTypes,
	countLeaving,
	onSubmit,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Refeição no diálogo — a nova já chega com id e a composição padrão. */
	meal: EventMealDraft | null
	/** Refeição ainda não está no evento — muda só os textos. */
	isNew: boolean
	/** Horários possíveis — os tipos de refeição do escopo do evento. */
	mealTypes: readonly { id: string; name: string | null }[]
	/** Quantas preparações da refeição sairiam de grupo com esta composição. */
	countLeaving: (mealId: string, groups: readonly DraftGroup[]) => number
	onSubmit: (meal: EventMealDraft) => void
}) {
	const [name, setName] = useState("")
	const [mealTypeId, setMealTypeId] = useState("")
	const [groups, setGroups] = useState<DraftGroup[]>([])

	// Reabrir o diálogo recomeça do que está gravado no rascunho do editor.
	useEffect(() => {
		if (!open || !meal) return
		setName(meal.name)
		setMealTypeId(meal.meal_type_id)
		setGroups(meal.groups.map((g) => ({ key: g.key, label: g.label })))
	}, [open, meal])

	const move = (index: number, delta: number) => {
		const target = index + delta
		if (target < 0 || target >= groups.length) return
		const next = [...groups]
		;[next[index], next[target]] = [next[target] as DraftGroup, next[index] as DraftGroup]
		setGroups(next)
	}

	// A chave só é derivada do rótulo quando o grupo é NOVO: regerá-la ao renomear tiraria de
	// grupo todas as preparações que já estavam nele.
	const resolved = resolveGroupKeys(groups)
	const hasBlank = groups.some((g) => g.label.trim() === "")
	const duplicate = findDuplicateGroup(resolved)
	const tooMany = groups.length > MAX_EVENT_MEAL_GROUPS
	const leaving = meal ? countLeaving(meal.id, resolved) : 0
	// Sugestão some quando a chave OU o rótulo já está na composição ("Bebidas" digitado esconde a sugestão "Bebidas").
	const suggestions = EVENT_MEAL_GROUP_SUGGESTIONS.filter((s) => !isSuggestionPresent(s, resolved))
	const selectedMealType = mealTypes.find((mt) => mt.id === mealTypeId)

	// `maxLength` segura a digitação; isto segura o que chega colado ou de rascunho antigo.
	const tooLong = name.trim().length > MAX_NAME || resolved.some((g) => g.label.length > MAX_LABEL)
	const canSave = meal != null && name.trim() !== "" && mealTypeId !== "" && groups.length > 0 && !hasBlank && !duplicate && !tooMany && !tooLong

	const submit = () => {
		if (!canSave || !meal) return
		onSubmit({ id: meal.id, name: name.trim(), meal_type_id: mealTypeId, groups: resolved })
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{isNew ? "Nova refeição do evento" : "Editar refeição"}</DialogTitle>
					<DialogDescription>
						As refeições do evento são dele: nome, horário e as colunas do cardápio (entradas, volantes, prato principal…) não mudam nada na rotina da cozinha.
					</DialogDescription>
				</DialogHeader>

				<form
					className="space-y-4 py-2"
					onSubmit={(e) => {
						e.preventDefault()
						submit()
					}}
				>
					<Field>
						<FieldLabel htmlFor="event-meal-name">Nome</FieldLabel>
						<Input
							id="event-meal-name"
							maxLength={MAX_NAME}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Ex.: Coquetel, Jantar de gala, Almoço de confraternização"
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor="event-meal-slot">Servida no horário de</FieldLabel>
						<Select value={mealTypeId} onValueChange={(value) => setMealTypeId(value ?? "")}>
							<SelectTrigger id="event-meal-slot">
								<SelectValue>{selectedMealType?.name ?? "Escolha o horário"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{mealTypes.map((mt) => (
									<SelectItem key={mt.id} value={mt.id}>
										{mt.name ?? "Refeição"}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<FieldDescription>
							Ao aplicar o evento no calendário, as preparações desta refeição entram no cardápio deste horário, somadas à rotina do dia.
						</FieldDescription>
					</Field>

					<Field>
						<FieldLabel>Composição, na ordem de leitura</FieldLabel>
						<div className="space-y-1.5">
							{groups.map((group, index) => (
								<div key={`${group.key}-${index}`} className="flex items-center gap-1.5">
									<span className="w-5 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
									<Input
										value={group.label}
										maxLength={MAX_LABEL}
										onChange={(e) => setGroups(groups.map((g, i) => (i === index ? { ...g, label: e.target.value } : g)))}
										placeholder="Ex.: Entradas, Volantes, Canapés"
										aria-label={`Grupo ${index + 1}`}
									/>
									<Button type="button" size="icon" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Subir grupo">
										<ArrowUp />
									</Button>
									<Button
										type="button"
										size="icon"
										variant="ghost"
										onClick={() => move(index, 1)}
										disabled={index === groups.length - 1}
										aria-label="Descer grupo"
									>
										<ArrowDown />
									</Button>
									<Button type="button" size="icon" variant="ghost" onClick={() => setGroups(groups.filter((_, i) => i !== index))} aria-label="Remover grupo">
										<X />
									</Button>
								</div>
							))}
						</div>
						<div className="flex flex-wrap items-center gap-1.5">
							{suggestions.map((s) => (
								<Button key={s.key} type="button" size="xs" variant="outline" onClick={() => setGroups([...groups, { key: s.key, label: s.label }])}>
									<Plus />
									{s.label}
								</Button>
							))}
							<Button type="button" size="xs" variant="ghost" onClick={() => setGroups([...groups, { key: "", label: "" }])}>
								<Plus />
								Outro grupo
							</Button>
						</div>
						{groups.length === 0 && <p className="text-sm text-destructive">A refeição precisa de ao menos um grupo — é nele que as preparações entram.</p>}
						{hasBlank && <p className="text-sm text-destructive">Dê um nome ao grupo em branco, ou remova a linha no ✕.</p>}
						{duplicate && <p className="text-sm text-destructive">Dois grupos com o mesmo nome ({duplicate.label}). Mude um deles.</p>}
						{tooMany && <p className="text-sm text-destructive">No máximo {MAX_EVENT_MEAL_GROUPS} grupos por refeição.</p>}
						{leaving > 0 && (
							<FieldDescription>
								{leaving} {leaving === 1 ? "preparação está num grupo removido e vai" : "preparações estão em grupos removidos e vão"} para "Sem grupo", para
								ser recolocada{leaving === 1 ? "" : "s"}.
							</FieldDescription>
						)}
					</Field>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancelar
						</Button>
						<Button type="submit" disabled={!canSave}>
							{isNew ? "Adicionar refeição" : "Salvar refeição"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
