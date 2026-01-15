import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	Button,
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
	Badge,
	ScrollArea,
} from "@iefa/ui";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
// import { useAuth } from "@/hooks/auth/useAuth"; // Unused
import { ArrowLeftRight, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateDailyMenu, useDayDetails } from "@/hooks/data/usePlanning";
import type { DailyMenuWithItems, MenuItem } from "@/types/domain/planning";
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

	const handleCreateMenu = () => {
		if (!date) return;
		createMenu([]); // Passing empty array as placeholder. Should invoke a real creation logic or modal.
		toast.info("Funcionalidade de criar menu simplificada.");
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
						<div className="flex items-center gap-4 bg-muted/50 p-2 rounded text-sm">
							<span className="text-muted-foreground">Efetivo Previsto:</span>
							<span className="font-medium">
								{menu.forecasted_headcount || "N/A"}
							</span>
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
									{menu.menu_items.map((item) => {
										// Safe cast for display
										const recipeName =
											(item.recipe as any)?.name ||
											item.recipe_origin?.name ||
											"Receita sem nome";

										return (
											<div
												key={item.id}
												className="flex items-center justify-between border rounded p-3 bg-background group"
											>
												<div>
													<p className="font-medium text-sm flex items-center gap-2">
														{recipeName}
														{item.substitutions && (
															<Badge
																variant="outline"
																className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200"
															>
																Substituição Ativa
															</Badge>
														)}
													</p>
													<p className="text-xs text-muted-foreground">
														{item.planned_portion_quantity} porções
													</p>
												</div>
												<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
													<Button
														size="icon"
														variant="ghost"
														className="h-8 w-8 text-muted-foreground hover:text-primary"
														onClick={() => onSubstitute(item)}
														title="Substituir ingredientes"
													>
														<ArrowLeftRight className="w-4 h-4" />
													</Button>
													<Button
														size="icon"
														variant="ghost"
														className="h-8 w-8 text-destructive hover:bg-destructive/10"
													>
														<Trash2 className="w-4 h-4" />
													</Button>
												</div>
											</div>
										);
									})}
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
