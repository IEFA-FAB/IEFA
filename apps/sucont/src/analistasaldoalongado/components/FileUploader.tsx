import { AlertCircle, Upload } from "lucide-react"
import { useCallback, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert"
import { cn } from "#/lib/utils"

interface FileUploaderProps {
	onFileSelect: (file: File) => void
	isLoading: boolean
	error: string | null
}

export function FileUploader({ onFileSelect, isLoading, error }: FileUploaderProps) {
	const [isDragging, setIsDragging] = useState(false)

	const handleDrag = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		if (e.type === "dragenter" || e.type === "dragover") {
			setIsDragging(true)
		} else if (e.type === "dragleave") {
			setIsDragging(false)
		}
	}, [])

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			e.stopPropagation()
			setIsDragging(false)
			if (e.dataTransfer.files?.[0]) {
				const file = e.dataTransfer.files[0]
				if (file.name.endsWith(".csv") || file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
					onFileSelect(file)
				}
			}
		},
		[onFileSelect]
	)

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			e.preventDefault()
			if (e.target.files?.[0]) {
				onFileSelect(e.target.files[0])
			}
		},
		[onFileSelect]
	)

	return (
		<div className="w-full max-w-2xl mx-auto">
			<label
				htmlFor="dropzone-file-saldo"
				className={cn(
					"relative flex flex-col items-center justify-center w-full h-64 rounded-xl border-2 border-dashed transition-all duration-200 ease-in-out cursor-pointer",
					isDragging ? "border-ring bg-muted/40" : "border-border bg-muted/50 hover:bg-muted hover:border-border/80",
					isLoading && "opacity-50 cursor-not-allowed"
				)}
				onDragEnter={handleDrag}
				onDragLeave={handleDrag}
				onDragOver={handleDrag}
				onDrop={handleDrop}
			>
				<div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
					<Upload className={cn("w-12 h-12 mb-4 transition-colors duration-200", isDragging ? "text-action" : "text-muted-foreground")} />
					<p className="mb-2 text-subheading text-foreground">
						<span className="font-semibold text-action">Clique para enviar</span> ou arraste e solte
					</p>
					<p className="text-caption text-muted-foreground">Planilhas CSV ou Excel (.xlsx, .xls)</p>
				</div>
				<input
					id="dropzone-file-saldo"
					type="file"
					className="hidden"
					accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
					onChange={handleChange}
					disabled={isLoading}
				/>
			</label>

			{error && (
				<Alert variant="destructive" className="mt-4">
					<AlertCircle />
					<AlertTitle>Não foi possível ler o arquivo</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	)
}
