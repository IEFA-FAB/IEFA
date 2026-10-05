import { MAX_EVENT_MEAL_GROUPS, MAX_GROUP_ITEM_COUNT } from "@iefa/sisub-domain/schemas"
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
	type EventMealDraft,
	findDuplicateGroup,
	groupSuggestionsFor,
	isGroupCountInverted,
	isSuggestionPresent,
	type OccasionGroup,
	parseEventMealHeadcount,
	parseGroupItemCount,
	resolveGroupKeys,
} from "@/lib/event-meals"
import type { OccasionMenuType } from "@/lib/occasion-menu"

/** Tetos do schema (`TemplateEventMealSchema` / `MenuGroupSchema`): acima deles o salvamento inteiro seria recusado. */
const MAX_NAME = 80
const MAX_LABEL = 60

/**
 * Linha da composição no diálogo. `key` vazia = grupo novo, a chave sai do rótulo ao salvar. A
 * contagem esperada fica como o usuário digitou até salvar.
 */
type DraftGroup = { key: string; label: string; minItems: string; maxItems: string }

function toDraftGroup(g: OccasionGroup): DraftGroup {
	return { key: g.key, label: g.label, minItems: g.minItems != null ? String(g.minItems) : "", maxItems: g.maxItems != null ? String(g.maxItems) : "" }
}

function fromDraftGroup(g: DraftGroup): OccasionGroup {
	const minItems = parseGroupItemCount(g.minItems)
	const maxItems = parseGroupItemCount(g.maxItems)
	return { key: g.key, label: g.label, ...(minItems != null && { minItems }), ...(maxItems != null && { maxItems }) }
}

/**
 * Cria ou edita uma refeição do evento ou do apoio: nome, horário no calendário e composição.
 *
 * A composição é da refeição, não de um conjunto compartilhado — mudar as colunas do coquetel
 * não mexe em cardápio nenhum da semana. Por isso não há "escolha um conjunto" aqui: o
 * cardápio monta as colunas que precisa, com os grupos típicos do regime a um clique. Cada
 * grupo pode dizer quantas preparações espera ("Proteínas 2", "Salgados 6 a 8"): o editor
 * avisa quando a contagem fica fora, sem travar.
 *
 * No apoio a refeição pode não ter grupo nenhum (o kit simples é a lista de preparações) e o
 * efetivo é o número de kits. No padrão de lanche o horário é o de sistema, fixado pelo
 * servidor, e os kits vêm do pedido.
 */
