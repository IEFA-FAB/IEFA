import { type ClassValue, clsx } from "clsx"
import { AlertCircle, Upload } from "lucide-react"
import type React from "react"
import { useCallback, useState } from "react"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

interface FileUploaderProps {
	onFileSelect: (file: File) => void
	isLoading: boolean
	error: string | null
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, isLoading, error }) => {
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
			<div
				className={cn(
					"relative flex flex-col items-center justify-center w-full h-64 rounded-2xl border-2 border-dashed transition-all duration-200 ease-in-out",
					isDragging ? "border-fab-500 bg-fab-50/50" : "border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400",
					isLoading && "opacity-50 cursor-not-allowed"
				)}
				onDragEnter={handleDrag}
				onDragLeave={handleDrag}
				onDragOver={handleDrag}
				onDrop={handleDrop}
			>
				<div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
					<Upload className={cn("w-12 h-12 mb-4 transition-colors duration-200", isDragging ? "text-fab-500" : "text-slate-400")} />
					<p className="mb-2 text-sm text-slate-700 font-medium">
						<span className="font-semibold text-fab-600">Clique para enviar</span> ou arraste e solte
					</p>
					<p className="text-xs text-slate-500">Planilhas CSV ou Excel (.xlsx, .xls)</p>
				</div>
				<input
					id="dropzone-file"
					type="file"
					className="hidden"
					accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
					onChange={handleChange}
					disabled={isLoading}
				/>
				{/* Make the whole area clickable by overlaying a label */}
				<label htmlFor="dropzone-file" className="absolute inset-0 w-full h-full cursor-pointer" />
			</div>

			{error && (
				<div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3">
					<AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
					<p className="text-sm text-red-700">{error}</p>
				</div>
			)}
		</div>
	)
}
