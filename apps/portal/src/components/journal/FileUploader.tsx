import { Page, Refresh, Upload, Xmark } from "iconoir-react"
import { useCallback, useState } from "react"
import { type FileRejection, useDropzone } from "react-dropzone"
import { cn } from "@/lib/utils"
import { Button } from "../ui/button"

interface FileUploaderProps {
	accept?: Record<string, string[]>
	maxSize?: number // in bytes
	maxFiles?: number
	label: string
	description?: string
	required?: boolean
	value?: File | File[]
	onChange: (files: File | File[] | undefined) => void
	error?: string
	multiple?: boolean
	/** Path already saved to storage — shows "uploaded" card instead of File object */
	uploadedPath?: string
	/** Multiple paths already saved (for supplementary files) */
	uploadedPaths?: string[]
	/** Shows a spinner; disables interaction while true */
	isUploading?: boolean
	/** Called when the user removes the already-uploaded file */
	onRemoveUploaded?: (index?: number) => void
}

export function FileUploader({
	accept = { "application/pdf": [".pdf"] },
	maxSize = 10 * 1024 * 1024, // 10MB default
	maxFiles = 1,
	label,
	description,
	required = false,
	value,
	onChange,
	error,
	multiple = false,
	uploadedPath,
	uploadedPaths,
	isUploading = false,
	onRemoveUploaded,
}: FileUploaderProps) {
	const [uploadError, setUploadError] = useState<string | null>(null)

	const onDrop = useCallback(
		(acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
			setUploadError(null)

			if (rejectedFiles.length > 0) {
				const rejection = rejectedFiles[0]
				if (rejection.errors[0]?.code === "file-too-large") {
					setUploadError(`Arquivo muito grande. Tamanho máximo: ${(maxSize / 1024 / 1024).toFixed(0)}MB`)
				} else if (rejection.errors[0]?.code === "file-invalid-type") {
					setUploadError("Tipo de arquivo não aceito")
				} else {
					setUploadError(rejection.errors[0]?.message || "Erro ao fazer upload")
				}
				return
			}

			if (acceptedFiles.length > 0) {
				if (multiple) {
					// For multiple files, append to existing
					const existing = Array.isArray(value) ? value : []
					const newFiles = [...existing, ...acceptedFiles].slice(0, maxFiles)
					onChange(newFiles)
				} else {
					// For single file, replace
					onChange(acceptedFiles[0])
				}
			}
		},
		[maxSize, multiple, value, onChange, maxFiles]
	)

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop,
		accept,
		maxSize,
		maxFiles: multiple ? maxFiles : 1,
		multiple,
		disabled: isUploading,
	})

	const removeFile = (index?: number) => {
		if (multiple && Array.isArray(value)) {
			const newFiles = value.filter((_, i) => i !== index)
			onChange(newFiles.length > 0 ? newFiles : undefined)
		} else {
			onChange(undefined)
		}
	}

	const files: File[] = multiple && Array.isArray(value) ? (value as File[]) : value && !Array.isArray(value) ? [value as File] : []
	const hasFiles = files.length > 0

	// Paths already saved to storage (takes priority over local File state)
	const savedPaths: string[] = uploadedPaths ?? (uploadedPath ? [uploadedPath] : [])
	const hasSavedPaths = savedPaths.length > 0

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<span className="text-sm font-medium">
					{label}
					{required && <span className="text-destructive ml-1">*</span>}
				</span>
			</div>

			{description && <p className="text-sm text-muted-foreground">{description}</p>}

			{/* Dropzone — hidden when a saved path exists (user must remove first to replace) */}
			{!hasSavedPaths && (
				<div
					{...getRootProps()}
					className={cn(
						"border-2 border-dashed rounded-lg p-8 text-center transition-colors",
						isUploading ? "cursor-not-allowed opacity-60" : "cursor-pointer",
						isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
						error || uploadError ? "border-destructive" : ""
					)}
				>
					<input {...getInputProps()} />
					<div className="flex flex-col items-center gap-2">
						{isUploading ? (
							<>
								<Refresh className="size-8 animate-spin text-primary" />
								<p className="text-sm font-medium text-primary">Enviando arquivo...</p>
							</>
						) : isDragActive ? (
							<>
								<Upload className="size-8 text-primary" />
								<p className="text-sm text-primary font-medium">Solte o arquivo aqui...</p>
							</>
						) : (
							<>
								<Upload className="size-8 text-muted-foreground" />
								<div className="text-sm">
									<p className="font-medium">Clique para selecionar ou arraste o arquivo</p>
									<p className="text-muted-foreground mt-1">
										{Object.keys(accept)
											.map((mime) => accept[mime].join(", "))
											.join(", ")}{" "}
										(máx. {(maxSize / 1024 / 1024).toFixed(0)}MB)
									</p>
								</div>
							</>
						)}
					</div>
				</div>
			)}

			{(error || uploadError) && <p className="text-sm text-destructive">{error || uploadError}</p>}

			{/* Already-uploaded files (persisted in storage) */}
			{hasSavedPaths && (
				<div className="space-y-2">
					<p className="text-sm font-medium text-green-700 dark:text-green-400">
						Arquivo{savedPaths.length > 1 ? "s" : ""} enviado{savedPaths.length > 1 ? "s" : ""}:
					</p>
					{savedPaths.map((path, index) => (
						<div key={path} className="flex items-center gap-2 p-3 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
							<Page className="size-4 text-green-600 dark:text-green-400 shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{path.split("/").pop()}</p>
								<p className="text-xs text-green-600 dark:text-green-400">✓ Salvo no servidor</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={(e) => {
									e.stopPropagation()
									onRemoveUploaded?.(multiple ? index : undefined)
								}}
							>
								<Xmark className="size-4" />
							</Button>
						</div>
					))}
					{/* Allow re-upload after removing */}
					<p className="text-xs text-muted-foreground">Para substituir, remova o arquivo acima e selecione um novo.</p>
				</div>
			)}

			{/* Local files selected (before upload — shown during the upload transition) */}
			{hasFiles && !hasSavedPaths && (
				<div className="space-y-2">
					{files.map((file, index) => (
						<div key={`${file.name}-${index}`} className="flex items-center gap-2 p-3 border rounded-lg bg-card">
							<Page className="size-4 text-muted-foreground shrink-0" />
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{file.name}</p>
								<p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={(e) => {
									e.stopPropagation()
									removeFile(multiple ? index : undefined)
								}}
							>
								<Xmark className="size-4" />
							</Button>
						</div>
					))}
				</div>
			)}

			{multiple && !hasSavedPaths && hasFiles && files.length < maxFiles && (
				<p className="text-xs text-muted-foreground">
					Você pode adicionar mais {maxFiles - files.length} arquivo
					{maxFiles - files.length > 1 ? "s" : ""}
				</p>
			)}
		</div>
	)
}
