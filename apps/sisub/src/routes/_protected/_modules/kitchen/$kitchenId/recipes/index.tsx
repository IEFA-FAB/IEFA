import { createFileRoute } from "@tanstack/react-router"
import { DownloadIcon, FolderCog } from "lucide-react"
import { useRef } from "react"
import { z } from "zod"
import { RecipesManager, type RecipesManagerHandle } from "@/components/features/shared/RecipesManager"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { useGlobalWrite } from "@/hooks/auth/useGlobalWrite"

const recipesSearchSchema = z.object({
	search: z.string().optional(),
	type: z.enum(["all", "global", "local"]).optional(),
})

export const Route = createFileRoute("/_protected/_modules/kitchen/$kitchenId/recipes/")({
	component: RecipesPage,
	validateSearch: recipesSearchSchema,
})

function RecipesPage() {
	// O catálogo de pastas é único e global: quem edita aqui é o mesmo perfil de lá.
	const canManageFolders = useGlobalWrite()
	const managerRef = useRef<RecipesManagerHandle>(null)

	return (
		<div className="space-y-6">
			<PageHeader title="Catálogo de Preparações">
				<Button variant="outline" size="sm" onClick={() => managerRef.current?.exportCsv()}>
					<DownloadIcon className="size-4" />
					<span className="hidden sm:inline">Exportar CSV</span>
					<span className="sm:hidden">CSV</span>
				</Button>
				{canManageFolders && (
					<Button variant="outline" size="sm" onClick={() => managerRef.current?.openFoldersDialog()} className="gap-2">
						<FolderCog className="size-4" />
						Pastas
					</Button>
				)}
			</PageHeader>
			<RecipesManager ref={managerRef} />
		</div>
	)
}
