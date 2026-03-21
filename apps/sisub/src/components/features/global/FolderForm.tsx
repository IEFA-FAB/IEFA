import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

				await queryClient.invalidateQueries({
					queryKey: ["products"],
				})

				onClose()
				form.reset()
			} catch (_error) {
				toast.error(mode === "create" ? "Erro ao criar pasta" : "Erro ao atualizar pasta")
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
				>
					<FieldGroup className="gap-4">
						{/* Descrição */}
						<form.Field name="description">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>
										Descrição <span className="text-destructive">*</span>
									</FieldLabel>
									<Input
										id={field.name}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder="Ex: CARNES, LATICÍNIOS, HORTIFRUTI"
										aria-invalid={!!field.state.meta.errors.length}
									/>
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: String(e) }))} />
								</Field>
							)}
						</form.Field>

						{/* Pasta Pai */}
						<form.Field name="parent_id">
							{(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Pasta Pai (Opcional)</FieldLabel>
									<Select value={field.state.value || "__NONE__"} onValueChange={(value) => field.handleChange(value === "__NONE__" ? null : value)}>
										<SelectTrigger>
											<SelectValue placeholder="Nenhuma (Raiz)">
												{field.state.value && field.state.value !== "__NONE__"
													? (folders?.find((f) => f.id === field.state.value)?.description ?? "Sem Nome")
													: undefined}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__NONE__">Nenhuma (Raiz)</SelectItem>
											{folders
												?.filter((f) => f.id !== folder?.id)
												.map((f) => (
													<SelectItem key={f.id} value={f.id}>
														{f.description || "Sem Nome"}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: String(e) }))} />
								</Field>
							)}
						</form.Field>
					</FieldGroup>

					<DialogFooter className="mt-6">
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
