import type { Folder } from "@iefa/database/sisub"
import { useForm } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronsUpDown } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { Button, buttonVariants } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/cn"
import { useCreateFolder, useIngredientsTree, useUpdateFolder } from "@/services/IngredientsService"

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
	const { tree } = useIngredientsTree()
	const folders = tree?.folders
	const { createFolder, isCreating } = useCreateFolder()
	const { updateFolder, isUpdating } = useUpdateFolder()
	const [parentOpen, setParentOpen] = useState(false)

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
					await createFolder(value)
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
								const selectedLabel = selected?.path ?? (field.state.value ? "Pasta indisponível" : "Nenhuma (Raiz)")

								return (
									<Field>
										<FieldLabel htmlFor={field.name}>Pasta Pai (Opcional)</FieldLabel>
										<Popover open={parentOpen} onOpenChange={setParentOpen}>
											<PopoverTrigger
												type="button"
												role="combobox"
												aria-expanded={parentOpen}
												aria-controls="folder-parent-combobox-popup"
												className={cn(buttonVariants({ variant: "outline" }), "w-full justify-between font-normal")}
											>
												<span className="truncate">{selectedLabel}</span>
												<ChevronsUpDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
											</PopoverTrigger>
											<PopoverContent
												id="folder-parent-combobox-popup"
												className="w-[--anchor-width] max-w-[calc(100vw-2rem)] p-0 sm:min-w-[420px]"
												align="start"
											>
												<Command>
													<CommandInput placeholder="Pesquisar pasta por nome ou caminho..." />
													<CommandList className="max-h-80">
														<CommandEmpty>Nenhuma pasta encontrada.</CommandEmpty>
														<CommandGroup>
															<CommandItem
																value="Nenhuma Raiz"
																onSelect={() => {
																	field.handleChange(null)
																	setParentOpen(false)
																}}
																className={cn(!field.state.value && "font-medium text-accent-foreground")}
															>
																<Check className={cn("mr-2 size-4 shrink-0 text-accent-foreground", !field.state.value ? "opacity-100" : "opacity-0")} />
																<span>Nenhuma (Raiz)</span>
															</CommandItem>
															{parentOptions.map((option) => {
																const isSelected = field.state.value === option.id
																return (
																	<CommandItem
																		key={option.id}
																		value={`${option.path} ${option.id}`}
																		onSelect={() => {
																			field.handleChange(option.id)
																			setParentOpen(false)
																		}}
																		className={cn("items-start", isSelected && "font-medium text-accent-foreground")}
																	>
																		<Check className={cn("mt-0.5 mr-2 size-4 shrink-0 text-accent-foreground", isSelected ? "opacity-100" : "opacity-0")} />
																		<span className="min-w-0">
																			<span className="block truncate">{option.name}</span>
																			<span className="block truncate text-xs font-normal text-muted-foreground">{option.parentPath}</span>
																		</span>
																	</CommandItem>
																)
															})}
														</CommandGroup>
													</CommandList>
												</Command>
											</PopoverContent>
										</Popover>
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
