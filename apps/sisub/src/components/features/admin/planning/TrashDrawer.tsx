import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	Button,
	ScrollArea,
	Badge,
} from "@iefa/ui";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, RefreshCcw, Trash2 } from "lucide-react";
import { useRestoreMenuItem, useTrashItems } from "@/hooks/data/usePlanning";

interface TrashDrawerProps {
	open: boolean;
	onClose: () => void;
	kitchenId: number;
}

export function TrashDrawer({ open, onClose, kitchenId }: TrashDrawerProps) {
	const { data: trashItems, isLoading } = useTrashItems(kitchenId);
	const { mutate: restoreItem, isPending } = useRestoreMenuItem();

	return (
		<Sheet open={open} onOpenChange={(v) => !v && onClose()}>
			<SheetContent className="sm:max-w-md w-full">
				<SheetHeader className="mb-6">
					<SheetTitle className="flex items-center gap-2">
						<Trash2 className="w-5 h-5 text-destructive" />
						Lixeira
					</SheetTitle>
					<SheetDescription>
						Itens removidos recentemente. Restaure se necessário.
					</SheetDescription>
				</SheetHeader>

				{isLoading ? (
					<div className="flex justify-center py-10">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				) : (
					<ScrollArea className="h-[calc(100vh-120px)] pr-4">
						{!trashItems || trashItems.length === 0 ? (
							<div className="text-center py-10 text-muted-foreground text-sm">
								A lixeira está vazia.
							</div>
						) : (
							<div className="space-y-3">
								{trashItems.map((item: any) => (
									<div
										key={item.id}
										className="border rounded-md p-3 bg-muted/20 flex flex-col gap-2"
									>
										<div className="flex justify-between items-start">
											<div>
												<p className="font-medium text-sm">
													{item.recipe?.name ||
														item.recipe_origin?.name ||
														"Receita sem nome"}
												</p>
												<p className="text-xs text-muted-foreground">
													{format(
														new Date(item.daily_menu.service_date),
														"dd/MM/yyyy",
														{ locale: ptBR },
													)}
												</p>
											</div>
											<Badge variant="outline" className="text-[10px]">
												{item.planned_portion_quantity} un
											</Badge>
										</div>

										<Button
											size="sm"
											variant="outline"
											className="w-full h-8 gap-2 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
											onClick={() => restoreItem(item.id)}
											disabled={isPending}
										>
											<RefreshCcw className="w-3 h-3" />
											Restaurar
										</Button>
									</div>
								))}
							</div>
						)}
					</ScrollArea>
				)}
			</SheetContent>
		</Sheet>
	);
}
