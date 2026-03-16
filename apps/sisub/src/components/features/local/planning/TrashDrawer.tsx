import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays, Loader2, RefreshCcw, Trash2, UtensilsCrossed } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRestoreMenuItem, useTrashItems } from "@/hooks/data/usePlanning"
import { useDeletedTemplates, useRestoreTemplate } from "@/hooks/data/useTemplates"

interface TrashDrawerProps {
	open: boolean
	onClose: () => void
	kitchenId: number
}

export function TrashDrawer({ open, onClose, kitchenId }: TrashDrawerProps) {
	const { data: trashItems, isLoading: itemsLoading } = useTrashItems(kitchenId)
	const { data: deletedTemplates, isLoading: templatesLoading } = useDeletedTemplates(kitchenId)
	const { mutate: restoreItem, isPending: itemRestoring } = useRestoreMenuItem()
	const { mutate: restoreTemplate, isPending: templateRestoring } = useRestoreTemplate()

	const isLoading = itemsLoading || templatesLoading
	const isPending = itemRestoring || templateRestoring

	return (
		<Sheet open={open} onOpenChange={(v) => !v && onClose()}>
			<SheetContent className="sm:max-w-2xl w-full">
				<SheetHeader className="mb-6">
					<SheetTitle className="flex items-center gap-2">
						<Trash2 className="w-5 h-5 text-destructive" />
						Lixeira
					</SheetTitle>
					<SheetDescription>Items e templates removidos. Restaure se necessário.</SheetDescription>
				</SheetHeader>

				{isLoading ? (
					<div className="flex justify-center py-10">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				) : (
					<Tabs defaultValue="items" className="w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="items" className="gap-2">
								<UtensilsCrossed className="w-4 h-4" />
								Items de Cardápio
								{trashItems && trashItems.length > 0 && (
									<Badge variant="secondary" className="ml-1 text-[10px]">
										{trashItems.length}
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value="templates" className="gap-2">
								<CalendarDays className="w-4 h-4" />
								Templates
								{deletedTemplates && deletedTemplates.length > 0 && (
									<Badge variant="secondary" className="ml-1 text-[10px]">
										{deletedTemplates.length}
									</Badge>
								)}
							</TabsTrigger>
						</TabsList>

						{/* Menu Items Tab */}
						<TabsContent value="items">
							<ScrollArea className="h-[calc(100vh-240px)] pr-4">
								{!trashItems || trashItems.length === 0 ? (
									<div className="text-center py-10 text-muted-foreground text-sm">Nenhum item removido.</div>
								) : (
									<div className="space-y-3 mt-4">
										{trashItems.map((item) => (
											<div key={item.id} className="border rounded-md p-3 bg-muted/20 flex flex-col gap-2">
												<div className="flex justify-between items-start">
													<div>
														<p className="font-medium text-sm">
															{(item.recipe as { name?: string })?.name || item.recipe_origin?.name || "Preparação sem nome"}
														</p>
														<p className="text-xs text-muted-foreground">
															{format(new Date(item.daily_menu.service_date || new Date().toISOString()), "dd/MM/yyyy", {
																locale: ptBR,
															})}{" "}
															· {item.planned_portion_quantity || 0}g
														</p>
														{item.deleted_at && (
															<p className="text-xs text-muted-foreground/70 mt-1">
																Removido em{" "}
																{format(new Date(item.deleted_at), "dd/MM/yyyy 'às' HH:mm", {
																	locale: ptBR,
																})}
															</p>
														)}
													</div>
												</div>

												<Button
													size="sm"
													variant="outline"
													className="w-full h-8 gap-2 hover:bg-success/10 hover:text-success hover:border-success/30"
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
						</TabsContent>

						{/* Templates Tab */}
						<TabsContent value="templates">
							<ScrollArea className="h-[calc(100vh-240px)] pr-4">
								{!deletedTemplates || deletedTemplates.length === 0 ? (
									<div className="text-center py-10 text-muted-foreground text-sm">Nenhum template removido.</div>
								) : (
									<div className="space-y-3 mt-4">
										{deletedTemplates.map((template) => (
											<div key={template.id} className="border rounded-md p-3 bg-muted/20 flex flex-col gap-2">
												<div className="flex justify-between items-start">
													<div className="flex-1">
														<div className="flex items-center gap-2">
															<p className="font-medium text-sm">{template.name}</p>
															{template.kitchen_id === null && (
																<Badge variant="outline" className="text-[10px]">
																	Global
																</Badge>
															)}
														</div>
														<p className="text-xs text-muted-foreground">{template.description || "Sem descrição"}</p>
														<p className="text-xs text-muted-foreground/70 mt-1">
															{template.recipe_count || 0} Preparação
															{template.recipe_count !== 1 ? "s" : ""}
														</p>
														{template.deleted_at && (
															<p className="text-xs text-muted-foreground/70 mt-1">
																Removido em{" "}
																{format(new Date(template.deleted_at), "dd/MM/yyyy 'às' HH:mm", {
																	locale: ptBR,
																})}
															</p>
														)}
													</div>
												</div>

												<Button
													size="sm"
													variant="outline"
													className="w-full h-8 gap-2 hover:bg-success/10 hover:text-success hover:border-success/30"
													onClick={() => restoreTemplate(template.id)}
													disabled={isPending}
												>
													<RefreshCcw className="w-3 h-3" />
													Restaurar Template
												</Button>
											</div>
										))}
									</div>
								)}
							</ScrollArea>
						</TabsContent>
					</Tabs>
				)}
			</SheetContent>
		</Sheet>
	)
}
