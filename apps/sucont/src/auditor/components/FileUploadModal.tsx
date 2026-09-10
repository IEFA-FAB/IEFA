import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog"
import { FileDropzone } from "#/components/ui/file-dropzone"

interface FileUploadModalProps {
	isOpen: boolean
	onClose: () => void
	onUpload: (file: File) => void
}

/**
 * Carga do relatório de evolução, em diálogo.
 *
 * O auditor é a única ferramenta que recebe planilha SEM ser na tela inicial —
 * a tela dele já tem dado carregado, e a carga é uma ação do cabeçalho. Por isso
 * o diálogo; a zona de envio dentro dele é a mesma das outras seis.
 *
 * O que estava aqui antes: um véu `fixed inset-0` desenhado à mão, sem foco
 * preso nem fechar por Escape, e um `setTimeout` de 800 ms que fingia
 * processamento antes de chamar `onUpload` — mais 1 s de "Processado com
 * sucesso!" antes de fechar. A leitura de verdade acontece no `onUpload`, então
 * a espera era só espera.
 */
export function FileUploadModal({ isOpen, onClose, onUpload }: FileUploadModalProps) {
	const [error, setError] = useState<string | null>(null)

	const handleFiles = (files: File[]) => {
		const file = files[0]
		if (!file) return
		// O `accept` do campo filtra a janela de escolha, não o que é arrastado.
		if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
			setError("Envie um arquivo Excel (.xlsx ou .xls).")
			return
		}
		setError(null)
		onUpload(file)
		onClose()
	}

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					setError(null)
					onClose()
				}
			}}
		>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Relatório de Evolução</DialogTitle>
					<DialogDescription>
						Carregue o Excel com a evolução mensal das diferenças. Os grupos (BMP, CONSUMO, INTANGÍVEL) são identificados na leitura.
					</DialogDescription>
				</DialogHeader>

				<FileDropzone accept=".xlsx,.xls" onFiles={handleFiles} prompt="ou arraste o relatório" hint="Excel (.xlsx, .xls) — suporta o volume das 80+ UGs" />

				{error && (
					<Alert variant="destructive">
						<AlertTitle>Formato inválido</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<DialogFooter className="justify-end">
					<Button type="button" variant="outline" onClick={onClose}>
						Cancelar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
