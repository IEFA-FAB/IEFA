import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ClipboardPaste, Copy, Loader2, Plus, Users } from "lucide-react"
import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { toast } from "@/components/ui/toast"
import { useMealTypes } from "@/hooks/data/useMealTypes"
import { useAddMenuItem, useCreateDailyMenu, useDayDetails, useDeleteMenuItem, useUpdateDailyMenu } from "@/hooks/data/usePlanning"
import { useRecipes } from "@/hooks/data/useRecipes"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import type { HeadcountPlan, MenuClipboardEntry } from "@/lib/menu-fill"
import { groupMenuItems } from "@/lib/menu-item-groups"
import { findOutdatedRecipes, indexLatestByLineage, type OutdatedRecipe, type RecipeVersionRef } from "@/lib/recipe-versions"
import type { DailyMenuWithItems, MenuItem } from "@/types/domain/planning"
import { MenuEquipmentAlert } from "./MenuEquipmentAlert"
import { MenuHeadcountDialog } from "./MenuHeadcountDialog"
import { MenuItemCard } from "./MenuItemCard"
import { RecipeSelector } from "./RecipeSelector"
import { SubstitutionModal } from "./SubstitutionModal"

interface DayDrawerProps {
	date: Date | null
	kitchenId: number
	onClose: () => void
	open: boolean
}

