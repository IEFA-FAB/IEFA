import { MAX_EVENT_MEALS } from "@iefa/sisub-domain/schemas"
import { Link, type LinkOptions } from "@tanstack/react-router"
import { AlertTriangle, CalendarPlus, Copy, GitFork, Layers, ListChecks, Loader2, Plus, Printer, Save, Users } from "lucide-react"
import type { ComponentProps, MouseEvent } from "react"
import type { MealTypeInfo } from "@/components/features/local/planning/MealTypeSection"
import { MenuFindBar } from "@/components/features/local/planning/MenuFindBar"
import type { OccasionMenuCopy } from "@/components/features/local/planning/occasion-menu-editor"
import { RecipeVersionUpdateButton } from "@/components/features/local/planning/RecipeVersionUpdateDialog"
import { type AutoSaveState, AutoSaveStatus } from "@/components/features/shared/AutoSaveStatus"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { MenuMatch } from "@/lib/menu-fill"
import type { TemplateItemDraft } from "@/types/domain/planning"

/** Peças de apresentação do `OccasionMenuEditor`: recebem tudo por props, sem estado próprio. */

export function OccasionNotFound({ copy, onBack }: { copy: OccasionMenuCopy; onBack: () => void }) {
	return (
		<div className="p-8 text-center bg-destructive/10 text-destructive rounded-md">
			<p className="text-subheading">
				{copy.singular} não {copy.article === "o" ? "encontrado" : "encontrada"}.
			</p>
			<Button variant="link" size="sm" className="mt-2" onClick={onBack}>
				← Voltar para {copy.plural.toLowerCase()}
			</Button>
		</div>
	)
}

interface OccasionHeaderActionsProps {
	saveStatus: AutoSaveState
	onRetry: () => void
	outdated: ComponentProps<typeof RecipeVersionUpdateButton>["outdated"]
	onApplyVersions: ComponentProps<typeof RecipeVersionUpdateButton>["onApply"]
	printLinkOptions: LinkOptions
	onPrintClick: (e: MouseEvent<HTMLAnchorElement>) => void
	printTooltip: string
	canApplyToCalendar: boolean
	totalRecipes: number
	onOpenApply: () => void
	isGlobalScope: boolean
	isDuplicating: boolean
	hasPendingChanges: boolean
	onDuplicate: () => void
	onCancel: () => void
	isSaving: boolean
	name: string
	onSave: () => void
}

export function OccasionHeaderActions({
	saveStatus,
	onRetry,
	outdated,
	onApplyVersions,
	printLinkOptions,
	onPrintClick,
	printTooltip,
	canApplyToCalendar,
	totalRecipes,
	onOpenApply,
	isGlobalScope,
	isDuplicating,
	hasPendingChanges,
	onDuplicate,
	onCancel,
	isSaving,
	name,
	onSave,
}: OccasionHeaderActionsProps) {
	return (
		<div className="flex items-center gap-2">
			<AutoSaveStatus status={saveStatus} onRetry={onRetry} />
			<RecipeVersionUpdateButton outdated={outdated} onApply={onApplyVersions} />
			{/* A folha lê o que está GRAVADO: com edição pendente, o clique salva antes e abre a folha do
			    que foi gravado. Link de verdade, para abrir em outra aba quando não há pendência. */}
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							nativeButton={false}
							type="button"
							variant="outline"
							size="sm"
							render={
								<Link {...printLinkOptions} onClick={onPrintClick}>
									<Printer className="size-4 sm:mr-2" />
									<span className="hidden sm:inline">Imprimir</span>
								</Link>
							}
						/>
					}
				></TooltipTrigger>
				<TooltipContent>{printTooltip}</TooltipContent>
			</Tooltip>
			{/* Aplicar é materializar no calendário de UMA cozinha — não existe no catálogo.
				    Padrão de lanche não entra por aqui: a produção dele nasce do aceite do pedido, e
				    nele o número do item é porções por KIT, não efetivo do dia. */}
			{canApplyToCalendar && (
				<Button variant="outline" size="sm" disabled={totalRecipes === 0} onClick={onOpenApply}>
					<CalendarPlus className="size-4 mr-2" />
					Aplicar ao Calendário
				</Button>
			)}
			{isGlobalScope && (
				<Button
					variant="outline"
					size="sm"
					// A variante sai do que está GRAVADO: com edição ainda não salva, ela não levaria o que está na tela.
					disabled={isDuplicating || hasPendingChanges}
					title={hasPendingChanges ? "Espere o salvamento automático para duplicar." : undefined}
					onClick={onDuplicate}
				>
					<Copy className="size-4 mr-2" />
					Duplicar como variante
				</Button>
			)}
			<Button type="button" variant="outline" size="sm" onClick={onCancel}>
				Cancelar
			</Button>
			<Button size="sm" disabled={isSaving || !name.trim()} onClick={onSave}>
				{isSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
				Salvar
			</Button>
		</div>
	)
}

