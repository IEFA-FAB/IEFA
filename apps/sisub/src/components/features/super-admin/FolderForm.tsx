import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@iefa/ui"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { zodValidator } from "@tanstack/zod-form-adapter"
import { toast } from "sonner"
import { z } from "zod"
import { useCreateFolder, useFolders, useUpdateFolder } from "@/services/ProductsService"
import type { Folder } from "@/types/supabase.types"

// Schema de validação
const folderSchema = z.object({
	description: z.string().min(3, "Descrição deve ter no mínimo 3 caracteres"),
	parent_id: z.string().nullable(),
})

interface FolderFormProps {
	isOpen: boolean
	onClose: () => void
	mode: "create" | "edit"
	folder?: Folder
}

export function FolderForm({ isOpen, onClose, mode, folder }: FolderFormProps) {
	const queryClient = useQueryClient()
	const { folders } = useFolders()
	const { createFolder, isCreating } = useCreateFolder()
	const { updateFolder, isUpdating } = useUpdateFolder()

	const form = useForm({
		defaultValues: {
			description: folder?.description || "",
			parent_id: folder?.parent_id || null,
		},
		// @ts-expect-error - TanStack Form type issue with validatorAdapter
		validatorAdapter: zodValidator(),
		validators: {
			onChange: folderSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				if (mode === "create") {
					await createFolder(value)
					toast.success("Pasta criada com sucesso!")
				} else if (folder) {
					await updateFolder({ id: folder.id, payload: value })
					toast.success("Pasta atualizada com sucesso!")
				}

				// Invalidar cache para recarregar dados
				await queryClient.invalidateQueries({
					queryKey: ["products"],
				})

				onClose()
				form.reset()
			} catch (error) {
				toast.error(mode === "create" ? "Erro ao criar pasta" : "Erro ao atualizar pasta")
				console.error(error)
			}
		},
	})

	const isPending = isCreating || isUpdating

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{mode === "create" ? "Nova Pasta" : "Editar Pasta"}</DialogTitle>
				</DialogHeader>

				<form
					onSubmit={(e) => {
						e.preventDefault()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					{/* Descrição */}
					<form.Field name="description">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Descrição <span className="text-destructive">*</span>
								</Label>
								<Input
									id={field.name}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									placeholder="Ex: CARNES, LATICÍNIOS, HORTIFRUTI"
									aria-invalid={!!field.state.meta.errors.length}
								/>
								{field.state.meta.errors && (
									<p className="text-sm text-destructive" role="alert">
										{field.state.meta.errors.join(", ")}
									</p>
								)}
							</div>
						)}
					</form.Field>
					{/* Pasta Pai (Parent Folder) */}
					<form.Field name="parent_id">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Pasta Pai (Opcional)</Label>
								<Select
									value={field.state.value || "__NONE__"}
									onValueChange={(value) => field.handleChange(value === "__NONE__" ? null : value)}
								>
									<SelectTrigger>
										<SelectValue placeholder="Nenhuma (Raiz)" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="__NONE__">Nenhuma (Raiz)</SelectItem>
										{folders
											?.filter((f) => f.id !== folder?.id) // Evitar auto-referência
											.map((f) => (
												<SelectItem key={f.id} value={f.id}>
													{f.description || "Sem Nome"}
												</SelectItem>
											))}
									</SelectContent>
								</Select>
								{field.state.meta.errors && (
									<p className="text-sm text-destructive" role="alert">
										{field.state.meta.errors.join(", ")}
									</p>
								)}
							</div>
						)}
					</form.Field>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
