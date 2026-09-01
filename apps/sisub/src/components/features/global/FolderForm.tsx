import type { Folder } from "@iefa/database/sisub"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { useCreateFolder, useIngredientsTree, useUpdateFolder } from "@/services/IngredientsService"
import { FolderCombobox } from "./FolderCombobox"

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
	/**
	 * Aba de onde o diálogo foi aberto — gêneros (`exclude`) ou itens auxiliares (`only`).
	 * Recorta as pastas-pai oferecidas (misturar as duas árvores no combo é como um item
	 * de EPI vai parar dentro de "Carnes") e define o escopo da pasta RAIZ criada aqui;
	 * com pai, o trigger do banco herda o escopo dele e este valor é ignorado.
	 */
	catalog?: "exclude" | "only"
}

export function FolderForm({ isOpen, onClose, mode, folder, catalog = "exclude" }: FolderFormProps) {
	const queryClient = useQueryClient()
	const { tree } = useIngredientsTree(false, "exclude", catalog)
	const folders = tree?.folders
	const { createFolder, isCreating } = useCreateFolder()
	const { updateFolder, isUpdating } = useUpdateFolder()

	const parentOptions = useMemo(() => {
		const list = folders ?? []
		const byId = new Map(list.map((f) => [f.id, f]))
		const childrenByParent = new Map<string, Folder[]>()
		for (const item of list) {
			if (!item.parent_id) continue
			const siblings = childrenByParent.get(item.parent_id) ?? []
			siblings.push(item)
			childrenByParent.set(item.parent_id, siblings)
		}

		const blockedIds = new Set<string>()
		if (mode === "edit" && folder?.id) {
			const stack = [folder.id]
			while (stack.length) {
				const id = stack.pop()
				if (!id || blockedIds.has(id)) continue
				blockedIds.add(id)
				for (const child of childrenByParent.get(id) ?? []) {
					stack.push(child.id)
				}
			}
		}

		const pathOf = (item: Folder) => {
			const parts: string[] = []
			let current: Folder | undefined = item
			const seen = new Set<string>()
			while (current && !seen.has(current.id)) {
				seen.add(current.id)
				parts.unshift(current.description || "Sem Nome")
				current = current.parent_id ? byId.get(current.parent_id) : undefined
			}
			return parts.join(" / ")
		}

		return list
			.filter((item) => !blockedIds.has(item.id))
			.map((item) => {
				const path = pathOf(item)
				const pathParts = path.split(" / ")
				return {
					id: item.id,
					name: item.description || "Sem Nome",
					path,
					parentPath: pathParts.length > 1 ? pathParts.slice(0, -1).join(" / ") : "Raiz",
				}
			})
			.sort((a, b) => a.path.localeCompare(b.path, "pt-BR"))
	}, [folder?.id, folders, mode])

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
					await createFolder({ ...value, catalog_scope: catalog === "only" ? "auxiliar" : "alimentacao" })
					toast.success("Pasta criada com sucesso!")
				} else if (folder) {
					await updateFolder({ id: folder.id, payload: value })
					toast.success("Pasta atualizada com sucesso!")
				}

				await queryClient.invalidateQueries({
					queryKey: ["ingredients"],
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
			<DialogContent className="sm:max-w-xl">
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
									<FieldError errors={field.state.meta.errors.map((e) => ({ message: typeof e === "string" ? e : e?.message }))} />
								</Field>
							)}
						</form.Field>

						{/* Pasta Pai */}
						<form.Field name="parent_id">
							{(field) => {
								const selected = field.state.value ? parentOptions.find((option) => option.id === field.state.value) : null
								return (
									<Field>
										<FieldLabel htmlFor={field.name}>Pasta Pai (Opcional)</FieldLabel>
										<FolderCombobox
											value={field.state.value ?? null}
											onChange={(id) => field.handleChange(id)}
											options={parentOptions}
											clearLabel="Nenhuma (Raiz)"
											searchPlaceholder="Pesquisar pasta por nome ou caminho..."
											contentClassName="max-w-[calc(100vw-2rem)] sm:min-w-[420px]"
										/>
										{selected && <p className="text-xs text-muted-foreground">Caminho: {selected.path}</p>}
										<FieldError errors={field.state.meta.errors.map((e) => ({ message: typeof e === "string" ? e : e?.message }))} />
									</Field>
								)
							}}
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