export function ForkNotice({ copy }: { copy: OccasionMenuCopy }) {
	return (
		<Alert>
			<GitFork className="size-4" />
			<AlertTitle>Modelo global</AlertTitle>
			<AlertDescription>
				{copy.article === "o" ? "Este" : "Esta"} {copy.noun} é do catálogo global da SDAB. Ao salvar, uma cópia local desta cozinha é criada com as suas
				alterações — o modelo global permanece intacto e as demais unidades continuam vendo o original. O salvamento automático fica desligado até lá.
			</AlertDescription>
		</Alert>
	)
}

interface OccasionMetadataCardProps {
	name: string
	description: string
	occurrences: string
	namePlaceholder: string
	showOccurrences: boolean
	isSnackStandard: boolean
	onNameChange: (value: string) => void
	onDescriptionChange: (value: string) => void
	onOccurrencesChange: (value: string) => void
}

export function OccasionMetadataCard({
	name,
	description,
	occurrences,
	namePlaceholder,
	showOccurrences,
	isSnackStandard,
	onNameChange,
	onDescriptionChange,
	onOccurrencesChange,
}: OccasionMetadataCardProps) {
	return (
		<Card>
			<CardContent>
				<FieldGroup className={showOccurrences ? "grid grid-cols-1 md:grid-cols-3 gap-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
					<Field>
						<FieldLabel htmlFor="name">
							Nome <span className="text-destructive">*</span>
						</FieldLabel>
						<Input id="name" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={namePlaceholder} required />
					</Field>
					{/* Ocorrências por mês são da cozinha: o modelo global não as tem. */}
					{showOccurrences && (
						<Field>
							<FieldLabel htmlFor="occurrences">{isSnackStandard ? "Kits por mês" : "Ocorrências/mês"}</FieldLabel>
							<Input
								id="occurrences"
								type="number"
								min={1}
								inputMode="numeric"
								value={occurrences}
								onChange={(e) => onOccurrencesChange(e.target.value)}
								placeholder={isSnackStandard ? "Ex.: 40" : "Ex.: 30"}
							/>
							{isSnackStandard && (
								<FieldDescription>
									O anexo quantitativo multiplica igual: porções por kit × kits por mês × vigência. Em branco, conta como 1 kit.
								</FieldDescription>
							)}
						</Field>
					)}
					<Field>
						<FieldLabel htmlFor="description">Descrição (opcional)</FieldLabel>
						<Input id="description" value={description} onChange={(e) => onDescriptionChange(e.target.value)} placeholder="Contexto ou observações" />
					</Field>
				</FieldGroup>
			</CardContent>
		</Card>
	)
}

/** Avisos de horário: tipo de refeição dos lanches que não carregou e refeição sem horário. */
export function OccasionSlotAlerts({
	isSnackStandard,
	snackMealTypeError,
	mealWithoutSlot,
}: {
	isSnackStandard: boolean
	snackMealTypeError: Error | null
	mealWithoutSlot: { name: string } | undefined
}) {
	return (
		<>
			{isSnackStandard && snackMealTypeError && (
				<Alert variant="destructive">
					<AlertTitle>Tipo de refeição dos lanches indisponível</AlertTitle>
					<AlertDescription>
						Não foi possível carregar o horário "Lanches de Bordo/Apoio" ({snackMealTypeError.message}). As refeições do padrão ficam nele de todo modo: o
						servidor as fixa ao salvar.
					</AlertDescription>
				</Alert>
			)}

			{mealWithoutSlot && (
				<Alert variant="destructive">
					<AlertTriangle className="size-4" />
					<AlertTitle>Refeição sem horário</AlertTitle>
					<AlertDescription>
						Escolha em que horário do calendário "{mealWithoutSlot.name}" é servida (lápis da refeição). Sem ele o cardápio não é salvo.
					</AlertDescription>
				</Alert>
			)}
		</>
	)
}

export function OccasionContentSummary({
	totalRecipes,
	mealCount,
	groupsWithContent,
	copy,
}: {
	totalRecipes: number
	mealCount: number
	groupsWithContent: number
	copy: OccasionMenuCopy
}) {
	if (!(totalRecipes > 0 || mealCount > 0)) return null
	return (
		<div className="flex items-center gap-4 text-sm text-muted-foreground px-1">
			<span>
				<strong className="text-foreground tabular-nums">{totalRecipes}</strong> {totalRecipes === 1 ? "preparação" : "preparações"}{" "}
				{copy.article === "o" ? "no" : "na"} {copy.noun}
			</span>
			{mealCount > 1 && (
				<>
					<span className="text-muted-foreground/40">·</span>
					<span>
						<strong className="text-foreground tabular-nums">{groupsWithContent}</strong>/{mealCount} refeições com preparação
					</span>
				</>
			)}
		</div>
	)
}

interface OccasionFillToolbarProps {
	items: TemplateItemDraft[]
	nameOf: (recipeId: string) => string | undefined
	sectionMealTypes: MealTypeInfo[]
	kitchenId: number | null
	onGoTo: (match: MenuMatch<TemplateItemDraft>) => void
	onReplaceAll: (keys: ReadonlySet<string>, recipeId: string) => void
	onSelectMatches: (keys: ReadonlySet<string>) => void
	showHeadcount: boolean
	onOpenHeadcount: () => void
	selectionMode: boolean
	onEnterSelection: () => void
	onExitSelection: () => void
	canAddModelMeal: boolean
	isGlobalEvent: boolean
	mealCount: number
	onOpenModelMeal: () => void
	onNewMeal: () => void
}

/** Preenchimento: localizar, quantitativo por refeição e seleção em massa. */
export function OccasionFillToolbar({
	items,
	nameOf,
	sectionMealTypes,
	kitchenId,
	onGoTo,
	onReplaceAll,
	onSelectMatches,
	showHeadcount,
	onOpenHeadcount,
	selectionMode,
	onEnterSelection,
	onExitSelection,
	canAddModelMeal,
	isGlobalEvent,
	mealCount,
	onOpenModelMeal,
	onNewMeal,
}: OccasionFillToolbarProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<MenuFindBar
				items={items}
				nameOf={nameOf}
				mealTypeOrder={sectionMealTypes.map((m) => m.id)}
				dayLabel={null}
				mealLabel={(mealTypeId) => sectionMealTypes.find((m) => m.id === mealTypeId)?.name ?? "Refeição"}
				kitchenId={kitchenId}
				onGoTo={onGoTo}
				onReplaceAll={onReplaceAll}
				onSelectMatches={onSelectMatches}
			/>
			{/* O auxiliador preenche o efetivo (kits) de cada refeição — número da cozinha: some no
			    modelo global e no padrão de lanche, cujos kits vêm do pedido. */}
			{showHeadcount && (
				<Button type="button" variant="outline" size="sm" onClick={onOpenHeadcount}>
					<Users className="size-4 sm:mr-2" />
					<span className="hidden sm:inline">Quantitativo</span>
				</Button>
			)}
			<Button type="button" variant={selectionMode ? "default" : "outline"} size="sm" onClick={() => (selectionMode ? onExitSelection() : onEnterSelection())}>
				<ListChecks className="size-4 sm:mr-2" />
				<span className="hidden sm:inline">{selectionMode ? "Sair da seleção" : "Selecionar"}</span>
			</Button>
			{canAddModelMeal && (
				<Button type="button" size="sm" variant="outline" disabled={mealCount >= MAX_EVENT_MEALS} onClick={onOpenModelMeal}>
					<Layers />
					Refeição de um modelo
				</Button>
			)}
			{/* Modelo global de evento tem uma refeição: outra opção é outro modelo ("Duplicar como variante"). */}
			{!(isGlobalEvent && mealCount >= 1) && (
				<Button
					type="button"
					size="sm"
					// Teto do schema: a refeição a mais faria o servidor recusar o cardápio inteiro.
					disabled={mealCount >= MAX_EVENT_MEALS}
					onClick={onNewMeal}
				>
					<Plus />
					Nova refeição
				</Button>
			)}
		</div>
	)
}

