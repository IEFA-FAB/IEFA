import { useCallback, useState } from "react"
import { Button } from "#/components/ui/button"
import { FileDropzone, FileDropzoneList } from "#/components/ui/file-dropzone"

interface DgcUploadProps {
	onProcess: (files: File[]) => void
	isLoading: boolean
}

/**
 * Carga das planilhas do DGC. Aceita vários arquivos porque o export normal são
 * quatro — um por painel — e o parser precisa dos quatro juntos para montar o
 * recorte completo de cada UG.
 *
 * A zona e a lista vêm do primitivo; o que é próprio daqui é o acúmulo (soltar
 * dois arquivos, depois mais dois) e o botão explícito: com quatro painéis, ler
 * no primeiro arquivo solto processaria uma base incompleta.
 *
 * O erro de leitura NÃO é renderizado aqui — é a rota que o passa ao
 * `AnalysisStart`, junto com o resto da tela inicial. Duas superfícies de erro
 * na mesma coluna era o que existia antes.
 */
export function DgcUpload({ onProcess, isLoading }: DgcUploadProps) {
	const [files, setFiles] = useState<File[]>([])

	const addFiles = useCallback((incoming: File[]) => {
		setFiles((prev) => {
			const merged = [...prev]
			for (const file of incoming) {
				if (!merged.some((f) => f.name === file.name && f.size === file.size)) merged.push(file)
			}
			return merged
		})
	}, [])

	return (
		<div className="space-y-4">
			<FileDropzone
				accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
				multiple
				onFiles={addFiles}
				prompt="ou arraste as planilhas"
				hint="Painéis 1 a 4 do DGC — CSV do Tesouro Gerencial ou Excel (.xlsx, .xls)"
				isLoading={isLoading}
				loadingLabel="Lendo as planilhas…"
			/>

			<FileDropzoneList files={files} onRemove={(file) => setFiles((prev) => prev.filter((f) => f !== file))} disabled={isLoading} />

			<Button type="button" onClick={() => onProcess(files)} disabled={files.length === 0 || isLoading} className="w-full">
				{isLoading ? "Lendo planilhas…" : "Carregar base"}
			</Button>
		</div>
	)
}
