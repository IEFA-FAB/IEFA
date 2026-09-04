import { AlertCircle, FileSpreadsheet, UploadCloud, X } from "lucide-react"
import { useCallback, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

interface DgcUploadProps {
	onProcess: (files: File[]) => void
	isLoading: boolean
	error?: string | null
}

/**
 * Carga das planilhas do DGC. Aceita vários arquivos porque o export normal são
 * quatro — um por painel — e o parser precisa dos quatro juntos para montar o
 * recorte completo de cada UG.
 */
export function DgcUpload({ onProcess, isLoading, error }: DgcUploadProps) {
	const [files, setFiles] = useState<File[]>([])
	const [isDragging, setIsDragging] = useState(false)

	const addFiles = useCallback((incoming: FileList | null) => {
		if (!incoming?.length) return
		setFiles((prev) => {
			const merged = [...prev]
			for (const file of Array.from(incoming)) {
				if (!merged.some((f) => f.name === file.name && f.size === file.size)) merged.push(file)
			}
			return merged
		})
	}, [])

	const handleDrag = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragging(e.type === "dragenter" || e.type === "dragover")
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			e.stopPropagation()
			setIsDragging(false)
			addFiles(e.dataTransfer.files)
		},
		[addFiles]
	)

	return (
		<div className="w-full max-w-3xl mx-auto">
			<label
				htmlFor="sacdgc-dropzone"
				className={cn(
					"relative flex flex-col items-center justify-center w-full h-56 border-2 border-dashed rounded-xl transition-all cursor-pointer",
					isDragging ? "border-tech-cyan bg-tech-cyan/5" : "border-border bg-muted/50 hover:bg-muted hover:border-border/80",
					isLoading && "opacity-50 cursor-not-allowed pointer-events-none"
				)}
				onDragEnter={handleDrag}
				onDragLeave={handleDrag}
				onDragOver={handleDrag}
				onDrop={handleDrop}
			>
				<UploadCloud className="w-11 h-11 mb-4 text-muted-foreground" />
				<p className="mb-1 text-subheading text-foreground">
					<span className="font-semibold text-tech-blue">Clique para enviar</span> ou arraste as planilhas
				</p>
				<p className="text-caption text-muted-foreground">Painéis 1 a 4 do DGC — CSV do Tesouro Gerencial ou Excel (.xlsx, .xls)</p>
				<input
					id="sacdgc-dropzone"
					type="file"
					multiple
					className="hidden"
					accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
					onChange={(e) => addFiles(e.target.files)}
					disabled={isLoading}
				/>
			</label>

			{files.length > 0 && (
				<ul className="mt-4 space-y-2">
					{files.map((file) => (
						<li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg px-4 py-3">
							<span className="flex items-center gap-3 min-w-0">
								<FileSpreadsheet className="w-4 h-4 text-tech-cyan shrink-0" />
								<span className="text-body text-foreground truncate">{file.name}</span>
							</span>
							<Button
								type="button"
								onClick={() => setFiles((prev) => prev.filter((f) => f !== file))}
								disabled={isLoading}
								variant="ghost"
								size="icon-xs"
								className="text-muted-foreground hover:bg-transparent hover:text-destructive disabled:opacity-40"
								aria-label={`Remover ${file.name}`}
							>
								<X className="w-4 h-4" />
							</Button>
						</li>
					))}
				</ul>
			)}

			{error && (
				<Alert variant="destructive" className="mt-4">
					<AlertCircle />
					<AlertTitle>Não foi possível ler a base</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<Button
				type="button"
				onClick={() => onProcess(files)}
				disabled={files.length === 0 || isLoading}
				className="mt-6 w-full rounded-lg bg-tech-blue px-6 py-3 text-label text-white shadow-sm hover:bg-tech-blue/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
			>
				{isLoading ? "Lendo planilhas…" : "Carregar base"}
			</Button>
		</div>
	)
}
