import { AlertCircle, CheckCircle, FileSpreadsheet, UploadCloud, X } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "#/components/ui/button"

interface FileUploadModalProps {
	isOpen: boolean
	onClose: () => void
	onUpload: (file: File) => void
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({ isOpen, onClose, onUpload }) => {
	const [isDragging, setIsDragging] = useState(false)
	const [uploadStatus, setUploadStatus] = useState<"idle" | "processing" | "success" | "error">("idle")
	const fileInputRef = useRef<HTMLInputElement>(null)

	if (!isOpen) return null

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(true)
	}

	const handleDragLeave = () => {
		setIsDragging(false)
	}

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault()
		setIsDragging(false)
		if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			processFile(e.dataTransfer.files[0])
		}
	}

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			processFile(e.target.files[0])
		}
	}

	const processFile = (file: File) => {
		if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
			setUploadStatus("error")
			setTimeout(() => setUploadStatus("idle"), 3000)
			return
		}

		setUploadStatus("processing")
		setTimeout(() => {
			onUpload(file)
			setUploadStatus("success")
			setTimeout(() => {
				onClose()
				setUploadStatus("idle")
			}, 1000)
		}, 800)
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 backdrop-blur-sm animate-in fade-in duration-200">
			<div className={`relative w-full max-w-2xl border rounded-xl shadow-2xl overflow-hidden p-8 text-center bg-card border-border`}>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClose}
					className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
					aria-label="Fechar"
				>
					<X className="w-6 h-6" />
				</Button>

				<div className="mb-6 flex flex-col items-center">
					<div className="p-4 bg-action/20 rounded-full mb-4">
						<FileSpreadsheet className="w-10 h-10 text-action" />
					</div>
					<h2 className="text-heading mb-2 text-foreground">Relatório de Evolução</h2>
					<p className={`max-w-md mx-auto text-muted-foreground`}>
						Carregue o arquivo Excel contendo a evolução mensal das diferenças. O sistema identifica automaticamente os grupos (BMP, CONSUMO, INTANGÍVEL).
					</p>
				</div>

				<label
					htmlFor="file-upload-input"
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					className={`
            relative border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer group block
            ${isDragging ? "border-action bg-action/10" : "border-border bg-muted/50 hover:bg-muted/80"}
          `}
				>
					<input id="file-upload-input" type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".xlsx, .xls" className="hidden" />

					{uploadStatus === "processing" && (
						<div className="flex flex-col items-center animate-pulse">
							<FileSpreadsheet className="w-12 h-12 text-action mb-4" />
							<p className="text-action font-medium">Lendo arquivo...</p>
						</div>
					)}

					{uploadStatus === "success" && (
						<div className="flex flex-col items-center animate-pulse">
							<CheckCircle className="w-12 h-12 text-success mb-4" />
							<p className="text-success font-medium">Processado com sucesso!</p>
						</div>
					)}

					{uploadStatus === "error" && (
						<div className="flex flex-col items-center">
							<AlertCircle className="w-12 h-12 text-destructive mb-4" />
							<p className="text-destructive font-medium">Formato inválido. Use .xlsx ou .xls</p>
						</div>
					)}

					{uploadStatus === "idle" && (
						<div className="flex flex-col items-center">
							<UploadCloud
								className={`w-12 h-12 mb-4 transition-colors ${isDragging ? "text-action" : "text-muted-foreground group-hover:text-muted-foreground/80"}`}
							/>
							<p className={`text-heading mb-1 text-foreground`}>Clique para enviar ou arraste</p>
							<p className="text-body text-muted-foreground">XLSX ou XLS</p>
						</div>
					)}
				</label>

				<div className={`mt-6 text-caption text-muted-foreground`}>Suporte para grandes volumes de dados (80+ UGs)</div>
			</div>
		</div>
	)
}
