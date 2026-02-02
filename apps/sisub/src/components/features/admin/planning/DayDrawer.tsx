import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Badge,
	Button,
	Input,
	Label,
	ScrollArea,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@iefa/ui"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { useMealTypes } from "@/hooks/data/useMealTypes"
import {
	useAddMenuItem,
	useCreateDailyMenu,
	useDayDetails,
	useDeleteMenuItem,
	useUpdateDailyMenu,
} from "@/hooks/data/usePlanning"
import type { DailyMenuWithItems, MenuItem } from "@/types/domain/planning"
import { MenuItemCard } from "./MenuItemCard"
import { RecipeSelector } from "./RecipeSelector"
import { SubstitutionModal } from "./SubstitutionModal"

interface DayDrawerProps {
	date: Date | null
	onClose: () => void
	open: boolean
}

export function DayDrawer({ date, onClose, open }: DayDrawerProps) {
	// const { user } = useAuth(); // Unused
	const kitchenId = 1 // HARDCODED

	const { data: dayMenus, isLoading: menusLoading } = useDayDetails(kitchenId, date || new Date())

	const { data: mealTypes, isLoading: mealTypesLoading } = useMealTypes(kitchenId)

	const isLoading = menusLoading || mealTypesLoading

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
	const { mutate: addMenuItem } = useAddMenuItem()

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
				</SheetHeader>

				{isLoading ? (
					<div className="flex justify-center py-10">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				) : (
					<ScrollArea className="h-[calc(100vh-180px)] pr-4">
						<Accordion type="single" collapsible className="w-full space-y-4">
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
								/>
							))}
						</Accordion>
					</ScrollArea>
				)}

				<SubstitutionModal
					open={!!substitutionItem}
					onClose={() => setSubstitutionItem(null)}
					menuItem={substitutionItem}
				/>

				<RecipeSelector
					open={!!recipeSelectorMenu}
					onClose={() => {
						console.log("RecipeSelector closing")
						setRecipeSelectorMenu(null)
					}}
					kitchenId={kitchenId}
					selectedRecipeIds={[]}
					onSelect={async (recipeIds) => {
						if (!recipeSelectorMenu || recipeIds.length === 0) {
							setRecipeSelectorMenu(null)
							return
						}

						console.log("Selected recipe IDs:", recipeIds, "for menu:", recipeSelectorMenu.id)

						// Create menu items for each selected recipe with snapshots
						for (const recipeId of recipeIds) {
							try {
								// Import and fetch complete recipe data
								const { fetchRecipeWithIngredients } = await import("@/hooks/data/useRecipes")
								const recipeSnapshot = await fetchRecipeWithIngredients(recipeId)

								// Create menu item with recipe snapshot (PRD RF12)
								addMenuItem({
									daily_menu_id: recipeSelectorMenu.id,
									recipe_origin_id: recipeId,
									recipe: recipeSnapshot as any,
									planned_portion_quantity: recipeSelectorMenu.forecasted_headcount || 150,
									excluded_from_procurement: 0,
								})
							} catch (error) {
								console.error("Error fetching recipe:", recipeId, error)
							}
						}

						setRecipeSelectorMenu(null)
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
}) {
	const { mutate: createMenu, isPending: isCreating } = useCreateDailyMenu()
	const { mutate: updateDailyMenu } = useUpdateDailyMenu()

	// State for headcount editing
	const [headcount, setHeadcount] = useState<number | null>(menu?.forecasted_headcount ?? null)

	// Update headcount when menu changes
	useEffect(() => {
		setHeadcount(menu?.forecasted_headcount ?? null)
	}, [menu])

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
		updateDailyMenu({
			id: menu.id,
			updates: { forecasted_headcount: headcount },
		})
	}

	return (
		<AccordionItem value={mealType.id} className="border rounded-lg px-4 bg-card">
			<AccordionTrigger className="hover:no-underline py-4">
				<div className="flex items-center justify-between w-full mr-4">
					<div className="flex items-center gap-2">
						<span className="font-semibold">{mealType.name}</span>
						{menu && (
							<Badge
								variant={menu.status === "PUBLISHED" ? "default" : "secondary"}
								className="text-[10px] h-5"
							>
								{menu.status === "PUBLISHED" ? "Publicado" : "Planejado"}
							</Badge>
						)}
					</div>
					<div className="text-sm text-muted-foreground font-normal">
						{menu ? `${menu.forecasted_headcount || 0} p. previstas` : "Não planejado"}
					</div>
				</div>
			</AccordionTrigger>
			<AccordionContent className="pb-4">
				{!menu ? (
					<div className="text-center py-6 space-y-3">
						<p className="text-muted-foreground text-sm">
							Nenhum cardápio criado para {mealType.name || "esta refeição"}.
						</p>
						<Button size="sm" variant="outline" onClick={handleCreateMenu} disabled={isCreating}>
							<Plus className="w-4 h-4 mr-2" />
							Iniciar Planejamento
						</Button>
					</div>
				) : (
					<div className="space-y-4">
						{/* Editable Forecasted Headcount */}
						<div className="bg-muted/30 p-3 rounded-md space-y-2">
							<Label htmlFor={`headcount-${menu.id}`} className="text-xs font-medium">
								Previsão de Comensais
							</Label>
							<div className="flex items-center gap-2">
								<Input
									id={`headcount-${menu.id}`}
									type="number"
									value={headcount ?? ""}
									onChange={(e) =>
										setHeadcount(e.target.value === "" ? null : Number.parseInt(e.target.value, 10))
									}
									onBlur={handleUpdateHeadcount}
									placeholder="0"
									className="h-8 w-24"
								/>
								<span className="text-xs text-muted-foreground">porções</span>
							</div>
						</div>

						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Itens do Cardápio</h4>
							{!menu.menu_items || menu.menu_items.length === 0 ? (
								<div className="border border-dashed rounded-md p-4 text-center text-sm text-muted-foreground">
									Nenhuma preparação adicionada.
								</div>
							) : (
								<div className="grid gap-2">
									{menu.menu_items.map((item) => (
										<MenuItemCard
											key={item.id}
											item={item}
											onSubstitute={onSubstitute}
											onDelete={onDelete}
										/>
									))}
								</div>
							)}

							<Button
								size="sm"
								className="w-full mt-2"
								variant="outline"
								onClick={() => {
									if (menu) {
										console.log("Adicionar Preparação clicked for menu:", menu.id)
										onAddRecipe(menu)
									}
								}}
							>
								<Plus className="w-4 h-4 mr-2" />
								Adicionar Preparação
							</Button>
						</div>
					</div>
				)}
			</AccordionContent>
		</AccordionItem>
	)
}
