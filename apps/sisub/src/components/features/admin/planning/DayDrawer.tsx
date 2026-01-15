import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
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
} from "@iefa/ui";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
// import { useAuth } from "@/hooks/auth/useAuth"; // Unused
import { ArrowLeftRight, Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	useCreateDailyMenu,
	useDayDetails,
	useDeleteMenuItem,
	useUpdateDailyMenu,
	useUpdateMenuItem,
} from "@/hooks/data/usePlanning";
import type { DailyMenuWithItems, MenuItem } from "@/types/domain/planning";
import { MenuItemCard } from "./MenuItemCard";
import { SubstitutionModal } from "./SubstitutionModal";

interface DayDrawerProps {
	date: Date | null;
	onClose: () => void;
	open: boolean;
}

export function DayDrawer({ date, onClose, open }: DayDrawerProps) {
	// const { user } = useAuth(); // Unused
	const kitchenId = 1; // HARDCODED

	const { data: dayMenus, isLoading } = useDayDetails(
		kitchenId,
		date || new Date(),
	);

	const meals: Record<string, DailyMenuWithItems | undefined> = {
		"Café da Manhã": dayMenus?.find(
			(m) => m.meal_type?.name === "Café da Manhã",
		),
		Almoço: dayMenus?.find((m) => m.meal_type?.name === "Almoço"),
		Jantar: dayMenus?.find((m) => m.meal_type?.name === "Jantar"),
		Ceia: dayMenus?.find((m) => m.meal_type?.name === "Ceia"),
	};

	const formattedDate = date
		? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })
		: "";

	// State for substitutions
	const [substitutionItem, setSubstitutionItem] = useState<MenuItem | null>(
		null,
	);

	return (
		<Sheet open={open} onOpenChange={(v) => !v && onClose()}>
			<SheetContent className="sm:max-w-xl w-full">
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
							{Object.entries(meals).map(([mealName, menu]) => (
								<MealSection
									key={mealName}
									mealName={mealName}
									menu={menu}
									date={date}
									kitchenId={kitchenId}
									onSubstitute={(item) => setSubstitutionItem(item)}
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
			</SheetContent>
		</Sheet>
	);
}

function MealSection({
	mealName,
	menu,
	date,
	//   kitchenId, // Unused
	onSubstitute,
}: {
	mealName: string;
	menu?: DailyMenuWithItems;
	date: Date | null;
	kitchenId: number;
	onSubstitute: (item: MenuItem) => void;
}) {
	const { mutate: createMenu, isPending: isCreating } = useCreateDailyMenu();
	const { mutate: updateDailyMenu } = useUpdateDailyMenu();
	const { mutate: updateMenuItem } = useUpdateMenuItem();
	const { mutate: deleteMenuItem } = useDeleteMenuItem();

	// State for headcount editing
	const [headcount, setHeadcount] = useState<number | null>(
		menu?.forecasted_headcount ?? null,
	);

	// Update headcount when menu changes
	useEffect(() => {
		setHeadcount(menu?.forecasted_headcount ?? null);
	}, [menu]);

	const handleCreateMenu = () => {
		if (!date) return;
		createMenu([]); // Passing empty array as placeholder. Should invoke a real creation logic or modal.
		toast.info("Funcionalidade de criar menu simplificada.");
	};

	const handleUpdateHeadcount = () => {
		if (!menu) return;
		updateDailyMenu({
			id: menu.id,
			updates: { forecasted_headcount: headcount },
		});
	};

	const handleUpdatePortionQuantity = (
		itemId: string,
		quantity: number | null,
	) => {
		updateMenuItem({
			id: itemId,
			updates: { planned_portion_quantity: quantity },
		});
	};

	const handleUpdateExcludedQuantity = (
		itemId: string,
		excludedQty: number | null,
	) => {
		updateMenuItem({
			id: itemId,
			updates: { excluded_from_procurement: excludedQty },
		});
	};

	const handleDeleteItem = (itemId: string, recipeName: string) => {
		if (
			window.confirm(
				`Remover "${recipeName}" do cardápio?\n\nPoderá ser recuperado na lixeira.`,
			)
		) {
			deleteMenuItem(itemId);
		}
	};

	return (
		<AccordionItem value={mealName} className="border rounded-lg px-4 bg-card">
			<AccordionTrigger className="hover:no-underline py-4">
				<div className="flex items-center justify-between w-full mr-4">
					<div className="flex items-center gap-2">
						<span className="font-semibold">{mealName}</span>
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
						{menu
							? `${menu.forecasted_headcount || 0} p. previstas`
							: "Não planejado"}
					</div>
				</div>
			</AccordionTrigger>
			<AccordionContent className="pb-4">
				{!menu ? (
					<div className="text-center py-6 space-y-3">
						<p className="text-muted-foreground text-sm">
							Nenhum cardápio criado para esta refeição.
						</p>
						<Button
							size="sm"
							variant="outline"
							onClick={handleCreateMenu}
							disabled={isCreating}
						>
							<Plus className="w-4 h-4 mr-2" />
							Iniciar Planejamento
						</Button>
					</div>
				) : (
					<div className="space-y-4">
						{/* Editable Forecasted Headcount */}
						<div className="bg-muted/30 p-3 rounded-md space-y-2">
							<Label
								htmlFor={`headcount-${menu.id}`}
								className="text-xs font-medium"
							>
								Previsão de Comensais
							</Label>
							<div className="flex items-center gap-2">
								<Input
									id={`headcount-${menu.id}`}
									type="number"
									value={headcount ?? ""}
									onChange={(e) =>
										setHeadcount(
											e.target.value === ""
												? null
												: Number.parseInt(e.target.value),
										)
									}
									onBlur={handleUpdateHeadcount}
									placeholder="0"
									className="h-8 w-24"
								/>
								<span className="text-xs text-muted-foreground">porções</span>
							</div>
						</div>

						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">
								Itens do Cardápio
							</h4>
							{menu.menu_items.length === 0 ? (
								<div className="border border-dashed rounded-md p-4 text-center text-sm text-muted-foreground">
									Nenhuma receita adicionada.
								</div>
							) : (
								<div className="grid gap-2">
									{menu.menu_items.map((item) => (
										<MenuItemCard
											key={item.id}
											item={item}
											onSubstitute={onSubstitute}
											onDelete={handleDeleteItem}
										/>
									))}
								</div>
							)}

							<Button size="sm" className="w-full mt-2" variant="outline">
								<Plus className="w-4 h-4 mr-2" />
								Adicionar Receita
							</Button>
						</div>
					</div>
				)}
			</AccordionContent>
		</AccordionItem>
	);
}
