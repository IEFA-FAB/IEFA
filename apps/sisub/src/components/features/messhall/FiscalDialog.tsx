import { useQuery } from "@tanstack/react-query"
import type { Dispatch, SetStateAction } from "react"
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
import type { DialogState } from "@/types/domain/presence"

interface FiscalDialogProps {
	setDialog: Dispatch<SetStateAction<DialogState>>
	dialog: DialogState
	confirmDialog: () => void
	selectedUnit?: string
	resolveDisplayName?: (userId: string) => Promise<string | null>
}

export default function FiscalDialog({ setDialog, dialog, confirmDialog, selectedUnit, resolveDisplayName }: FiscalDialogProps) {
	const forecastIsYes = !!dialog.systemForecast
	const forecastIsNo = !dialog.systemForecast

	const id = dialog.uuid?.trim() || null
	// staleTime Infinity: nome não muda durante a sessão do fiscal — substitui o Map manual.
	const nameQuery = useQuery({
		queryKey: ["presences", "display-name", id],
		queryFn: async () => {
			if (!id || !resolveDisplayName) return null
			const name = await resolveDisplayName(id)
			return name?.trim() || null
		},
		enabled: !!id && !!resolveDisplayName,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const personLine = nameQuery.isLoading ? "Carregando..." : nameQuery.data || dialog.uuid || "—"

	return (
		<>
			{/* Diálogo de decisão do fiscal */}
			<AlertDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Confirmar entrada do militar</AlertDialogTitle>
						<AlertDialogDescription>
							Pessoa: {personLine}
							<br />
							Previsão do sistema: {dialog.systemForecast === null ? "Não encontrado" : dialog.systemForecast ? "Previsto" : "Não previsto"}
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className="space-y-4">
						{/* Está na previsão? (somente leitura) */}
						<div className="space-y-2">
							<div className="text-subheading">Está na previsão?</div>
							<div className="flex gap-2">
								<Button disabled variant={forecastIsYes ? "default" : "outline"} size="sm" aria-pressed={forecastIsYes}>
									Sim
								</Button>
								<Button disabled variant={forecastIsNo ? "default" : "outline"} size="sm" aria-pressed={forecastIsNo}>
									Não
								</Button>
							</div>
						</div>

						{/* Vai entrar? (decisão do fiscal) */}
						<div className="space-y-2">
							<div className="text-subheading">Vai entrar?</div>
							<div className="flex gap-2">
								<Button
									variant={dialog.willEnter === "sim" ? "default" : "outline"}
									size="sm"
									aria-pressed={dialog.willEnter === "sim"}
									onClick={() => setDialog((d) => ({ ...d, willEnter: "sim" }))}
								>
									Sim
								</Button>
								<Button
									variant={dialog.willEnter === "nao" ? "destructive" : "outline"}
									size="sm"
									aria-pressed={dialog.willEnter === "nao"}
									onClick={() => setDialog((d) => ({ ...d, willEnter: "nao" }))}
								>
									Não
								</Button>
							</div>
						</div>

						{selectedUnit && <div className="text-xs text-muted-foreground">Rancho selecionado: {selectedUnit}</div>}
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setDialog((d) => ({ ...d, open: false }))}>Cancelar</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDialog}>Confirmar</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
