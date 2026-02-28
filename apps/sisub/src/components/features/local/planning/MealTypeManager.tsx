import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@iefa/ui"
import { AlertCircle, Edit, Lock, Plus, Trash2 } from "lucide-react"
import React from "react"
import { useDeleteMealType, useMealTypes } from "@/hooks/data/useMealTypes"
import type { MealType } from "@/types/supabase.types"
import { MealTypeForm } from "./MealTypeForm"

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

	const { data: mealTypes, isLoading } = useMealTypes(kitchenId)
	const { mutate: deleteMealType, isPending: isDeleting } = useDeleteMealType()

	const handleEdit = (mealType: MealType) => {
		setEditingMealType(mealType)
		setFormOpen(true)
	}

	const handleCreate = () => {
		setEditingMealType(null)
		setFormOpen(true)
	}

	const handleDelete = (mealType: MealType) => {
		if (
			window.confirm(
				`Tem certeza que deseja remover "${mealType.name}"?\n\nEste tipo de refeição poderá ser recuperado na lixeira.`
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
						<AlertCircle className="w-4 h-4" />
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
						<DialogDescription>
							Tipos genéricos são definidos globalmente. Você pode criar tipos customizados para
							esta cozinha.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-6 py-4">
						{/* Generic Types Section */}
						<div>
							<div className="flex items-center gap-2 mb-3">
								<Lock className="w-4 h-4 text-muted-foreground" />
								<h3 className="text-sm font-medium">Tipos Genéricos</h3>
								<Badge variant="outline" className="text-xs">
									Global
								</Badge>
							</div>

							{genericTypes.length > 0 ? (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Nome</TableHead>
											<TableHead className="w-24">Ordem</TableHead>
											<TableHead className="w-24 text-right">Ações</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{genericTypes.map((mealType) => (
											<TableRow key={mealType.id}>
												<TableCell className="font-medium">{mealType.name}</TableCell>
												<TableCell>
													<Badge variant="secondary" className="font-mono text-xs">
														{mealType.sort_order}
													</Badge>
												</TableCell>
												<TableCell className="text-right">
													<Badge variant="outline" className="text-xs">
														Somente Leitura
													</Badge>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							) : (
								<p className="text-sm text-muted-foreground py-4">
									Nenhum tipo genérico cadastrado.
								</p>
							)}
						</div>

						{/* Custom Types Section */}
						<div>
							<div className="flex items-center justify-between mb-3">
								<div className="flex items-center gap-2">
									<h3 className="text-sm font-medium">Tipos Customizados</h3>
									<Badge variant="default" className="text-xs">
										Esta Cozinha
									</Badge>
								</div>
								<Button size="sm" onClick={handleCreate}>
									<Plus className="w-4 h-4 mr-2" />
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
											<TableHead className="w-24">Ordem</TableHead>
											<TableHead className="w-32 text-right">Ações</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{customTypes.map((mealType) => (
											<TableRow key={mealType.id}>
												<TableCell className="font-medium">{mealType.name}</TableCell>
												<TableCell>
													<Badge variant="secondary" className="font-mono text-xs">
														{mealType.sort_order}
													</Badge>
												</TableCell>
												<TableCell className="text-right">
													<div className="flex items-center justify-end gap-1">
														<Button
															size="icon"
															variant="ghost"
															onClick={() => handleEdit(mealType)}
															title="Editar"
														>
															<Edit className="w-4 h-4" />
														</Button>
														<Button
															size="icon"
															variant="ghost"
															onClick={() => handleDelete(mealType)}
															disabled={isDeleting}
															title="Remover"
														>
															<Trash2 className="w-4 h-4 text-destructive" />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							) : (
								<div className="py-8 text-center border-2 border-dashed rounded-lg">
									<p className="text-sm text-muted-foreground mb-2">
										Nenhum tipo customizado criado ainda.
									</p>
									<Button size="sm" variant="outline" onClick={handleCreate}>
										<Plus className="w-4 h-4 mr-2" />
										Criar Primeiro Tipo
									</Button>
								</div>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Form Dialog */}
			<MealTypeForm
				open={formOpen}
				onClose={handleFormClose}
				kitchenId={kitchenId || 0}
				mealType={editingMealType}
			/>
		</>
	)
}