export function EventMealDialog({
	open,
	onOpenChange,
	meal,
	isNew,
	mealTypes,
	countLeaving,
	onSubmit,
	templateType = "event",
	allowBase = true,
	lockedSlotName = null,
	isSuggestedSlot = false,
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
	countLeaving: (mealId: string, groups: readonly OccasionGroup[]) => number
	onSubmit: (meal: EventMealDraft) => void
	templateType?: OccasionMenuType
	/** `false` no modelo global e no padrão de lanche: o efetivo (kits) não é deste cardápio. */
	allowBase?: boolean
	/** Padrão de lanche: o horário é o de sistema, e o campo só o mostra. */
	lockedSlotName?: string | null
	/** Modelo global: o horário é sugestão; quem decide é a cozinha, ao aplicar ou montar o evento. */
	isSuggestedSlot?: boolean
}) {
	const isSupportMenu = templateType === "apoio"
	const [name, setName] = useState("")
	const [mealTypeId, setMealTypeId] = useState("")
	const [groups, setGroups] = useState<DraftGroup[]>([])
	const [baseHeadcount, setBaseHeadcount] = useState("")

	// Reabrir o diálogo recomeça do que está gravado no rascunho do editor.
	useEffect(() => {
		if (!open || !meal) return
		setName(meal.name)
		setMealTypeId(meal.meal_type_id)
		setBaseHeadcount(meal.base_headcount != null ? String(meal.base_headcount) : "")
		setGroups(meal.groups.map(toDraftGroup))
	}, [open, meal])

	const patchGroup = (index: number, patch: Partial<DraftGroup>) => setGroups(groups.map((g, i) => (i === index ? { ...g, ...patch } : g)))

	const move = (index: number, delta: number) => {
		const target = index + delta
		if (target < 0 || target >= groups.length) return
		const next = [...groups]
		;[next[index], next[target]] = [next[target] as DraftGroup, next[index] as DraftGroup]
		setGroups(next)
	}

	// A chave só é derivada do rótulo quando o grupo é NOVO: regerá-la ao renomear tiraria de
	// grupo todas as preparações que já estavam nele.
	const resolved = resolveGroupKeys(groups.map(fromDraftGroup))
	const hasBlank = groups.some((g) => g.label.trim() === "")
	const duplicate = findDuplicateGroup(resolved)
	const tooMany = groups.length > MAX_EVENT_MEAL_GROUPS
	// Mínimo acima do máximo o servidor recusaria. Contagem FORA do esperado não trava nada.
	const invertedCount = resolved.find(isGroupCountInverted)
	const leaving = meal ? countLeaving(meal.id, resolved) : 0
	// Sugestão some quando a chave OU o rótulo já está na composição ("Bebidas" digitado esconde a sugestão "Bebidas").
	const suggestions = groupSuggestionsFor(templateType).filter((s) => !isSuggestionPresent(s, resolved))
	const selectedMealType = mealTypes.find((mt) => mt.id === mealTypeId)
	// Evento precisa de ao menos uma coluna; o apoio sem grupo é o kit simples.
	const missingGroups = !isSupportMenu && groups.length === 0

	// `maxLength` segura a digitação; isto segura o que chega colado ou de rascunho antigo.
	const tooLong = name.trim().length > MAX_NAME || resolved.some((g) => g.label.length > MAX_LABEL)
	const canSave = meal != null && name.trim() !== "" && mealTypeId !== "" && !missingGroups && !hasBlank && !duplicate && !tooMany && !tooLong && !invertedCount

	const submit = () => {
		if (!canSave || !meal) return
		onSubmit({
			id: meal.id,
			name: name.trim(),
			meal_type_id: mealTypeId,
			groups: resolved,
			// Sem o campo (global, padrão de lanche), o efetivo que já estava fica como estava.
			base_headcount: allowBase ? parseEventMealHeadcount(baseHeadcount) : meal.base_headcount,
			// Editar a refeição não apaga de qual modelo ela veio.
			source_template_id: meal.source_template_id,
		})
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{isNew ? (isSupportMenu ? "Nova refeição do apoio" : "Nova refeição do evento") : "Editar refeição"}</DialogTitle>
					<DialogDescription>
						{isSupportMenu
							? 'As refeições do apoio são dele: um kit simples é uma refeição só, sem grupos. Separe "Refeição" e "Lanche" ou marque os componentes (sanduíche, bebida…) quando o kit pedir.'
							: "As refeições do evento são dele: nome, horário e as colunas do cardápio (entradas, volantes, prato principal…) não mudam nada na rotina da cozinha."}
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
							placeholder={isSupportMenu ? "Ex.: Kit, Refeição, Lanche" : "Ex.: Coquetel, Jantar de gala, Almoço de confraternização"}
						/>
					</Field>

					<Field>
						<FieldLabel htmlFor="event-meal-slot">{isSuggestedSlot ? "Horário sugerido" : "Servida no horário de"}</FieldLabel>
						{lockedSlotName != null ? (
							<>
								<Input id="event-meal-slot" value={lockedSlotName} readOnly disabled />
								<FieldDescription>Padrão de lanche é servido no horário de sistema, onde o pedido aceito entra na produção.</FieldDescription>
							</>
						) : (
							<>
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
									{isSuggestedSlot
										? "Formato não é horário: o coquetel pode ir ao almoço ou à noite. A cozinha escolhe o horário ao aplicar ou montar o evento; este vem preenchido."
										: `Ao aplicar ${isSupportMenu ? "o apoio" : "o evento"} no calendário, as preparações desta refeição entram no cardápio deste horário, somadas à rotina do dia.`}
								</FieldDescription>
							</>
						)}
					</Field>

					{allowBase && (
						<Field>
							<FieldLabel htmlFor="event-meal-base">{isSupportMenu ? "Kits (opcional)" : "Efetivo (opcional)"}</FieldLabel>
							<Input
								id="event-meal-base"
								type="number"
								min={1}
								step={1}
								inputMode="numeric"
								value={baseHeadcount}
								onChange={(e) => setBaseHeadcount(e.target.value)}
								placeholder={isSupportMenu ? "Ex.: 40" : "Ex.: 300"}
							/>
							<FieldDescription>
								{isSupportMenu
									? "Quantos kits saem desta refeição. Cada preparação diz quantas porções vão em cada kit, ou o total de porções direto."
									: "Quantas pessoas comem nesta refeição. Cada preparação pode então pedir uma % desse efetivo — como no cardápio semanal — ou informar o número de pessoas direto."}
							</FieldDescription>
						</Field>
					)}

					<Field>
						<FieldLabel>Composição, na ordem de leitura</FieldLabel>
						<div className="space-y-1.5">
							{groups.map((group, index) => (
								<div key={`${group.key}-${index}`} className="flex items-center gap-1.5">
									<span className="w-5 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
									<Input
										value={group.label}
										maxLength={MAX_LABEL}
										onChange={(e) => patchGroup(index, { label: e.target.value })}
										placeholder={isSupportMenu ? "Ex.: Sanduíches, Bebidas" : "Ex.: Entradas, Volantes, Canapés"}
										aria-label={`Grupo ${index + 1}`}
									/>
									{/* Quantidade de preparações esperada: "de _ a _", os dois opcionais. */}
									<span className="shrink-0 text-xs text-muted-foreground">de</span>
									<Input
										type="number"
										min={0}
										max={MAX_GROUP_ITEM_COUNT}
										step={1}
										inputMode="numeric"
										className="w-14 shrink-0"
										value={group.minItems}
										onChange={(e) => patchGroup(index, { minItems: e.target.value })}
										placeholder="mín."
										aria-label={`Mínimo de preparações do grupo ${group.label || index + 1}`}
									/>
									<span className="shrink-0 text-xs text-muted-foreground">a</span>
									<Input
										type="number"
										min={0}
										max={MAX_GROUP_ITEM_COUNT}
										step={1}
										inputMode="numeric"
										className="w-14 shrink-0"
										value={group.maxItems}
										onChange={(e) => patchGroup(index, { maxItems: e.target.value })}
										placeholder="máx."
										aria-label={`Máximo de preparações do grupo ${group.label || index + 1}`}
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
								<Button
									key={s.key}
									type="button"
									size="xs"
									variant="outline"
									onClick={() => setGroups([...groups, { key: s.key, label: s.label, minItems: "", maxItems: "" }])}
								>
									<Plus />
									{s.label}
								</Button>
							))}
							<Button type="button" size="xs" variant="ghost" onClick={() => setGroups([...groups, { key: "", label: "", minItems: "", maxItems: "" }])}>
								<Plus />
								Outro grupo
							</Button>
						</div>
						<FieldDescription>
							Quantidade de preparações: de _ a _, os dois opcionais ("Proteínas de 2 a 2", "Salgados de 6 a 8"). O cardápio avisa quando a contagem fica fora,
							sem impedir o salvamento.
						</FieldDescription>
						{missingGroups && <p className="text-sm text-destructive">A refeição precisa de ao menos um grupo — é nele que as preparações entram.</p>}
						{isSupportMenu && groups.length === 0 && <FieldDescription>Sem grupos, a refeição é uma lista de preparações — o kit simples.</FieldDescription>}
						{invertedCount && (
							<p className="text-sm text-destructive">
								Em "{invertedCount.label}" o mínimo ({invertedCount.minItems}) passa do máximo ({invertedCount.maxItems}).
							</p>
						)}
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
