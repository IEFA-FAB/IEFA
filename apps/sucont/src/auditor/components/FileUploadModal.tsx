import { Button } from "#/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/components/ui/dialog"
import { EXCEL_ACCEPT, FileDropzone } from "#/components/ui/file-dropzone"

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
	// Um caminho só para fechar: Escape, clique fora e "Cancelar" limpam o erro.
	// Com o "Cancelar" chamando `onClose` direto, o aviso de formato sobrevivia
	// à próxima abertura — Base UI não dispara `onOpenChange` para prop controlada.
	function close() {
		onClose()
	}

	const handleFiles = (files: File[]) => {
		const file = files[0]
		if (!file) return
		onUpload(file)
		close()
	}

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) close()
			}}
		>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Relatório de Evolução</DialogTitle>
					<DialogDescription>
						Carregue o Excel com a evolução mensal das diferenças. Os grupos (BMP, CONSUMO, INTANGÍVEL) são identificados na leitura.
					</DialogDescription>
				</DialogHeader>

				<FileDropzone accept={EXCEL_ACCEPT} onFiles={handleFiles} hint="Excel (.xlsx, .xls) — suporta o volume das 80+ UGs" />

				<DialogFooter className="justify-end">
					<Button type="button" variant="outline" onClick={close}>
						Cancelar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
