import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
} from "@iefa/ui"
import { type Dispatch, type SetStateAction, useEffect, useState } from "react"
import type { DialogState } from "@/types/domain/presence"

interface FiscalDialogProps {
	setDialog: Dispatch<SetStateAction<DialogState>>
	dialog: DialogState
	confirmDialog: () => void
	selectedUnit: string
	resolveDisplayName?: (userId: string) => Promise<string | null>
}

const nameCache = new Map<string, string>()

export default function FiscalDialog({
	setDialog,
	dialog,
	confirmDialog,
	selectedUnit,
	resolveDisplayName,
}: FiscalDialogProps) {
	const forecastIsYes = !!dialog.systemForecast
	const forecastIsNo = !dialog.systemForecast

	const id = dialog.uuid?.trim() || null
	const [fetchedId, setFetchedId] = useState<string | null>(null)
	const [fetchedName, setFetchedName] = useState<string | null>(null)

	// Derive loading from state — avoids synchronous setState in effect body
	const loadingName = !!(id && resolveDisplayName && !nameCache.has(id) && fetchedId !== id)
	const displayName = id ? (nameCache.get(id) ?? (fetchedId === id ? fetchedName : null)) : null

	useEffect(() => {
		if (!id || !resolveDisplayName || nameCache.has(id)) return
		let cancelled = false
		resolveDisplayName(id)
			.then((name) => {
				if (cancelled) return
				const normalized = name?.trim() || null
				if (normalized) nameCache.set(id, normalized)
				setFetchedName(normalized)
				setFetchedId(id)
			})
			.catch(() => {
				if (!cancelled) setFetchedId(id)
			})
		return () => {
			cancelled = true
		}
	}, [id, resolveDisplayName])

	const personLine = loadingName ? "Carregando..." : displayName || dialog.uuid || "—"

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
							Previsão do sistema:{" "}
							{dialog.systemForecast === null
								? "Não encontrado"
								: dialog.systemForecast
									? "Previsto"
									: "Não previsto"}
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className="space-y-4">
						{/* Está na previsão? (somente leitura) */}
						<div className="space-y-2">
							<div className="text-sm font-medium">Está na previsão?</div>
							<div className="flex gap-2">
								<Button
									disabled
									variant={forecastIsYes ? "default" : "outline"}
									size="sm"
									aria-pressed={forecastIsYes}
								>
									Sim
								</Button>
								<Button
									disabled
									variant={forecastIsNo ? "default" : "outline"}
									size="sm"
									aria-pressed={forecastIsNo}
								>
									Não
								</Button>
							</div>
						</div>

						{/* Vai entrar? (decisão do fiscal) */}
						<div className="space-y-2">
							<div className="text-sm font-medium">Vai entrar?</div>
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

						{selectedUnit && (
							<div className="text-xs text-muted-foreground">
								Rancho selecionado: {selectedUnit}
							</div>
						)}
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setDialog((d) => ({ ...d, open: false }))}>
							Cancelar
						</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDialog}>Confirmar</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