export function DayDrawer({ date, kitchenId, onClose, open }: DayDrawerProps) {
	"use no memo"

	const { data: dayMenus, isLoading: menusLoading } = useDayDetails(kitchenId, date || new Date())

	const { data: mealTypes, isLoading: mealTypesLoading } = useMealTypes(kitchenId)

	const isLoading = menusLoading || mealTypesLoading

	// Fichas do dia em versão antiga. O dia congela a ficha na aplicação; `recipe_origin` traz a
	// linha exata (com versão e linhagem), e o catálogo da cozinha diz qual é a vencedora.
	const { data: catalog } = useRecipes({ kitchen_id: kitchenId })
	const outdatedById = (() => {
		const byId = new Map<string, RecipeVersionRef>()
		const ids: string[] = []
		for (const menu of dayMenus ?? []) {
			for (const item of menu.menu_items ?? []) {
				if (!item.recipe_origin) continue
				byId.set(item.recipe_origin.id, item.recipe_origin)
				ids.push(item.recipe_origin.id)
			}
		}
		const outdated = findOutdatedRecipes(ids, byId, indexLatestByLineage(catalog ?? []))
		return new Map<string, OutdatedRecipe>(outdated.map((o) => [o.current.id, o]))
	})()

	// Build meals dynamically based on meal types
	const meals =
		mealTypes?.map((mealType) => ({
			mealType,
			menu: dayMenus?.find((m) => m.meal_type_id === mealType.id),
		})) || []

	const formattedDate = date ? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }) : ""

	// State for substitutions
	const [substitutionItem, setSubstitutionItem] = useState<MenuItem | null>(null)

	// State for recipe selector
	const [recipeSelectorMenu, setRecipeSelectorMenu] = useState<DailyMenuWithItems | null>(null)

	// State for delete confirmation
	const [itemToDelete, setItemToDelete] = useState<{
		id: string
		name: string
	} | null>(null)

	const { mutate: deleteMenuItem } = useDeleteMenuItem()
	const { mutateAsync: addMenuItem } = useAddMenuItem({ silent: true })
	const { mutateAsync: updateDailyMenu } = useUpdateDailyMenu({ silent: true })
	const [headcountOpen, setHeadcountOpen] = useState(false)
	// Área de transferência do cardápio do DIA, por cozinha: a do template guarda itens de
	// rascunho; aqui cada colagem vira item gravado no dia.
	const [clipboard, setClipboard] = usePersistentState<MenuClipboardEntry[]>(`sisub:day-menu:clipboard:${kitchenId}`, [])

	/**
	 * Adiciona preparações a um menu do dia: pula as que já estão lá e resume o resultado num
	 * toast só. Antes cada uma buscava a ficha técnica inteira — que o servidor nem usa, ele monta
	 * o snapshot sozinho — e uma falha nessa busca caía num `catch` vazio: a preparação sumia
	 * sem aviso nenhum.
	 */
	const addToMenu = async (
		menu: DailyMenuWithItems,
		entries: { recipeId: string; itemGroup?: string | null; recommendedProportion?: number | null }[],
		verb: "adicionada" | "colada"
	) => {
		const present = new Set((menu.menu_items ?? []).map((i) => i.recipe_origin_id))
		const fresh = entries.filter((e) => !present.has(e.recipeId))
		// Posição calculada AQUI, por grupo: os inserts saem em paralelo, e sem `sort_order` o
		// servidor calcula "último + 1" para todos no mesmo instante — as preparações nasciam
		// empatadas e a ordem copiada virava a ordem em que o banco devolve.
		const nextInGroup = new Map<string | null, number>()
		for (const item of menu.menu_items ?? []) {
			const group = item.item_group ?? null
			nextInGroup.set(group, Math.max(nextInGroup.get(group) ?? 0, (item.sort_order ?? 0) + 1))
		}
		const positions = fresh.map((e) => {
			const group = e.itemGroup ?? null
			const position = nextInGroup.get(group) ?? 0
			nextInGroup.set(group, position + 1)
			return position
		})
		const results = await Promise.allSettled(
			fresh.map((e, index) =>
				addMenuItem({
					daily_menu_id: menu.id,
					recipe_origin_id: e.recipeId,
					// Previsão da refeição; sem ela, fica em branco — os 150 que existiam aqui eram
					// um número inventado entrando na compra.
					planned_portion_quantity: menu.forecasted_headcount || null,
					excluded_from_procurement: 0,
					item_group: e.itemGroup ?? null,
					sort_order: positions[index],
					recommended_proportion: e.recommendedProportion ?? null,
				})
			)
		)
		const failed = results.filter((r) => r.status === "rejected").length
		const done = fresh.length - failed
		const skipped = entries.length - fresh.length
		const plural = (n: number) => (n === 1 ? `preparação ${verb}` : `preparações ${verb}s`)
		const skippedNote = skipped > 0 ? ` ${skipped} já ${skipped === 1 ? "estava" : "estavam"} na refeição.` : ""
		if (failed > 0) toast.error(`${done} ${plural(done)}, ${failed} falharam.${skippedNote}`)
		else if (done > 0) toast.success(`${done} ${plural(done)}.${skippedNote}`)
		else if (skipped > 0) toast.info(`Nada ${verb === "colada" ? "colado" : "adicionado"}:${skippedNote}`)
	}

	const handleCopyMeal = (menu: DailyMenuWithItems) => {
		const entries: MenuClipboardEntry[] = (menu.menu_items ?? [])
			.filter((i) => i.recipe_origin_id)
			.map((i) => ({
				recipe_id: i.recipe_origin_id as string,
				item_group: i.item_group ?? null,
				headcount_override: null,
				recommended_proportion: i.recommended_proportion ?? null,
				meal_type_id: menu.meal_type_id ?? "",
			}))
		if (entries.length === 0) return
		setClipboard(entries)
		toast.success(`${entries.length} ${entries.length === 1 ? "preparação copiada" : "preparações copiadas"}`)
	}

	const handlePasteMeal = (menu: DailyMenuWithItems) =>
		addToMenu(
			menu,
			clipboard.map((e) => ({ recipeId: e.recipe_id, itemGroup: e.item_group, recommendedProportion: e.recommended_proportion })),
			"colada"
		)

	/** Quantitativo do dia: um número por refeição, gravado de uma vez nas refeições planejadas. */
	const plannedMeals = meals.filter((m) => m.menu)
	const countHeadcountTargets = (plan: HeadcountPlan, overwrite: boolean) =>
		plannedMeals.filter(({ mealType, menu }) => {
			const value = plan.get(mealType.id)
			if (value == null || !menu) return false
			if (!overwrite && menu.forecasted_headcount) return false
			return menu.forecasted_headcount !== value
		}).length

	const handleApplyHeadcount = async (plan: HeadcountPlan, overwrite: boolean) => {
		const targets = plannedMeals.filter(({ mealType, menu }) => {
			const value = plan.get(mealType.id)
			return value != null && menu && (overwrite || !menu.forecasted_headcount) && menu.forecasted_headcount !== value
		})
		const results = await Promise.allSettled(
			targets.map(({ mealType, menu }) =>
				updateDailyMenu({ id: (menu as DailyMenuWithItems).id, updates: { forecasted_headcount: plan.get(mealType.id) as number } })
			)
		)
		const failed = results.filter((r) => r.status === "rejected").length
		if (failed > 0) toast.error(`${targets.length - failed} refeições atualizadas, ${failed} falharam.`)
		else toast.success(`${targets.length} ${targets.length === 1 ? "refeição atualizada" : "refeições atualizadas"}.`)
	}

	const handleDeleteItem = (itemId: string, recipeName: string) => {
		setItemToDelete({ id: itemId, name: recipeName })
	}

	const confirmDelete = () => {
		if (itemToDelete) {
			deleteMenuItem(itemToDelete.id)
			setItemToDelete(null)
		}
	}

	return (
		<Sheet open={open} onOpenChange={(v) => !v && onClose()}>
			<SheetContent className="sm:max-w-xl w-full pl-4 ">
				<SheetHeader className="mb-6">
					<SheetTitle className="capitalize">{formattedDate}</SheetTitle>
					<SheetDescription>Planejamento de cardápio do dia.</SheetDescription>
					{plannedMeals.length > 0 && (
						<div>
							<Button type="button" size="sm" variant="outline" onClick={() => setHeadcountOpen(true)}>
								<Users className="size-4 mr-2" />
								Quantitativo do dia
							</Button>
						</div>
					)}
				</SheetHeader>

				{isLoading ? (
					<div className="flex justify-center py-10">
						<Loader2 className="size-8 animate-spin text-muted-foreground" />
					</div>
				) : (
					<ScrollArea className="h-[calc(100vh-180px)] pr-4">
						<Accordion className="w-full space-y-4">
							{meals.map(({ mealType, menu }) => (
								<MealSection
									key={mealType.id}
									mealType={mealType}
									menu={menu}
									date={date}
									kitchenId={kitchenId}
									onSubstitute={(item) => setSubstitutionItem(item)}
									onDelete={handleDeleteItem}
									onAddRecipe={setRecipeSelectorMenu}
									onCopyMeal={handleCopyMeal}
									onPasteMeal={handlePasteMeal}
									clipboardCount={clipboard.length}
									outdatedById={outdatedById}
								/>
							))}
						</Accordion>
					</ScrollArea>
				)}

				<MenuHeadcountDialog
					open={headcountOpen}
					onOpenChange={setHeadcountOpen}
					mealTypes={plannedMeals.map(({ mealType }) => ({ id: mealType.id, name: mealType.name }))}
					scope="day-menu"
					countTargets={countHeadcountTargets}
					onApply={handleApplyHeadcount}
				/>

				<SubstitutionModal open={!!substitutionItem} onClose={() => setSubstitutionItem(null)} menuItem={substitutionItem} />

				<RecipeSelector
					key={recipeSelectorMenu?.id || "none"}
					open={!!recipeSelectorMenu}
					onClose={() => {
						setRecipeSelectorMenu(null)
					}}
					kitchenId={kitchenId}
					selectedRecipeIds={[]}
					onSelect={async (recipeIds) => {
						"use no memo"
						const menu = recipeSelectorMenu
						setRecipeSelectorMenu(null)
						if (!menu || recipeIds.length === 0) return
						await addToMenu(
							menu,
							recipeIds.map((recipeId) => ({ recipeId })),
							"adicionada"
						)
					}}
					multiSelect={true}
				/>

				<AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Remover Preparação</AlertDialogTitle>
							<AlertDialogDescription>
								Tem certeza que deseja remover "{itemToDelete?.name}" do cardápio?
								<br />
								<br />
								Esta preparação poderá ser recuperada na lixeira.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancelar</AlertDialogCancel>
							<AlertDialogAction onClick={confirmDelete}>Remover</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</SheetContent>
		</Sheet>
	)
}