export function GlobalEventMealsAlert({ isGlobalEvent, mealCount }: { isGlobalEvent: boolean; mealCount: number }) {
	if (!(isGlobalEvent && mealCount > 1)) return null
	return (
		<Alert variant="destructive">
			<AlertTriangle className="size-4" />
			<AlertTitle>Modelo com mais de uma refeição</AlertTitle>
			<AlertDescription>
				Modelo global de evento é uma opção de um formato só. Deixe aqui uma refeição e crie as outras como modelos nas pastas delas; sem isso, o salvamento é
				recusado.
			</AlertDescription>
		</Alert>
	)
}

export function OccasionMealsEmpty({ copy, isSupportMenu, onNewMeal }: { copy: OccasionMenuCopy; isSupportMenu: boolean; onNewMeal: () => void }) {
	return (
		<div className="rounded-md border border-dashed p-10 text-center">
			<p className="text-sm text-muted-foreground mb-1">
				{copy.article === "o" ? "Este" : "Esta"} {copy.noun} ainda não tem refeições.
			</p>
			<p className="text-xs text-muted-foreground/60 mb-3">
				{isSupportMenu
					? 'Crie a refeição do kit — ou "Refeição" e "Lanche", quando o kit tiver as duas — e ponha as preparações nela.'
					: "Crie as refeições do evento — coquetel, jantar de gala… — e monte a composição de cada uma: entradas, volantes, prato principal."}
			</p>
			<Button type="button" size="sm" variant="outline" onClick={onNewMeal}>
				<Plus />
				Nova refeição
			</Button>
		</div>
	)
}
