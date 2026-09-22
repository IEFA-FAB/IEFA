import type { MealType } from "@iefa/database/sisub"
import { AlertCircle, Edit, LayoutGrid, Lock, Plus, Trash2 } from "lucide-react"
import React from "react"
import { usePBAC } from "@/auth/pbac"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeleteMealType, useMealTypes } from "@/hooks/data/useMealTypes"
import { useMenuGroupSets } from "@/hooks/data/useMenuGroups"
import { MealTypeForm } from "./MealTypeForm"
import { MenuGroupSetManager } from "./MenuGroupSetManager"

interface MealTypeManagerProps {
	open: boolean
	onClose: () => void
	kitchenId: number | null
}

/**
 * Gerenciador de Tipos de Refeição
 *
 * Lista meal types genéricos (read-only) e customizados da kitchen (editable)
 * Permite criar, editar e soft-delete de tipos customizados
 *
 * @example
 * ```tsx
 * <MealTypeManager
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   kitchenId={1}
 * />
 * ```
 */
export function MealTypeManager({ open, onClose, kitchenId }: MealTypeManagerProps) {
	const [formOpen, setFormOpen] = React.useState(false)
	const [editingMealType, setEditingMealType] = React.useState<MealType | null>(null)
	const [groupSetsOpen, setGroupSetsOpen] = React.useState(false)

	const { data: mealTypes, isLoading } = useMealTypes(kitchenId)
	const { data: groupSets } = useMenuGroupSets(kitchenId)
	const { mutate: deleteMealType, isPending: isDeleting } = useDeleteMealType()
	const { can } = usePBAC()
	// Tipo genérico é da SDAB: só `global:2` troca o conjunto dele. Sem isso a tela
	// ofereceria um botão que o domínio recusa.
	const canEditGeneric = can("global", 2)

	/** Nome do conjunto da refeição — sem conjunto, a tela usa o padrão. */
	const groupSetName = (mealType: MealType) =>
		(mealType.group_set_id ? groupSets?.find((s) => s.id === mealType.group_set_id)?.name : null) ?? "Padrão (refeição principal)"

	const handleEdit = (mealType: MealType) => {
		setEditingMealType(mealType)
		setFormOpen(true)
	}

	const handleCreate = () => {
		setEditingMealType(null)
		setFormOpen(true)
	}

	const handleDelete = (mealType: MealType) => {
		// Não há lixeira para tipo de refeição (a de Planejamento só guarda itens e templates), então
		// o aviso diz o que acontece em vez de prometer uma recuperação que a interface não oferece.
		if (
			window.confirm(
				`Tem certeza que deseja remover "${mealType.name}"?\n\nEle sai dos editores de cardápio e do calendário, e não há como restaurá-lo por aqui.`
			)
		) {
			deleteMealType(mealType.id)
		}
	}

	const handleFormClose = () => {
		setFormOpen(false)
		setEditingMealType(null)
	}

	// Separar tipos genéricos vs customizados
	const genericTypes = mealTypes?.filter((mt) => mt.kitchen_id === null) || []
	const customTypes = mealTypes?.filter((mt) => mt.kitchen_id !== null) || []

	if (!kitchenId) {
		return (
			<Dialog open={open} onOpenChange={onClose}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Gerenciar Tipos de Refeição</DialogTitle>
					</DialogHeader>
					<div className="flex items-center gap-2 p-4 text-muted-foreground">
						<AlertCircle className="size-4" />
						<p className="text-sm">Selecione uma cozinha para gerenciar tipos de refeição.</p>
					</div>
				</DialogContent>
			</Dialog>
		)
	}

	return (
		<>
			<Dialog open={open} onOpenChange={onClose}>
				<DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Gerenciar Tipos de Refeição</DialogTitle>
						<DialogDescription>Tipos genéricos são definidos globalmente. Você pode criar tipos customizados para esta cozinha.</DialogDescription>
					</DialogHeader>

					<div className="flex justify-end">
						<Button size="sm" variant="outline" className="gap-1.5" onClick={() => setGroupSetsOpen(true)}>
							<LayoutGrid className="size-4" />
							Conjuntos de grupos
						</Button>
					</div>

					<div className="space-y-6 py-4">
						{/* Generic Types Section */}
						<div>
							<div className="flex items-center gap-2 mb-3">
								<Lock className="size-4 text-muted-foreground" />
								<h3 className="text-subheading">Tipos Genéricos</h3>
								<Badge variant="outline" className="text-xs">
									Global
								</Badge>
							</div>

							{genericTypes.length > 0 ? (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Nome</TableHead>
											<TableHead>Grupos</TableHead>
											<TableHead className="w-24">Ordem</TableHead>
											<TableHead className="w-24 text-right">Ações</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{genericTypes.map((mealType) => (
											<TableRow key={mealType.id}>
												<TableCell className="text-subheading">{mealType.name}</TableCell>
												<TableCell className="text-sm text-muted-foreground">{groupSetName(mealType)}</TableCell>
												<TableCell>
													<Badge variant="secondary" className="font-mono text-xs">
														{mealType.sort_order}
													</Badge>
												</TableCell>
												<TableCell className="text-right">
													{canEditGeneric ? (
														<Tooltip>
															<TooltipTrigger
																render={
																	<Button size="icon" variant="ghost" onClick={() => handleEdit(mealType)}>
																		<Edit className="size-4" />
																	</Button>
																}
															></TooltipTrigger>
															<TooltipContent>Editar nome, ordem e conjunto de grupos</TooltipContent>
														</Tooltip>
													) : (
														<Badge variant="outline" className="text-xs">
															Somente Leitura
														</Badge>
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							) : (
								<p className="text-sm text-muted-foreground py-4">Nenhum tipo genérico cadastrado.</p>
							)}
						</div>

						{/* Custom Types Section */}
						<div>
							<div className="flex items-center justify-between mb-3">
								<div className="flex items-center gap-2">
									<h3 className="text-subheading">Tipos Customizados</h3>
									<Badge variant="default" className="text-xs">
										Esta Cozinha
									</Badge>
								</div>
								<Button size="sm" onClick={handleCreate}>
									<Plus className="size-4 mr-2" />
									Novo Tipo
								</Button>
							</div>

							{isLoading ? (
								<div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
							) : customTypes.length > 0 ? (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Nome</TableHead>
											<TableHead>Grupos</TableHead>
											<TableHead className="w-24">Ordem</TableHead>
											<TableHead className="w-32 text-right">Ações</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{customTypes.map((mealType) => (
											<TableRow key={mealType.id}>
												<TableCell className="text-subheading">{mealType.name}</TableCell>
												<TableCell className="text-sm text-muted-foreground">{groupSetName(mealType)}</TableCell>
												<TableCell>
													<Badge variant="secondary" className="font-mono text-xs">
														{mealType.sort_order}
													</Badge>
												</TableCell>
												<TableCell className="text-right">
													<div className="flex items-center justify-end gap-1">
														<Tooltip>
															<TooltipTrigger
																render={
																	<Button size="icon" variant="ghost" onClick={() => handleEdit(mealType)}>
																		<Edit className="size-4" />
																	</Button>
																}
															></TooltipTrigger>
															<TooltipContent>Editar</TooltipContent>
														</Tooltip>
														<Tooltip>
															<TooltipTrigger
																render={
																	<Button size="icon" variant="ghost" onClick={() => handleDelete(mealType)} disabled={isDeleting}>
																		<Trash2 className="size-4 text-destructive" />
																	</Button>
																}
															></TooltipTrigger>
															<TooltipContent>Remover</TooltipContent>
														</Tooltip>
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							) : (
								<div className="py-8 text-center border-2 border-dashed rounded-lg">
									<p className="text-sm text-muted-foreground mb-2">Nenhum tipo customizado criado ainda.</p>
									<Button size="sm" variant="outline" onClick={handleCreate}>
										<Plus className="size-4 mr-2" />
										Criar Primeiro Tipo
									</Button>
								</div>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Form Dialog */}
			<MealTypeForm open={formOpen} onClose={handleFormClose} kitchenId={kitchenId || 0} mealType={editingMealType} />

			<MenuGroupSetManager open={groupSetsOpen} onClose={() => setGroupSetsOpen(false)} kitchenId={kitchenId} />
		</>
	)
}