function MealSection({
	mealType,
	menu,
	date,
	kitchenId,
	onSubstitute,
	onDelete,
	onAddRecipe,
	onCopyMeal,
	onPasteMeal,
	clipboardCount,
	outdatedById,
}: {
	mealType: {
		id: string
		name: string | null
		sort_order: number | null
		kitchen_id: number | null
	}
	menu?: DailyMenuWithItems
	date: Date | null
	kitchenId: number
	onSubstitute: (item: MenuItem) => void
	onDelete: (itemId: string, recipeName: string) => void
	onAddRecipe: (menu: DailyMenuWithItems) => void
	onCopyMeal: (menu: DailyMenuWithItems) => void
	onPasteMeal: (menu: DailyMenuWithItems) => void
	clipboardCount: number
	outdatedById: ReadonlyMap<string, OutdatedRecipe>
}) {
	const { mutate: createMenu, isPending: isCreating } = useCreateDailyMenu()
	const { mutate: updateDailyMenu } = useUpdateDailyMenu()

	// State for headcount editing
	const serverHeadcount = menu?.forecasted_headcount ?? null
	const [headcount, setHeadcount] = useState<number | null>(serverHeadcount)
	const [prevServerHeadcount, setPrevServerHeadcount] = useState<number | null>(serverHeadcount)

	// Sync headcount with prop changes (adjust during render, not in effect)
	if (prevServerHeadcount !== serverHeadcount) {
		setPrevServerHeadcount(serverHeadcount)
		setHeadcount(serverHeadcount)
	}

	const handleCreateMenu = () => {
		if (!date || !kitchenId) return
		const serviceDate = format(date, "yyyy-MM-dd")
		createMenu([
			{
				service_date: serviceDate,
				meal_type_id: mealType.id,
				kitchen_id: kitchenId,
				status: "DRAFT",
				forecasted_headcount: 0,
			},
		])
	}

	const handleUpdateHeadcount = () => {
		if (!menu) return
		// Campo vazio (ou zero/negativo) não é um efetivo: devolve o valor gravado em vez de
		// inventar um. Antes isto virava 1 comensal com aviso de sucesso.
		if (headcount == null || !Number.isFinite(headcount) || headcount < 1) {
			setHeadcount(serverHeadcount)
			return
		}
		if (headcount === serverHeadcount) return
		updateDailyMenu({
			id: menu.id,
			updates: { forecasted_headcount: headcount },
		})
	}

	return (
		<AccordionItem value={mealType.id} className="border rounded-md px-4 bg-card">
			<AccordionTrigger className="hover:no-underline py-4">
				<div className="flex items-center justify-between w-full mr-4">
					<div className="flex items-center gap-2">
						<span className="text-subheading">{mealType.name}</span>
						{menu && (
							<Badge variant={menu.status === "PUBLISHED" ? "default" : "secondary"} className="text-[10px] h-5">
								{menu.status === "PUBLISHED" ? "Publicado" : "Planejado"}
							</Badge>
						)}
					</div>
					<div className="text-sm font-normal">
						{menu ? (
							menu.forecasted_headcount ? (
								<span className="text-muted-foreground">{menu.forecasted_headcount} comensais</span>
							) : (
								<span className="text-destructive text-subheading">Sem comensais</span>
							)
						) : (
							<span className="text-muted-foreground">Não planejado</span>
						)}
					</div>
				</div>
			</AccordionTrigger>
			<AccordionContent className="pb-4">
				{!menu ? (
					<div className="text-center py-6 space-y-3">
						<p className="text-muted-foreground text-sm">Nenhum cardápio criado para {mealType.name || "esta refeição"}.</p>
						<Button size="sm" variant="outline" onClick={handleCreateMenu} disabled={isCreating}>
							<Plus className="size-4 mr-2" />
							Iniciar Planejamento
						</Button>
					</div>
				) : (
					<div className="space-y-4">
						{/* Editable Forecasted Headcount */}
						<div className="bg-muted/30 p-3 rounded-md">
							<Field orientation="vertical" className="gap-2">
								<FieldLabel htmlFor={`headcount-${menu.id}`} className="text-caption">
									Previsão de Comensais
								</FieldLabel>
								<div className="flex items-center gap-2">
									<Input
										id={`headcount-${menu.id}`}
										type="number"
										value={headcount ?? ""}
										onChange={(e) => setHeadcount(e.target.value === "" ? null : Number.parseInt(e.target.value, 10))}
										onBlur={handleUpdateHeadcount}
										placeholder="0"
										className="h-8 w-24"
									/>
									<span className="text-xs text-muted-foreground">comensais</span>
								</div>
							</Field>
						</div>

						{/* Disputa de equipamento entre as preparações DESTA refeição — só aparece quando falta. */}
						<MenuEquipmentAlert dailyMenuId={menu.id} />

						<div className="space-y-2">
							<div className="flex items-center justify-between gap-2">
								<h4 className="text-subheading">Itens do Cardápio</h4>
								<div className="flex items-center gap-1">
									{menu.menu_items && menu.menu_items.length > 0 && (
										<Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => onCopyMeal(menu)}>
											<Copy className="size-3.5" />
											Copiar refeição
										</Button>
									)}
									{clipboardCount > 0 && (
										<Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => onPasteMeal(menu)}>
											<ClipboardPaste className="size-3.5" />
											Colar ({clipboardCount})
										</Button>
									)}
								</div>
							</div>
							{!menu.menu_items || menu.menu_items.length === 0 ? (
								<div className="border border-dashed rounded-md p-4 text-center text-sm text-muted-foreground">Nenhuma preparação adicionada.</div>
							) : (
								<div className="space-y-3">
									{groupMenuItems(menu.menu_items).map((group) => (
										<div key={group.key} className="space-y-2">
											<p className="text-xs uppercase tracking-wide text-muted-foreground/80">{group.label}</p>
											<div className="grid gap-2">
												{group.items.map((item) => (
													<MenuItemCard
														key={item.id}
														item={item}
														onSubstitute={onSubstitute}
														onDelete={onDelete}
														outdated={item.recipe_origin_id ? outdatedById.get(item.recipe_origin_id) : undefined}
													/>
												))}
											</div>
										</div>
									))}
								</div>
							)}

							<Button
								size="sm"
								className="w-full mt-2"
								variant="outline"
								onClick={() => {
									if (menu) {
										onAddRecipe(menu)
									}
								}}
							>
								<Plus className="size-4 mr-2" />
								Adicionar Preparação
							</Button>
						</div>
					</div>
				)}
			</AccordionContent>
		</AccordionItem>
	)
}
