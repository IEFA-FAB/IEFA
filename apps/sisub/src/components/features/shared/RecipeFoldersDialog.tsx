import { Check, Folder, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { useRecipeFolderMutations, useRecipeFolders } from "@/hooks/data/useRecipeFolders"

interface RecipeFoldersDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Gerencia o CATÁLOGO de pastas de preparação — lista plana, sem hierarquia.
 *
 * Só cria/renomeia/exclui a pasta em si. Arquivar preparações é outra ação (barra de seleção
 * em massa da listagem, ou o campo de pasta na tela da preparação), porque é autorizada pela
 * posse de cada preparação, não pelo nível global.
 */
export function RecipeFoldersDialog({ open, onOpenChange }: RecipeFoldersDialogProps) {
	const { folders, isLoading } = useRecipeFolders()
	const { createFolder, renameFolder, deleteFolder, isPending } = useRecipeFolderMutations()

	const [newName, setNewName] = useState("")
	const [editingId, setEditingId] = useState<string | null>(null)
	const [editingName, setEditingName] = useState("")
	const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

	const close = () => {
		if (isPending) return
		setEditingId(null)
		setNewName("")
		onOpenChange(false)
	}

	const handleCreate = async () => {
		const name = newName.trim()
		if (!name) return
		try {
			await createFolder(name)
			setNewName("")
			toast.success(`Pasta "${name}" criada`)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao criar pasta")
		}
	}

	const handleRename = async () => {
		const name = editingName.trim()
		if (!editingId || !name) return
		try {
			await renameFolder({ id: editingId, name })
			setEditingId(null)
			toast.success("Pasta renomeada")
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao renomear pasta")
		}
	}

	const handleDelete = async () => {
		if (!pendingDelete) return
		try {
			const result = await deleteFolder(pendingDelete.id)
			toast.success(
				result.unfiled > 0
					? `Pasta excluída — ${result.unfiled} ${result.unfiled === 1 ? "preparação ficou" : "preparações ficaram"} sem pasta`
					: "Pasta excluída"
			)
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Erro ao excluir pasta")
		} finally {
			setPendingDelete(null)
		}
	}

	return (
		<>
			<Dialog open={open} onOpenChange={(o) => !o && close()}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Pastas de preparações</DialogTitle>
						<DialogDescription>
							Agrupamento simples para organizar e filtrar a listagem. Uma preparação fica em no máximo uma pasta, e a pasta não interfere na ficha técnica nem
							no versionamento.
						</DialogDescription>
					</DialogHeader>

					<div className="flex items-center gap-2">
						<Input
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault()
									handleCreate()
								}
							}}
							placeholder="Nome da nova pasta (ex.: Carnes, Sobremesas)"
							aria-label="Nome da nova pasta"
						/>
						<Button onClick={handleCreate} disabled={isPending || newName.trim().length === 0} className="shrink-0 gap-1.5">
							{isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
							Criar
						</Button>
					</div>

					<div className="max-h-96 overflow-y-auto">
						{isLoading ? (
							<p className="py-6 text-center text-sm text-muted-foreground">Carregando pastas...</p>
						) : folders.length === 0 ? (
							<p className="py-6 text-center text-sm text-muted-foreground">Nenhuma pasta criada ainda.</p>
						) : (
							<ItemGroup>
								{folders.map((folder) =>
									editingId === folder.id ? (
										<Item key={folder.id} variant="outline" size="sm">
											<ItemContent>
												<Input
													value={editingName}
													onChange={(e) => setEditingName(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															e.preventDefault()
															handleRename()
														}
														if (e.key === "Escape") setEditingId(null)
													}}
													autoFocus
													aria-label={`Novo nome da pasta ${folder.name}`}
												/>
											</ItemContent>
											<ItemActions>
												<Button
													size="icon-sm"
													variant="ghost"
													onClick={handleRename}
													disabled={isPending || editingName.trim().length === 0}
													aria-label="Salvar nome"
												>
													<Check className="size-4" />
												</Button>
												<Button size="icon-sm" variant="ghost" onClick={() => setEditingId(null)} disabled={isPending} aria-label="Cancelar edição">
													<X className="size-4" />
												</Button>
											</ItemActions>
										</Item>
									) : (
										<Item key={folder.id} variant="outline" size="sm">
											<ItemMedia variant="icon">
												<Folder className="size-4" />
											</ItemMedia>
											<ItemContent>
												<ItemTitle>{folder.name}</ItemTitle>
											</ItemContent>
											<ItemActions>
												<Button
													size="icon-sm"
													variant="ghost"
													onClick={() => {
														setEditingId(folder.id)
														setEditingName(folder.name)
													}}
													disabled={isPending}
													aria-label={`Renomear ${folder.name}`}
												>
													<Pencil className="size-4" />
												</Button>
												<Button
													size="icon-sm"
													variant="ghost"
													className="text-destructive hover:text-destructive"
													onClick={() => setPendingDelete({ id: folder.id, name: folder.name })}
													disabled={isPending}
													aria-label={`Excluir ${folder.name}`}
												>
													<Trash2 className="size-4" />
												</Button>
											</ItemActions>
										</Item>
									)
								)}
							</ItemGroup>
						)}
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={close} disabled={isPending}>
							Fechar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && !isPending && setPendingDelete(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir a pasta "{pendingDelete?.name}"?</AlertDialogTitle>
						<AlertDialogDescription>
							Nenhuma preparação é excluída: as que estiverem nesta pasta simplesmente ficam sem pasta e continuam na listagem.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isPending}>
							{isPending && <Loader2 className="size-4 animate-spin" />}
							Excluir
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
